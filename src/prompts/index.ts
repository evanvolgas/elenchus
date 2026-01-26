/**
 * Prompt Library for Elenchus Intent Contract Compiler
 *
 * These functions build prompts that guide Claude to:
 * 1. Extract structure from raw epics
 * 2. Generate Socratic questions
 * 3. Detect contradictions
 * 4. Assess readiness
 * 5. Compile intent into executable agent prompts
 *
 * Key principle: Claude is the intelligence, these prompts provide structure.
 */

/**
 * Builds prompt for initial epic analysis
 * Claude extracts goals, constraints, acceptance criteria from raw content
 */
export function buildEpicAnalysisPrompt(rawContent: string): string {
  return `You are analyzing a software epic to extract structured information.

## RAW EPIC CONTENT
${rawContent}

## YOUR TASK
Extract the following from this epic:

1. **Goals**: What is this epic trying to achieve? List concrete, measurable goals.
2. **Constraints**: What limitations, requirements, or boundaries are mentioned?
3. **Acceptance Criteria**: What would make this epic "done"? What tests or validations are implied?
4. **Scope Hints**: What's explicitly in scope? What's explicitly out of scope?
5. **Stakeholders**: Who needs to be considered? (users, systems, teams)

## OUTPUT FORMAT
Return a JSON object with this structure:

\`\`\`json
{
  "goals": ["goal1", "goal2", ...],
  "constraints": ["constraint1", "constraint2", ...],
  "acceptanceCriteria": ["criterion1", "criterion2", ...],
  "inScope": ["item1", "item2", ...],
  "outOfScope": ["item1", "item2", ...],
  "stakeholders": ["stakeholder1", "stakeholder2", ...]
}
\`\`\`

## GUIDELINES
- Be precise and concrete
- Don't invent requirements not in the epic
- If something is ambiguous, note it in constraints
- Extract what's there, don't fill gaps yet`;
}

/**
 * Builds prompt for codebase analysis
 * Claude identifies patterns, conventions, tech stack, relevant files
 */
export function buildCodebaseAnalysisPrompt(
  fileList: string[],
  sampleFiles: Record<string, string>
): string {
  const fileListStr = fileList.slice(0, 100).join('\n');
  const samplesStr = Object.entries(sampleFiles)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content.slice(0, 500)}...\n\`\`\``)
    .join('\n\n');

  return `You are analyzing a codebase to understand its patterns and conventions.

## FILE STRUCTURE (first 100 files)
${fileListStr}

## SAMPLE FILES
${samplesStr}

## YOUR TASK
Analyze this codebase and extract:

1. **Tech Stack**: Languages, frameworks, build tools, databases
2. **Architecture Pattern**: monolith, microservices, serverless, modular, etc.
3. **Code Conventions**:
   - Error handling patterns
   - Validation approaches
   - Testing conventions
   - Naming conventions
   - File organization patterns
4. **Maturity Level**: greenfield, early, established, legacy
5. **Key Libraries**: Most-used dependencies
6. **Risk Areas**: Files that might be affected by changes

## OUTPUT FORMAT
Return a JSON object:

\`\`\`json
{
  "techStack": {
    "languages": ["lang1", "lang2"],
    "frameworks": ["framework1"],
    "databases": ["db1"],
    "buildTools": ["tool1"]
  },
  "architecture": "monolith|microservices|serverless|modular",
  "maturity": "greenfield|early|established|legacy",
  "conventions": {
    "errorHandling": "description",
    "validation": "description",
    "testing": "description",
    "naming": "description",
    "fileOrganization": "description"
  },
  "keyLibraries": ["lib1", "lib2"],
  "riskAreas": [
    { "path": "file/path", "reason": "why it's relevant" }
  ]
}
\`\`\`

## GUIDELINES
- Focus on patterns, not exhaustive details
- Identify conventions that should be followed
- Note patterns that indicate quality and maintainability
- Flag areas where changes might have ripple effects`;
}

/**
 * Builds prompt for Socratic interrogation (THE CORE)
 * Claude generates contextual questions based on epic, codebase, history, coverage
 */
export function buildInterrogationPrompt(
  epic: { rawContent: string; extractedGoals?: string[] },
  codebase: {
    techStack: any;
    conventions: any;
    relevantFiles: any[];
  } | null,
  exchanges: Array<{ question: string; answer?: string; area: string }>,
  coverage: Record<string, number>,
  options?: { challengeMode?: boolean }
): string {
  const goalsSection = epic.extractedGoals?.length
    ? `### Extracted Goals\n${epic.extractedGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
    : '';

  const codebaseSection = codebase
    ? `## CODEBASE CONTEXT

**Tech Stack**: ${JSON.stringify(codebase.techStack.languages || [])} + ${JSON.stringify(codebase.techStack.frameworks || [])}

**Architecture**: ${(codebase as any).architecture || 'unknown'}

**Conventions**:
- Error handling: ${codebase.conventions.errorHandling || 'unknown'}
- Validation: ${codebase.conventions.validation || 'unknown'}
- Testing: ${codebase.conventions.testing || 'unknown'}

**Relevant Files**:
${codebase.relevantFiles.slice(0, 10).map((f: any) => `- ${f.path}: ${f.reason || ''}`).join('\n')}
`
    : '## CODEBASE CONTEXT\nNo codebase analysis available yet.\n';

  const conversationSection = exchanges.length
    ? `## CONVERSATION SO FAR (${exchanges.length} exchanges)

${exchanges.slice(-10).map((ex, i) => `### Exchange ${i + 1} [${ex.area}]
**Q**: ${ex.question}
${ex.answer ? `**A**: ${ex.answer}` : '**A**: [Not answered yet]'}
`).join('\n')}
`
    : '## CONVERSATION SO FAR\nNo previous exchanges.\n';

  const challengeModeNote = options?.challengeMode
    ? `\n**CHALLENGE MODE ACTIVE**: Also generate devil's advocate questions that:
- Challenge stated assumptions
- Explore alternative approaches
- Surface potential downsides
- Question "obvious" choices`
    : '';

  return `You are a Socratic interrogator refining a software specification through strategic questioning.

## EPIC
${epic.rawContent}

${goalsSection}

${codebaseSection}

${conversationSection}

## COVERAGE ASSESSMENT
- **Scope boundaries**: ${coverage.scope || 0}% explored
- **Technical decisions**: ${coverage.technical || 0}% explored
- **Success criteria**: ${coverage.success || 0}% explored
- **Risks & constraints**: ${coverage.risks || 0}% explored
- **Stakeholders**: ${coverage.stakeholders || 0}% explored
- **Edge cases**: ${coverage.edgeCases || 0}% explored

## YOUR TASK
Generate 3-5 strategic questions that:

1. **Fill the biggest gaps** in coverage (prioritize areas below 60%)
2. **Challenge assumptions** that haven't been validated
3. **Reference the codebase** when relevant (make questions concrete)
4. **Surface contradictions** between answers or goals
5. **Dig deeper** on vague answers from previous exchanges
${challengeModeNote}

## QUESTION AREAS
Choose the most impactful area for each question:
- \`scope\`: What's in/out, boundaries, feature set
- \`technical\`: Architecture, frameworks, data models, APIs
- \`success\`: Metrics, acceptance tests, definition of done
- \`risks\`: Performance, security, scalability, failure modes
- \`constraints\`: Time, budget, compliance, legacy systems
- \`stakeholders\`: Users, teams, dependencies, integrations
- \`edgeCases\`: Error scenarios, edge inputs, failure recovery

## OUTPUT FORMAT
Return a JSON object:

\`\`\`json
{
  "questions": [
    {
      "text": "The question text (be specific, reference codebase when relevant)",
      "area": "scope|technical|success|risks|constraints|stakeholders|edgeCases",
      "rationale": "Why this question matters and what gap it fills",
      "priority": "high|medium|low"
    }
  ]
}
\`\`\`

## GUIDELINES
- Make questions specific and actionable
- Reference actual files/patterns from the codebase when possible
- Build on previous answers to go deeper
- Don't ask questions already clearly answered
- Focus on what would help an agent execute this epic
- Keep questions focused (one concept per question)`;
}

/**
 * Builds prompt for answer analysis
 * Claude extracts facts, detects contradictions, updates coverage
 */
export function buildAnswerAnalysisPrompt(
  question: string,
  answer: string,
  existingFacts: Array<{ statement: string }>,
  existingConflicts: Array<{ statement1: string; statement2: string }>
): string {
  const factsSection = existingFacts.length
    ? `## EXISTING FACTS\n${existingFacts.map((f, i) => `${i + 1}. ${f.statement}`).join('\n')}\n`
    : '';

  const conflictsSection = existingConflicts.length
    ? `## KNOWN CONFLICTS\n${existingConflicts.map((c, i) => `${i + 1}. "${c.statement1}" vs "${c.statement2}"`).join('\n')}\n`
    : '';

  return `You are analyzing an answer to extract facts and detect contradictions.

## QUESTION
${question}

## ANSWER
${answer}

${factsSection}

${conflictsSection}

## YOUR TASK

1. **Extract New Facts**: What concrete, verifiable statements can be extracted from this answer?
2. **Detect Contradictions**: Does this answer contradict any existing facts or itself?
3. **Assess Clarity**: Is this answer clear and actionable, or vague and evasive?
4. **Identify Follow-ups**: What follow-up questions does this answer raise?

## OUTPUT FORMAT
Return a JSON object:

\`\`\`json
{
  "facts": [
    {
      "statement": "Concrete fact extracted",
      "confidence": "high|medium|low",
      "source": "quote from answer"
    }
  ],
  "contradictions": [
    {
      "newStatement": "Statement from this answer",
      "conflictsWith": "Existing fact ID or statement",
      "severity": "high|medium|low"
    }
  ],
  "clarity": {
    "score": 0-100,
    "issues": ["vague term 1", "unclear reference 2"],
    "strengths": ["specific detail 1", "concrete example 2"]
  },
  "followUps": [
    {
      "question": "Follow-up question text",
      "reason": "Why this needs clarification"
    }
  ]
}
\`\`\`

## GUIDELINES
- Be precise in fact extraction (avoid interpretation)
- Flag contradictions even if subtle
- Low clarity score (< 60) means answer is too vague
- Follow-ups should drill into vague areas or contradictions
- High confidence facts are explicit and verifiable`;
}

/**
 * Builds prompt for readiness assessment
 * Claude determines if we have enough information to compile
 */
export function buildReadinessPrompt(
  coverage: Record<string, number>,
  facts: Array<{ statement: string }>,
  conflicts: Array<{ resolved: boolean }>
): string {
  const unresolvedConflicts = conflicts.filter((c) => !c.resolved).length;

  return `You are assessing whether a specification is ready to compile into executable agent prompts.

## COVERAGE SCORES
- Scope boundaries: ${coverage.scope || 0}%
- Technical decisions: ${coverage.technical || 0}%
- Success criteria: ${coverage.success || 0}%
- Risks & constraints: ${coverage.risks || 0}%
- Stakeholders: ${coverage.stakeholders || 0}%
- Edge cases: ${coverage.edgeCases || 0}%

**Average Coverage**: ${Math.round(Object.values(coverage).reduce((a, b) => a + b, 0) / Object.keys(coverage).length)}%

## FACTS GATHERED
Total facts: ${facts.length}

Sample facts:
${facts.slice(0, 5).map((f, i) => `${i + 1}. ${f.statement}`).join('\n')}

## UNRESOLVED CONFLICTS
${unresolvedConflicts} unresolved contradictions

## YOUR TASK
Determine if this specification is ready to compile into executable agent prompts.

Consider:
1. **Minimum Thresholds**:
   - Scope: ≥ 70%
   - Technical: ≥ 60%
   - Success: ≥ 60%
   - Overall: ≥ 65%

2. **Quality Checks**:
   - No unresolved contradictions
   - At least 10 concrete facts
   - Key decisions documented

3. **Risk Assessment**:
   - Critical unknowns identified
   - Edge cases considered
   - Failure modes addressed

## OUTPUT FORMAT
Return a JSON object:

\`\`\`json
{
  "ready": true|false,
  "confidence": "high|medium|low",
  "reasoning": "Why ready or not ready",
  "blockers": [
    {
      "issue": "Description of blocking issue",
      "severity": "high|medium|low",
      "recommendation": "What to do about it"
    }
  ],
  "strengths": [
    "What's well-specified",
    "What's ready to execute"
  ],
  "gaps": [
    {
      "area": "scope|technical|success|risks|etc",
      "description": "What's missing",
      "priority": "high|medium|low"
    }
  ]
}
\`\`\`

## GUIDELINES
- Be conservative: better to ask more questions than ship with gaps
- High-severity blockers (unresolved conflicts, scope ambiguity) = not ready
- Low coverage in critical areas (scope, technical) = not ready
- Edge cases and risks can be lower if core is solid
- Confidence reflects how certain you are about the assessment`;
}

/**
 * Builds prompt for compilation (THE KEY OUTPUT)
 * Claude generates executable agent prompts from interrogation results
 */
export function buildCompilationPrompt(
  epic: { rawContent: string; extractedGoals?: string[] },
  codebase: {
    techStack: any;
    conventions: any;
    relevantFiles: any[];
  } | null,
  facts: Array<{ statement: string; confidence: string }>,
  insights: Array<{ pattern: string; recommendation: string }>
): string {
  const codebaseSection = codebase
    ? `## CODEBASE CONTEXT

**Tech Stack**: ${JSON.stringify(codebase.techStack)}

**Architecture**: ${(codebase as any).architecture || 'unknown'}

**Conventions to Follow**:
- Error handling: ${codebase.conventions.errorHandling}
- Validation: ${codebase.conventions.validation}
- Testing: ${codebase.conventions.testing}
- Naming: ${codebase.conventions.naming}

**Files to Modify/Create**:
${codebase.relevantFiles.map((f: any) => `- ${f.path}: ${f.reason}`).join('\n')}
`
    : '## CODEBASE CONTEXT\nNo codebase analysis available.\n';

  const factsSection = facts
    .filter((f) => f.confidence === 'high' || f.confidence === 'medium')
    .map((f, i) => `${i + 1}. ${f.statement} [${f.confidence}]`)
    .join('\n');

  const insightsSection = insights.length
    ? `## INSIGHTS FROM INTERROGATION\n${insights.map((ins, i) => `${i + 1}. **${ins.pattern}**: ${ins.recommendation}`).join('\n')}\n`
    : '';

  return `You are compiling a refined specification into executable agent prompts.

## ORIGINAL EPIC
${epic.rawContent}

${codebaseSection}

## VALIDATED FACTS (from interrogation)
${factsSection}

${insightsSection}

## YOUR TASK
Generate executable prompts for agents to implement this epic as a proof-of-concept.

Create prompts for these agent phases:

1. **Research Agent**: Gather technical context, review relevant files
2. **Design Agent**: Architecture decisions, API contracts, data models
3. **Implementation Agent**: Code generation with specific requirements
4. **Test Agent**: Test scenarios, edge cases, validation
5. **Review Agent**: Quality checks, convention adherence, security

## OUTPUT FORMAT
Return a JSON object:

\`\`\`json
{
  "problemStatement": "Clear, concise description of what we're building",

  "technicalDecisions": [
    {
      "decision": "What was decided",
      "rationale": "Why this choice",
      "alternatives": "What else was considered"
    }
  ],

  "agentPrompts": {
    "research": "Full prompt for research agent with specific tasks",
    "design": "Full prompt for design agent with constraints and patterns",
    "implementation": "Full prompt for implementation agent with concrete requirements",
    "test": "Full prompt for test agent with scenarios and edge cases",
    "review": "Full prompt for review agent with quality criteria"
  },

  "successCriteria": [
    "Testable criterion 1",
    "Testable criterion 2"
  ],

  "risksAndMitigation": [
    {
      "risk": "Potential issue",
      "severity": "high|medium|low",
      "mitigation": "How to address it"
    }
  ],

  "executionPlan": [
    {
      "phase": "Phase name",
      "agent": "Agent type",
      "inputs": ["Required inputs"],
      "outputs": ["Expected outputs"],
      "estimatedEffort": "S|M|L|XL"
    }
  ],

  "checkpoints": [
    {
      "after": "Phase name",
      "reviewCriteria": "What to check",
      "decision": "What decision point requires human input"
    }
  ]
}
\`\`\`

## GUIDELINES FOR AGENT PROMPTS

### Research Agent Prompt Should Include:
- Specific files to analyze
- Patterns to identify
- Dependencies to check
- Context to gather

### Design Agent Prompt Should Include:
- Architecture constraints from codebase
- API contracts to define
- Data models to create
- Integration points
- Convention requirements

### Implementation Agent Prompt Should Include:
- Exact files to create/modify
- Code patterns to follow
- Error handling requirements
- Validation requirements
- Specific technical decisions

### Test Agent Prompt Should Include:
- Specific test scenarios
- Edge cases from interrogation
- Performance requirements
- Security test cases

### Review Agent Prompt Should Include:
- Convention checklist
- Security review points
- Code quality criteria
- Documentation requirements

## COMPILATION PRINCIPLES
- Ground everything in facts from interrogation
- Make prompts specific and actionable
- Include codebase context in every prompt
- Reference actual files and patterns
- Make success criteria testable
- Don't invent requirements not discussed
- Estimate based on actual scope, not generic formulas
- Keep execution plan realistic (POC, not production)`;
}

/**
 * Builds prompt for conflict resolution
 * Claude helps resolve contradictions between facts
 */
export function buildConflictResolutionPrompt(
  conflict: { statement1: string; statement2: string; context: string }
): string {
  return `You are helping resolve a contradiction in the specification.

## CONFLICTING STATEMENTS

**Statement 1**: ${conflict.statement1}

**Statement 2**: ${conflict.statement2}

**Context**: ${conflict.context}

## YOUR TASK
Analyze this conflict and provide resolution strategies.

Consider:
1. Are these actually contradictory, or compatible when viewed differently?
2. Which statement has stronger justification?
3. Is there a third option that reconciles both?
4. What clarifying question would resolve this?

## OUTPUT FORMAT
Return a JSON object:

\`\`\`json
{
  "conflictType": "direct|conditional|scope|priority",
  "analysis": "Explanation of why these conflict",
  "resolutionStrategies": [
    {
      "approach": "Description of resolution approach",
      "tradeoffs": "What this approach sacrifices",
      "recommendation": "Why this might be best"
    }
  ],
  "clarifyingQuestion": "Question to ask user to resolve this",
  "suggestedResolution": "Your recommended resolution with rationale"
}
\`\`\`

## GUIDELINES
- Look for compatibility before declaring true conflict
- Consider scope: maybe both are true in different contexts
- Prioritize technical correctness over convenience
- Recommend asking user if genuinely unclear`;
}

/**
 * Builds prompt for coverage assessment
 * Claude analyzes conversation to determine coverage scores
 */
export function buildCoverageAssessmentPrompt(
  exchanges: Array<{ question: string; answer?: string; area: string }>,
  facts: Array<{ statement: string; area?: string }>
): string {
  const exchangesByArea = exchanges.reduce((acc, ex) => {
    acc[ex.area] = (acc[ex.area] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return `You are assessing specification coverage across key areas.

## CONVERSATION SUMMARY
Total exchanges: ${exchanges.length}
- Scope: ${exchangesByArea.scope || 0} questions
- Technical: ${exchangesByArea.technical || 0} questions
- Success: ${exchangesByArea.success || 0} questions
- Risks: ${exchangesByArea.risks || 0} questions
- Constraints: ${exchangesByArea.constraints || 0} questions
- Stakeholders: ${exchangesByArea.stakeholders || 0} questions
- Edge cases: ${exchangesByArea.edgeCases || 0} questions

## FACTS GATHERED
${facts.map((f, i) => `${i + 1}. [${f.area || 'unknown'}] ${f.statement}`).join('\n')}

## YOUR TASK
Assess coverage in each area (0-100%).

Consider:
- **Quantity**: How many questions/facts in this area?
- **Quality**: Are answers concrete or vague?
- **Depth**: Have we drilled into details?
- **Completeness**: What's still missing?

## OUTPUT FORMAT
Return a JSON object:

\`\`\`json
{
  "coverage": {
    "scope": 0-100,
    "technical": 0-100,
    "success": 0-100,
    "risks": 0-100,
    "constraints": 0-100,
    "stakeholders": 0-100,
    "edgeCases": 0-100
  },
  "overallReadiness": 0-100,
  "reasoning": {
    "scope": "Why this score",
    "technical": "Why this score",
    "success": "Why this score",
    "risks": "Why this score",
    "constraints": "Why this score",
    "stakeholders": "Why this score",
    "edgeCases": "Why this score"
  },
  "criticalGaps": [
    {
      "area": "Area name",
      "gap": "What's missing",
      "impact": "Why it matters"
    }
  ]
}
\`\`\`

## SCORING RUBRIC
- **0-30%**: Barely touched, major gaps
- **30-60%**: Some coverage, needs more depth
- **60-80%**: Good coverage, minor gaps
- **80-100%**: Comprehensive, ready to execute

## GUIDELINES
- Be honest about gaps (better to ask more questions)
- Consider both breadth and depth
- Scope and technical are most critical for execution
- Success criteria can be refined during implementation`;
}
