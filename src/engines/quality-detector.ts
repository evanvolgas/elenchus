/**
 * Quality Detection Engine - STRUCTURAL BASELINE LAYER
 *
 * This module provides the STRUCTURAL baseline for quality assessment. It uses
 * pattern matching (regex) for STRUCTURAL indicators only - not for semantic
 * understanding. The two-layer architecture:
 *
 * LAYER 1 (This file): Structural Baseline
 * - Detects presence/absence of numbers, units, actors, technologies
 * - Counts keyword matches for area coverage (scope, success, constraint, etc.)
 * - Identifies vague language patterns ("fast", "scalable", "good")
 * - Calculates specificity scores based on structural indicators
 * - ALWAYS runs - provides baseline even without LLM
 *
 * LAYER 2 (llm-signal-detector.ts, llm-question-generator.ts, etc.): Semantic Analysis
 * - Uses Claude to understand MEANING and find contradictions
 * - Detects semantic gaps (not just keyword absence)
 * - Finds tensions between requirements that seem compatible
 * - Generates contextual questions based on understanding
 * - OPTIONAL - gracefully degrades when ANTHROPIC_API_KEY is unset
 *
 * WHY THIS DESIGN:
 * 1. Structural baseline ensures Elenchus works without API keys
 * 2. LLM layer adds semantic depth when available
 * 3. Clean separation: structural patterns here, semantic reasoning in llm-* files
 * 4. Both layers inform the calling LLM (Claude in Claude Code) which does final synthesis
 *
 * WHAT THIS IS NOT:
 * - This is NOT semantic understanding via regex (that would be wrong)
 * - This is NOT trying to replace LLM reasoning
 * - This IS detecting structural indicators that hint at quality level
 */

/**
 * Quality tier (1-5)
 * 1 = Useless (yes/no, vague)
 * 2 = Vague (fast, scalable)
 * 3 = Partial (numbers but no context)
 * 4 = Good (numbers + context + units)
 * 5 = Complete (comprehensive, edge cases, testable)
 */
export type QualityTier = 1 | 2 | 3 | 4 | 5;

/**
 * Interrogation strategy based on quality tier
 */
export type InterrogationStrategy =
  | 'comprehensive'  // Tier 1-2: needs full interrogation
  | 'targeted'       // Tier 3: fill specific gaps
  | 'validation'     // Tier 4: validate and edge cases
  | 'minimal';       // Tier 5: just sanity check

/**
 * Coverage level for each area
 */
export type CoverageLevel = 'detailed' | 'partial' | 'mentioned' | 'absent';

/**
 * The 5 key areas of interrogation
 */
export type InterrogationArea = 'scope' | 'success' | 'constraint' | 'risk' | 'technical';

/**
 * Area coverage assessment
 */
export interface AreaCoverage {
  area: InterrogationArea;
  level: CoverageLevel;
  score: number;          // 0-100
  indicators: string[];    // What was found
  missing: string[];       // What's missing
}

/**
 * Specificity map for the epic
 */
export interface SpecificityMap {
  hasNumbers: boolean;
  hasUnits: boolean;
  hasActors: boolean;
  hasTestableConditions: boolean;
  hasTechnology: boolean;
  hasVagueLanguage: boolean;
  vaguePhrases: string[];
  specificPhrases: string[];
}

/**
 * Quality assessment metrics
 */
export interface QualityMetrics {
  overallScore: number;           // 0-100
  specificityScore: number;       // 0-100
  coverageScore: number;          // 0-100
  clarityScore: number;           // 0-100
  statementCount: number;
  specificStatements: number;
  vagueStatements: number;
}

/**
 * Complete quality assessment
 */
export interface QualityAssessment {
  tier: QualityTier;
  strategy: InterrogationStrategy;
  metrics: QualityMetrics;
  specificityMap: SpecificityMap;
  areaCoverage: AreaCoverage[];
  suggestedFocus: InterrogationArea[];
  analysisPrompt: string;  // Prompt for LLM to do deeper analysis
}

/**
 * Structural indicators for each area
 */
const AREA_INDICATORS: Record<InterrogationArea, {
  keywords: string[];
  requiredElements: string[];
}> = {
  scope: {
    keywords: ['user', 'who', 'what', 'feature', 'functionality', 'system', 'component', 'module'],
    requiredElements: ['actors', 'boundaries', 'features'],
  },
  success: {
    keywords: ['success', 'done', 'complete', 'verify', 'test', 'acceptance', 'criteria', 'measure'],
    requiredElements: ['metrics', 'criteria', 'validation'],
  },
  constraint: {
    keywords: ['within', 'must', 'cannot', 'limit', 'budget', 'time', 'deadline', 'requirement', 'compliance'],
    requiredElements: ['limits', 'requirements', 'boundaries'],
  },
  risk: {
    keywords: ['error', 'fail', 'exception', 'risk', 'issue', 'problem', 'when', 'if', 'edge case'],
    requiredElements: ['error_handling', 'edge_cases', 'failure_modes'],
  },
  technical: {
    keywords: ['api', 'database', 'service', 'backend', 'frontend', 'architecture', 'stack', 'technology'],
    requiredElements: ['technologies', 'architecture', 'integration'],
  },
};

/**
 * Common vague phrases that reduce quality
 */
const VAGUE_PHRASES = [
  'fast',
  'slow',
  'quick',
  'scalable',
  'performant',
  'robust',
  'reliable',
  'user-friendly',
  'intuitive',
  'simple',
  'easy',
  'good',
  'bad',
  'better',
  'worse',
  'efficient',
  'effective',
  'optimize',
  'improve',
  'enhance',
  'many',
  'few',
  'some',
  'several',
  'various',
  'appropriate',
  'reasonable',
  'adequate',
  'sufficient',
];

/**
 * Common units that indicate specificity
 */
const UNIT_PATTERNS = [
  'ms', 'millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month',
  'kb', 'mb', 'gb', 'tb', 'byte',
  'user', 'request', 'transaction', 'record', 'row',
  'percent', '%',
  'dollar', '$', 'usd', 'eur',
  'qps', 'rps', 'tps',
];

/**
 * Common actor types
 */
const ACTOR_PATTERNS = [
  'admin', 'administrator',
  'user', 'customer', 'client',
  'system', 'service',
  'developer', 'engineer',
  'manager', 'owner',
  'guest', 'visitor',
  'api', 'backend', 'frontend',
];

/**
 * Common technology indicators
 */
const TECH_PATTERNS = [
  'api', 'rest', 'graphql', 'grpc',
  'database', 'sql', 'nosql', 'postgres', 'mysql', 'mongodb',
  'cache', 'redis', 'memcached',
  'queue', 'kafka', 'rabbitmq',
  'http', 'https', 'websocket',
  'oauth', 'jwt', 'saml',
  'docker', 'kubernetes', 'aws', 'gcp', 'azure',
];

/**
 * Pass 1: Extract explicit statements
 */
function extractExplicitStatements(content: string): {
  hasNumbers: boolean;
  hasUnits: boolean;
  hasActors: boolean;
  hasTechnology: boolean;
} {
  const lower = content.toLowerCase();

  // Check for numbers (any digit sequence)
  const hasNumbers = /\d+/.test(content);

  // Check for units
  const hasUnits = UNIT_PATTERNS.some(unit =>
    new RegExp(`\\d+\\s*${unit}|${unit}\\s*\\d+`, 'i').test(lower)
  );

  // Check for actors
  const hasActors = ACTOR_PATTERNS.some(actor =>
    new RegExp(`\\b${actor}s?\\b`, 'i').test(lower)
  );

  // Check for technology
  const hasTechnology = TECH_PATTERNS.some(tech =>
    new RegExp(`\\b${tech}\\b`, 'i').test(lower)
  );

  return { hasNumbers, hasUnits, hasActors, hasTechnology };
}

/**
 * Pass 2: Detect vague language
 */
function detectVagueLanguage(content: string): {
  hasVagueLanguage: boolean;
  vaguePhrases: string[];
} {
  const lower = content.toLowerCase();
  const vaguePhrases: string[] = [];

  for (const phrase of VAGUE_PHRASES) {
    if (new RegExp(`\\b${phrase}\\b`, 'i').test(lower)) {
      vaguePhrases.push(phrase);
    }
  }

  return {
    hasVagueLanguage: vaguePhrases.length > 0,
    vaguePhrases,
  };
}

/**
 * Pass 3: Check coverage of key areas
 */
function checkAreaCoverage(content: string): AreaCoverage[] {
  const lower = content.toLowerCase();
  const coverage: AreaCoverage[] = [];

  for (const [areaKey, indicators] of Object.entries(AREA_INDICATORS)) {
    const area = areaKey as InterrogationArea;

    // Count keyword matches
    const keywordMatches = indicators.keywords.filter(kw =>
      new RegExp(`\\b${kw}\\b`, 'i').test(lower)
    );

    // Determine coverage level
    const matchRatio = keywordMatches.length / indicators.keywords.length;
    let level: CoverageLevel;
    let score: number;

    if (matchRatio >= 0.5) {
      level = 'detailed';
      score = 75 + (matchRatio - 0.5) * 50;
    } else if (matchRatio >= 0.25) {
      level = 'partial';
      score = 50 + (matchRatio - 0.25) * 100;
    } else if (matchRatio > 0) {
      level = 'mentioned';
      score = matchRatio * 200;
    } else {
      level = 'absent';
      score = 0;
    }

    // Identify what's missing
    const missing = indicators.requiredElements.filter(element => {
      // Simple heuristic: check if element-related keywords exist
      return !new RegExp(`\\b${element.replace(/_/g, '|')}\\b`, 'i').test(lower);
    });

    coverage.push({
      area,
      level,
      score: Math.round(score),
      indicators: keywordMatches,
      missing,
    });
  }

  return coverage;
}

/**
 * Pass 4: Calculate specificity scores
 */
function calculateSpecificity(content: string): {
  specificityMap: SpecificityMap;
  specificStatements: number;
  vagueStatements: number;
} {
  const explicitStatements = extractExplicitStatements(content);
  const vagueDetection = detectVagueLanguage(content);

  // Check for testable conditions (when X then Y patterns)
  const hasTestableConditions =
    /when\s+.+\s+then/i.test(content) ||
    /if\s+.+\s+then/i.test(content) ||
    /given\s+.+\s+when/i.test(content);

  // Build specificity map
  const specificityMap: SpecificityMap = {
    ...explicitStatements,
    hasTestableConditions,
    hasVagueLanguage: vagueDetection.hasVagueLanguage,
    vaguePhrases: vagueDetection.vaguePhrases,
    specificPhrases: [], // Populated by LLM in deeper analysis
  };

  // Count specific vs vague statements (simple heuristic)
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // Handle empty content
  if (sentences.length === 0) {
    return { specificityMap, specificStatements: 0, vagueStatements: 0 };
  }

  let specificStatements = 0;
  let vagueStatements = 0;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    // STRONG specificity: actual numbers, units, or concrete thresholds
    const hasStrongSpecific =
      /\d+\s*(ms|seconds?|minutes?|hours?|days?|weeks?|%|percent|users?|requests?|gb|mb|kb)\b/i.test(sentence) ||
      /\d+[.,]\d+/.test(sentence) ||  // Decimals
      /\$\d+/.test(sentence) ||  // Dollar amounts
      /<\s*\d+|>\s*\d+|<=|>=|under\s+\d+|over\s+\d+|within\s+\d+/i.test(sentence);  // Comparisons

    // WEAK specificity: just mentions actors or has any number
    const hasWeakSpecific =
      /\d+/.test(sentence) ||
      ACTOR_PATTERNS.some(a => new RegExp(`\\b${a}\\b`, 'i').test(lower));

    const hasVagueMarkers = VAGUE_PHRASES.some(v =>
      new RegExp(`\\b${v}\\b`, 'i').test(lower)
    );

    // Scoring logic:
    // - Strong specific markers (actual metrics) → specific
    // - Vague markers → vague
    // - Weak specific only (just mentions "user") → neutral, lean vague for short sentences
    // - Nothing → vague if short, neutral if long

    if (hasStrongSpecific && !hasVagueMarkers) {
      specificStatements++;
    } else if (hasVagueMarkers) {
      vagueStatements++;
    } else if (!hasWeakSpecific && sentence.trim().length < 80) {
      // No specificity markers and short → vague
      vagueStatements++;
    } else if (hasWeakSpecific && sentence.trim().length < 50) {
      // Only weak markers (just "user") and very short → still vague
      vagueStatements++;
    }
    // Otherwise: neutral (doesn't count as either)
  }

  return { specificityMap, specificStatements, vagueStatements };
}

/**
 * Calculate statement-level scores
 */
function scoreStatement(statement: string): number {
  let score = 0;
  const lower = statement.toLowerCase();

  // +1 if has numbers
  if (/\d+/.test(statement)) score++;

  // +1 if has units
  if (UNIT_PATTERNS.some(u => new RegExp(`\\d+\\s*${u}|${u}\\s*\\d+`, 'i').test(lower))) {
    score++;
  }

  // +1 if has concrete actors
  if (ACTOR_PATTERNS.some(a => new RegExp(`\\b${a}s?\\b`, 'i').test(lower))) {
    score++;
  }

  // +1 if has testable condition
  if (/when\s+.+\s+then|if\s+.+\s+then|given\s+.+\s+when/i.test(statement)) {
    score++;
  }

  // +1 if references specific technology
  if (TECH_PATTERNS.some(t => new RegExp(`\\b${t}\\b`, 'i').test(lower))) {
    score++;
  }

  // -1 for each vague word
  const vagueCount = VAGUE_PHRASES.filter(v =>
    new RegExp(`\\b${v}\\b`, 'i').test(lower)
  ).length;
  score -= vagueCount;

  return Math.max(0, Math.min(5, score));
}

/**
 * Calculate overall metrics
 */
function calculateMetrics(
  content: string,
  specificityData: ReturnType<typeof calculateSpecificity>,
  areaCoverage: AreaCoverage[]
): QualityMetrics {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const statementCount = sentences.length;

  // Specificity score (0-100)
  const specificRatio = statementCount > 0
    ? specificityData.specificStatements / statementCount
    : 0;
  const specificityScore = Math.round(specificRatio * 100);

  // Coverage score (average of all areas)
  const coverageScore = areaCoverage.length > 0
    ? Math.round(areaCoverage.reduce((sum, a) => sum + a.score, 0) / areaCoverage.length)
    : 0;

  // Clarity score (inverse of vague ratio)
  const vagueRatio = statementCount > 0
    ? specificityData.vagueStatements / statementCount
    : 0;
  const clarityScore = Math.round((1 - vagueRatio) * 100);

  // Overall score (weighted average)
  const overallScore = Math.round(
    specificityScore * 0.4 +
    coverageScore * 0.4 +
    clarityScore * 0.2
  );

  return {
    overallScore,
    specificityScore,
    coverageScore,
    clarityScore,
    statementCount,
    specificStatements: specificityData.specificStatements,
    vagueStatements: specificityData.vagueStatements,
  };
}

/**
 * Determine quality tier from metrics
 */
function determineQualityTier(metrics: QualityMetrics): QualityTier {
  const score = metrics.overallScore;

  if (score >= 75) return 5;
  if (score >= 55) return 4;
  if (score >= 35) return 3;
  if (score >= 15) return 2;
  return 1;
}

/**
 * Determine interrogation strategy from tier
 */
function determineStrategy(tier: QualityTier): InterrogationStrategy {
  switch (tier) {
    case 5: return 'minimal';
    case 4: return 'validation';
    case 3: return 'targeted';
    case 2:
    case 1:
    default:
      return 'comprehensive';
  }
}

/**
 * Identify areas that need the most focus
 */
function suggestFocus(areaCoverage: AreaCoverage[]): InterrogationArea[] {
  // Sort by score ascending (lowest scores need most focus)
  const sorted = [...areaCoverage].sort((a, b) => a.score - b.score);

  // Take areas with score < 50
  return sorted
    .filter(a => a.score < 50)
    .map(a => a.area);
}

/**
 * Build analysis prompt for LLM to do deeper semantic analysis
 */
function buildAnalysisPrompt(
  content: string,
  metrics: QualityMetrics,
  specificityMap: SpecificityMap,
  areaCoverage: AreaCoverage[]
): string {
  const lowCoverageAreas = areaCoverage
    .filter(a => a.score < 50)
    .map(a => `- **${a.area}**: ${a.level} (score: ${a.score}) - Missing: ${a.missing.join(', ')}`);

  return `You are analyzing an epic to determine interrogation approach.

## EPIC CONTENT
${content}

## STRUCTURAL ANALYSIS RESULTS

### Quality Metrics
- Overall Score: ${metrics.overallScore}/100
- Specificity: ${metrics.specificityScore}/100 (${metrics.specificStatements}/${metrics.statementCount} specific statements)
- Coverage: ${metrics.coverageScore}/100
- Clarity: ${metrics.clarityScore}/100 (${metrics.vagueStatements} vague statements)

### Specificity Indicators
- Has Numbers: ${specificityMap.hasNumbers ? 'YES' : 'NO'}
- Has Units: ${specificityMap.hasUnits ? 'YES' : 'NO'}
- Has Actors: ${specificityMap.hasActors ? 'YES' : 'NO'}
- Has Testable Conditions: ${specificityMap.hasTestableConditions ? 'YES' : 'NO'}
- Has Technology: ${specificityMap.hasTechnology ? 'YES' : 'NO'}
- Vague Phrases Found: ${specificityMap.vaguePhrases.join(', ') || 'none'}

### Area Coverage
${lowCoverageAreas.length > 0
  ? lowCoverageAreas.join('\n')
  : 'All areas have adequate coverage (score >= 50)'}

## YOUR TASK

1. **Validate Structural Analysis**: Do you agree with the scores? Are there semantic nuances missed?

2. **Identify Specific Phrases**: Extract concrete, specific phrases that demonstrate clarity (numbers, units, actors, testable conditions).

3. **Identify Missing Critical Elements**: What critical information is completely absent that would block implementation?

4. **Suggest Initial Questions**: Based on the gaps, what are the TOP 3-5 questions to ask first?

## OUTPUT FORMAT
Return JSON (no markdown, just JSON):

{
  "validationNotes": "Your assessment of the structural analysis",
  "specificPhrases": ["phrase 1", "phrase 2", ...],
  "criticalGaps": [
    {
      "area": "scope|success|constraint|risk|technical",
      "gap": "description of what's missing",
      "severity": "critical|high|medium|low",
      "blockingReason": "why this blocks implementation"
    }
  ],
  "suggestedQuestions": [
    {
      "question": "The question to ask",
      "area": "scope|success|constraint|risk|technical",
      "targets": "what gap this addresses",
      "priority": "critical|high|medium"
    }
  ]
}`;
}

/**
 * Main quality detection function
 *
 * Analyzes epic content and returns a comprehensive quality assessment.
 */
export function detectQualityTier(content: string): QualityAssessment {
  // Pass 3: Check area coverage
  const areaCoverage = checkAreaCoverage(content);

  // Pass 4: Calculate specificity
  const specificityData = calculateSpecificity(content);

  // Calculate metrics
  const metrics = calculateMetrics(content, specificityData, areaCoverage);

  // Determine tier and strategy
  const tier = determineQualityTier(metrics);
  const strategy = determineStrategy(tier);

  // Suggest focus areas
  const suggestedFocus = suggestFocus(areaCoverage);

  // Build analysis prompt for LLM
  const analysisPrompt = buildAnalysisPrompt(
    content,
    metrics,
    specificityData.specificityMap,
    areaCoverage
  );

  return {
    tier,
    strategy,
    metrics,
    specificityMap: specificityData.specificityMap,
    areaCoverage,
    suggestedFocus,
    analysisPrompt,
  };
}

/**
 * Export statement scoring for testing
 * @internal
 */
export { scoreStatement };
