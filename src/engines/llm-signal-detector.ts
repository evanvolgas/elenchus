/**
 * LLM Signal Detector
 *
 * Uses Claude to perform SEMANTIC signal detection on epic content.
 * Goes beyond structural/regex analysis to find:
 * - Contradictions between requirements
 * - Implicit assumptions that need verification
 * - Semantic gaps (not just keyword absence)
 * - Tensions between seemingly compatible requirements
 *
 * Falls back to null when LLM unavailable, allowing callers to use
 * structural analysis as fallback.
 */

import { callLLM, isLLMAvailable } from './llm-client.js';
import type { SignalType, SignalSeverity } from '../types/signals.js';

/**
 * Signal detected by LLM analysis
 */
export interface LLMSignal {
  type: SignalType;
  content: string;
  quote: string | null;
  severity: SignalSeverity;
}

/**
 * Result of LLM signal detection
 */
export interface LLMSignalDetectionResult {
  signals: LLMSignal[];
  analysis: string; // Brief summary of what the LLM found
}

/**
 * Response format expected from Claude
 */
interface LLMSignalResponse {
  signals: Array<{
    type: SignalType;
    content: string;
    quote?: string;
    severity: SignalSeverity;
  }>;
  analysis: string;
}

/**
 * System prompt for signal detection
 */
const SYSTEM_PROMPT = `You are a senior technical analyst specializing in requirements analysis.

Your task is to detect SIGNALS in epic/requirement documents:

**SIGNAL TYPES:**

1. **claim**: Explicit statements about what the system should do
   - "Users can filter by date range"
   - "Search results appear in under 200ms"
   - Look for: action verbs, explicit features, stated requirements

2. **gap**: Important aspects NOT mentioned (semantic, not just keyword absence)
   - Missing error handling strategies
   - No mention of authentication/authorization
   - Unclear scaling/performance expectations
   - Missing data validation approach
   - Look for: what a competent engineer would ask about

3. **tension**: Requirements that might conflict with each other
   - "Real-time updates" + "Must work offline"
   - "Sub-100ms latency" + "Complex aggregations on millions of records"
   - "Highly customizable" + "Simple for non-technical users"
   - Look for: requirements that pull in opposite directions

4. **assumption**: Things taken for granted that should be verified
   - Assuming users have stable internet
   - Assuming single timezone/locale
   - Assuming existing infrastructure capabilities
   - Look for: unstated premises, implied context

**SEVERITY LEVELS:**
- critical: Blocks implementation entirely
- high: Significant risk or ambiguity
- medium: Should be clarified but workarounds exist
- low: Minor clarification needed

**YOUR ANALYSIS APPROACH:**

1. Read the epic content carefully
2. Review the structural analysis (pre-computed metrics)
3. Go BEYOND structural analysis:
   - Find semantic contradictions (not just keyword presence)
   - Identify implicit assumptions (not just missing keywords)
   - Detect tensions between requirements that seem compatible
   - Note critical gaps that structural analysis missed

4. Return ONLY signals that would materially improve the spec
   - Don't report signals that are already adequately addressed
   - Focus on actionable items
   - Prioritize by severity

**OUTPUT FORMAT:**
Return valid JSON (no markdown):
{
  "signals": [
    {
      "type": "claim|gap|tension|assumption",
      "content": "Clear description of the signal",
      "quote": "Exact quote from epic if applicable (or omit if not)",
      "severity": "critical|high|medium|low"
    }
  ],
  "analysis": "Brief summary of what you found (2-3 sentences)"
}`;

/**
 * Detect signals in epic content using LLM.
 * Falls back to null when LLM unavailable.
 *
 * @param epicContent - Raw epic text
 * @param structuralAnalysisPrompt - The analysisPrompt from quality-detector (pre-computed structural findings)
 * @returns LLM signals or null if unavailable
 */
export async function detectSignalsWithLLM(
  epicContent: string,
  structuralAnalysisPrompt: string,
): Promise<LLMSignalDetectionResult | null> {
  // Early exit if LLM not available
  if (!isLLMAvailable()) {
    return null;
  }

  // Build user prompt combining epic content and structural analysis
  const userPrompt = `# EPIC CONTENT

${epicContent}

---

# STRUCTURAL ANALYSIS (Pre-computed)

${structuralAnalysisPrompt}

---

# YOUR TASK

Analyze the epic content above and detect signals (claims, gaps, tensions, assumptions).
Use the structural analysis as context, but go BEYOND it to find semantic issues.

Return your findings as JSON.`;

  // Call Claude with temperature 0.3 for deterministic but not overly rigid analysis
  const response = await callLLM<LLMSignalResponse>(
    SYSTEM_PROMPT,
    userPrompt,
    {
      temperature: 0.3,
      maxTokens: 2000,
    }
  );

  // Return null if call failed or response malformed
  if (!response?.signals || !response.analysis) {
    return null;
  }

  // Normalize the response to ensure all fields are present
  const signals: LLMSignal[] = response.signals.map(signal => ({
    type: signal.type,
    content: signal.content,
    quote: signal.quote ?? null,
    severity: signal.severity,
  }));

  return {
    signals,
    analysis: response.analysis,
  };
}
