import { z } from 'zod';

/**
 * Codebase maturity levels
 */
export const CodebaseMaturitySchema = z.enum([
  'greenfield', // New project, no existing code
  'early',      // Some structure, limited patterns
  'established', // Clear patterns, good test coverage
  'legacy'      // Old codebase, may have technical debt
]);

export type CodebaseMaturity = z.infer<typeof CodebaseMaturitySchema>;

/**
 * Architecture patterns we can detect
 */
export const ArchitecturePatternSchema = z.enum([
  'monolith',
  'modular-monolith',
  'microservices',
  'serverless',
  'hybrid',
  'unknown'
]);

export type ArchitecturePattern = z.infer<typeof ArchitecturePatternSchema>;

/**
 * Detected code convention
 */
export const ConventionSchema = z.object({
  type: z.enum([
    'naming',        // Variable/function naming
    'file-structure', // How files are organized
    'testing',       // Test patterns
    'error-handling', // Error handling patterns
    'logging',       // Logging patterns
    'api-style',     // REST, GraphQL, etc.
    'state-management', // Redux, Context, etc.
    'other'
  ]),
  pattern: z.string(),
  examples: z.array(z.string()),
  confidence: z.number().min(0).max(100),
});

export type Convention = z.infer<typeof ConventionSchema>;

/**
 * Dependency information
 */
export const DependencySchema = z.object({
  name: z.string(),
  version: z.string(),
  type: z.enum(['production', 'development', 'peer', 'optional']),
  purpose: z.string().optional(),
});

export type Dependency = z.infer<typeof DependencySchema>;

/**
 * File reference with relevance score
 */
export const FileReferenceSchema = z.object({
  path: z.string(),
  relevance: z.number().min(0).max(100),
  reason: z.string(),
  linesOfCode: z.number().optional(),
  lastModified: z.string().datetime().optional(),
});

export type FileReference = z.infer<typeof FileReferenceSchema>;

/**
 * Risk assessment for an area of the codebase
 */
export const RiskAssessmentSchema = z.object({
  area: z.string(),
  level: z.enum(['low', 'medium', 'high', 'critical']),
  reason: z.string(),
  mitigations: z.array(z.string()),
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

/**
 * Suggested pattern to follow
 */
export const PatternSuggestionSchema = z.object({
  name: z.string(),
  description: z.string(),
  exampleFile: z.string().optional(),
  relevance: z.string(),
});

export type PatternSuggestion = z.infer<typeof PatternSuggestionSchema>;

/**
 * Test coverage information
 */
export const CoverageReportSchema = z.object({
  overallPercentage: z.number().min(0).max(100),
  hasTests: z.boolean(),
  testFramework: z.string().optional(),
  testCommand: z.string().optional(),
  criticalPathsCovered: z.boolean(),
});

export type CoverageReport = z.infer<typeof CoverageReportSchema>;

/**
 * Complete codebase context
 */
export const CodebaseContextSchema = z.object({
  // Analysis metadata
  analyzedAt: z.string().datetime(),
  rootPath: z.string(),
  analysisDepth: z.enum(['shallow', 'medium', 'deep']),

  // Core characteristics
  maturity: CodebaseMaturitySchema,
  architecture: ArchitecturePatternSchema,
  primaryLanguage: z.string(),
  frameworks: z.array(z.string()),

  // Patterns and conventions
  conventions: z.array(ConventionSchema),
  suggestedPatterns: z.array(PatternSuggestionSchema),

  // Dependencies
  dependencies: z.array(DependencySchema),

  // Quality signals
  testCoverage: CoverageReportSchema,
  hasTypeScript: z.boolean(),
  hasLinting: z.boolean(),
  hasCICD: z.boolean(),

  // Risk areas
  riskAreas: z.array(RiskAssessmentSchema),

  // Relevant files for the epic
  relevantFiles: z.array(FileReferenceSchema),

  // Context files found
  contextFiles: z.object({
    claudeMd: z.string().optional(),
    agentsMd: z.string().optional(),
    conventionsMd: z.string().optional(),
    readme: z.string().optional(),
  }),
});

export type CodebaseContext = z.infer<typeof CodebaseContextSchema>;

/**
 * Input for codebase analysis
 */
export const AnalyzeInputSchema = z.object({
  path: z.string().default('.'),
  depth: z.enum(['shallow', 'medium', 'deep']).default('medium'),
  focusAreas: z.array(z.string()).optional(), // Specific areas to analyze deeper
  epicId: z.string().optional(), // Associate with an epic for relevance scoring
});

export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;
