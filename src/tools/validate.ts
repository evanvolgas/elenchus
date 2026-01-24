import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import { z } from 'zod';

const ValidateInputSchema = z.object({
  specId: z.string(),
});

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
  if (!spec.problem || spec.problem.length < 20) {
    issues.push({
      severity: 'error',
      field: 'problem',
      message: 'Problem statement is missing or too brief',
    });
    score -= 15;
  }

  // Check user persona
  if (!spec.userPersona || spec.userPersona.length < 10) {
    issues.push({
      severity: 'warning',
      field: 'userPersona',
      message: 'User persona is missing or too brief',
    });
    score -= 5;
  }

  // Check success metrics
  if (spec.successMetrics.length === 0) {
    issues.push({
      severity: 'error',
      field: 'successMetrics',
      message: 'No success metrics defined',
    });
    score -= 15;
  } else if (spec.successMetrics.filter(m => m.priority === 'primary').length === 0) {
    issues.push({
      severity: 'warning',
      field: 'successMetrics',
      message: 'No primary success metric defined',
    });
    score -= 5;
  }

  // Check acceptance criteria
  if (spec.acceptanceCriteria.length === 0) {
    issues.push({
      severity: 'error',
      field: 'acceptanceCriteria',
      message: 'No acceptance criteria defined',
    });
    score -= 15;
  } else {
    const nonTestable = spec.acceptanceCriteria.filter(ac => !ac.testable);
    if (nonTestable.length > 0) {
      issues.push({
        severity: 'warning',
        field: 'acceptanceCriteria',
        message: `${nonTestable.length} acceptance criteria are not testable`,
      });
      score -= 5;
    }
  }

  // Check phases
  if (spec.phases.length === 0) {
    issues.push({
      severity: 'error',
      field: 'phases',
      message: 'No execution phases defined',
    });
    score -= 15;
  } else {
    // Check for circular dependencies
    const phaseIds = new Set(spec.phases.map(p => p.id));
    for (const phase of spec.phases) {
      for (const dep of phase.dependencies) {
        if (!phaseIds.has(dep)) {
          issues.push({
            severity: 'error',
            field: `phases.${phase.id}.dependencies`,
            message: `Unknown dependency: ${dep}`,
          });
          score -= 10;
        }
      }
    }

    // Check for tasks
    for (const phase of spec.phases) {
      if (phase.tasks.length === 0) {
        issues.push({
          severity: 'warning',
          field: `phases.${phase.id}.tasks`,
          message: `Phase "${phase.name}" has no tasks`,
        });
        score -= 5;
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
    score -= 5;
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
    score -= 5;
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
    score -= 5;
  }

  // Generate recommendations based on issues
  if (issues.filter(i => i.severity === 'error').length > 0) {
    recommendations.unshift('Fix all errors before proceeding to execution');
  }

  if (score >= 80 && issues.filter(i => i.severity === 'error').length === 0) {
    recommendations.push('Specification is ready for execution');
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    score: Math.max(0, score),
    issues,
    recommendations,
  };
}
