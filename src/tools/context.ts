import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { CodebaseContext, DetectedLanguage, Convention, PatternSuggestion, RiskAssessment } from '../types/index.js';

/**
 * elenchus_context - Analyze codebase context for informed interrogation
 *
 * Analyzes a codebase to inform the interrogation process. Understanding
 * existing patterns helps ask better questions.
 */
export const contextTool: Tool = {
  name: 'elenchus_context',
  description: `Analyze codebase context to inform interrogation.

Understanding the existing codebase helps ask better questions:
- What patterns already exist?
- What technologies are in use?
- What conventions should be followed?

## Actions

- **analyze** - Analyze a codebase path (simulated - returns prompt for you to analyze)
- **get** - Get stored context for a path
- **link** - Link context to an epic

## Examples

Analyze a codebase:
\`\`\`json
{ "action": "analyze", "path": "/path/to/project" }
\`\`\`

Get stored context:
\`\`\`json
{ "action": "get", "path": "/path/to/project" }
\`\`\`

Link context to epic:
\`\`\`json
{ "action": "link", "path": "/path/to/project", "epicId": "epic-xxx" }
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['analyze', 'get', 'link', 'store'],
        description: 'Action to perform',
      },
      path: {
        type: 'string',
        description: 'Path to the codebase',
      },
      epicId: {
        type: 'string',
        description: 'Epic ID to link context to (for link action)',
      },
      context: {
        type: 'object',
        description: 'Context data to store (for store action)',
      },
    },
    required: ['action', 'path'],
  },
};

/**
 * Result from elenchus_context
 */
export interface ContextResult {
  action: 'analyze' | 'get' | 'link' | 'store';
  path: string;
  found?: boolean;
  context?: CodebaseContext;
  analysisPrompt?: string;
  linked?: {
    epicId: string;
    success: boolean;
  };
  stored?: boolean;
  interrogationHints?: string[];
}

/**
 * Handle context requests
 */
export function handleContext(
  args: Record<string, unknown>,
  storage: Storage
): ContextResult {
  const action = args.action as 'analyze' | 'get' | 'link' | 'store';
  const path = args.path as string;
  const epicId = args.epicId as string | undefined;
  const contextData = args.context as Record<string, unknown> | undefined;

  if (!action) {
    throw new Error('action is required (analyze, get, link, or store)');
  }
  if (!path) {
    throw new Error('path is required');
  }

  switch (action) {
    case 'analyze': {
      // Return a prompt for the calling LLM to analyze the codebase
      const analysisPrompt = buildAnalysisPrompt(path);
      return {
        action: 'analyze',
        path,
        analysisPrompt,
        interrogationHints: [
          'After analyzing, store the context with action: "store"',
          'Link the context to an epic with action: "link"',
          'Use detected patterns to inform your questions',
        ],
      };
    }

    case 'get': {
      const context = storage.getContextForPath(path);
      if (!context) {
        return {
          action: 'get',
          path,
          found: false,
          interrogationHints: [
            'No context found. Use action: "analyze" first.',
          ],
        };
      }
      return {
        action: 'get',
        path,
        found: true,
        context,
        interrogationHints: generateInterrogationHints(context),
      };
    }

    case 'link': {
      if (!epicId) {
        throw new Error('epicId is required for link action');
      }

      // Check epic exists
      const epic = storage.getEpic(epicId);
      if (!epic) {
        throw new Error(`Epic not found: ${epicId}`);
      }

      // Check context exists
      const context = storage.getContextForPath(path);
      if (!context) {
        return {
          action: 'link',
          path,
          linked: {
            epicId,
            success: false,
          },
          interrogationHints: [
            'No context found to link. Use action: "analyze" first.',
          ],
        };
      }

      // Store context with epic association
      storage.saveContext(context, epicId);

      return {
        action: 'link',
        path,
        linked: {
          epicId,
          success: true,
        },
        interrogationHints: generateInterrogationHints(context),
      };
    }

    case 'store': {
      if (!contextData) {
        throw new Error('context object is required for store action');
      }

      // Build full context object matching CodebaseContext type
      const now = new Date().toISOString();
      const fullContext: CodebaseContext = {
        rootPath: path,
        analyzedAt: now,
        analysisDepth: (contextData.analysisDepth as 'shallow' | 'medium' | 'deep') ?? 'medium',
        maturity: (contextData.maturity as 'greenfield' | 'early' | 'established' | 'legacy') ?? 'greenfield',
        architecture: (contextData.architecture as 'monolith' | 'modular-monolith' | 'microservices' | 'serverless' | 'hybrid' | 'unknown') ?? 'unknown',
        primaryLanguage: (contextData.primaryLanguage as string) ?? 'unknown',
        detectedLanguages: contextData.detectedLanguages as DetectedLanguage[] | undefined,
        frameworks: (contextData.frameworks as string[]) ?? [],
        conventions: (contextData.conventions as Convention[]) ?? [],
        suggestedPatterns: (contextData.suggestedPatterns as PatternSuggestion[]) ?? [],
        dependencies: (contextData.dependencies as Array<{ name: string; version: string; type: 'production' | 'development' | 'peer' | 'optional'; purpose?: string }>) ?? [],
        testCoverage: (contextData.testCoverage as { overallPercentage: number; hasTests: boolean; criticalPathsCovered: boolean; testFramework?: string; testCommand?: string }) ?? {
          overallPercentage: 0,
          hasTests: false,
          criticalPathsCovered: false,
        },
        hasTypeScript: (contextData.hasTypeScript as boolean) ?? false,
        hasLinting: (contextData.hasLinting as boolean) ?? false,
        hasCICD: (contextData.hasCICD as boolean) ?? false,
        riskAreas: (contextData.riskAreas as RiskAssessment[]) ?? [],
        relevantFiles: (contextData.relevantFiles as Array<{ path: string; relevance: number; reason: string; linesOfCode?: number; lastModified?: string }>) ?? [],
        contextFiles: (contextData.contextFiles as { claudeMd?: string; agentsMd?: string; conventionsMd?: string; readme?: string }) ?? {},
      };

      storage.saveContext(fullContext, epicId);

      return {
        action: 'store',
        path,
        stored: true,
        context: fullContext,
        interrogationHints: generateInterrogationHints(fullContext),
      };
    }

    default:
      throw new Error(`Unknown action: ${action}. Valid: analyze, get, link, store`);
  }
}

/**
 * Build analysis prompt for the calling LLM
 */
function buildAnalysisPrompt(path: string): string {
  return `## Codebase Analysis Request

Analyze the codebase at: \`${path}\`

Please identify:

### 1. Maturity Level
- greenfield (new project)
- early (some structure, limited patterns)
- established (clear patterns, good test coverage)
- legacy (older patterns)

### 2. Languages & Frameworks
- Primary programming language
- Web/mobile frameworks
- Testing frameworks
- Build tools

### 3. Architecture Pattern
- monolith, modular-monolith, microservices, serverless, hybrid, or unknown

### 4. Conventions
- File naming patterns
- Code organization
- Import/export style
- Error handling patterns

### 5. Dependencies
- Major external dependencies
- Database systems
- Message queues
- Cloud services

### 6. Risk Areas
- Known issues
- Deprecated patterns
- Missing tests
- Documentation gaps

After analysis, call elenchus_context with:
\`\`\`json
{
  "action": "store",
  "path": "${path}",
  "context": {
    "maturity": "established",
    "architecture": "modular-monolith",
    "primaryLanguage": "TypeScript",
    "frameworks": ["Express", "React"],
    "conventions": [
      { "type": "naming", "pattern": "kebab-case files", "examples": ["user-service.ts"], "confidence": 90 }
    ],
    "dependencies": [
      { "name": "PostgreSQL", "version": "14", "type": "production", "purpose": "Primary database" }
    ],
    "testCoverage": {
      "overallPercentage": 75,
      "hasTests": true,
      "criticalPathsCovered": true,
      "testFramework": "jest"
    },
    "hasTypeScript": true,
    "hasLinting": true,
    "hasCICD": true,
    "riskAreas": [
      { "area": "Integration tests", "level": "medium", "reason": "Missing integration tests", "mitigations": ["Add E2E tests"] }
    ]
  }
}
\`\`\``;
}

/**
 * Generate interrogation hints from codebase context
 */
function generateInterrogationHints(context: CodebaseContext): string[] {
  const hints: string[] = [];

  // Maturity hints
  switch (context.maturity) {
    case 'greenfield':
      hints.push('Greenfield project - focus on architectural decisions and patterns to establish');
      break;
    case 'early':
      hints.push('Early stage - clarify what stays vs. what gets rewritten');
      break;
    case 'established':
      hints.push('Established codebase - ask about consistency with existing patterns');
      break;
    case 'legacy':
      hints.push('Legacy codebase - ask about migration strategy and backwards compatibility');
      break;
  }

  // Language hints
  if (context.primaryLanguage && context.primaryLanguage !== 'unknown') {
    hints.push(`Primary language: ${context.primaryLanguage} - ensure language-specific considerations`);
  }

  // Framework hints
  if (context.frameworks.length > 0) {
    hints.push(`Existing frameworks: ${context.frameworks.join(', ')} - ensure compatibility`);
  }

  // Architecture hints
  if (context.architecture && context.architecture !== 'unknown') {
    hints.push(`Architecture: ${context.architecture} - follow existing patterns`);
  }

  // Risk area hints
  if (context.riskAreas.length > 0) {
    hints.push(`Be aware of risk areas: ${context.riskAreas.length} items identified`);
  }

  // Test coverage hints
  if (context.testCoverage) {
    if (context.testCoverage.overallPercentage < 50) {
      hints.push('Low test coverage - emphasize testing requirements in spec');
    } else if (context.testCoverage.overallPercentage >= 80) {
      hints.push('Good test coverage - maintain testing standards');
    }
  }

  return hints;
}
