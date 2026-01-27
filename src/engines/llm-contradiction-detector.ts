/**
 * LLM-powered contradiction detector for Socratic elenchus.
 *
 * Uses Claude to detect semantic contradictions between premises extracted
 * from user answers. This goes beyond regex pattern matching to find logical
 * inconsistencies that would block or confuse implementation.
 */

import { callLLMText, isLLMAvailable } from './llm-client.js';

export interface DetectedContradiction {
  premiseIds: string[];
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  explanation: string; // WHY these can't coexist
  suggestedResolution: string; // How to resolve this
}

export interface LLMContradictionResult {
  contradictions: DetectedContradiction[];
  consistencyScore: number; // 0-100, how consistent the premises are overall
  analysis: string; // Brief analysis of logical coherence
}

export interface PremiseForAnalysis {
  id: string;
  statement: string;
  type: string;
  extractedFrom: string; // answer ID
}

/**
 * Detect contradictions between premises using LLM semantic analysis.
 * Returns null when LLM unavailable.
 */
export async function detectContradictionsWithLLM(
  premises: PremiseForAnalysis[],
  epicContent: string,
): Promise<LLMContradictionResult | null> {
  if (!isLLMAvailable()) {
    return null;
  }

  if (premises.length < 2) {
    // Need at least 2 premises to have a contradiction
    return {
      contradictions: [],
      consistencyScore: 100,
      analysis: 'Insufficient premises to detect contradictions.',
    };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(premises, epicContent);

  try {
    const response = await callLLMText(systemPrompt, userPrompt, {
      temperature: 0.2, // Low temperature for precise logical analysis
      maxTokens: 2000,
    });

    if (!response) {
      return null;
    }

    return parseContradictionResponse(response);
  } catch (error) {
    // If LLM fails, return null to allow fallback
    console.error('LLM contradiction detection failed:', error);
    return null;
  }
}

function buildSystemPrompt(): string {
  return `You are a logic analyst specialized in detecting contradictions in requirements and specifications.

Your task is to analyze stated premises (requirements, constraints, assumptions) and identify contradictions that would block or confuse implementation.

Focus on:

1. **Direct contradictions**: Where X says "must" and Y says "must not"
   Example: "Must work offline" vs "Must sync in real-time"

2. **Implicit contradictions**: Where requirements are logically incompatible
   Example: "No external dependencies" vs "Use AWS S3 for storage"

3. **Non-functional requirement tensions**: Where quality attributes conflict
   Example: "Maximum simplicity" vs "Enterprise-grade features"

4. **Conflicting assumptions**: Where stated assumptions cannot coexist
   Example: "Assume single user" vs "Assume concurrent multi-user access"

DO NOT report trivial tensions or trade-offs that are expected in software design.
ONLY report contradictions that would cause confusion, block implementation, or require explicit resolution.

Rate severity:
- **critical**: Cannot implement if both premises hold
- **high**: Implementation possible but deeply confused
- **medium**: Significant tension requiring clarification
- **low**: Minor inconsistency worth noting

For each contradiction:
- Identify which premise IDs are in conflict
- Explain WHY they cannot coexist
- Suggest a concrete resolution (not "discuss with stakeholder" - be specific)

Provide a consistency score (0-100):
- 100: Fully consistent, no contradictions
- 75-99: Minor tensions, mostly consistent
- 50-74: Moderate contradictions, needs clarification
- 25-49: Major contradictions, specification unclear
- 0-24: Fundamentally incoherent requirements

Return your analysis as JSON matching this structure:
{
  "contradictions": [
    {
      "premiseIds": ["premise-1", "premise-3"],
      "description": "Brief description of the contradiction",
      "severity": "critical|high|medium|low",
      "explanation": "Why these premises cannot coexist",
      "suggestedResolution": "Specific resolution strategy"
    }
  ],
  "consistencyScore": 85,
  "analysis": "Overall assessment of logical coherence"
}`;
}

function buildUserPrompt(
  premises: PremiseForAnalysis[],
  epicContent: string,
): string {
  const premisesText = premises
    .map(
      (p) =>
        `[${p.id}] (${p.type})\n${p.statement}\n(Extracted from answer: ${p.extractedFrom})`,
    )
    .join('\n\n');

  return `# Original Epic

${epicContent}

# Extracted Premises

${premisesText}

# Task

Analyze these premises for contradictions. Remember: only report contradictions that would actually block or confuse implementation, not every possible tension.

Return your analysis as JSON.`;
}

interface RawContradictionResponse {
  contradictions: Array<{
    premiseIds: string[];
    description: string;
    severity: string;
    explanation: string;
    suggestedResolution: string;
  }>;
  consistencyScore: number;
  analysis: string;
}

function parseContradictionResponse(response: string): LLMContradictionResult {
  try {
    // Extract JSON from response (may have markdown code blocks)
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonText = jsonMatch?.[1] ?? response;

    const parsed = JSON.parse(jsonText.trim()) as RawContradictionResponse;

    // Validate and normalize
    const contradictions: DetectedContradiction[] = (
      parsed.contradictions ?? []
    ).map((c) => ({
      premiseIds: Array.isArray(c.premiseIds) ? c.premiseIds : [],
      description: String(c.description ?? ''),
      severity: normalizeSeverity(c.severity),
      explanation: String(c.explanation ?? ''),
      suggestedResolution: String(c.suggestedResolution ?? ''),
    }));

    const consistencyScore = normalizeScore(parsed.consistencyScore);
    const analysis = String(parsed.analysis ?? '');

    return {
      contradictions,
      consistencyScore,
      analysis,
    };
  } catch (error) {
    // If parsing fails, return empty result
    console.error('Failed to parse contradiction response:', error);
    return {
      contradictions: [],
      consistencyScore: 50,
      analysis: 'Failed to parse LLM response.',
    };
  }
}

function normalizeSeverity(
  severity: string,
): 'critical' | 'high' | 'medium' | 'low' {
  const normalized = severity.toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  return 'low';
}

function normalizeScore(score: number): number {
  if (typeof score !== 'number' || isNaN(score)) {
    return 50;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
