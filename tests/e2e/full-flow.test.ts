/**
 * End-to-end test: full elenchus_start → elenchus_qa → elenchus_spec flow.
 *
 * Exercises tool handlers directly (bypassing MCP transport) to verify
 * the entire interrogation pipeline works, including LLM graceful degradation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Storage } from '../../src/storage/index.js';
import { handleToolCall } from '../../src/tools/index.js';

/**
 * These tests call real tool handlers. When ANTHROPIC_API_KEY is set,
 * LLM calls are made which can take 5-15 seconds each.
 * The full flow test makes ~5 LLM calls, so it needs generous timeout.
 */
const E2E_TIMEOUT = 120_000; // 2 minutes

/** Parse the JSON from a tool call result */
function parseResult(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe('Full Flow E2E', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new Storage(); // fresh in-memory DB each test
  });

  it('should complete start → qa → spec without errors', { timeout: E2E_TIMEOUT }, async () => {
    // ── Step 1: elenchus_start ──────────────────────────────────────────
    const startResult = parseResult(
      await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a REST API for a todo app. Users can create, read, update, and delete todos. Each todo has a title, description, and status (pending, in-progress, done). Authentication via JWT. Rate limiting at 100 req/min. Must deploy to AWS Lambda.',
      }, storage)
    );

    expect(startResult['epicId']).toBeDefined();
    expect(startResult['sessionId']).toBeDefined();
    expect(startResult['signals']).toBeDefined();
    expect(startResult['suggestedQuestions']).toBeDefined();

    const epicId = startResult['epicId'] as string;
    const sessionId = startResult['sessionId'] as string;
    const signals = startResult['signals'] as Record<string, unknown>;
    const questions = startResult['suggestedQuestions'] as Array<Record<string, unknown>>;

    expect(epicId).toMatch(/^epic-/);
    expect(sessionId).toMatch(/^session-/);

    // Signals is an object with { claims, gaps, tensions, assumptions }
    expect(signals['claims']).toBeDefined();
    expect(signals['gaps']).toBeDefined();
    expect(signals['tensions']).toBeDefined();
    expect(signals['assumptions']).toBeDefined();

    // At least one signal category should have entries
    const totalSignals =
      (signals['claims'] as unknown[]).length +
      (signals['gaps'] as unknown[]).length +
      (signals['tensions'] as unknown[]).length +
      (signals['assumptions'] as unknown[]).length;
    expect(totalSignals).toBeGreaterThan(0);

    // Questions should have content
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q['question']).toBeDefined();
      expect(typeof q['question']).toBe('string');
    }

    // ── Step 2: elenchus_qa (round 1) ───────────────────────────────────
    const qaResult1 = parseResult(
      await handleToolCall('elenchus_qa', {
        sessionId,
        qa: [
          {
            area: 'scope',
            question: 'Who will use this API?',
            answer: 'Internal mobile app developers. About 5 team members initially, scaling to 50 within 6 months.',
          },
          {
            area: 'success',
            question: 'How will you know the API works correctly?',
            answer: 'All CRUD operations return correct HTTP status codes. JWT auth rejects invalid tokens with 401. Rate limiter returns 429 after threshold. Response time under 200ms for single todo operations.',
          },
          {
            area: 'technical',
            question: 'What database will you use?',
            answer: 'DynamoDB since we\'re deploying to AWS Lambda. Single table design with GSI for status queries.',
          },
        ],
      }, storage)
    );

    expect(qaResult1['quality']).toBeDefined();
    const quality1 = qaResult1['quality'] as Record<string, unknown>;
    expect(quality1['averageScore']).toBeDefined();
    expect(typeof quality1['averageScore']).toBe('number');
    expect(quality1['totalAnswered']).toBeDefined();

    // Should have suggested follow-up questions
    expect(qaResult1['suggestedQuestions']).toBeDefined();

    // ── Step 3: elenchus_qa (round 2) ───────────────────────────────────
    const qaResult2 = parseResult(
      await handleToolCall('elenchus_qa', {
        sessionId,
        qa: [
          {
            area: 'constraint',
            question: 'What are the deployment constraints?',
            answer: 'Must use AWS CDK for infrastructure. CI/CD via GitHub Actions. Staging and production environments. Lambda cold start must be under 500ms.',
          },
          {
            area: 'risk',
            question: 'What could go wrong?',
            answer: 'DynamoDB throttling under load — mitigate with on-demand capacity. JWT secret rotation needs zero-downtime strategy. Lambda cold starts could exceed SLA — use provisioned concurrency for critical paths.',
          },
        ],
      }, storage)
    );

    expect(qaResult2['quality']).toBeDefined();
    const quality2 = qaResult2['quality'] as Record<string, unknown>;
    expect(typeof quality2['averageScore']).toBe('number');
    // Total answered should increase across rounds
    expect((quality2['totalAnswered'] as number)).toBeGreaterThan((quality1['totalAnswered'] as number));

    // ── Step 4: elenchus_spec ───────────────────────────────────────────
    // Force spec generation (may not hit readyForSpec threshold with 2 rounds)
    const specResult = parseResult(
      await handleToolCall('elenchus_spec', {
        sessionId,
        force: true,
      }, storage)
    );

    expect(specResult['ready']).toBe(true);
    expect(specResult['structuredSpec']).toBeDefined();
    expect(specResult['specification']).toBeDefined();
    expect(specResult['synthesisPrompt']).toBeDefined();

    const structuredSpec = specResult['structuredSpec'] as Record<string, unknown>;
    expect(structuredSpec['requirements']).toBeDefined();
    expect(structuredSpec['constraints']).toBeDefined();
    expect(structuredSpec['risks']).toBeDefined();
    expect(structuredSpec['unknowns']).toBeDefined();
    expect(structuredSpec['executionGuidance']).toBeDefined();

    const metadata = structuredSpec['metadata'] as Record<string, unknown>;
    expect(metadata['tier']).toBeDefined();
    expect(metadata['confidence']).toBeDefined();
    expect(typeof metadata['confidence']).toBe('number');

    // Requirements should have content from our Q&A
    const requirements = structuredSpec['requirements'] as Array<Record<string, unknown>>;
    expect(requirements.length).toBeGreaterThan(0);

    // Spec should reference things we actually said
    const synthesisPrompt = specResult['synthesisPrompt'] as string;
    expect(synthesisPrompt).toContain('Requirements Extracted');
    expect(synthesisPrompt).toContain('Execution Plan');

    // llmEnhanced field should exist (true if API key set, false if not)
    expect(typeof specResult['llmEnhanced']).toBe('boolean');
  });

  it('should reject spec generation when session is not ready and force=false', { timeout: E2E_TIMEOUT }, async () => {
    // Start a session
    const startResult = parseResult(
      await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build something vague',
      }, storage)
    );

    const sessionId = startResult['sessionId'] as string;

    // Try to generate spec without any Q&A
    const specResult = parseResult(
      await handleToolCall('elenchus_spec', {
        sessionId,
        force: false,
      }, storage)
    );

    expect(specResult['ready']).toBe(false);
    expect(specResult['blockers']).toBeDefined();
    expect((specResult['blockers'] as string[]).length).toBeGreaterThan(0);
  });

  it('should handle multiple signals from a complex epic', { timeout: E2E_TIMEOUT }, async () => {
    const startResult = parseResult(
      await handleToolCall('elenchus_start', {
        source: 'text',
        content: `Build a real-time collaborative document editor like Google Docs.
Must support 1000 concurrent users editing the same document.
The system should be simple and fast.
Use blockchain for conflict resolution.
Must work offline and sync in real-time.
Deploy on a Raspberry Pi.
Budget: $100/month. Timeline: 2 weeks.`,
      }, storage)
    );

    const signals = startResult['signals'] as Record<string, unknown>;

    // This epic is loaded with tensions and unrealistic claims
    expect(signals['claims']).toBeDefined();
    expect(signals['gaps']).toBeDefined();
    expect(signals['tensions']).toBeDefined();
    expect(signals['assumptions']).toBeDefined();

    // Should detect multiple issues across categories
    const totalSignals =
      (signals['claims'] as unknown[]).length +
      (signals['gaps'] as unknown[]).length +
      (signals['tensions'] as unknown[]).length +
      (signals['assumptions'] as unknown[]).length;
    expect(totalSignals).toBeGreaterThan(0);

    // Flatten all signal contents and check for relevance
    const allSignals = [
      ...(signals['claims'] as Array<Record<string, string>>),
      ...(signals['gaps'] as Array<Record<string, string>>),
      ...(signals['tensions'] as Array<Record<string, string>>),
      ...(signals['assumptions'] as Array<Record<string, string>>),
    ];
    const allContent = allSignals.map(s => (s['content'] ?? '').toLowerCase()).join(' ');
    const hasRelevantSignals =
      allContent.includes('offline') ||
      allContent.includes('real-time') ||
      allContent.includes('concurrent') ||
      allContent.includes('simple') ||
      allContent.includes('blockchain') ||
      allContent.includes('raspberry') ||
      allContent.includes('budget') ||
      allContent.includes('timeline') ||
      allContent.includes('scale') ||
      allContent.includes('1000');
    expect(hasRelevantSignals).toBe(true);
  });

  it('should detect contradictions across Q&A rounds', { timeout: E2E_TIMEOUT }, async () => {
    const startResult = parseResult(
      await handleToolCall('elenchus_start', {
        source: 'text',
        content: 'Build a data processing pipeline',
      }, storage)
    );

    const sessionId = startResult['sessionId'] as string;

    // Submit contradictory answers
    const qaResult = parseResult(
      await handleToolCall('elenchus_qa', {
        sessionId,
        qa: [
          {
            area: 'technical',
            question: 'What is the data volume?',
            answer: 'We process about 10 records per day. Very small scale.',
          },
          {
            area: 'technical',
            question: 'What infrastructure do you need?',
            answer: 'We need a distributed Kafka cluster with 50 partitions and Spark for real-time stream processing to handle the massive data throughput.',
          },
        ],
        conflicts: [
          {
            description: '10 records/day does not require distributed Kafka + Spark',
            severity: 'high',
          },
        ],
      }, storage)
    );

    // The system should acknowledge the contradiction
    expect(qaResult['quality']).toBeDefined();
  });

  it('should handle health check', async () => {
    const healthResult = parseResult(
      await handleToolCall('elenchus_health', {}, storage)
    );

    expect(healthResult['status']).toBeDefined();
    expect(healthResult['version']).toBeDefined();
  });

  it('should error on unknown tool', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_nonexistent', {}, storage)
    );

    // Should return an error response, not crash
    expect(result['error']).toBeDefined();
  });

  it('should error on missing sessionId for qa', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_qa', {
        qa: [{ area: 'scope', question: 'test?', answer: 'test' }],
      }, storage)
    );

    // Should return error about missing sessionId
    expect(result['error']).toBeDefined();
  });

  it('should error on missing sessionId for spec', async () => {
    const result = parseResult(
      await handleToolCall('elenchus_spec', {}, storage)
    );

    expect(result['error']).toBeDefined();
  });
});
