import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import { z } from 'zod';

const StatusInputSchema = z.object({
  epicId: z.string().optional(),
  sessionId: z.string().optional(),
  specId: z.string().optional(),
});

/**
 * Tool definition for status checking
 */
export const statusTool: Tool = {
  name: 'elenchus_status',
  description: `Check the status of an epic, session, or specification.

Provides a summary of current state, progress, and next steps.
If no ID is provided, returns a summary of all active items.`,

  inputSchema: {
    type: 'object',
    properties: {
      epicId: {
        type: 'string',
        description: 'ID of the epic to check',
      },
      sessionId: {
        type: 'string',
        description: 'ID of the session to check',
      },
      specId: {
        type: 'string',
        description: 'ID of the specification to check',
      },
    },
  },
};

interface StatusResult {
  type: 'epic' | 'session' | 'spec' | 'summary';
  data: unknown;
  nextSteps: string[];
}

/**
 * Handle status check
 */
export async function handleStatus(
  args: Record<string, unknown>,
  storage: Storage
): Promise<StatusResult> {
  const input = StatusInputSchema.parse(args);

  // Check specific item if ID provided
  if (input.specId) {
    return getSpecStatus(input.specId, storage);
  }

  if (input.sessionId) {
    return getSessionStatus(input.sessionId, storage);
  }

  if (input.epicId) {
    return getEpicStatus(input.epicId, storage);
  }

  // Return summary of all items
  return getSummary(storage);
}

function getEpicStatus(epicId: string, storage: Storage): StatusResult {
  const epic = storage.getEpic(epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${epicId}`);
  }

  const sessions = storage.getSessionsForEpic(epicId);
  const latestSpec = storage.getLatestSpecForEpic(epicId);

  const nextSteps: string[] = [];

  if (epic.status === 'ingested') {
    nextSteps.push('Run elenchus_analyze to understand codebase context');
    nextSteps.push('Run elenchus_interrogate to start clarification');
  } else if (epic.status === 'interrogating') {
    nextSteps.push('Continue answering questions with elenchus_answer');
  } else if (epic.status === 'specifying') {
    nextSteps.push('Review generated specification');
  } else if (epic.status === 'ready') {
    nextSteps.push('Start execution with elenchus_execute');
  }

  return {
    type: 'epic',
    data: {
      epic: {
        id: epic.id,
        title: epic.title,
        status: epic.status,
        goals: epic.extractedGoals.length,
        constraints: epic.extractedConstraints.length,
        acceptanceCriteria: epic.extractedAcceptanceCriteria.length,
        createdAt: epic.createdAt,
        updatedAt: epic.updatedAt,
      },
      sessions: sessions.map(s => ({
        id: s.id,
        status: s.status,
        clarityScore: s.clarityScore,
        completenessScore: s.completenessScore,
        readyForSpec: s.readyForSpec,
        questionsAnswered: s.answers.length,
        questionsTotal: s.questions.length,
      })),
      latestSpec: latestSpec ? {
        id: latestSpec.id,
        version: latestSpec.version,
        readinessScore: latestSpec.readinessScore,
      } : null,
    },
    nextSteps,
  };
}

function getSessionStatus(sessionId: string, storage: Storage): StatusResult {
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const unansweredQuestions = session.questions.filter(q => !answeredIds.has(q.id));

  const nextSteps: string[] = [];

  if (unansweredQuestions.length > 0) {
    const criticalUnanswered = unansweredQuestions.filter(q => q.priority === 'critical');
    if (criticalUnanswered.length > 0) {
      nextSteps.push(`Answer ${criticalUnanswered.length} critical question(s)`);
    } else {
      nextSteps.push(`Answer ${unansweredQuestions.length} remaining question(s)`);
    }
  }

  if (session.readyForSpec) {
    nextSteps.push('Generate specification with elenchus_generate_spec');
  }

  return {
    type: 'session',
    data: {
      id: session.id,
      epicId: session.epicId,
      status: session.status,
      round: session.round,
      clarityScore: session.clarityScore,
      completenessScore: session.completenessScore,
      readyForSpec: session.readyForSpec,
      blockers: session.blockers,
      questions: {
        total: session.questions.length,
        answered: session.answers.length,
        critical: session.questions.filter(q => q.priority === 'critical').length,
        criticalAnswered: session.questions.filter(
          q => q.priority === 'critical' && answeredIds.has(q.id)
        ).length,
      },
      unansweredQuestions: unansweredQuestions.slice(0, 5).map(q => ({
        id: q.id,
        type: q.type,
        priority: q.priority,
        question: q.question,
      })),
    },
    nextSteps,
  };
}

function getSpecStatus(specId: string, storage: Storage): StatusResult {
  const spec = storage.getSpec(specId);
  if (!spec) {
    throw new Error(`Specification not found: ${specId}`);
  }

  const nextSteps: string[] = [];

  if (spec.readinessScore < 70) {
    nextSteps.push('Improve specification completeness');
    for (const issue of spec.readinessIssues.slice(0, 3)) {
      nextSteps.push(`Fix: ${issue}`);
    }
  } else {
    nextSteps.push('Validate specification with elenchus_validate');
    nextSteps.push('Start execution with elenchus_execute');
  }

  return {
    type: 'spec',
    data: {
      id: spec.id,
      epicId: spec.epicId,
      sessionId: spec.sessionId,
      version: spec.version,
      readinessScore: spec.readinessScore,
      readinessIssues: spec.readinessIssues,
      phases: spec.phases.map(p => ({
        id: p.id,
        name: p.name,
        tasks: p.tasks.length,
        checkpointAfter: p.checkpointAfter,
      })),
      checkpoints: spec.checkpoints.length,
      acceptanceCriteria: spec.acceptanceCriteria.length,
      estimatedDuration: `${spec.estimatedDuration.totalMinutes} minutes`,
      estimatedCost: `$${spec.estimatedCost.estimatedCostUSD.toFixed(2)}`,
      risks: spec.risks.length,
    },
    nextSteps,
  };
}

function getSummary(storage: Storage): StatusResult {
  const epics = storage.listEpics();

  const summary = {
    totalEpics: epics.length,
    byStatus: {} as Record<string, number>,
    recentEpics: epics.slice(0, 5).map(e => ({
      id: e.id,
      title: e.title,
      status: e.status,
      updatedAt: e.updatedAt,
    })),
  };

  for (const epic of epics) {
    summary.byStatus[epic.status] = (summary.byStatus[epic.status] ?? 0) + 1;
  }

  const nextSteps: string[] = [];

  if (epics.length === 0) {
    nextSteps.push('Ingest an epic with elenchus_ingest to get started');
  } else {
    const inProgress = epics.filter(e =>
      e.status === 'ingested' ||
      e.status === 'analyzing' ||
      e.status === 'interrogating' ||
      e.status === 'specifying'
    );
    if (inProgress.length > 0) {
      nextSteps.push(`Continue work on ${inProgress.length} in-progress epic(s)`);
    }
  }

  return {
    type: 'summary',
    data: summary,
    nextSteps,
  };
}
