/**
 * LLM Spec Enhancer Engine
 *
 * Uses Claude to ENHANCE a structurally-synthesized specification with semantic intelligence.
 * The spec-synthesizer.ts produces a StructuredSpec from Q&A data using templates.
 * This module takes that output and improves it with LLM reasoning.
 *
 * Key features:
 * 1. Synthesizes a real problem statement (not template boilerplate)
 * 2. Identifies implicit requirements not explicitly stated
 * 3. Identifies risks the user didn't mention
 * 4. Flags remaining unknowns with recommendations
 * 5. Generates executive summary
 *
 * Gracefully degrades when LLM is unavailable (returns null).
 */

import { callLLM, isLLMAvailable } from './llm-client.js';
import { logger } from '../utils/logger.js';

/**
 * Enhanced fields that the LLM can improve
 */
export interface SpecEnhancement {
  /** Improved problem statement synthesized from Q&A (not template-filled) */
  problemStatement: string;
  /** Inferred requirements NOT explicitly stated but implied by answers */
  inferredRequirements: Array<{
    description: string;
    basis: string; // What answers/facts suggest this
    confidence: 'high' | 'medium' | 'low';
    category: string;
  }>;
  /** Risks the user didn't mention but the LLM identifies */
  inferredRisks: Array<{
    risk: string;
    likelihood: 'high' | 'medium' | 'low';
    impact: 'high' | 'medium' | 'low';
    mitigation: string;
    basis: string;
  }>;
  /** Remaining unknowns and ambiguities with recommendations */
  unknowns: Array<{
    area: string;
    question: string;
    impact: 'high' | 'medium' | 'low';
    recommendation: string;
  }>;
  /** Brief executive summary of the spec */
  executiveSummary: string;
}

/**
 * Internal schema for LLM response validation
 */
interface LLMEnhancementResponse {
  problemStatement: string;
  inferredRequirements: Array<{
    description: string;
    basis: string;
    confidence: 'high' | 'medium' | 'low';
    category: string;
  }>;
  inferredRisks: Array<{
    risk: string;
    likelihood: 'high' | 'medium' | 'low';
    impact: 'high' | 'medium' | 'low';
    mitigation: string;
    basis: string;
  }>;
  unknowns: Array<{
    area: string;
    question: string;
    impact: 'high' | 'medium' | 'low';
    recommendation: string;
  }>;
  executiveSummary: string;
}

/**
 * System prompt for the LLM enhancement task
 */
const SYSTEM_PROMPT = `You are a senior technical product manager reviewing a specification.

Your job is to ENHANCE a structurally-synthesized specification with semantic intelligence. You will receive:
1. The original epic text
2. The full Q&A history from interrogation
3. A summary of the structural specification already generated

Your task is to SYNTHESIZE — not just repeat what was said, but find the meaning between the lines:

1. **Problem Statement**: Write a REAL problem statement that captures the essence of what was discussed. Not template boilerplate. What problem are we actually solving? Why does it matter?

2. **Inferred Requirements**: Identify requirements that are IMPLICIT in the answers but not explicitly stated. Read between the lines. What do their choices imply about unstated needs?

3. **Inferred Risks**: Identify risks the user didn't mention but that logically follow from their technical choices, constraints, or scope. What could go wrong that they haven't thought about?

4. **Unknowns**: Flag remaining ambiguities and unknowns that should be clarified. What critical questions remain unanswered? What will bite us later if not addressed?

5. **Executive Summary**: Write a 2-3 sentence summary for stakeholders who need the gist.

**CRITICAL INSTRUCTIONS**:
- DO NOT repeat what's already in the structural spec
- DO connect dots the user didn't explicitly connect
- DO flag what's missing or ambiguous
- DO identify implied requirements from their choices
- DO identify risks that follow from their decisions
- DO be specific and actionable
- DO NOT make wild guesses — base everything on the Q&A content
- DO indicate confidence levels (high/medium/low)

Return your analysis as a JSON object with this exact structure:

{
  "problemStatement": "string - the synthesized problem statement",
  "inferredRequirements": [
    {
      "description": "string - what requirement is implied",
      "basis": "string - what in the Q&A suggests this",
      "confidence": "high" | "medium" | "low",
      "category": "string - functional/non-functional/constraint/etc"
    }
  ],
  "inferredRisks": [
    {
      "risk": "string - what could go wrong",
      "likelihood": "high" | "medium" | "low",
      "impact": "high" | "medium" | "low",
      "mitigation": "string - recommended mitigation",
      "basis": "string - what in their choices creates this risk"
    }
  ],
  "unknowns": [
    {
      "area": "string - what area (scope/technical/etc)",
      "question": "string - what's still unclear",
      "impact": "high" | "medium" | "low",
      "recommendation": "string - what to do about it"
    }
  ],
  "executiveSummary": "string - 2-3 sentence summary for stakeholders"
}

Focus on SYNTHESIS and INFERENCE. Your value is in seeing what the structural analysis cannot see.`;

/**
 * Build the user prompt with all context
 */
function buildUserPrompt(
  epicContent: string,
  qaLog: Array<{ question: string; answer: string; area: string }>,
  structuralSpecSummary: string
): string {
  const qaText = qaLog
    .map((qa, i) => `Q${i + 1} [${qa.area}]: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n');

  return `# Original Epic

${epicContent}

---

# Q&A History (${qaLog.length} questions)

${qaText}

---

# Structural Spec Summary

${structuralSpecSummary}

---

Please analyze the above and provide your enhancement in JSON format as specified.`;
}

/**
 * Validate the LLM response structure
 */
function validateEnhancement(response: unknown): response is SpecEnhancement {
  if (!response || typeof response !== 'object') return false;

  const r = response as Record<string, unknown>;

  // Check required top-level fields
  if (typeof r.problemStatement !== 'string') return false;
  if (typeof r.executiveSummary !== 'string') return false;
  if (!Array.isArray(r.inferredRequirements)) return false;
  if (!Array.isArray(r.inferredRisks)) return false;
  if (!Array.isArray(r.unknowns)) return false;

  // Validate inferredRequirements array
  for (const req of r.inferredRequirements) {
    if (!req || typeof req !== 'object') return false;
    const reqObj = req as Record<string, unknown>;
    if (
      typeof reqObj.description !== 'string' ||
      typeof reqObj.basis !== 'string' ||
      typeof reqObj.category !== 'string' ||
      !['high', 'medium', 'low'].includes(reqObj.confidence as string)
    ) {
      return false;
    }
  }

  // Validate inferredRisks array
  for (const risk of r.inferredRisks) {
    if (!risk || typeof risk !== 'object') return false;
    const riskObj = risk as Record<string, unknown>;
    if (
      typeof riskObj.risk !== 'string' ||
      typeof riskObj.mitigation !== 'string' ||
      typeof riskObj.basis !== 'string' ||
      !['high', 'medium', 'low'].includes(riskObj.likelihood as string) ||
      !['high', 'medium', 'low'].includes(riskObj.impact as string)
    ) {
      return false;
    }
  }

  // Validate unknowns array
  for (const unknown of r.unknowns) {
    if (!unknown || typeof unknown !== 'object') return false;
    const unknownObj = unknown as Record<string, unknown>;
    if (
      typeof unknownObj.area !== 'string' ||
      typeof unknownObj.question !== 'string' ||
      typeof unknownObj.recommendation !== 'string' ||
      !['high', 'medium', 'low'].includes(unknownObj.impact as string)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Enhance a structurally-synthesized spec with LLM intelligence.
 * Returns null when LLM unavailable.
 *
 * @param epicContent - Original epic text
 * @param qaLog - Full Q&A history
 * @param structuralSpecSummary - Summary of what the structural synthesizer produced
 */
export async function enhanceSpecWithLLM(
  epicContent: string,
  qaLog: Array<{ question: string; answer: string; area: string }>,
  structuralSpecSummary: string
): Promise<SpecEnhancement | null> {
  // Check if LLM is available
  if (!isLLMAvailable()) {
    logger.info('LLM unavailable, skipping spec enhancement');
    return null;
  }

  logger.info('Enhancing spec with LLM', {
    epicLength: epicContent.length,
    qaCount: qaLog.length,
  });

  try {
    // Build prompt
    const userPrompt = buildUserPrompt(epicContent, qaLog, structuralSpecSummary);

    // Call LLM
    const response = await callLLM<LLMEnhancementResponse>(
      SYSTEM_PROMPT,
      userPrompt,
      {
        temperature: 0.4, // Balanced synthesis
        maxTokens: 3000,
      }
    );

    if (!response) {
      logger.warn('LLM returned null response');
      return null;
    }

    // Validate response structure
    if (!validateEnhancement(response)) {
      logger.error('LLM response failed validation', { response });
      return null;
    }

    logger.info('Successfully enhanced spec with LLM', {
      inferredReqCount: response.inferredRequirements.length,
      inferredRiskCount: response.inferredRisks.length,
      unknownCount: response.unknowns.length,
    });

    return response;
  } catch (error) {
    logger.error('Failed to enhance spec with LLM', { error });
    return null;
  }
}
