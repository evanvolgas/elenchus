/**
 * Fact Extraction Engine
 *
 * Extracts semantic facts from Q&A answers using pattern-based extraction
 * for structure and returns LLM prompts for deeper semantic analysis.
 *
 * This engine transforms raw answers into structured facts that can be
 * reasoned about, checked for contradictions, and validated for completeness.
 */

// =============================================================================
// Fact Types
// =============================================================================

export interface MetricFact {
  type: 'metric';
  value: number;
  unit: string;
  context: string;
  confidence: number;
  rawText: string;
}

export interface ThresholdFact {
  type: 'threshold';
  value: number;
  unit: string;
  comparison: 'under' | 'over' | 'exactly' | 'between' | 'at_least' | 'at_most';
  upperBound?: number; // For 'between' comparisons
  context: string;
  confidence: number;
  rawText: string;
}

export interface EntityFact {
  type: 'entity';
  name: string;
  category?: string; // e.g., 'user', 'resource', 'service'
  variants?: string[]; // e.g., ['admin', 'regular'] for 'user'
  confidence: number;
  rawText: string;
}

export interface RelationshipFact {
  type: 'relationship';
  subject: string;
  action: string;
  object: string;
  constraint?: string; // e.g., 'only if authenticated'
  confidence: number;
  rawText: string;
}

export interface ConstraintFact {
  type: 'constraint';
  category: 'technical' | 'security' | 'compliance' | 'performance' | 'business';
  value: string;
  mustHave: boolean; // true for "must use X", false for "cannot use X"
  confidence: number;
  rawText: string;
}

export interface DecisionFact {
  type: 'decision';
  choice: string;
  alternatives: string[];
  rationale?: string;
  confidence: number;
  rawText: string;
}

export type ExtractedFact =
  | MetricFact
  | ThresholdFact
  | EntityFact
  | RelationshipFact
  | ConstraintFact
  | DecisionFact;

export interface ExtractionResult {
  facts: ExtractedFact[];
  deeperAnalysisPrompt: string;
  coverage: {
    hasMetrics: boolean;
    hasEntities: boolean;
    hasRelationships: boolean;
    hasConstraints: boolean;
    hasDecisions: boolean;
  };
}

// =============================================================================
// Pattern Matchers
// =============================================================================

/**
 * Extract numerical metrics with units
 *
 * Examples:
 * - "10,000 users" → { value: 10000, unit: 'users' }
 * - "5 GB" → { value: 5, unit: 'GB' }
 * - "99.9%" → { value: 99.9, unit: 'percent' }
 */
function extractMetrics(text: string, context: string): MetricFact[] {
  const metrics: MetricFact[] = [];
  const seen = new Set<string>(); // Dedup overlapping matches

  // Pattern: number + unit
  const metricPatterns = [
    // Multipliers (K, M, B) - must come first to avoid partial matches
    /(\d+(?:\.\d+)?)\s*([KMB])\s+(users?|records?|requests?|items?)/gi,
    // Thousands/millions with commas
    /(\d{1,3}(?:,\d{3})+)\s+(users?|records?|requests?|items?|rows?|connections?|sessions?)/gi,
    // Numbers with units
    /(\d+(?:\.\d+)?)\s+(GB|MB|KB|TB|ms|seconds?|minutes?|hours?|days?|users?|requests?|QPS|RPS|TPS)/gi,
    // Percentages
    /(\d+(?:\.\d+)?)\s*%/g,
  ];

  for (const pattern of metricPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Skip if we've already seen this position
      const key = `${match.index}-${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let value = parseFloat((match[1] ?? '0').replace(/,/g, ''));
      let unit = match[2] ?? 'percent';

      // Handle K/M/B multipliers
      if (/^[KMB]$/i.test(unit)) {
        const multiplier = unit.toUpperCase();
        const actualUnit = match[3] || 'units';
        value *= multiplier === 'K' ? 1000 : multiplier === 'M' ? 1000000 : 1000000000;
        unit = actualUnit;
      }

      metrics.push({
        type: 'metric',
        value,
        unit: unit.toLowerCase(),
        context,
        confidence: 1.0,
        rawText: match[0],
      });
    }
  }

  return metrics;
}

/**
 * Extract thresholds and performance requirements
 *
 * Examples:
 * - "under 200ms" → { value: 200, unit: 'ms', comparison: 'under' }
 * - "at least 99.9% uptime" → { value: 99.9, unit: 'percent', comparison: 'at_least', context: 'uptime' }
 * - "between 100-500 concurrent users" → { value: 100, upperBound: 500, comparison: 'between' }
 */
function extractThresholds(text: string, context: string): ThresholdFact[] {
  const thresholds: ThresholdFact[] = [];

  const patterns = [
    // "under X", "less than X", "below X"
    {
      regex: /(?:under|less than|below|<)\s*(\d+(?:\.\d+)?)\s*(ms|seconds?|minutes?|hours?|%|percent|GB|MB|KB)/gi,
      comparison: 'under' as const,
    },
    // "over X", "more than X", "above X", "greater than X"
    {
      regex: /(?:over|more than|above|greater than|>)\s*(\d+(?:\.\d+)?)\s*(ms|seconds?|minutes?|hours?|%|percent|GB|MB|KB|users?|requests?)/gi,
      comparison: 'over' as const,
    },
    // "at least X", "minimum X"
    {
      regex: /(?:at least|minimum|min)\s*(\d+(?:\.\d+)?)\s*(%|percent|ms|seconds?|GB|MB|users?|requests?)/gi,
      comparison: 'at_least' as const,
    },
    // "at most X", "maximum X"
    {
      regex: /(?:at most|maximum|max)\s*(\d+(?:\.\d+)?)\s*(%|percent|ms|seconds?|GB|MB|users?|requests?)/gi,
      comparison: 'at_most' as const,
    },
    // "exactly X"
    {
      regex: /(?:exactly|precisely)\s*(\d+(?:\.\d+)?)\s*(ms|seconds?|users?|requests?|%|percent)/gi,
      comparison: 'exactly' as const,
    },
  ];

  for (const { regex, comparison } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const value = parseFloat(match[1] ?? '0');
      const unit = (match[2] ?? 'units').toLowerCase();

      // Try to extract context from surrounding words
      const contextMatch = text.slice(Math.max(0, match.index - 30), match.index).match(/(?:for|in|of)\s+(\w+(?:\s+\w+)?)/i);
      const extractedContext = contextMatch ? contextMatch[1] : context;

      thresholds.push({
        type: 'threshold',
        value,
        unit: unit === '%' ? 'percent' : unit,
        comparison,
        context: extractedContext ?? context,
        confidence: 1.0,
        rawText: match[0] ?? '',
      });
    }
  }

  // Handle "between X and Y" separately
  const betweenPattern = /between\s*(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*(\d+(?:\.\d+)?)\s*(ms|seconds?|users?|requests?|%|percent|GB|MB)/gi;
  let match: RegExpExecArray | null;
  while ((match = betweenPattern.exec(text)) !== null) {
    const value = parseFloat(match[1] ?? '0');
    const upperBound = parseFloat(match[2] ?? '0');
    const unit = (match[3] ?? 'units').toLowerCase();

    thresholds.push({
      type: 'threshold',
      value,
      upperBound,
      unit: unit === '%' ? 'percent' : unit,
      comparison: 'between',
      context,
      confidence: 1.0,
      rawText: match[0],
    });
  }

  return thresholds;
}

/**
 * Extract entities and their variants
 *
 * Examples:
 * - "Admins and regular users" → entity 'user' with variants ['admin', 'regular']
 * - "PostgreSQL database" → entity 'database' with variant 'postgresql'
 */
function extractEntities(text: string): EntityFact[] {
  const entities: EntityFact[] = [];

  // User types
  const userPattern = /(?:^|\s)((?:admin|regular|premium|free|guest|authenticated|anonymous)\s+)?users?(?:\s|$|,)/gi;
  let match: RegExpExecArray | null;
  while ((match = userPattern.exec(text)) !== null) {
    const variant = match[1]?.trim().toLowerCase();
    const existing = entities.find(e => e.name === 'user');
    if (existing && variant) {
      if (!existing.variants) existing.variants = [];
      if (!existing.variants.includes(variant)) {
        existing.variants.push(variant);
      }
    } else if (!existing) {
      const entity: EntityFact = {
        type: 'entity',
        name: 'user',
        category: 'actor',
        confidence: 1.0,
        rawText: match[0] ?? '',
      };
      if (variant) {
        entity.variants = [variant];
      }
      entities.push(entity);
    }
  }

  // Database/tech entities
  const techPattern = /(PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch|S3|AWS|GCP|Azure|Kubernetes|Docker)/gi;
  while ((match = techPattern.exec(text)) !== null) {
    entities.push({
      type: 'entity',
      name: (match[1] ?? 'unknown').toLowerCase(),
      category: 'technology',
      confidence: 1.0,
      rawText: match[0] ?? '',
    });
  }

  // Resource entities (things users interact with)
  const resourcePattern = /(?:^|\s)(projects?|tasks?|documents?|files?|reports?|dashboards?|accounts?)(?:\s|$|,)/gi;
  while ((match = resourcePattern.exec(text)) !== null) {
    const name = (match[1] ?? 'unknown').toLowerCase().replace(/s$/, ''); // Singularize
    if (!entities.find(e => e.name === name)) {
      entities.push({
        type: 'entity',
        name,
        category: 'resource',
        confidence: 0.9,
        rawText: match[0] ?? '',
      });
    }
  }

  return entities;
}

/**
 * Extract relationships (subject-action-object)
 *
 * Examples:
 * - "Users can create Projects" → { subject: 'users', action: 'create', object: 'projects' }
 * - "Admins must approve requests" → { subject: 'admins', action: 'approve', object: 'requests' }
 */
function extractRelationships(text: string): RelationshipFact[] {
  const relationships: RelationshipFact[] = [];

  // Pattern: [Actor] [can/must/should/will] [action] [object]
  const pattern = /(users?|admins?|guests?|system|service)\s+(can|must|should|will|may|cannot|must not)\s+(create|read|update|delete|view|edit|manage|approve|reject|export|import|access|modify|remove|add)\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const subject = (match[1] ?? 'unknown').toLowerCase();
    const modal = (match[2] ?? 'can').toLowerCase();
    const action = (match[3] ?? 'access').toLowerCase();
    const object = (match[4] ?? 'resource').toLowerCase();

    // Determine if this is a constraint (cannot/must not)
    const constraintValue = modal === 'cannot' || modal === 'must not' ? 'forbidden' : modal === 'must' ? 'required' : null;

    const relationship: RelationshipFact = {
      type: 'relationship',
      subject,
      action,
      object,
      confidence: 1.0,
      rawText: match[0] ?? '',
    };
    if (constraintValue) {
      relationship.constraint = constraintValue;
    }
    relationships.push(relationship);
  }

  return relationships;
}

/**
 * Extract constraints (must/must not)
 *
 * Examples:
 * - "Must use PostgreSQL" → { category: 'technical', value: 'PostgreSQL', mustHave: true }
 * - "Cannot store PII" → { category: 'security', value: 'no PII storage', mustHave: false }
 */
function extractConstraints(text: string): ConstraintFact[] {
  const constraints: ConstraintFact[] = [];

  // Positive constraints (must use/have/be)
  const mustPatterns = [
    /must (?:use|have|be|support|comply with|implement)\s+([^.,;]+)/gi,
    /required to\s+(?:use|have|support)\s+([^.,;]+)/gi,
    /shall\s+(?:use|implement|support)\s+([^.,;]+)/gi,
  ];

  for (const pattern of mustPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = (match[1] ?? '').trim();
      const category = determineConstraintCategory(value);
      if (!value) continue;

      constraints.push({
        type: 'constraint',
        category,
        value,
        mustHave: true,
        confidence: 1.0,
        rawText: match[0],
      });
    }
  }

  // Negative constraints (cannot/must not)
  const cannotPatterns = [
    /(?:cannot|must not|shall not|should not)\s+(?:use|store|allow|permit|have)\s+([^.,;]+)/gi,
    /(?:no|without)\s+(PII|personal data|external dependencies|third-party|cloud)/gi,
  ];

  for (const pattern of cannotPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = (match[1] ?? '').trim();
      const category = determineConstraintCategory(value);
      if (!value) continue;

      constraints.push({
        type: 'constraint',
        category,
        value: `no ${value}`,
        mustHave: false,
        confidence: 1.0,
        rawText: match[0],
      });
    }
  }

  return constraints;
}

/**
 * Determine constraint category from content
 */
function determineConstraintCategory(value: string): ConstraintFact['category'] {
  const lower = value.toLowerCase();

  if (/postgres|mysql|mongo|redis|docker|kubernetes|aws|gcp|node|python|java/.test(lower)) {
    return 'technical';
  }
  if (/pii|gdpr|hipaa|auth|encrypt|security|password|token|credential/.test(lower)) {
    return 'security';
  }
  if (/sox|gdpr|hipaa|compliance|audit|regulation/.test(lower)) {
    return 'compliance';
  }
  if (/performance|latency|throughput|response time|concurrent/.test(lower)) {
    return 'performance';
  }
  return 'business';
}

/**
 * Extract decisions (chose X over Y because Z)
 *
 * Examples:
 * - "We chose JWT over sessions because..." → { choice: 'JWT', alternatives: ['sessions'], rationale: '...' }
 */
function extractDecisions(text: string): DecisionFact[] {
  const decisions: DecisionFact[] = [];

  // Pattern: "chose/selected/decided X over/instead of Y"
  const patterns = [
    /(?:chose|selected|decided on|went with)\s+([\w-]+(?:\s+[\w-]+)?)\s+(?:over|instead of|rather than)\s+([\w-]+(?:(?:\s+or\s+|\s*,\s*)[\w-]+)*?)(?:\s+because\s+([^.,;]+))?(?:[.,;]|\s+[A-Z]|$)/gi,
    /(?:using|use)\s+([\w-]+(?:\s+[\w-]+)?)\s+(?:not|instead of)\s+([\w-]+(?:(?:\s+or\s+|\s*,\s*)[\w-]+)*?)(?:\s+because\s+([^.,;]+))?(?:[.,;]|\s+[A-Z]|$)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const choice = (match[1] ?? '').trim();
      const alternativesText = (match[2] ?? '').trim();
      const rationale = match[3]?.trim();

      // Parse alternatives (might be "X, Y, or Z")
      const alternatives = alternativesText
        .split(/\s*,\s*|\s+or\s+|\s+and\s+/)
        .map(a => a.trim())
        .filter(a => a.length > 2); // Filter out single-char artifacts

      // Skip if no valid alternatives extracted
      if (alternatives.length === 0 || alternatives.some(a => a.length < 2)) {
        continue;
      }

      const decision: DecisionFact = {
        type: 'decision',
        choice,
        alternatives,
        confidence: rationale ? 1.0 : 0.8,
        rawText: (match[0] ?? '').trim(),
      };
      if (rationale) {
        decision.rationale = rationale;
      }
      decisions.push(decision);
    }
  }

  return decisions;
}

// =============================================================================
// Deep Analysis Prompt Generator
// =============================================================================

/**
 * Generate a prompt for the calling LLM to perform deeper semantic analysis
 */
function buildDeepAnalysisPrompt(answer: string, extractedFacts: ExtractedFact[]): string {
  const factSummary = extractedFacts.map((f, i) => {
    switch (f.type) {
      case 'metric':
        return `${i + 1}. Metric: ${f.value} ${f.unit} (${f.context})`;
      case 'threshold':
        return `${i + 1}. Threshold: ${f.comparison} ${f.value} ${f.unit} for ${f.context}`;
      case 'entity':
        return `${i + 1}. Entity: ${f.name}${f.variants ? ` (variants: ${f.variants.join(', ')})` : ''}`;
      case 'relationship':
        return `${i + 1}. Relationship: ${f.subject} ${f.action} ${f.object}${f.constraint ? ` (${f.constraint})` : ''}`;
      case 'constraint':
        return `${i + 1}. Constraint: ${f.mustHave ? 'MUST' : 'MUST NOT'} ${f.value} (${f.category})`;
      case 'decision':
        return `${i + 1}. Decision: ${f.choice} over ${f.alternatives.join(', ')}${f.rationale ? ` - ${f.rationale}` : ''}`;
    }
  }).join('\n');

  return `## Semantic Fact Extraction

**Original Answer:**
"${answer}"

**Pattern-Based Facts Extracted:**
${factSummary || 'None'}

## Your Task: Deep Semantic Analysis

Analyze the answer for additional semantic facts that pattern matching cannot catch:

1. **Implied Constraints**: What is assumed but not stated explicitly?
   - Example: "Real-time updates" implies WebSocket/SSE, not polling

2. **Hidden Dependencies**: What must be true for this to work?
   - Example: "Export to Excel" requires file generation, storage, download mechanism

3. **Performance Implications**: What does this mean for system load?
   - Example: "10,000 concurrent users" implies connection pooling, caching, horizontal scaling

4. **Security Implications**: What risks does this create?
   - Example: "Users can export" - can they export other users' data? PII?

5. **Edge Cases**: What scenarios are not covered?
   - Example: "Search returns <200ms" - for what data size? Query complexity?

6. **Contradictions with Previous Statements**: Does this conflict with earlier commitments?

## Output Format

Return additional facts in the same structure:

\`\`\`json
{
  "impliedFacts": [
    {
      "type": "constraint",
      "category": "technical",
      "value": "WebSocket or SSE for real-time updates",
      "mustHave": true,
      "confidence": 0.9,
      "reasoning": "Real-time updates cannot be achieved with polling"
    }
  ],
  "risks": [
    {
      "type": "security",
      "description": "Export may leak PII if not filtered per user",
      "severity": "high"
    }
  ],
  "edgeCases": [
    "What happens if export takes >30 seconds?",
    "How many concurrent exports are allowed?"
  ]
}
\`\`\`

Focus on what's MISSING or AMBIGUOUS, not on restating the obvious.`;
}

// =============================================================================
// Main Extraction Function
// =============================================================================

/**
 * Extract all facts from an answer
 */
export function extractFacts(answer: string, questionContext: string): ExtractionResult {
  const facts: ExtractedFact[] = [
    ...extractMetrics(answer, questionContext),
    ...extractThresholds(answer, questionContext),
    ...extractEntities(answer),
    ...extractRelationships(answer),
    ...extractConstraints(answer),
    ...extractDecisions(answer),
  ];

  const coverage = {
    hasMetrics: facts.some(f => f.type === 'metric'),
    hasEntities: facts.some(f => f.type === 'entity'),
    hasRelationships: facts.some(f => f.type === 'relationship'),
    hasConstraints: facts.some(f => f.type === 'constraint'),
    hasDecisions: facts.some(f => f.type === 'decision'),
  };

  const deeperAnalysisPrompt = buildDeepAnalysisPrompt(answer, facts);

  return {
    facts,
    deeperAnalysisPrompt,
    coverage,
  };
}

// =============================================================================
// Inline Tests (Run with: tsx fact-extractor.ts)
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running inline tests...\n');

  const tests = [
    {
      name: 'Metrics extraction',
      answer: 'Support 10,000 users with 99.9% uptime and response under 200ms',
      context: 'performance',
    },
    {
      name: 'Threshold extraction',
      answer: 'Search must return results in less than 200ms for up to 100k records',
      context: 'search',
    },
    {
      name: 'Entity extraction',
      answer: 'Admins and regular users can create Projects',
      context: 'scope',
    },
    {
      name: 'Relationship extraction',
      answer: 'Users can create Projects. Admins must approve requests. Guests cannot export data.',
      context: 'permissions',
    },
    {
      name: 'Constraint extraction',
      answer: 'Must use PostgreSQL. Cannot store PII. Must comply with GDPR.',
      context: 'requirements',
    },
    {
      name: 'Decision extraction',
      answer: 'We chose JWT over sessions because of stateless scaling. Using Redis instead of memcached for persistence.',
      context: 'technical',
    },
    {
      name: 'Complex mixed extraction',
      answer: 'System must support between 5000-10000 concurrent users with at least 99.9% uptime. Admins can manage all accounts. Must use PostgreSQL, cannot use MongoDB. Response time under 200ms for search queries.',
      context: 'requirements',
    },
    {
      name: 'Edge case: vague answer',
      answer: 'It should be fast and support lots of users',
      context: 'performance',
    },
  ];

  for (const test of tests) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TEST: ${test.name}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Answer: "${test.answer}"\n`);

    const result = extractFacts(test.answer, test.context);

    console.log(`Facts extracted: ${result.facts.length}`);
    for (const fact of result.facts) {
      console.log(`  - ${JSON.stringify(fact, null, 2)}`);
    }

    console.log(`\nCoverage:`);
    console.log(`  Metrics: ${result.coverage.hasMetrics}`);
    console.log(`  Entities: ${result.coverage.hasEntities}`);
    console.log(`  Relationships: ${result.coverage.hasRelationships}`);
    console.log(`  Constraints: ${result.coverage.hasConstraints}`);
    console.log(`  Decisions: ${result.coverage.hasDecisions}`);

    if (result.facts.length === 0) {
      console.log(`\n⚠️  No facts extracted - vague answer detected`);
      console.log(`\nDeeper analysis prompt would be:`);
      console.log(result.deeperAnalysisPrompt);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('Tests complete!');
  console.log(`${'='.repeat(70)}\n`);
}
