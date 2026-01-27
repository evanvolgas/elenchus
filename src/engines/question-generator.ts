/**
 * Question Generator Engine
 *
 * Generates tier-appropriate questions based on quality level:
 * - Tier 1 (Vague): Foundation questions to establish basics
 * - Tier 2 (Minimal): Extraction questions to get specifics
 * - Tier 3 (Partial): Targeted questions to fill gaps
 * - Tier 4 (Detailed): Refinement questions to add depth
 * - Tier 5 (Complete): Validation questions to probe edge cases
 *
 * Core principles:
 * 1. Different question types for different tiers
 * 2. Personalize with epic content (no generic questions)
 * 3. Never ask about what's already been answered
 * 4. Focus on coverage gaps
 * 5. Fewer questions as quality increases
 */

import type { Signal, AnswerEvaluation, Contradiction, Premise } from '../types/index.js';

/**
 * Quality tiers based on average answer score
 */
export type QualityTier = 1 | 2 | 3 | 4 | 5;

/**
 * Coverage gaps by area
 */
export interface CoverageGaps {
  scope: boolean;
  success: boolean;
  constraint: boolean;
  risk: boolean;
  technical: boolean;
  missing: Array<'scope' | 'success' | 'constraint' | 'risk' | 'technical'>;
}

/**
 * Extracted facts from epic content
 */
export interface ExtractedFacts {
  goals: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  stakeholders: string[];
  technologies: string[];
}

/**
 * Previous Q&A entry for context
 */
export interface QAEntry {
  area: 'scope' | 'success' | 'constraint' | 'risk' | 'technical';
  question: string;
  answer: string;
  score?: number;
}

/**
 * Generated question with metadata
 */
export interface GeneratedQuestion {
  question: string;
  area: 'scope' | 'success' | 'constraint' | 'risk' | 'technical';
  priority: 'critical' | 'high' | 'medium';
  reason: string; // Why this question is being asked
  basedOn?: string; // What signal/gap/fact this addresses
}

/**
 * Determine quality tier from average score
 */
export function determineQualityTier(averageScore: number): QualityTier {
  if (averageScore < 2) return 1;
  if (averageScore < 3) return 2;
  if (averageScore < 4) return 3;
  if (averageScore < 4.5) return 4;
  return 5;
}

/**
 * Generate questions based on quality tier and context
 */
export function generateQuestions(params: {
  tier: QualityTier;
  epicContent: string;
  previousQA: QAEntry[];
  extractedFacts: ExtractedFacts;
  coverageGaps: CoverageGaps;
  signals?: Signal[];
  evaluations?: AnswerEvaluation[];
  contradictions?: Contradiction[];
  premises?: Premise[];
}): GeneratedQuestion[] {
  const { tier, epicContent, previousQA, extractedFacts, coverageGaps, signals, contradictions } = params;

  // Track what's been asked/answered
  const askedAbout = new Set<string>();
  previousQA.forEach(qa => {
    askedAbout.add(qa.area);
    // Extract key terms from questions/answers
    extractKeyTerms(qa.question + ' ' + qa.answer).forEach(term => askedAbout.add(term));
  });

  const questions: GeneratedQuestion[] = [];

  // Tier 1: Foundation questions (5-7 questions)
  if (tier === 1) {
    questions.push(...generateTier1Questions(extractedFacts, coverageGaps, askedAbout, epicContent));
  }

  // Tier 2: Extraction questions (4-6 questions)
  if (tier === 2) {
    questions.push(...generateTier2Questions(previousQA, extractedFacts, coverageGaps, askedAbout, epicContent));
  }

  // Tier 3: Targeted questions (3-5 questions)
  if (tier === 3) {
    questions.push(...generateTier3Questions(previousQA, coverageGaps, askedAbout, epicContent, signals));
  }

  // Tier 4: Refinement questions (2-4 questions)
  if (tier === 4) {
    questions.push(...generateTier4Questions(previousQA, askedAbout, epicContent, signals));
  }

  // Tier 5: Validation questions (2-3 questions)
  if (tier === 5) {
    questions.push(...generateTier5Questions(previousQA, contradictions, askedAbout, epicContent));
  }

  // Sort by priority
  questions.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Return appropriate number for tier (fewer as tier increases)
  const limits = { 1: 7, 2: 6, 3: 5, 4: 4, 5: 3 };
  return questions.slice(0, limits[tier]);
}

/**
 * Tier 1: Foundation questions - establish the basics
 */
function generateTier1Questions(
  facts: ExtractedFacts,
  coverage: CoverageGaps,
  askedAbout: Set<string>,
  epicContent: string
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];

  // Core foundation questions
  if (!askedAbout.has('scope') && coverage.missing.includes('scope')) {
    questions.push({
      question: 'What problem does this solve? Who has this problem and why does it matter?',
      area: 'scope',
      priority: 'critical',
      reason: 'Need to establish core problem and stakeholders',
      basedOn: 'No scope definition detected',
    });
  }

  if (!askedAbout.has('success') && coverage.missing.includes('success')) {
    questions.push({
      question: 'How will you know this is done? What would you test to verify it works?',
      area: 'success',
      priority: 'critical',
      reason: 'Need concrete success criteria',
      basedOn: 'No acceptance criteria detected',
    });
  }

  // Who questions
  if (!containsUserMention(epicContent) && !askedAbout.has('user')) {
    questions.push({
      question: 'Who will use this? Are there different types of users with different needs?',
      area: 'scope',
      priority: 'critical',
      reason: 'Users not clearly defined',
      basedOn: 'No user roles mentioned',
    });
  }

  // What questions
  if (facts.goals.length === 0 || facts.goals[0]!.length < 20) {
    questions.push({
      question: "What's the one thing this absolutely must do? If it only did one thing, what would it be?",
      area: 'scope',
      priority: 'critical',
      reason: 'Core functionality not clearly defined',
      basedOn: 'Vague or missing goals',
    });
  }

  // Constraints
  if (!askedAbout.has('constraint') && coverage.missing.includes('constraint')) {
    questions.push({
      question: 'Are there any constraints? Budget, timeline, technology requirements, compliance needs?',
      area: 'constraint',
      priority: 'high',
      reason: 'Need to understand limitations and requirements',
      basedOn: 'No constraints mentioned',
    });
  }

  // Risk awareness
  if (!askedAbout.has('risk') && coverage.missing.includes('risk')) {
    questions.push({
      question: 'What could go wrong? What are you most worried about with this?',
      area: 'risk',
      priority: 'high',
      reason: 'Need to identify concerns and risks',
      basedOn: 'No risk discussion',
    });
  }

  // Scope boundaries
  if (!askedAbout.has('out-of-scope')) {
    questions.push({
      question: 'What is explicitly OUT of scope? What should this NOT do?',
      area: 'scope',
      priority: 'medium',
      reason: 'Prevent scope creep',
      basedOn: 'Boundaries not defined',
    });
  }

  return questions;
}

/**
 * Tier 2: Extraction questions - get specifics from vague statements
 */
function generateTier2Questions(
  previousQA: QAEntry[],
  _facts: ExtractedFacts,
  coverage: CoverageGaps,
  askedAbout: Set<string>,
  epicContent: string
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];

  // Extract specifics from vague answers
  const vagueAnswers = previousQA.filter(qa => (qa.score ?? 0) < 3);
  for (const qa of vagueAnswers.slice(0, 2)) {
    const key = extractKeyTerms(qa.answer)[0];
    if (key && key.length > 3) {
      questions.push({
        question: `You mentioned "${key}". What does success look like for ${key}? What's the concrete measurement?`,
        area: qa.area,
        priority: 'critical',
        reason: `Previous answer about ${qa.area} was vague (score ${qa.score}/5)`,
        basedOn: `Vague answer: "${qa.answer.slice(0, 50)}..."`,
      });
    }
  }

  // Missing areas
  for (const area of coverage.missing.slice(0, 2)) {
    if (area === 'constraint' && !askedAbout.has('timeline')) {
      questions.push({
        question: 'What constraints exist? Timeline, budget, technology, compliance, team size?',
        area,
        priority: 'high',
        reason: 'No constraints defined',
        basedOn: 'Missing constraint coverage',
      });
    }
    if (area === 'risk' && !askedAbout.has('error')) {
      questions.push({
        question: 'What could go wrong? How should errors be handled? What are the biggest risks?',
        area,
        priority: 'high',
        reason: 'No risk analysis',
        basedOn: 'Missing risk coverage',
      });
    }
  }

  // Extract specifics from epic content
  const vaguePhrases = findVaguePhrases(epicContent);
  for (const phrase of vaguePhrases.slice(0, 2)) {
    questions.push({
      question: `You mentioned "${phrase}". Can you be specific? Numbers, examples, or concrete criteria?`,
      area: 'scope',
      priority: 'high',
      reason: 'Vague statement needs clarification',
      basedOn: `Epic contains: "${phrase}"`,
    });
  }

  // Data specifics
  if (containsDataMention(epicContent) && !askedAbout.has('data')) {
    questions.push({
      question: 'What data is involved? How much? How is it structured? Where does it come from?',
      area: 'technical',
      priority: 'high',
      reason: 'Data mentioned but not specified',
      basedOn: 'Data references in epic',
    });
  }

  // Performance specifics
  if (containsPerformanceMention(epicContent) && !askedAbout.has('performance')) {
    questions.push({
      question: 'What are the performance requirements? Response time, throughput, concurrent users?',
      area: 'constraint',
      priority: 'high',
      reason: 'Performance mentioned but not quantified',
      basedOn: 'Performance references in epic',
    });
  }

  return questions;
}

/**
 * Tier 3: Targeted questions - fill specific gaps
 */
function generateTier3Questions(
  previousQA: QAEntry[],
  _coverage: CoverageGaps,
  askedAbout: Set<string>,
  epicContent: string,
  signals?: Signal[]
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];

  // Target partially answered areas
  const partialAnswers = previousQA.filter(qa => qa.score === 3);
  for (const qa of partialAnswers.slice(0, 2)) {
    const missingDetail = identifyMissingDetail(qa.answer);
    if (missingDetail) {
      questions.push({
        question: `You said "${qa.answer.slice(0, 40)}...". ${missingDetail.question}`,
        area: qa.area,
        priority: 'high',
        reason: `Answer is partial - missing ${missingDetail.aspect}`,
        basedOn: `Partially specific answer in ${qa.area}`,
      });
    }
  }

  // Address critical signals
  const criticalSignals = signals?.filter(s => s.severity === 'critical' && !s.addressed) || [];
  for (const signal of criticalSignals.slice(0, 2)) {
    questions.push({
      question: `Critical gap: ${signal.content}. How should this be handled?`,
      area: signalTypeToArea(signal.type),
      priority: 'critical',
      reason: 'Critical gap identified in analysis',
      basedOn: `Signal: ${signal.type} - ${signal.content}`,
    });
  }

  // Scope boundaries
  if (!askedAbout.has('boundary') && !askedAbout.has('out-of-scope')) {
    questions.push({
      question: 'What is explicitly out of scope? What features or requirements are you NOT including?',
      area: 'scope',
      priority: 'high',
      reason: 'Scope boundaries prevent feature creep',
      basedOn: 'Boundaries not defined',
    });
  }

  // Edge cases
  if (!askedAbout.has('edge-case') && !askedAbout.has('exception')) {
    const mainFeature = extractMainFeature(epicContent);
    if (mainFeature) {
      questions.push({
        question: `For ${mainFeature}, what happens in the edge cases? Empty data, maximum values, concurrent access?`,
        area: 'risk',
        priority: 'high',
        reason: 'Edge cases not addressed',
        basedOn: `Main feature: ${mainFeature}`,
      });
    }
  }

  // Integration points
  if (!askedAbout.has('integration') && containsIntegrationHints(epicContent)) {
    questions.push({
      question: 'What systems does this integrate with? What happens if those systems are unavailable?',
      area: 'technical',
      priority: 'high',
      reason: 'Integration dependencies not specified',
      basedOn: 'Integration references detected',
    });
  }

  return questions;
}

/**
 * Tier 4: Refinement questions - add depth and handle edge cases
 */
function generateTier4Questions(
  previousQA: QAEntry[],
  askedAbout: Set<string>,
  epicContent: string,
  _signals?: Signal[]
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];

  // Interaction between features
  const features = extractFeatures(previousQA);
  if (features.length >= 2 && !askedAbout.has('interaction')) {
    const [f1, f2] = features;
    questions.push({
      question: `How do ${f1} and ${f2} interact? Are there dependencies or conflicts?`,
      area: 'technical',
      priority: 'high',
      reason: 'Multiple features may interact',
      basedOn: `Features: ${f1}, ${f2}`,
    });
  }

  // Edge case probing
  const mainConcepts = extractMainConcepts(previousQA);
  for (const concept of mainConcepts.slice(0, 2)) {
    if (!askedAbout.has(`edge-${concept}`)) {
      questions.push({
        question: `For ${concept}, what happens in these edge cases: empty input, maximum scale, concurrent modification?`,
        area: 'risk',
        priority: 'high',
        reason: 'Edge cases need explicit handling',
        basedOn: `Main concept: ${concept}`,
      });
    }
  }

  // Alternatives exploration
  const decisions = extractDecisions(previousQA);
  for (const decision of decisions.slice(0, 1)) {
    questions.push({
      question: `You chose ${decision}. What alternatives did you consider and why was this best?`,
      area: 'technical',
      priority: 'medium',
      reason: 'Understanding tradeoffs',
      basedOn: `Decision: ${decision}`,
    });
  }

  // Performance at scale
  if (!askedAbout.has('scale') && containsDataMention(epicContent)) {
    questions.push({
      question: 'At 10x scale (users, data, requests), what breaks first? How do you handle it?',
      area: 'constraint',
      priority: 'high',
      reason: 'Scale implications not discussed',
      basedOn: 'Data/users mentioned without scale discussion',
    });
  }

  return questions;
}

/**
 * Tier 5: Validation questions - probe assumptions and edge cases
 */
function generateTier5Questions(
  previousQA: QAEntry[],
  contradictions?: Contradiction[],
  _askedAbout?: Set<string>,
  _epicContent?: string
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];

  // Probe contradictions
  const unresolved = contradictions?.filter(c => !c.resolved) || [];
  for (const contradiction of unresolved.slice(0, 1)) {
    questions.push({
      question: `Potential conflict: ${contradiction.description}. Can both be true? How do they work together?`,
      area: 'scope',
      priority: 'critical',
      reason: 'Contradiction must be resolved',
      basedOn: `Contradiction: ${contradiction.description}`,
    });
  }

  // Challenge assumptions
  const assumptions = extractAssumptions(previousQA);
  for (const assumption of assumptions.slice(0, 2)) {
    questions.push({
      question: `You're assuming ${assumption}. What happens if that assumption is wrong?`,
      area: 'risk',
      priority: 'high',
      reason: 'Test critical assumptions',
      basedOn: `Assumption: ${assumption}`,
    });
  }

  // Stress test requirements
  const requirements = extractRequirements(previousQA);
  for (const req of requirements.slice(0, 1)) {
    questions.push({
      question: `You said ${req}. What would make you change this requirement? What's non-negotiable?`,
      area: 'constraint',
      priority: 'medium',
      reason: 'Identify truly essential requirements',
      basedOn: `Requirement: ${req}`,
    });
  }

  return questions;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract key terms from text
 */
function extractKeyTerms(text: string): string[] {
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their']);

  return text
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[^a-z0-9-]/g, ''))
    .filter(word => word.length > 3 && !commonWords.has(word))
    .slice(0, 10);
}

/**
 * Check if content mentions users
 */
function containsUserMention(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes('user') || lower.includes('customer') || lower.includes('admin') ||
         lower.includes('role') || lower.includes('permission') || lower.includes('who ');
}

/**
 * Check if content mentions data
 */
function containsDataMention(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes('data') || lower.includes('database') || lower.includes('record') ||
         lower.includes('table') || lower.includes('storage') || lower.includes('persist');
}

/**
 * Check if content mentions performance
 */
function containsPerformanceMention(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes('fast') || lower.includes('slow') || lower.includes('performance') ||
         lower.includes('speed') || lower.includes('latency') || lower.includes('scale');
}

/**
 * Check for integration hints
 */
function containsIntegrationHints(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes('api') || lower.includes('integration') || lower.includes('external') ||
         lower.includes('third-party') || lower.includes('service') || lower.includes('endpoint');
}

/**
 * Find vague phrases that need clarification
 */
function findVaguePhrases(content: string): string[] {
  const vaguePhrases: string[] = [];
  const patterns = [
    /(?:should be|must be|needs to be)\s+(fast|quick|slow|good|nice|clean|simple|easy)/gi,
    /(?:many|some|few|several|various)\s+(\w+)/gi,
    /(?:handle|support|allow)\s+(\w+)/gi,
  ];

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[0]) {
        vaguePhrases.push(match[0].slice(0, 50));
      }
    }
  }

  return vaguePhrases.slice(0, 3);
}

/**
 * Identify missing detail in a partial answer
 */
function identifyMissingDetail(answer: string): { aspect: string; question: string } | null {
  const lower = answer.toLowerCase();

  if (!lower.match(/\d/)) {
    return { aspect: 'numbers', question: 'Can you give specific numbers or measurements?' };
  }
  if (!lower.includes('when') && !lower.includes('if')) {
    return { aspect: 'conditions', question: 'Under what conditions or circumstances?' };
  }
  if (!lower.includes('example')) {
    return { aspect: 'examples', question: 'Can you give a concrete example?' };
  }

  return null;
}

/**
 * Map signal type to question area
 */
function signalTypeToArea(type: string): 'scope' | 'success' | 'constraint' | 'risk' | 'technical' {
  switch (type) {
    case 'gap': return 'scope';
    case 'tension': return 'risk';
    case 'assumption': return 'constraint';
    default: return 'scope';
  }
}

/**
 * Extract main feature from epic
 */
function extractMainFeature(content: string): string | null {
  // Look for action verbs + objects
  const match = content.match(/(?:build|create|implement|add|develop)\s+(?:a|an)?\s*([a-z\s]{5,30})/i);
  return match?.[1]?.trim() || null;
}

/**
 * Extract features from Q&A
 */
function extractFeatures(qa: QAEntry[]): string[] {
  const features: string[] = [];
  for (const entry of qa) {
    const match = entry.answer.match(/(?:feature|component|module|system|service)\s+(?:for|that|which)\s+([^.]+)/i);
    if (match?.[1]) {
      features.push(match[1].trim().slice(0, 30));
    }
  }
  return features;
}

/**
 * Extract main concepts from Q&A
 */
function extractMainConcepts(qa: QAEntry[]): string[] {
  const concepts = new Set<string>();
  for (const entry of qa) {
    // Extract nouns that appear multiple times
    const words = extractKeyTerms(entry.answer);
    words.forEach(w => concepts.add(w));
  }
  return Array.from(concepts).slice(0, 5);
}

/**
 * Extract technical decisions from Q&A
 */
function extractDecisions(qa: QAEntry[]): string[] {
  const decisions: string[] = [];
  for (const entry of qa) {
    const match = entry.answer.match(/(?:use|using|chose|selected|pick)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (match?.[1]) {
      decisions.push(match[1]);
    }
  }
  return decisions;
}

/**
 * Extract assumptions from Q&A
 */
function extractAssumptions(qa: QAEntry[]): string[] {
  const assumptions: string[] = [];
  for (const entry of qa) {
    const matches = entry.answer.matchAll(/(?:assum(?:e|ing)|expect|should|will)\s+([^.!?]+)/gi);
    for (const match of matches) {
      if (match[1] && match[1].length > 10 && match[1].length < 100) {
        assumptions.push(match[1].trim());
      }
    }
  }
  return assumptions.slice(0, 3);
}

/**
 * Extract requirements from Q&A
 */
function extractRequirements(qa: QAEntry[]): string[] {
  const requirements: string[] = [];
  for (const entry of qa) {
    const matches = entry.answer.matchAll(/(?:must|required|need|essential)\s+([^.!?]+)/gi);
    for (const match of matches) {
      if (match[1] && match[1].length > 10 && match[1].length < 100) {
        requirements.push(match[1].trim());
      }
    }
  }
  return requirements.slice(0, 2);
}
