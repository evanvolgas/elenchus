import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Phase } from '../types/index.js';
import { z } from 'zod';

const ValidateInputSchema = z.object({
  specId: z.string(),
});

/**
 * Validation scoring weights and thresholds.
 * Extracted as named constants for maintainability.
 */
const VALIDATION_CONFIG = {
  /** Minimum characters for a valid problem statement */
  MIN_PROBLEM_LENGTH: 20,
  /** Minimum characters for a valid user persona */
  MIN_USER_PERSONA_LENGTH: 10,
  /** Score deduction for missing problem statement */
  PROBLEM_MISSING_PENALTY: 15,
  /** Score deduction for missing user persona */
  USER_PERSONA_MISSING_PENALTY: 5,
  /** Score deduction for missing success metrics */
  SUCCESS_METRICS_MISSING_PENALTY: 15,
  /** Score deduction for missing primary metric */
  PRIMARY_METRIC_MISSING_PENALTY: 5,
  /** Score deduction for missing acceptance criteria */
  ACCEPTANCE_CRITERIA_MISSING_PENALTY: 15,
  /** Score deduction for non-testable acceptance criteria */
  NON_TESTABLE_CRITERIA_PENALTY: 5,
  /** Score deduction for missing phases */
  PHASES_MISSING_PENALTY: 15,
  /** Score deduction for unknown dependency */
  UNKNOWN_DEPENDENCY_PENALTY: 10,
  /** Score deduction for empty phase tasks */
  EMPTY_PHASE_TASKS_PENALTY: 5,
  /** Score deduction for missing checkpoints */
  CHECKPOINTS_MISSING_PENALTY: 5,
  /** Score deduction for missing risks */
  RISKS_MISSING_PENALTY: 5,
  /** Score deduction for missing codebase context */
  CODEBASE_CONTEXT_MISSING_PENALTY: 5,
  /** Score deduction for circular dependencies */
  CIRCULAR_DEPENDENCY_PENALTY: 20,
  /** Score threshold for "ready" status */
  READY_SCORE_THRESHOLD: 80,
} as const;

/**
 * Tool definition for spec validation
 */
export const validateTool: Tool = {
  name: 'elenchus_validate',
  description: `Validate a specification for completeness and readiness.

Checks:
- All required fields are present
- Acceptance criteria are testable
- Phases have clear dependencies
- Estimates are reasonable
- Risks are identified

Returns a validation report with issues and recommendations.`,

  inputSchema: {
    type: 'object',
    properties: {
      specId: {
        type: 'string',
        description: 'ID of the specification to validate',
      },
    },
    required: ['specId'],
  },
};

interface ValidationResult {
  valid: boolean;
  score: number;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    field: string;
    message: string;
  }>;
  recommendations: string[];
}

/**
 * Detect circular dependencies in phase graph using DFS.
 *
 * Uses a three-color algorithm (white/gray/black) to detect back edges.
 * - White (unvisited): not yet processed
 * - Gray (visiting): currently in the recursion stack
 * - Black (visited): fully processed
 *
 * @param phases - Array of phases with their dependencies
 * @returns Array of detected cycles, each as a string describing the cycle path
 */
function detectCircularDependencies(phases: Phase[]): string[] {
  const cycles: string[] = [];

  // Build adjacency list from phases
  const graph = new Map<string, string[]>();
  const phaseNames = new Map<string, string>();

  for (const phase of phases) {
    graph.set(phase.id, phase.dependencies);
    phaseNames.set(phase.id, phase.name);
  }

  // Track visited state: 0 = unvisited, 1 = visiting (in stack), 2 = visited
  const state = new Map<string, number>();
  for (const phase of phases) {
    state.set(phase.id, 0);
  }

  // Track path for cycle reporting
  const path: string[] = [];

  function dfs(nodeId: string): boolean {
    const nodeState = state.get(nodeId);

    // If currently visiting, we found a cycle
    if (nodeState === 1) {
      // Find the start of the cycle in the path
      const cycleStart = path.indexOf(nodeId);
      if (cycleStart !== -1) {
        const cyclePath = path.slice(cycleStart);
        cyclePath.push(nodeId); // Complete the cycle
        const cycleNames = cyclePath.map(id => phaseNames.get(id) ?? id);
        cycles.push(cycleNames.join(' → '));
      }
      return true;
    }

    // If already fully visited, no cycle through this node
    if (nodeState === 2) {
      return false;
    }

    // Mark as visiting
    state.set(nodeId, 1);
    path.push(nodeId);

    // Visit all dependencies
    const deps = graph.get(nodeId) ?? [];
    for (const depId of deps) {
      // Only follow edges to nodes that exist in our graph
      if (graph.has(depId)) {
        dfs(depId);
      }
    }

    // Mark as visited
    state.set(nodeId, 2);
    path.pop();

    return false;
  }

  // Run DFS from each unvisited node
  for (const phase of phases) {
    if (state.get(phase.id) === 0) {
      dfs(phase.id);
    }
  }

  return cycles;
}

/**
 * Handle spec validation
 */
export async function handleValidate(
  args: Record<string, unknown>,
  storage: Storage
): Promise<ValidationResult> {
  const input = ValidateInputSchema.parse(args);

  const spec = storage.getSpec(input.specId);
  if (!spec) {
    throw new Error(`Specification not found: ${input.specId}`);
  }

  const issues: ValidationResult['issues'] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check problem statement
  if (!spec.problem || spec.problem.length < VALIDATION_CONFIG.MIN_PROBLEM_LENGTH) {
    issues.push({
      severity: 'error',
      field: 'problem',
      message: `Problem statement is missing or too brief (minimum ${VALIDATION_CONFIG.MIN_PROBLEM_LENGTH} characters)`,
    });
    score -= VALIDATION_CONFIG.PROBLEM_MISSING_PENALTY;
  }

  // Check user persona
  if (!spec.userPersona || spec.userPersona.length < VALIDATION_CONFIG.MIN_USER_PERSONA_LENGTH) {
    issues.push({
      severity: 'warning',
      field: 'userPersona',
      message: `User persona is missing or too brief (minimum ${VALIDATION_CONFIG.MIN_USER_PERSONA_LENGTH} characters)`,
    });
    score -= VALIDATION_CONFIG.USER_PERSONA_MISSING_PENALTY;
  }

  // Check success metrics
  if (spec.successMetrics.length === 0) {
    issues.push({
      severity: 'error',
      field: 'successMetrics',
      message: 'No success metrics defined',
    });
    score -= VALIDATION_CONFIG.SUCCESS_METRICS_MISSING_PENALTY;
  } else if (spec.successMetrics.filter(m => m.priority === 'primary').length === 0) {
    issues.push({
      severity: 'warning',
      field: 'successMetrics',
      message: 'No primary success metric defined',
    });
    score -= VALIDATION_CONFIG.PRIMARY_METRIC_MISSING_PENALTY;
  }

  // Check acceptance criteria
  if (spec.acceptanceCriteria.length === 0) {
    issues.push({
      severity: 'error',
      field: 'acceptanceCriteria',
      message: 'No acceptance criteria defined',
    });
    score -= VALIDATION_CONFIG.ACCEPTANCE_CRITERIA_MISSING_PENALTY;
  } else {
    const nonTestable = spec.acceptanceCriteria.filter(ac => !ac.testable);
    if (nonTestable.length > 0) {
      issues.push({
        severity: 'warning',
        field: 'acceptanceCriteria',
        message: `${nonTestable.length} acceptance criteria are not testable`,
      });
      score -= VALIDATION_CONFIG.NON_TESTABLE_CRITERIA_PENALTY;
    }
  }

  // Check phases
  if (spec.phases.length === 0) {
    issues.push({
      severity: 'error',
      field: 'phases',
      message: 'No execution phases defined',
    });
    score -= VALIDATION_CONFIG.PHASES_MISSING_PENALTY;
  } else {
    // Check for unknown dependencies
    const phaseIds = new Set(spec.phases.map(p => p.id));
    for (const phase of spec.phases) {
      for (const dep of phase.dependencies) {
        if (!phaseIds.has(dep)) {
          issues.push({
            severity: 'error',
            field: `phases.${phase.id}.dependencies`,
            message: `Unknown dependency: ${dep}`,
          });
          score -= VALIDATION_CONFIG.UNKNOWN_DEPENDENCY_PENALTY;
        }
      }
    }

    // Detect circular dependencies using DFS
    const cycles = detectCircularDependencies(spec.phases);
    for (const cycle of cycles) {
      issues.push({
        severity: 'error',
        field: 'phases.dependencies',
        message: `Circular dependency detected: ${cycle}`,
      });
      score -= VALIDATION_CONFIG.CIRCULAR_DEPENDENCY_PENALTY;
    }

    // Check for tasks
    for (const phase of spec.phases) {
      if (phase.tasks.length === 0) {
        issues.push({
          severity: 'warning',
          field: `phases.${phase.id}.tasks`,
          message: `Phase "${phase.name}" has no tasks`,
        });
        score -= VALIDATION_CONFIG.EMPTY_PHASE_TASKS_PENALTY;
      }
    }
  }

  // Check checkpoints
  if (spec.checkpoints.length === 0) {
    issues.push({
      severity: 'warning',
      field: 'checkpoints',
      message: 'No checkpoints defined - consider adding human-in-the-loop validation',
    });
    recommendations.push('Add checkpoints for critical decisions');
    score -= VALIDATION_CONFIG.CHECKPOINTS_MISSING_PENALTY;
  }

  // Check constraints
  if (spec.constraints.length === 0) {
    issues.push({
      severity: 'info',
      field: 'constraints',
      message: 'No constraints defined',
    });
    recommendations.push('Consider adding technical or business constraints');
  }

  // Check risks
  if (spec.risks.length === 0) {
    issues.push({
      severity: 'warning',
      field: 'risks',
      message: 'No risks identified',
    });
    recommendations.push('Identify potential risks and mitigations');
    score -= VALIDATION_CONFIG.RISKS_MISSING_PENALTY;
  }

  // Check estimates
  if (spec.estimatedCost.confidence === 'low') {
    issues.push({
      severity: 'info',
      field: 'estimatedCost',
      message: 'Cost estimate has low confidence',
    });
    recommendations.push('Refine estimates after research phase');
  }

  // Check codebase context
  if (!spec.codebaseContext) {
    issues.push({
      severity: 'warning',
      field: 'codebaseContext',
      message: 'No codebase context available',
    });
    recommendations.push('Run elenchus_analyze to understand the codebase');
    score -= VALIDATION_CONFIG.CODEBASE_CONTEXT_MISSING_PENALTY;
  }

  // Generate recommendations based on issues
  if (issues.filter(i => i.severity === 'error').length > 0) {
    recommendations.unshift('Fix all errors before proceeding to execution');
  }

  if (score >= VALIDATION_CONFIG.READY_SCORE_THRESHOLD && issues.filter(i => i.severity === 'error').length === 0) {
    recommendations.push('Specification is ready for execution');
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    score: Math.max(0, score),
    issues,
    recommendations,
  };
}
