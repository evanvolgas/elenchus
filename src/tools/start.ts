import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Epic } from '../types/index.js';
import type { InterrogationStrategy } from '../types/tiers.js';
import { CreateEpicInputSchema } from '../types/index.js';
import { generateId } from '../utils/id.js';
import { buildSignalDetectionPrompt } from '../prompts/index.js';
import { detectQualityTier, type QualityAssessment } from '../engines/quality-detector.js';
import { TIER_TO_STRATEGY } from '../types/tiers.js';
import { detectSignalsWithLLM } from '../engines/llm-signal-detector.js';
import { generateQuestionsWithLLM } from '../engines/llm-question-generator.js';

/**
 * elenchus_start - Begin interrogation of an epic
 *
 * This is the entry point. Takes raw epic content, creates the epic and session,
 * detects signals, and returns suggested first-round questions.
 */
export const startTool: Tool = {
  name: 'elenchus_start',
  description: `Begin Socratic interrogation of an epic.

Takes raw epic content and:
1. Stores the epic
2. Detects signals (claims, gaps, tensions, assumptions)
3. Creates an interrogation session
4. Returns suggested questions to ask the user

## Example

\`\`\`json
{
  "source": "text",
  "content": "Build a user dashboard that shows activity metrics. Users should be able to filter by date range."
}
\`\`\`

## What You Get Back

- **epicId** and **sessionId** for tracking
- **signals** - gaps, tensions, assumptions detected in the epic
- **suggestedQuestions** - first-round questions to ask the user
- **nextStep** - what to do next

## Your Job

1. Call this tool with the user's epic
2. Review the detected signals
3. Ask the user the suggested questions (or better ones based on signals)
4. Call \`elenchus_qa\` with their answers`,

  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['text', 'structured'],
        description: 'Source type (use "text" for raw content)',
      },
      content: {
        type: 'string',
        description: 'The epic content to interrogate',
      },
      title: {
        type: 'string',
        description: 'Optional title (extracted automatically if not provided)',
      },
    },
    required: ['source', 'content'],
  },
};

/**
 * Suggested question for the calling LLM to ask
 */
interface SuggestedQuestion {
  question: string;
  area: 'scope' | 'success' | 'constraint' | 'risk' | 'technical';
  basedOn: string; // What signal/gap this addresses
  priority: 'critical' | 'high' | 'medium';
}

/**
 * Result from elenchus_start
 */
export interface StartResult {
  epicId: string;
  sessionId: string;
  epic: {
    title: string;
    description: string;
  };
  // Quality assessment - the KEY to adaptive interrogation
  quality: {
    tier: 1 | 2 | 3 | 4 | 5;
    strategy: InterrogationStrategy;
    assessment: QualityAssessment;
    questionCount: { min: number; max: number };
  };
  signals: {
    claims: Array<{ content: string; quote?: string }>;
    gaps: Array<{ content: string; severity: string }>;
    tensions: Array<{ content: string; severity: string }>;
    assumptions: Array<{ content: string }>;
  };
  suggestedQuestions: SuggestedQuestion[];
  signalDetectionPrompt: string;
  nextStep: string;
  /** Whether LLM-powered analysis was used (vs structural-only fallback) */
  llmEnhanced: boolean;
}

/**
 * Handle start - create epic, session, detect signals, suggest questions
 */
export async function handleStart(
  args: Record<string, unknown>,
  storage: Storage
): Promise<StartResult> {
  const input = CreateEpicInputSchema.parse(args);

  if (input.source !== 'text' && input.source !== 'structured') {
    throw new Error(`Source "${input.source}" not supported. Use "text".`);
  }

  const now = new Date().toISOString();
  const epicId = generateId('epic');
  const sessionId = generateId('session');

  // Extract basic info from content
  const extracted = extractFromContent(input.content);

  // Create and save epic
  const epic: Epic = {
    id: epicId,
    source: input.source,
    title: input.title ?? extracted.title,
    description: extracted.description,
    rawContent: input.content,
    extractedGoals: extracted.goals,
    extractedConstraints: extracted.constraints,
    extractedAcceptanceCriteria: extracted.acceptanceCriteria,
    extractedStakeholders: [],
    linkedResources: [],
    status: 'interrogating',
    createdAt: now,
    updatedAt: now,
  };
  storage.saveEpic(epic);

  // Create and save session
  const session = {
    id: sessionId,
    epicId,
    status: 'in-progress' as const,
    questions: [],
    answers: [],
    clarityScore: 0,
    completenessScore: 0,
    readyForSpec: false,
    blockers: [],
    round: 1,
    maxRounds: 10,
    startedAt: now,
    updatedAt: now,
  };
  storage.saveSession(session);

  // CRITICAL: Detect quality tier FIRST - this drives everything
  const qualityAssessment = detectQualityTier(input.content);
  const tier = qualityAssessment.tier;
  const strategy = TIER_TO_STRATEGY[tier];

  // Determine question count based on tier
  // Higher tier = fewer questions needed (spec is already good)
  const questionCountByTier: Record<number, { min: number; max: number }> = {
    1: { min: 5, max: 7 },   // Vague: need lots of foundation
    2: { min: 4, max: 6 },   // Minimal: need extraction
    3: { min: 3, max: 5 },   // Partial: targeted gaps
    4: { min: 2, max: 4 },   // Detailed: refinement
    5: { min: 2, max: 3 },   // Complete: validation only
  };
  const questionCount = questionCountByTier[tier] ?? { min: 3, max: 5 };

  // Generate signal detection prompt for Claude to analyze
  const signalDetectionPrompt = buildSignalDetectionPrompt(input.content);

  // ========================================================================
  // LLM-ENHANCED: Try to use Claude for semantic signal detection
  // Falls back to structural analysis if API key unavailable
  // ========================================================================
  let llmEnhanced = false;

  // Structural signals (always computed as baseline)
  const assessmentGaps = qualityAssessment.areaCoverage
    .filter((ac: { level: string }) => ac.level === 'absent' || ac.level === 'mentioned')
    .flatMap((ac: { area: string; missing: string[] }) => ac.missing.map((m: string) => ({ content: `${ac.area}: ${m}`, severity: 'high' })));

  const structuralSignals = {
    claims: extracted.goals.map((g: string) => ({ content: g })),
    gaps: [
      ...generateGapHints(input.content),
      ...assessmentGaps,
    ],
    tensions: [] as Array<{ content: string; severity: string }>,
    assumptions: generateAssumptionHints(input.content),
  };

  // Try LLM signal detection (uses the analysisPrompt that was previously orphaned)
  const llmSignals = await detectSignalsWithLLM(input.content, qualityAssessment.analysisPrompt);

  // Merge LLM signals with structural signals
  let signals: typeof structuralSignals;
  if (llmSignals) {
    llmEnhanced = true;
    // LLM signals supplement structural ones
    signals = {
      claims: [
        ...structuralSignals.claims,
        ...llmSignals.signals
          .filter(s => s.type === 'claim')
          .map(s => ({ content: s.content, quote: s.quote ?? undefined })),
      ],
      gaps: [
        ...structuralSignals.gaps,
        ...llmSignals.signals
          .filter(s => s.type === 'gap')
          .map(s => ({ content: s.content, severity: s.severity })),
      ],
      tensions: llmSignals.signals
        .filter(s => s.type === 'tension')
        .map(s => ({ content: s.content, severity: s.severity })),
      assumptions: [
        ...structuralSignals.assumptions,
        ...llmSignals.signals
          .filter(s => s.type === 'assumption')
          .map(s => ({ content: s.content })),
      ],
    };
  } else {
    signals = structuralSignals;
  }

  // ========================================================================
  // LLM-ENHANCED: Try contextual question generation
  // Falls back to template-based questions if LLM unavailable
  // ========================================================================

  // Structural questions (always generated as fallback)
  const templateQuestions = generateInitialQuestions(extracted, input.content, qualityAssessment);

  // Try LLM-powered contextual questions
  const coverageGapNames = qualityAssessment.areaCoverage
    .filter((ac: { level: string }) => ac.level === 'absent' || ac.level === 'mentioned')
    .map((ac: { area: string }) => ac.area);

  const llmQuestions = await generateQuestionsWithLLM({
    epicContent: input.content,
    tier,
    strategy,
    previousQA: [],
    signals: signals.gaps.map(g => ({ type: 'gap', content: g.content, severity: g.severity })),
    coverageGaps: coverageGapNames,
    maxQuestions: questionCount.max,
  });

  // Use LLM questions if available, otherwise fall back to templates
  let suggestedQuestions: SuggestedQuestion[];
  if (llmQuestions && llmQuestions.questions.length > 0) {
    llmEnhanced = true;
    suggestedQuestions = llmQuestions.questions.map(q => ({
      question: q.question,
      area: q.area,
      basedOn: q.basedOn,
      priority: q.priority,
    }));
  } else {
    suggestedQuestions = templateQuestions;
  }

  // Build tier-appropriate next step
  const tierGuidance: Record<number, string> = {
    1: 'This spec is VAGUE (Tier 1). Focus on FOUNDATION: who, what, why. Get basic facts before details.',
    2: 'This spec has basics but lacks DEPTH (Tier 2). EXTRACT concrete requirements, metrics, entities.',
    3: 'This spec has good coverage but GAPS exist (Tier 3). TARGET specific missing areas.',
    4: 'This spec is DETAILED but has edge cases (Tier 4). REFINE ambiguities and corner cases.',
    5: 'This spec is COMPLETE (Tier 5). Just VALIDATE consistency and completeness.',
  };

  const llmNote = llmEnhanced ? ' (LLM-enhanced analysis)' : ' (structural analysis only - set ANTHROPIC_API_KEY for deeper analysis)';

  return {
    epicId,
    sessionId,
    epic: {
      title: epic.title,
      description: epic.description,
    },
    quality: {
      tier,
      strategy,
      assessment: qualityAssessment,
      questionCount,
    },
    signals,
    suggestedQuestions,
    signalDetectionPrompt,
    nextStep: `${tierGuidance[tier]} Ask ${questionCount.min}-${questionCount.max} questions, then submit via elenchus_qa.${llmNote}`,
    llmEnhanced,
  };
}

/**
 * Extract basic structure from epic content
 */
function extractFromContent(content: string): {
  title: string;
  description: string;
  goals: string[];
  constraints: string[];
  acceptanceCriteria: string[];
} {
  const lines = content.split('\n').filter(line => line.trim());

  // Title: first line or first heading
  let title = 'Untitled Epic';
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    title = headingMatch[1];
  } else if (lines[0]) {
    title = lines[0].slice(0, 100);
  }

  // Description: first paragraph
  const description = content.slice(0, 500);

  // Goals: look for action verbs
  const goals: string[] = [];
  const goalPatterns = /(?:should|must|need to|want to|will)\s+([^.!?]+)/gi;
  let match;
  while ((match = goalPatterns.exec(content)) !== null) {
    if (match[1] && match[1].length > 10) {
      goals.push(match[1].trim());
    }
  }

  // Constraints: look for limiting language
  const constraints: string[] = [];
  const constraintPatterns = /(?:must not|cannot|should not|within|under|maximum|minimum|at least|no more than)\s+([^.!?]+)/gi;
  while ((match = constraintPatterns.exec(content)) !== null) {
    if (match[1]) {
      constraints.push(match[1].trim());
    }
  }

  // Acceptance criteria: look for success conditions
  const acceptanceCriteria: string[] = [];
  const criteriaPatterns = /(?:done when|success when|complete when|verified by|tested by)\s+([^.!?]+)/gi;
  while ((match = criteriaPatterns.exec(content)) !== null) {
    if (match[1]) {
      acceptanceCriteria.push(match[1].trim());
    }
  }

  return { title, description, goals, constraints, acceptanceCriteria };
}

/**
 * Generate initial questions based on QUALITY TIER and what's missing
 *
 * KEY CHANGE: Questions are tier-appropriate!
 * - Tier 1: Foundation (who/what/why)
 * - Tier 2: Extraction (concrete metrics/entities)
 * - Tier 3: Targeted (specific gaps)
 * - Tier 4: Refinement (edge cases)
 * - Tier 5: Validation (confirmation)
 */
function generateInitialQuestions(
  _extracted: { goals: string[]; constraints: string[]; acceptanceCriteria: string[] },
  content: string,
  assessment: QualityAssessment
): SuggestedQuestion[] {
  const questions: SuggestedQuestion[] = [];
  const tier = assessment.tier;

  // Helper to check area coverage
  const getAreaLevel = (area: string): string => {
    const ac = assessment.areaCoverage.find((a: { area: string }) => a.area === area);
    return ac?.level ?? 'absent';
  };

  const hasActors = assessment.specificityMap.hasActors;
  const hasNumbers = assessment.specificityMap.hasNumbers;
  const hasTestable = assessment.specificityMap.hasTestableConditions;
  const hasTech = assessment.specificityMap.hasTechnology;
  const hasVague = assessment.specificityMap.hasVagueLanguage;

  // TIER 1 & 2: Foundation questions (for vague specs)
  if (tier <= 2) {
    if (getAreaLevel('scope') === 'absent' || getAreaLevel('scope') === 'mentioned') {
      questions.push({
        question: 'What is the CORE problem being solved? One sentence, no jargon.',
        area: 'scope',
        basedOn: 'No clear scope defined',
        priority: 'critical',
      });
    }

    if (!hasActors) {
      questions.push({
        question: 'WHO will use this? Be specific - job titles, technical level, how often they use it.',
        area: 'scope',
        basedOn: 'Users not clearly defined',
        priority: 'critical',
      });
    }

    if (getAreaLevel('success') === 'absent' || !hasTestable) {
      questions.push({
        question: 'How will you KNOW this works? What specific test would prove success?',
        area: 'success',
        basedOn: 'No success criteria detected',
        priority: 'critical',
      });
    }
  }

  // TIER 2 & 3: Extraction questions (for specs that need metrics)
  if (tier >= 2 && tier <= 3) {
    if (!hasNumbers) {
      questions.push({
        question: 'You mentioned goals but without NUMBERS. What specific metrics define success? (e.g., "reduce X by Y%")',
        area: 'success',
        basedOn: 'Goals lack quantifiable metrics',
        priority: 'high',
      });
    }

    if (assessment.metrics.specificityScore < 50) {
      questions.push({
        question: 'What are the PERFORMANCE requirements? Response time? Throughput? Concurrent users?',
        area: 'constraint',
        basedOn: 'Performance requirements not quantified',
        priority: 'high',
      });
    }

    if (getAreaLevel('constraint') === 'absent' || getAreaLevel('constraint') === 'mentioned') {
      questions.push({
        question: 'What CONSTRAINTS exist? Timeline, budget, technology mandates, compliance requirements?',
        area: 'constraint',
        basedOn: 'No constraints detected',
        priority: 'high',
      });
    }
  }

  // TIER 3 & 4: Targeted gap questions
  if (tier >= 3 && tier <= 4) {
    if (getAreaLevel('risk') === 'absent' || getAreaLevel('risk') === 'mentioned') {
      questions.push({
        question: 'What could go WRONG? What are the biggest risks and how do you mitigate them?',
        area: 'risk',
        basedOn: 'Risk analysis missing',
        priority: 'high',
      });
    }

    if (!hasTech && content.toLowerCase().includes('data')) {
      questions.push({
        question: 'Data is mentioned but security is not. What are the SECURITY requirements?',
        area: 'constraint',
        basedOn: 'Data mentioned without security requirements',
        priority: 'high',
      });
    }

    // Address specific gaps from area coverage
    const areasWithGaps = assessment.areaCoverage
      .filter((ac: { level: string }) => ac.level !== 'detailed')
      .slice(0, 2);
    for (const areaGap of areasWithGaps) {
      if (areaGap.missing.length > 0) {
        questions.push({
          question: `Gap detected: "${areaGap.area} - ${areaGap.missing[0]}". Can you clarify this?`,
          area: areaGap.area as 'scope' | 'success' | 'constraint' | 'risk' | 'technical',
          basedOn: `Coverage gap: ${areaGap.missing[0]}`,
          priority: 'medium',
        });
      }
    }
  }

  // TIER 4 & 5: Refinement and validation
  if (tier >= 4) {
    questions.push({
      question: 'What EDGE CASES should be handled? Empty input, maximum scale, concurrent modification?',
      area: 'risk',
      basedOn: 'Edge cases need explicit handling at high tiers',
      priority: 'medium',
    });

    questions.push({
      question: 'What is explicitly OUT OF SCOPE? What should this NOT attempt?',
      area: 'scope',
      basedOn: 'Scope boundaries prevent creep',
      priority: 'medium',
    });
  }

  // TIER 5 ONLY: Validation questions
  if (tier === 5) {
    questions.push({
      question: 'The spec looks complete. Is there anything MISSING that we haven\'t discussed?',
      area: 'scope',
      basedOn: 'Final validation check',
      priority: 'medium',
    });

    questions.push({
      question: 'Review the requirements. Any CONFLICTS or things that can\'t coexist?',
      area: 'risk',
      basedOn: 'Consistency validation',
      priority: 'medium',
    });
  }

  // Address vague language if detected
  if (hasVague && assessment.specificityMap.vaguePhrases.length > 0 && questions.length < 5) {
    const vaguePhrase = assessment.specificityMap.vaguePhrases[0];
    questions.push({
      question: `You used "${vaguePhrase}". Can you be more specific? What exactly does this mean?`,
      area: 'scope',
      basedOn: `Vague language: ${vaguePhrase}`,
      priority: 'high',
    });
  }

  // Limit based on tier
  const maxQuestions = tier <= 2 ? 5 : tier <= 4 ? 4 : 3;
  return questions.slice(0, maxQuestions);
}

/**
 * Generate gap hints based on common missing elements
 */
function generateGapHints(content: string): Array<{ content: string; severity: string }> {
  const gaps: Array<{ content: string; severity: string }> = [];
  const lower = content.toLowerCase();

  if (!lower.includes('error') && !lower.includes('fail') && !lower.includes('exception')) {
    gaps.push({ content: 'Error handling not mentioned', severity: 'high' });
  }
  if (!lower.includes('auth') && !lower.includes('login') && !lower.includes('permission')) {
    gaps.push({ content: 'Authentication/authorization not mentioned', severity: 'medium' });
  }
  if (!lower.includes('scale') && !lower.includes('performance') && !lower.includes('load')) {
    gaps.push({ content: 'Scale/performance requirements not mentioned', severity: 'medium' });
  }
  if (!lower.includes('test') && !lower.includes('verify') && !lower.includes('validate')) {
    gaps.push({ content: 'Testing approach not mentioned', severity: 'medium' });
  }

  return gaps;
}

/**
 * Generate assumption hints
 */
function generateAssumptionHints(content: string): Array<{ content: string }> {
  const assumptions: Array<{ content: string }> = [];
  const lower = content.toLowerCase();

  if (lower.includes('database') || lower.includes('data')) {
    assumptions.push({ content: 'Assumes database exists and is accessible' });
  }
  if (lower.includes('api') || lower.includes('endpoint')) {
    assumptions.push({ content: 'Assumes API infrastructure exists' });
  }
  if (lower.includes('user')) {
    assumptions.push({ content: 'Assumes user management system exists' });
  }

  return assumptions;
}
