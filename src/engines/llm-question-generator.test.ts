/**
 * Tests for LLM Question Generator Engine
 *
 * Note: These tests mock the LLM client since we can't rely on API keys
 * being available in CI/test environments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as llmClient from './llm-client.js';
import {
  generateQuestionsWithLLM,
  isLLMAvailable,
  type GenerateQuestionsParams,
  type LLMQuestionGenerationResult,
} from './llm-question-generator.js';

// Mock the LLM client module
vi.mock('./llm-client.js', () => ({
  isLLMAvailable: vi.fn(),
  callLLM: vi.fn(),
}));

describe('LLM Question Generator Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateQuestionsWithLLM', () => {
    it('should return null when LLM is not available', async () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(false);

      const params: GenerateQuestionsParams = {
        epicContent: 'Build a dashboard',
        tier: 1,
        strategy: 'comprehensive',
        previousQA: [],
        signals: [],
        coverageGaps: ['scope', 'success'],
        maxQuestions: 5,
      };

      const result = await generateQuestionsWithLLM(params);

      expect(result).toBeNull();
      expect(llmClient.isLLMAvailable).toHaveBeenCalled();
      expect(llmClient.callLLM).not.toHaveBeenCalled();
    });

    it('should return null when LLM returns null', async () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(true);
      vi.mocked(llmClient.callLLM).mockResolvedValue(null);

      const params: GenerateQuestionsParams = {
        epicContent: 'Build a dashboard',
        tier: 1,
        strategy: 'comprehensive',
        previousQA: [],
        signals: [],
        coverageGaps: ['scope', 'success'],
        maxQuestions: 5,
      };

      const result = await generateQuestionsWithLLM(params);

      expect(result).toBeNull();
      expect(llmClient.callLLM).toHaveBeenCalled();
    });

    it('should generate questions for tier 1 with proper context', async () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(true);

      const mockResponse: LLMQuestionGenerationResult = {
        questions: [
          {
            question: 'Who will use this dashboard?',
            area: 'scope',
            reason: 'User roles not defined in epic',
            priority: 'critical',
            basedOn: 'No stakeholders mentioned in epic',
          },
          {
            question: 'What specific metrics will the dashboard display?',
            area: 'scope',
            reason: 'Epic mentions "dashboard" but not specific data',
            priority: 'critical',
            basedOn: 'Epic content: "Build a dashboard"',
          },
          {
            question: 'How will you know the dashboard works correctly?',
            area: 'success',
            reason: 'No acceptance criteria defined',
            priority: 'critical',
            basedOn: 'Missing success criteria',
          },
        ],
      };

      vi.mocked(llmClient.callLLM).mockResolvedValue(mockResponse);

      const params: GenerateQuestionsParams = {
        epicContent: 'Build a dashboard for monitoring user activity',
        tier: 1,
        strategy: 'comprehensive',
        previousQA: [],
        signals: [
          { type: 'gap', content: 'No user roles defined', severity: 'high' },
          { type: 'gap', content: 'No acceptance criteria', severity: 'critical' },
        ],
        coverageGaps: ['scope', 'success', 'constraint'],
        maxQuestions: 5,
      };

      const result = await generateQuestionsWithLLM(params);

      expect(result).not.toBeNull();
      expect(result?.questions).toHaveLength(3);
      expect(result?.questions[0]?.area).toBe('scope');
      expect(result?.questions[0]?.priority).toBe('critical');
      expect(llmClient.callLLM).toHaveBeenCalledWith(
        expect.stringContaining('Socratic interrogation'),
        expect.stringContaining('Build a dashboard'),
        expect.objectContaining({
          maxTokens: 2000,
          temperature: 0.5,
        })
      );
    });

    it('should include previous Q&A in context', async () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(true);

      const mockResponse: LLMQuestionGenerationResult = {
        questions: [
          {
            question: 'You said "admins and users" - do they have different permission levels?',
            area: 'scope',
            reason: 'Follow-up on vague answer about users',
            priority: 'high',
            basedOn: 'Previous answer: "admins and users" (score 2)',
          },
        ],
      };

      vi.mocked(llmClient.callLLM).mockResolvedValue(mockResponse);

      const params: GenerateQuestionsParams = {
        epicContent: 'Build a dashboard',
        tier: 2,
        strategy: 'targeted',
        previousQA: [
          {
            area: 'scope',
            question: 'Who will use this?',
            answer: 'Admins and users',
            score: 2,
          },
        ],
        signals: [],
        coverageGaps: [],
        maxQuestions: 3,
      };

      const result = await generateQuestionsWithLLM(params);

      expect(result).not.toBeNull();
      expect(llmClient.callLLM).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Previous Q&A'),
        expect.any(Object)
      );

      // Verify the prompt includes the previous Q&A
      const callArgs = vi.mocked(llmClient.callLLM).mock.calls[0];
      expect(callArgs?.[1]).toContain('Who will use this?');
      expect(callArgs?.[1]).toContain('Admins and users');
    });

    it('should adapt questions based on tier', async () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(true);

      const mockResponseTier4: LLMQuestionGenerationResult = {
        questions: [
          {
            question: 'At 10x scale, what part of the dashboard breaks first?',
            area: 'constraint',
            reason: 'Scale implications not discussed',
            priority: 'high',
            basedOn: 'Data volume mentioned but scale not addressed',
          },
        ],
      };

      vi.mocked(llmClient.callLLM).mockResolvedValue(mockResponseTier4);

      const params: GenerateQuestionsParams = {
        epicContent: 'Build a dashboard that displays user metrics',
        tier: 4,
        strategy: 'refinement',
        previousQA: [
          {
            area: 'scope',
            question: 'What metrics?',
            answer: 'Active users, page views, session duration',
            score: 4,
          },
        ],
        signals: [],
        coverageGaps: [],
        maxQuestions: 2,
      };

      const result = await generateQuestionsWithLLM(params);

      expect(result).not.toBeNull();
      expect(result?.questions[0]?.question).toContain('10x scale');
      expect(result?.questions[0]?.area).toBe('constraint');

      // Verify tier 4 context is included
      const callArgs = vi.mocked(llmClient.callLLM).mock.calls[0];
      expect(callArgs?.[1]).toContain('Tier: 4');
      expect(callArgs?.[1]).toContain('Refinement');
    });

    it('should handle invalid LLM response gracefully', async () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(true);

      // Invalid response: missing required fields
      const invalidResponse = {
        questions: [
          {
            question: 'What is the purpose?',
            // Missing area, reason, priority, basedOn
          },
        ],
      };

      vi.mocked(llmClient.callLLM).mockResolvedValue(invalidResponse);

      const params: GenerateQuestionsParams = {
        epicContent: 'Build a system',
        tier: 1,
        strategy: 'comprehensive',
        previousQA: [],
        signals: [],
        coverageGaps: [],
        maxQuestions: 5,
      };

      const result = await generateQuestionsWithLLM(params);

      // Should return null when parsing fails
      expect(result).toBeNull();
    });

    it('should validate question areas', async () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(true);

      const responseWithInvalidArea = {
        questions: [
          {
            question: 'What is the purpose?',
            area: 'invalid_area', // Invalid area
            reason: 'Testing validation',
            priority: 'high',
            basedOn: 'Test',
          },
        ],
      };

      vi.mocked(llmClient.callLLM).mockResolvedValue(responseWithInvalidArea);

      const params: GenerateQuestionsParams = {
        epicContent: 'Build a system',
        tier: 1,
        strategy: 'comprehensive',
        previousQA: [],
        signals: [],
        coverageGaps: [],
        maxQuestions: 5,
      };

      const result = await generateQuestionsWithLLM(params);

      // Should return null due to invalid area
      expect(result).toBeNull();
    });

    it('should validate question priorities', async () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(true);

      const responseWithInvalidPriority = {
        questions: [
          {
            question: 'What is the purpose?',
            area: 'scope',
            reason: 'Testing validation',
            priority: 'super_urgent', // Invalid priority
            basedOn: 'Test',
          },
        ],
      };

      vi.mocked(llmClient.callLLM).mockResolvedValue(responseWithInvalidPriority);

      const params: GenerateQuestionsParams = {
        epicContent: 'Build a system',
        tier: 1,
        strategy: 'comprehensive',
        previousQA: [],
        signals: [],
        coverageGaps: [],
        maxQuestions: 5,
      };

      const result = await generateQuestionsWithLLM(params);

      // Should return null due to invalid priority
      expect(result).toBeNull();
    });
  });

  describe('isLLMAvailable', () => {
    it('should return true when LLM is available', () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(true);

      const result = isLLMAvailable();

      expect(result).toBe(true);
      expect(llmClient.isLLMAvailable).toHaveBeenCalled();
    });

    it('should return false when LLM is not available', () => {
      vi.mocked(llmClient.isLLMAvailable).mockReturnValue(false);

      const result = isLLMAvailable();

      expect(result).toBe(false);
      expect(llmClient.isLLMAvailable).toHaveBeenCalled();
    });
  });
});
