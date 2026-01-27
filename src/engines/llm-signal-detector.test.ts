/**
 * Tests for LLM Signal Detector
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectSignalsWithLLM } from './llm-signal-detector.js';
import * as llmClient from './llm-client.js';

describe('LLM Signal Detector', () => {
  const mockEpicContent = 'Build a user dashboard with real-time updates and offline support.';
  const mockStructuralPrompt = 'Coverage: 60/100, Specificity: 40/100';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectSignalsWithLLM', () => {
    it('should return null when LLM is unavailable', async () => {
      vi.spyOn(llmClient, 'isLLMAvailable').mockReturnValue(false);

      const result = await detectSignalsWithLLM(mockEpicContent, mockStructuralPrompt);

      expect(result).toBeNull();
    });

    it('should return null when LLM call fails', async () => {
      vi.spyOn(llmClient, 'isLLMAvailable').mockReturnValue(true);
      vi.spyOn(llmClient, 'callLLM').mockResolvedValue(null);

      const result = await detectSignalsWithLLM(mockEpicContent, mockStructuralPrompt);

      expect(result).toBeNull();
    });

    it('should return null when response is malformed', async () => {
      vi.spyOn(llmClient, 'isLLMAvailable').mockReturnValue(true);
      vi.spyOn(llmClient, 'callLLM').mockResolvedValue({
        // Missing required fields
        signals: [],
      });

      const result = await detectSignalsWithLLM(mockEpicContent, mockStructuralPrompt);

      expect(result).toBeNull();
    });

    it('should detect and normalize signals when LLM available', async () => {
      vi.spyOn(llmClient, 'isLLMAvailable').mockReturnValue(true);
      vi.spyOn(llmClient, 'callLLM').mockResolvedValue({
        signals: [
          {
            type: 'tension',
            content: 'Real-time updates require persistent connection, but offline support requires working without connection',
            quote: 'real-time updates and offline support',
            severity: 'high',
          },
          {
            type: 'gap',
            content: 'No mention of authentication or authorization',
            // No quote provided
            severity: 'critical',
          },
        ],
        analysis: 'Found 1 tension and 1 critical gap',
      });

      const result = await detectSignalsWithLLM(mockEpicContent, mockStructuralPrompt);

      expect(result).not.toBeNull();
      expect(result?.signals).toHaveLength(2);
      expect(result?.signals[0]).toEqual({
        type: 'tension',
        content: 'Real-time updates require persistent connection, but offline support requires working without connection',
        quote: 'real-time updates and offline support',
        severity: 'high',
      });
      expect(result?.signals[1]).toEqual({
        type: 'gap',
        content: 'No mention of authentication or authorization',
        quote: null, // Normalized to null
        severity: 'critical',
      });
      expect(result?.analysis).toBe('Found 1 tension and 1 critical gap');
    });

    it('should call LLM with correct parameters', async () => {
      vi.spyOn(llmClient, 'isLLMAvailable').mockReturnValue(true);
      const callLLMSpy = vi.spyOn(llmClient, 'callLLM').mockResolvedValue({
        signals: [],
        analysis: 'No issues found',
      });

      await detectSignalsWithLLM(mockEpicContent, mockStructuralPrompt);

      expect(callLLMSpy).toHaveBeenCalledWith(
        expect.stringContaining('You are a senior technical analyst'),
        expect.stringContaining(mockEpicContent),
        {
          temperature: 0.3,
          maxTokens: 2000,
        }
      );
    });

    it('should include structural analysis in user prompt', async () => {
      vi.spyOn(llmClient, 'isLLMAvailable').mockReturnValue(true);
      const callLLMSpy = vi.spyOn(llmClient, 'callLLM').mockResolvedValue({
        signals: [],
        analysis: 'All good',
      });

      await detectSignalsWithLLM(mockEpicContent, mockStructuralPrompt);

      const userPrompt = callLLMSpy.mock.calls[0]?.[1] as string;
      expect(userPrompt).toContain(mockEpicContent);
      expect(userPrompt).toContain(mockStructuralPrompt);
    });
  });
});
