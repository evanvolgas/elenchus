/**
 * Signal Detector
 *
 * Detects patterns in epics and answers that the calling LLM should
 * reason about. NO question generation, NO heuristic scoring, NO fake intelligence.
 *
 * Just pattern detection that flags things for the LLM to probe.
 */

import type { Epic } from '../types/index.js';
import type { Answer, Question, QuestionType } from '../types/interrogation.js';

/**
 * Signals detected in an answer that may warrant follow-up
 */
export interface AnswerSignals {
  questionId: string;
  vaguenessIndicators: VaguenessIndicator[];
  specificityMarkers: string[];
  technicalDecisions: string[];
}

export interface VaguenessIndicator {
  type: 'hedging' | 'generic-term' | 'short-answer' | 'no-specifics' | 'deferral';
  evidence: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Contradiction detected between two answers
 */
export interface ContradictionSignal {
  answerId1: string;
  answerId2: string;
  pattern: string;
  evidence: {
    text1: string;
    text2: string;
  };
  severity: 'potential' | 'likely' | 'definite';
}

/**
 * Coverage gap in the interrogation
 */
export interface CoverageGap {
  questionType: QuestionType;
  reason: string;
  priority: 'critical' | 'important' | 'nice-to-have';
}

/**
 * Assumption detected in the epic or answers
 */
export interface AssumptionSignal {
  assumption: string;
  source: 'epic' | 'answer';
  sourceId: string | undefined;
  confidence: 'definite' | 'likely' | 'potential';
}

/**
 * Complete set of signals from detection
 */
export interface InterrogationSignals {
  // Per-answer signals
  answerSignals: AnswerSignals[];

  // Cross-answer signals
  contradictions: ContradictionSignal[];

  // Coverage analysis
  coverageGaps: CoverageGap[];
  answeredTypes: QuestionType[];
  unansweredTypes: QuestionType[];

  // Assumption detection
  assumptions: AssumptionSignal[];

  // Technical stack mentions (for context)
  detectedStack: string[];

  // Summary metrics (for the LLM to interpret)
  metrics: {
    totalAnswers: number;
    vagueAnswerCount: number;
    contradictionCount: number;
    gapCount: number;
    assumptionCount: number;
  };
}

/**
 * Detect vagueness indicators in an answer.
 * These are patterns that suggest the answer lacks specificity.
 */
export function detectVagueness(
  answer: Answer,
  question: Question
): VaguenessIndicator[] {
  const indicators: VaguenessIndicator[] = [];
  const text = answer.answer;
  const lowerText = text.toLowerCase();

  // Pattern 1: Hedging words
  const hedgingPatterns = [
    { pattern: /\bmaybe\b/gi, term: 'maybe' },
    { pattern: /\bperhaps\b/gi, term: 'perhaps' },
    { pattern: /\bprobably\b/gi, term: 'probably' },
    { pattern: /\bpossibly\b/gi, term: 'possibly' },
    { pattern: /\bmight\b/gi, term: 'might' },
    { pattern: /\bcould be\b/gi, term: 'could be' },
    { pattern: /\bsort of\b/gi, term: 'sort of' },
    { pattern: /\bkind of\b/gi, term: 'kind of' },
    { pattern: /\bi think\b/gi, term: 'I think' },
    { pattern: /\bi guess\b/gi, term: 'I guess' },
    { pattern: /\bnot sure\b/gi, term: 'not sure' },
    { pattern: /\bdon't know\b/gi, term: "don't know" },
  ];

  for (const { pattern, term } of hedgingPatterns) {
    if (pattern.test(text)) {
      indicators.push({
        type: 'hedging',
        evidence: `Contains "${term}"`,
        severity: 'medium',
      });
    }
  }

  // Pattern 2: Generic terms
  const genericTerms = [
    { pattern: /\bstuff\b/gi, term: 'stuff' },
    { pattern: /\bthings\b/gi, term: 'things' },
    { pattern: /\bsomething\b/gi, term: 'something' },
    { pattern: /\banything\b/gi, term: 'anything' },
    { pattern: /\beverything\b/gi, term: 'everything' },
    { pattern: /\betc\.?\b/gi, term: 'etc' },
    { pattern: /\band so on\b/gi, term: 'and so on' },
    { pattern: /\bor something\b/gi, term: 'or something' },
    { pattern: /\bwhatever\b/gi, term: 'whatever' },
  ];

  for (const { pattern, term } of genericTerms) {
    if (pattern.test(text)) {
      indicators.push({
        type: 'generic-term',
        evidence: `Uses "${term}" instead of specific details`,
        severity: 'high',
      });
    }
  }

  // Pattern 3: Short answers to complex questions
  const wordCount = text.split(/\s+/).length;
  if (question.priority === 'critical' && wordCount < 10) {
    indicators.push({
      type: 'short-answer',
      evidence: `Only ${wordCount} words for a critical question`,
      severity: 'high',
    });
  } else if (question.priority === 'important' && wordCount < 5) {
    indicators.push({
      type: 'short-answer',
      evidence: `Only ${wordCount} words for an important question`,
      severity: 'medium',
    });
  }

  // Pattern 4: Deferral language
  const deferrals = [
    { pattern: /\blater\b/gi, term: 'later' },
    { pattern: /\btbd\b/gi, term: 'TBD' },
    { pattern: /\bto be determined\b/gi, term: 'to be determined' },
    { pattern: /\bwe'll see\b/gi, term: "we'll see" },
    { pattern: /\bnot yet\b/gi, term: 'not yet' },
    { pattern: /\bfigure it out\b/gi, term: 'figure it out' },
  ];

  for (const { pattern, term } of deferrals) {
    if (pattern.test(text)) {
      indicators.push({
        type: 'deferral',
        evidence: `Contains "${term}" - decision being deferred`,
        severity: 'medium',
      });
    }
  }

  // Pattern 5: No concrete specifics (numbers, names, technologies)
  const hasNumbers = /\d+/.test(text);
  const hasTechTerms = /\b(api|database|sql|postgres|mongo|redis|react|node|python|aws|gcp|azure)\b/i.test(text);
  const hasProperNouns = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/.test(text);

  if (!hasNumbers && !hasTechTerms && !hasProperNouns && wordCount > 15) {
    // Only flag if it's a substantial answer without specifics
    if (lowerText.includes('fast') || lowerText.includes('scalable') ||
        lowerText.includes('good') || lowerText.includes('nice') ||
        lowerText.includes('easy') || lowerText.includes('simple')) {
      indicators.push({
        type: 'no-specifics',
        evidence: 'Uses subjective terms without measurable criteria',
        severity: 'medium',
      });
    }
  }

  return indicators;
}

/**
 * Extract specificity markers - concrete details that ARE present
 */
export function extractSpecificityMarkers(answer: Answer): string[] {
  const markers: string[] = [];
  const text = answer.answer;

  // Numbers and metrics
  const numbers = text.match(/\d+(?:\.\d+)?(?:\s*(?:ms|s|seconds|minutes|hours|days|weeks|%|percent|users|requests|rps|tps|mb|gb|tb))?/gi);
  if (numbers) {
    markers.push(...numbers.map(n => `Specific metric: ${n}`));
  }

  // Technology mentions
  const techPatterns = [
    /\b(postgresql?|mysql|mongodb|redis|elasticsearch|sqlite)\b/gi,
    /\b(react|vue|angular|svelte|next\.?js|nuxt)\b/gi,
    /\b(node\.?js|python|golang?|rust|java|typescript)\b/gi,
    /\b(aws|gcp|azure|vercel|netlify|cloudflare)\b/gi,
    /\b(rest|graphql|grpc|websocket|sse)\b/gi,
    /\b(jwt|oauth|saml|openid)\b/gi,
    /\b(docker|kubernetes|k8s|terraform|ansible)\b/gi,
  ];

  for (const pattern of techPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      markers.push(...matches.map(m => `Technology: ${m}`));
    }
  }

  return markers;
}

/**
 * Extract technical decisions mentioned in an answer
 */
export function extractTechnicalDecisions(answer: Answer): string[] {
  const decisions: string[] = [];
  const text = answer.answer;
  const lowerText = text.toLowerCase();

  // Decision language patterns
  const decisionPatterns = [
    { pattern: /will use\s+([^,.]+)/gi, prefix: 'Using' },
    { pattern: /going with\s+([^,.]+)/gi, prefix: 'Chose' },
    { pattern: /decided on\s+([^,.]+)/gi, prefix: 'Decision' },
    { pattern: /we'll use\s+([^,.]+)/gi, prefix: 'Using' },
    { pattern: /plan to use\s+([^,.]+)/gi, prefix: 'Planning' },
    { pattern: /must have\s+([^,.]+)/gi, prefix: 'Requirement' },
    { pattern: /need\s+([^,.]+)/gi, prefix: 'Need' },
  ];

  for (const { pattern, prefix } of decisionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      decisions.push(`${prefix}: ${match[1]?.trim()}`);
    }
  }

  // Architecture mentions
  if (lowerText.includes('microservice')) {
    decisions.push('Architecture: Microservices');
  } else if (lowerText.includes('monolith')) {
    decisions.push('Architecture: Monolith');
  } else if (lowerText.includes('serverless')) {
    decisions.push('Architecture: Serverless');
  }

  return decisions;
}

/**
 * Detect potential contradictions between answers
 */
export function detectContradictions(
  answers: Answer[],
  questions: Question[]
): ContradictionSignal[] {
  const contradictions: ContradictionSignal[] = [];

  // Build question lookup
  const questionMap = new Map<string, Question>();
  for (const q of questions) {
    questionMap.set(q.id, q);
  }

  // Known contradictory term pairs
  const contradictoryPairs: Array<{
    terms1: RegExp;
    terms2: RegExp;
    label: string;
    severity: 'potential' | 'likely' | 'definite';
  }> = [
    {
      terms1: /\breal[\s-]?time\b/i,
      terms2: /\bbatch\b|\bscheduled\b|\bdaily\b|\bweekly\b/i,
      label: 'real-time vs batch processing',
      severity: 'likely',
    },
    {
      terms1: /\bstateless\b/i,
      terms2: /\bstateful\b|\bsession\b|\bstate\b/i,
      label: 'stateless vs stateful',
      severity: 'likely',
    },
    {
      terms1: /\bsynchronous\b|\bsync\b/i,
      terms2: /\basync\b|\basynchronous\b/i,
      label: 'sync vs async',
      severity: 'potential',
    },
    {
      terms1: /\bsql\b|\brelational\b|\bpostgres\b|\bmysql\b/i,
      terms2: /\bnosql\b|\bmongo\b|\bdynamodb\b|\bdocument store\b/i,
      label: 'SQL vs NoSQL',
      severity: 'potential',
    },
    {
      terms1: /\bpublic\b/i,
      terms2: /\bprivate\b|\binternal\b/i,
      label: 'public vs private',
      severity: 'likely',
    },
    {
      terms1: /\brequired\b|\bmust\b|\bmandatory\b/i,
      terms2: /\boptional\b|\bnice to have\b/i,
      label: 'required vs optional',
      severity: 'potential',
    },
    {
      terms1: /\bsimple\b|\bbasic\b|\bminimal\b/i,
      terms2: /\bcomplex\b|\badvanced\b|\bfull[\s-]?featured\b/i,
      label: 'simple vs complex scope',
      severity: 'potential',
    },
  ];

  // Compare all answer pairs
  for (let i = 0; i < answers.length; i++) {
    for (let j = i + 1; j < answers.length; j++) {
      const answer1 = answers[i]!;
      const answer2 = answers[j]!;
      const text1 = answer1.answer;
      const text2 = answer2.answer;

      for (const pair of contradictoryPairs) {
        const has1in1 = pair.terms1.test(text1);
        const has2in1 = pair.terms2.test(text1);
        const has1in2 = pair.terms1.test(text2);
        const has2in2 = pair.terms2.test(text2);

        // Contradiction: one answer has term1, other has term2
        if ((has1in1 && has2in2) || (has2in1 && has1in2)) {
          // Extract the actual matched text for evidence
          const match1 = text1.match(has1in1 ? pair.terms1 : pair.terms2);
          const match2 = text2.match(has1in2 ? pair.terms2 : pair.terms1);

          contradictions.push({
            answerId1: answer1.questionId,
            answerId2: answer2.questionId,
            pattern: pair.label,
            evidence: {
              text1: match1?.[0] ?? 'unknown',
              text2: match2?.[0] ?? 'unknown',
            },
            severity: pair.severity,
          });
        }
      }
    }
  }

  return contradictions;
}

/**
 * Detect coverage gaps - question types that haven't been addressed
 */
export function detectCoverageGaps(
  answers: Answer[],
  questions: Question[]
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const answeredIds = new Set(answers.map(a => a.questionId));

  // Group questions by type and check what's answered
  const typeToQuestions = new Map<QuestionType, Question[]>();
  for (const q of questions) {
    const existing = typeToQuestions.get(q.type) ?? [];
    existing.push(q);
    typeToQuestions.set(q.type, existing);
  }

  const allTypes: Array<{ type: QuestionType; priority: 'critical' | 'important' | 'nice-to-have' }> = [
    { type: 'scope', priority: 'critical' },
    { type: 'success', priority: 'critical' },
    { type: 'constraint', priority: 'critical' },
    { type: 'technical', priority: 'important' },
    { type: 'risk', priority: 'important' },
    { type: 'stakeholder', priority: 'important' },
    { type: 'timeline', priority: 'nice-to-have' },
  ];

  for (const { type, priority } of allTypes) {
    const questionsOfType = typeToQuestions.get(type) ?? [];
    const answeredOfType = questionsOfType.filter(q => answeredIds.has(q.id));

    if (questionsOfType.length === 0) {
      gaps.push({
        questionType: type,
        reason: `No ${type} questions have been asked yet`,
        priority,
      });
    } else if (answeredOfType.length === 0) {
      gaps.push({
        questionType: type,
        reason: `${type} questions exist but none answered`,
        priority,
      });
    }
  }

  return gaps;
}

/**
 * Detect assumptions in the epic or answers
 */
export function detectAssumptions(
  epic: Epic,
  answers: Answer[]
): AssumptionSignal[] {
  const assumptions: AssumptionSignal[] = [];

  // Assumption patterns to look for
  const assumptionPatterns = [
    {
      present: /\buser\b/i,
      absent: /\bguest\b|\banonymous\b|\bunauthenticated\b/i,
      assumption: 'All users are authenticated (no guest/anonymous access)',
    },
    {
      present: /\b(web|browser)\b/i,
      absent: /\bmobile\b|\bapp\b|\bnative\b/i,
      assumption: 'Web-only (no mobile app)',
    },
    {
      present: /\b(api|endpoint)\b/i,
      absent: /\brate limit\b|\bthrottle\b/i,
      assumption: 'No rate limiting mentioned',
    },
    {
      present: /\b(database|data|store)\b/i,
      absent: /\bbackup\b|\brecovery\b|\bdisaster\b/i,
      assumption: 'No backup/recovery strategy mentioned',
    },
    {
      present: /\b(scale|users|traffic)\b/i,
      absent: /\d+|\bnumber\b|\bhow many\b/i,
      assumption: 'No specific scale numbers defined',
    },
    {
      present: /\b(secure|security)\b/i,
      absent: /\baudit\b|\bcompliance\b|\bsoc\b|\bhipaa\b|\bgdpr\b/i,
      assumption: 'No specific compliance requirements mentioned',
    },
  ];

  // Check epic
  const epicText = `${epic.title ?? ''} ${epic.description}`;
  for (const pattern of assumptionPatterns) {
    if (pattern.present.test(epicText) && !pattern.absent.test(epicText)) {
      assumptions.push({
        assumption: pattern.assumption,
        source: 'epic',
        sourceId: epic.id,
        confidence: 'potential',
      });
    }
  }

  // Check answers
  for (const answer of answers) {
    for (const pattern of assumptionPatterns) {
      if (pattern.present.test(answer.answer) && !pattern.absent.test(answer.answer)) {
        // Check if already detected in epic
        const existsInEpic = assumptions.some(
          a => a.assumption === pattern.assumption && a.source === 'epic'
        );
        if (!existsInEpic) {
          assumptions.push({
            assumption: pattern.assumption,
            source: 'answer',
            sourceId: answer.questionId,
            confidence: 'likely',
          });
        }
      }
    }
  }

  return assumptions;
}

/**
 * Detect technology stack mentioned across epic and answers
 */
export function detectStack(epic: Epic, answers: Answer[]): string[] {
  const stack = new Set<string>();
  const allText = `${epic.title ?? ''} ${epic.description} ${answers.map(a => a.answer).join(' ')}`;

  const techPatterns: Array<{ pattern: RegExp; name: string }> = [
    // Databases
    { pattern: /\bpostgres(?:ql)?\b/i, name: 'PostgreSQL' },
    { pattern: /\bmysql\b/i, name: 'MySQL' },
    { pattern: /\bmongodb?\b/i, name: 'MongoDB' },
    { pattern: /\bredis\b/i, name: 'Redis' },
    { pattern: /\belasticsearch\b/i, name: 'Elasticsearch' },
    { pattern: /\bsqlite\b/i, name: 'SQLite' },
    { pattern: /\bdynamodb\b/i, name: 'DynamoDB' },

    // Frontend
    { pattern: /\breact\b/i, name: 'React' },
    { pattern: /\bvue\b/i, name: 'Vue' },
    { pattern: /\bangular\b/i, name: 'Angular' },
    { pattern: /\bsvelte\b/i, name: 'Svelte' },
    { pattern: /\bnext\.?js\b/i, name: 'Next.js' },

    // Backend
    { pattern: /\bnode\.?js\b/i, name: 'Node.js' },
    { pattern: /\bpython\b/i, name: 'Python' },
    { pattern: /\bfastapi\b/i, name: 'FastAPI' },
    { pattern: /\bdjango\b/i, name: 'Django' },
    { pattern: /\bflask\b/i, name: 'Flask' },
    { pattern: /\bgolang\b|\bgo\b/i, name: 'Go' },
    { pattern: /\brust\b/i, name: 'Rust' },

    // Cloud
    { pattern: /\baws\b/i, name: 'AWS' },
    { pattern: /\bgcp\b|\bgoogle cloud\b/i, name: 'GCP' },
    { pattern: /\bazure\b/i, name: 'Azure' },
    { pattern: /\bvercel\b/i, name: 'Vercel' },

    // API styles
    { pattern: /\bgraphql\b/i, name: 'GraphQL' },
    { pattern: /\brest\b/i, name: 'REST' },
    { pattern: /\bgrpc\b/i, name: 'gRPC' },
    { pattern: /\bwebsocket\b/i, name: 'WebSocket' },

    // Auth
    { pattern: /\bjwt\b/i, name: 'JWT' },
    { pattern: /\boauth\b/i, name: 'OAuth' },

    // AI/ML
    { pattern: /\bclaude\b/i, name: 'Claude' },
    { pattern: /\bopenai\b|\bgpt\b/i, name: 'OpenAI' },
    { pattern: /\bllm\b/i, name: 'LLM' },
  ];

  for (const { pattern, name } of techPatterns) {
    if (pattern.test(allText)) {
      stack.add(name);
    }
  }

  return Array.from(stack);
}

/**
 * Main function: Analyze epic and answers to produce signals
 */
export function detectSignals(
  epic: Epic,
  questions: Question[],
  answers: Answer[]
): InterrogationSignals {
  // Build question lookup
  const questionMap = new Map<string, Question>();
  for (const q of questions) {
    questionMap.set(q.id, q);
  }

  // Analyze each answer
  const answerSignals: AnswerSignals[] = [];
  let vagueCount = 0;

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question) continue;

    const vagueness = detectVagueness(answer, question);
    const specificity = extractSpecificityMarkers(answer);
    const decisions = extractTechnicalDecisions(answer);

    if (vagueness.length > 0) {
      vagueCount++;
    }

    answerSignals.push({
      questionId: answer.questionId,
      vaguenessIndicators: vagueness,
      specificityMarkers: specificity,
      technicalDecisions: decisions,
    });
  }

  // Cross-answer analysis
  const contradictions = detectContradictions(answers, questions);
  const coverageGaps = detectCoverageGaps(answers, questions);
  const assumptions = detectAssumptions(epic, answers);
  const detectedStack = detectStack(epic, answers);

  // Compute answered/unanswered types
  const answeredIds = new Set(answers.map(a => a.questionId));
  const answeredTypes = new Set<QuestionType>();
  const unansweredTypes = new Set<QuestionType>();

  for (const q of questions) {
    if (answeredIds.has(q.id)) {
      answeredTypes.add(q.type);
    } else {
      unansweredTypes.add(q.type);
    }
  }

  return {
    answerSignals,
    contradictions,
    coverageGaps,
    answeredTypes: Array.from(answeredTypes),
    unansweredTypes: Array.from(unansweredTypes),
    assumptions,
    detectedStack,
    metrics: {
      totalAnswers: answers.length,
      vagueAnswerCount: vagueCount,
      contradictionCount: contradictions.length,
      gapCount: coverageGaps.length,
      assumptionCount: assumptions.length,
    },
  };
}
