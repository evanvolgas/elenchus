/**
 * Prompt Library for Elenchus
 *
 * Provides prompt templates for the calling LLM to use.
 * The calling LLM is the intelligence - these prompts provide structure.
 */

/**
 * Builds prompt for signal detection from epic content
 * Returns a prompt that guides Claude to identify claims, gaps, tensions, assumptions
 */
export function buildSignalDetectionPrompt(epicContent: string): string {
  return `You are analyzing an epic to detect signals that inform interrogation.

## EPIC CONTENT
${epicContent}

## YOUR TASK
Analyze this epic and identify:

1. **CLAIMS** - Explicit statements about what the system should do
2. **GAPS** - Important aspects NOT mentioned (error handling, auth, scale, security)
3. **TENSIONS** - Requirements that might conflict (simple vs enterprise, fast vs many features)
4. **ASSUMPTIONS** - Things taken for granted that should be verified

## OUTPUT FORMAT
Return JSON (no markdown, just JSON):

{
  "signals": [
    {
      "type": "claim|gap|tension|assumption",
      "content": "Description of the signal",
      "quote": "Relevant quote from epic if applicable, or null",
      "severity": "critical|high|medium|low"
    }
  ]
}

## SEVERITY GUIDE
- **critical**: Will definitely cause failure if not addressed
- **high**: Likely to cause problems
- **medium**: Should be clarified
- **low**: Nice to have clarity

## GUIDELINES
- Be thorough but not pedantic
- Focus on signals that affect implementation
- Quote the epic when identifying claims/tensions
- Prioritize signals that would block execution`;
}
