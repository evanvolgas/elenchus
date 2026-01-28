/**
 * End-to-end test: graceful degradation without ANTHROPIC_API_KEY.
 *
 * Verifies the full flow works with structural-only analysis
 * when no LLM is available.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Storage } from '../../src/storage/index.js';
import { handleToolCall } from '../../src/tools/index.js';

/** Parse the JSON from a tool call result */
function parseResult(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe('Graceful Degradation (no LLM)', () => {
  let storage: Storage;
  let originalApiKey: string | undefined;

  beforeAll(() => {
    // Remove API key to force structural-only mode
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    // Restore API key
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  });

  beforeEach(() => {
    storage = new Storage();
  });

  it('should complete full flow without LLM', async () => {
    // ── Start ──
    const startResult = parseResult(
      await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a REST API for a todo app with JWT auth and rate limiting. Deploy to AWS Lambda with DynamoDB.',
      }, storage)
    );

    expect(startResult['epicId']).toBeDefined();
    expect(startResult['sessionId']).toBeDefined();
    expect(startResult['signals']).toBeDefined();
    expect(startResult['suggestedQuestions']).toBeDefined();

    // llmEnhanced should be false (no API key)
    expect(startResult['llmEnhanced']).toBe(false);

    const sessionId = startResult['sessionId'] as string;
    const questions = startResult['suggestedQuestions'] as Array<Record<string, unknown>>;

    // Should still get template-based questions
    expect(questions.length).toBeGreaterThan(0);

    // Signals should still be detected structurally
    const signals = startResult['signals'] as Record<string, unknown>;
    expect(signals['claims']).toBeDefined();
    expect(signals['gaps']).toBeDefined();

    // ── QA ──
    const qaResult = parseResult(
      await handleToolCall('elenchus_qa', {
        sessionId,
        qa: [
          {
            area: 'scope',
            question: 'Who will use this?',
            answer: 'Internal developers, about 10 people.',
          },
          {
            area: 'technical',
            question: 'What database?',
            answer: 'DynamoDB with single table design.',
          },
        ],
      }, storage)
    );

    expect(qaResult['quality']).toBeDefined();
    expect(qaResult['suggestedQuestions']).toBeDefined();

    // Should still get template follow-up questions
    const followUps = qaResult['suggestedQuestions'] as Array<Record<string, unknown>>;
    expect(followUps.length).toBeGreaterThan(0);

    // ── Spec ──
    const specResult = parseResult(
      await handleToolCall('elenchus_spec', {
        sessionId,
        force: true,
      }, storage)
    );

    expect(specResult['ready']).toBe(true);
    expect(specResult['structuredSpec']).toBeDefined();
    expect(specResult['specification']).toBeDefined();

    // LLM decomposition should be absent (no API key)
    expect(specResult['llmEnhanced']).toBe(false);
    // blueprint should be undefined (not present or null)
    expect(specResult['blueprint']).toBeUndefined();

    // Structural spec should still have content
    const structuredSpec = specResult['structuredSpec'] as Record<string, unknown>;
    expect((structuredSpec['requirements'] as unknown[]).length).toBeGreaterThan(0);
    expect(structuredSpec['executionGuidance']).toBeDefined();
  });
});
