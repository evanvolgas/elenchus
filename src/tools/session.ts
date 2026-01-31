import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Epic, InterrogationSession, Specification, Premise, Contradiction, Signal } from '../types/index.js';

/**
 * elenchus_session - Unified session management tool
 *
 * Consolidates lifecycle, data access, and export operations into a single tool.
 * Reduces API surface from 7 tools to 1.
 */
export const sessionTool: Tool = {
  name: 'elenchus_session',
  description: `Unified session management for Elenchus interrogations.

## Actions

### Lifecycle
- **list** - List epics, sessions, or specs
- **delete** - Delete an epic or session
- **resume** - Resume an existing session

### Data Access
- **premises** - View extracted premises for a session
- **contradictions** - View or resolve contradictions

### Export
- **export** - Export spec, session, or audit trail

## Examples

List all sessions:
\`\`\`json
{ "action": "list", "type": "sessions" }
\`\`\`

Resume a session:
\`\`\`json
{ "action": "resume", "sessionId": "session-xxx" }
\`\`\`

View contradictions:
\`\`\`json
{ "action": "contradictions", "sessionId": "session-xxx" }
\`\`\`

Resolve a contradiction:
\`\`\`json
{ "action": "contradictions", "sessionId": "session-xxx", "resolve": { "contradictionId": "contra-xxx", "resolution": "Clarified: only admins can delete" } }
\`\`\`

Export spec as markdown:
\`\`\`json
{ "action": "export", "sessionId": "session-xxx", "what": "spec", "format": "markdown" }
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'delete', 'resume', 'premises', 'contradictions', 'export'],
        description: 'Action to perform',
      },
      // For list action
      type: {
        type: 'string',
        enum: ['epics', 'sessions', 'specs'],
        description: 'What to list (for list action)',
      },
      status: {
        type: 'string',
        description: 'Filter by status (for list action)',
      },
      epicId: {
        type: 'string',
        description: 'Filter by epic ID (for list sessions/specs)',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (for list action)',
      },
      // For delete action
      deleteType: {
        type: 'string',
        enum: ['epic', 'session'],
        description: 'What to delete (for delete action)',
      },
      id: {
        type: 'string',
        description: 'ID of item to delete (for delete action)',
      },
      cascade: {
        type: 'boolean',
        description: 'Also delete related sessions/specs (for delete action)',
      },
      // For resume, premises, contradictions, export
      sessionId: {
        type: 'string',
        description: 'Session ID (for resume, premises, contradictions, export)',
      },
      // For contradictions resolve
      resolve: {
        type: 'object',
        properties: {
          contradictionId: { type: 'string' },
          resolution: { type: 'string' },
        },
        description: 'Resolution details (for contradictions action)',
      },
      showResolved: {
        type: 'boolean',
        description: 'Include resolved contradictions (for contradictions action)',
      },
      // For export action
      what: {
        type: 'string',
        enum: ['spec', 'session', 'audit'],
        description: 'What to export (for export action)',
      },
      format: {
        type: 'string',
        enum: ['json', 'markdown', 'summary'],
        description: 'Export format (for export action)',
      },
    },
    required: ['action'],
  },
};

/**
 * Result types for each action
 */
export interface SessionResult {
  action: string;
  success: boolean;
  data?: unknown;
  message?: string;
}

/**
 * Handle session management requests
 */
export function handleSession(
  args: Record<string, unknown>,
  storage: Storage
): SessionResult {
  const action = args.action as string;

  if (!action) {
    throw new Error('action is required');
  }

  switch (action) {
    case 'list':
      return handleList(args, storage);
    case 'delete':
      return handleDelete(args, storage);
    case 'resume':
      return handleResume(args, storage);
    case 'premises':
      return handlePremises(args, storage);
    case 'contradictions':
      return handleContradictions(args, storage);
    case 'export':
      return handleExport(args, storage);
    default:
      throw new Error(`Unknown action: ${action}. Valid: list, delete, resume, premises, contradictions, export`);
  }
}

// ============================================================================
// LIST ACTION
// ============================================================================

function handleList(args: Record<string, unknown>, storage: Storage): SessionResult {
  const type = args.type as 'epics' | 'sessions' | 'specs' | undefined;
  const status = args.status as string | undefined;
  const epicId = args.epicId as string | undefined;
  const limit = (args.limit as number) ?? 50;

  if (!type) {
    throw new Error('type is required for list action (epics, sessions, or specs)');
  }

  switch (type) {
    case 'epics': {
      let epics = storage.listEpics();
      if (status) {
        epics = epics.filter((e: Epic) => e.status === status);
      }
      epics = epics.slice(0, limit);
      return {
        action: 'list',
        success: true,
        data: {
          type: 'epics',
          count: epics.length,
          items: epics.map((e: Epic) => ({
            id: e.id,
            title: e.title,
            status: e.status,
            createdAt: e.createdAt,
          })),
        },
      };
    }
    case 'sessions': {
      // Sessions must be filtered by epicId - no getAllSessions
      if (!epicId) {
        // Get all epics and their sessions
        const allEpics = storage.listEpics();
        let allSessions: InterrogationSession[] = [];
        for (const epic of allEpics) {
          allSessions = allSessions.concat(storage.getSessionsForEpic(epic.id));
        }
        if (status) {
          allSessions = allSessions.filter((s: InterrogationSession) => s.status === status);
        }
        allSessions = allSessions.slice(0, limit);
        return {
          action: 'list',
          success: true,
          data: {
            type: 'sessions',
            count: allSessions.length,
            items: allSessions.map((s: InterrogationSession) => ({
              id: s.id,
              epicId: s.epicId,
              status: s.status,
              round: s.round,
              readyForSpec: s.readyForSpec,
              updatedAt: s.updatedAt,
            })),
          },
        };
      }
      let sessions = storage.getSessionsForEpic(epicId);
      if (status) {
        sessions = sessions.filter((s: InterrogationSession) => s.status === status);
      }
      sessions = sessions.slice(0, limit);
      return {
        action: 'list',
        success: true,
        data: {
          type: 'sessions',
          count: sessions.length,
          items: sessions.map((s: InterrogationSession) => ({
            id: s.id,
            epicId: s.epicId,
            status: s.status,
            round: s.round,
            readyForSpec: s.readyForSpec,
            updatedAt: s.updatedAt,
          })),
        },
      };
    }
    case 'specs': {
      // Specs must be retrieved via epic - get the latest for each epic
      const allEpics = storage.listEpics();
      let specs: Specification[] = [];
      if (epicId) {
        const spec = storage.getLatestSpecForEpic(epicId);
        if (spec) specs.push(spec);
      } else {
        for (const epic of allEpics) {
          const spec = storage.getLatestSpecForEpic(epic.id);
          if (spec) specs.push(spec);
        }
      }
      specs = specs.slice(0, limit);
      return {
        action: 'list',
        success: true,
        data: {
          type: 'specs',
          count: specs.length,
          items: specs.map((s: Specification) => ({
            id: s.id,
            epicId: s.epicId,
            version: s.version,
            readinessScore: s.readinessScore,
            createdAt: s.createdAt,
          })),
        },
      };
    }
    default:
      throw new Error(`Unknown list type: ${type}`);
  }
}

// ============================================================================
// DELETE ACTION
// ============================================================================

function handleDelete(args: Record<string, unknown>, storage: Storage): SessionResult {
  const deleteType = args.deleteType as 'epic' | 'session' | undefined;
  const id = args.id as string | undefined;
  const cascade = (args.cascade as boolean) ?? false;

  if (!deleteType) {
    throw new Error('deleteType is required for delete action (epic or session)');
  }
  if (!id) {
    throw new Error('id is required for delete action');
  }

  switch (deleteType) {
    case 'epic': {
      const epic = storage.getEpic(id);
      if (!epic) {
        return {
          action: 'delete',
          success: false,
          message: `Epic not found: ${id}`,
        };
      }

      let sessionsDeleted = 0;
      if (cascade) {
        const sessions = storage.getSessionsForEpic(id);
        sessionsDeleted = sessions.length;
        // Note: Cascade delete would need storage support
      }

      const deleted = storage.deleteEpic(id);
      return {
        action: 'delete',
        success: deleted,
        data: cascade ? { sessionsDeleted } : undefined,
        message: deleted ? `Deleted epic: ${epic.title}` : `Failed to delete epic: ${id}`,
      };
    }
    case 'session': {
      const session = storage.getSession(id);
      if (!session) {
        return {
          action: 'delete',
          success: false,
          message: `Session not found: ${id}`,
        };
      }
      // Note: Session deletion not implemented in storage
      return {
        action: 'delete',
        success: false,
        message: 'Session deletion not yet implemented in storage layer',
      };
    }
    default:
      throw new Error(`Unknown delete type: ${deleteType}`);
  }
}

// ============================================================================
// RESUME ACTION
// ============================================================================

function handleResume(args: Record<string, unknown>, storage: Storage): SessionResult {
  const sessionId = args.sessionId as string | undefined;

  if (!sessionId) {
    throw new Error('sessionId is required for resume action');
  }

  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const epic = storage.getEpic(session.epicId);
  if (!epic) {
    throw new Error(`Epic not found for session: ${session.epicId}`);
  }

  const premises = storage.getPremisesForSession(sessionId);
  const contradictions = storage.getUnresolvedContradictionsForSession(sessionId);

  // Build Q&A history
  const qaHistory = session.questions.map((q, i) => ({
    question: q.question,
    area: q.type,
    answer: session.answers[i]?.answer ?? '(no answer)',
  }));

  return {
    action: 'resume',
    success: true,
    data: {
      sessionId: session.id,
      epicId: epic.id,
      epicTitle: epic.title,
      epicDescription: epic.description,
      status: session.status,
      round: session.round,
      clarityScore: session.clarityScore,
      readyForSpec: session.readyForSpec,
      blockers: session.blockers,
      qaHistory,
      premiseCount: premises.length,
      unresolvedContradictions: contradictions.length,
      nextQuestions: session.questions.filter((_, i) => !session.answers[i]),
    },
    message: session.readyForSpec
      ? 'Session ready for spec generation. Call elenchus_spec to generate.'
      : contradictions.length > 0
        ? `${contradictions.length} unresolved contradiction(s). Resolve before spec.`
        : 'Continue with elenchus_qa to refine requirements.',
  };
}

// ============================================================================
// PREMISES ACTION
// ============================================================================

function handlePremises(args: Record<string, unknown>, storage: Storage): SessionResult {
  const sessionId = args.sessionId as string | undefined;

  if (!sessionId) {
    throw new Error('sessionId is required for premises action');
  }

  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const premises = storage.getPremisesForSession(sessionId);

  // Group by type
  const byType: Record<string, Premise[]> = {};
  for (const p of premises) {
    const typeKey = p.type;
    if (!byType[typeKey]) {
      byType[typeKey] = [];
    }
    (byType[typeKey] as Premise[]).push(p);
  }

  return {
    action: 'premises',
    success: true,
    data: {
      sessionId,
      total: premises.length,
      byType: Object.fromEntries(
        Object.entries(byType).map(([type, list]) => [
          type,
          list.map((p: Premise) => ({
            id: p.id,
            statement: p.statement,
            confidence: p.confidence,
          })),
        ])
      ),
    },
  };
}

// ============================================================================
// CONTRADICTIONS ACTION
// ============================================================================

function handleContradictions(args: Record<string, unknown>, storage: Storage): SessionResult {
  const sessionId = args.sessionId as string | undefined;
  const resolve = args.resolve as { contradictionId: string; resolution: string } | undefined;
  const showResolved = (args.showResolved as boolean) ?? false;

  if (!sessionId) {
    throw new Error('sessionId is required for contradictions action');
  }

  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Handle resolve
  if (resolve) {
    if (!resolve.contradictionId || !resolve.resolution) {
      throw new Error('resolve requires contradictionId and resolution');
    }
    const success = storage.resolveContradiction(resolve.contradictionId, resolve.resolution);
    const remaining = storage.getUnresolvedContradictionsForSession(sessionId);
    const unresolvedCritical = remaining.filter((c: Contradiction) => c.severity === 'critical').length;

    return {
      action: 'contradictions',
      success,
      data: {
        resolved: {
          contradictionId: resolve.contradictionId,
          resolution: resolve.resolution,
        },
        remaining: remaining.length,
        unresolvedCritical,
        blocksSpec: unresolvedCritical > 0,
      },
      message: success
        ? unresolvedCritical > 0
          ? `Resolved. ${unresolvedCritical} critical contradiction(s) remain.`
          : 'Resolved. No critical contradictions remain.'
        : 'Failed to resolve contradiction.',
    };
  }

  // List contradictions
  const allPremises = storage.getPremisesForSession(sessionId);
  const contradictions = showResolved
    ? storage.getContradictionsForSession(sessionId)
    : storage.getUnresolvedContradictionsForSession(sessionId);

  const unresolvedCritical = storage.getUnresolvedContradictionsForSession(sessionId)
    .filter((c: Contradiction) => c.severity === 'critical').length;

  return {
    action: 'contradictions',
    success: true,
    data: {
      sessionId,
      count: contradictions.length,
      unresolvedCritical,
      blocksSpec: unresolvedCritical > 0,
      items: contradictions.map((c: Contradiction) => {
        const relatedPremises = allPremises.filter((p: Premise) => c.premiseIds.includes(p.id));
        return {
          id: c.id,
          description: c.description,
          severity: c.severity,
          resolved: c.resolved,
          resolution: c.resolution,
          premises: relatedPremises.map((p: Premise) => ({
            id: p.id,
            statement: p.statement,
          })),
          challengeQuestion: relatedPremises.length >= 2
            ? `You said "${relatedPremises[0]?.statement}" AND "${relatedPremises[1]?.statement}". Which is essential?`
            : `How should this be resolved: ${c.description}?`,
        };
      }),
    },
    message: unresolvedCritical > 0
      ? `${unresolvedCritical} critical contradiction(s) block spec generation.`
      : contradictions.length > 0
        ? `${contradictions.length} non-critical contradiction(s) exist.`
        : 'No contradictions detected.',
  };
}

// ============================================================================
// EXPORT ACTION
// ============================================================================

function handleExport(args: Record<string, unknown>, storage: Storage): SessionResult {
  const sessionId = args.sessionId as string | undefined;
  const what = args.what as 'spec' | 'session' | 'audit' | undefined;
  const format = (args.format as 'json' | 'markdown' | 'summary') ?? 'json';

  if (!sessionId) {
    throw new Error('sessionId is required for export action');
  }
  if (!what) {
    throw new Error('what is required for export action (spec, session, or audit)');
  }

  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const epic = storage.getEpic(session.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${session.epicId}`);
  }

  const now = new Date().toISOString();

  switch (what) {
    case 'spec': {
      const spec = storage.getLatestSpecForEpic(session.epicId);
      if (!spec) {
        throw new Error('No specification found. Generate one with elenchus_spec first.');
      }

      let content: string;
      if (format === 'markdown') {
        content = specToMarkdown(spec, epic);
      } else if (format === 'summary') {
        content = specToSummary(spec, epic);
      } else {
        content = JSON.stringify(spec, null, 2);
      }

      return {
        action: 'export',
        success: true,
        data: {
          what: 'spec',
          format,
          content,
          metadata: {
            exportedAt: now,
            epicTitle: epic.title,
            version: spec.version,
          },
        },
      };
    }

    case 'session': {
      const premises = storage.getPremisesForSession(sessionId);
      const contradictions = storage.getContradictionsForSession(sessionId);

      const sessionData = {
        session: {
          id: session.id,
          epicId: session.epicId,
          status: session.status,
          round: session.round,
          clarityScore: session.clarityScore,
          readyForSpec: session.readyForSpec,
        },
        epic: { id: epic.id, title: epic.title },
        qaHistory: session.questions.map((q, i) => ({
          question: q.question,
          area: q.type,
          answer: session.answers[i]?.answer ?? '(no answer)',
        })),
        premises: premises.map((p: Premise) => ({
          statement: p.statement,
          type: p.type,
          confidence: p.confidence,
        })),
        contradictions: contradictions.map((c: Contradiction) => ({
          description: c.description,
          severity: c.severity,
          resolved: c.resolved,
          resolution: c.resolution,
        })),
      };

      let content: string;
      if (format === 'markdown') {
        content = sessionToMarkdown(sessionData, epic);
      } else if (format === 'summary') {
        content = sessionToSummary(sessionData);
      } else {
        content = JSON.stringify(sessionData, null, 2);
      }

      return {
        action: 'export',
        success: true,
        data: {
          what: 'session',
          format,
          content,
          metadata: {
            exportedAt: now,
            epicTitle: epic.title,
          },
        },
      };
    }

    case 'audit': {
      const premises = storage.getPremisesForSession(sessionId);
      const contradictions = storage.getContradictionsForSession(sessionId);
      const evaluations = storage.getEvaluationsForSession(sessionId);
      const signals = storage.getSignalsForEpic(session.epicId);
      const spec = storage.getLatestSpecForEpic(session.epicId);

      const auditData = {
        exportedAt: now,
        epic: {
          id: epic.id,
          title: epic.title,
          status: epic.status,
          createdAt: epic.createdAt,
        },
        session: {
          id: session.id,
          rounds: session.round,
          status: session.status,
          readyForSpec: session.readyForSpec,
        },
        interrogation: {
          questionCount: session.questions.length,
          answerCount: session.answers.length,
        },
        elenchus: {
          premiseCount: premises.length,
          contradictionCount: contradictions.length,
        },
        quality: {
          evaluationCount: evaluations.length,
          averageScore: evaluations.length > 0
            ? evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length
            : 0,
        },
        signals: {
          total: signals.length,
          byType: {
            claim: signals.filter((s: Signal) => s.type === 'claim').length,
            gap: signals.filter((s: Signal) => s.type === 'gap').length,
            tension: signals.filter((s: Signal) => s.type === 'tension').length,
            assumption: signals.filter((s: Signal) => s.type === 'assumption').length,
          },
          addressed: signals.filter((s: Signal) => s.addressed).length,
        },
        specification: spec ? {
          id: spec.id,
          version: spec.version,
          readinessScore: spec.readinessScore,
        } : null,
      };

      let content: string;
      if (format === 'markdown') {
        content = auditToMarkdown(auditData, epic);
      } else if (format === 'summary') {
        content = auditToSummary(auditData);
      } else {
        content = JSON.stringify(auditData, null, 2);
      }

      return {
        action: 'export',
        success: true,
        data: {
          what: 'audit',
          format,
          content,
          metadata: {
            exportedAt: now,
            epicTitle: epic.title,
            version: spec?.version,
          },
        },
      };
    }

    default:
      throw new Error(`Unknown export what: ${what}`);
  }
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

function specToMarkdown(spec: Specification, epic: { title: string }): string {
  return `# ${epic.title}

## Problem Statement

${spec.problem || 'Not defined'}

## Success Metrics

${spec.successMetrics?.map(m => `- **${m.name}**: ${m.description} (Target: ${m.target})`).join('\n') || '- Not defined'}

## Out of Scope

${spec.outOfScope?.map(s => `- ${s}`).join('\n') || '- Not defined'}

## Constraints

${spec.constraints?.map(c => `- **${c.type}**: ${c.description}`).join('\n') || '- None specified'}

## Risks

${spec.risks?.map(r => `### ${r.description}
- **Likelihood**: ${r.likelihood}
- **Impact**: ${r.impact}
- **Mitigation**: ${r.mitigation}
`).join('\n') || 'No risks identified'}

## Execution Plan

${spec.phases?.map(p => `### ${p.name}
${p.tasks?.map(t => `- ${t.description}`).join('\n') || '- No tasks'}
`).join('\n') || 'No execution plan'}
`;
}

function specToSummary(spec: Specification, epic: { title: string }): string {
  return `Specification: ${epic.title}
Success Metrics: ${spec.successMetrics?.length ?? 0}
Constraints: ${spec.constraints?.length ?? 0}
Risks: ${spec.risks?.length ?? 0}
Phases: ${spec.phases?.length ?? 0}`;
}

interface SessionExportData {
  session: { round: number; clarityScore: number; readyForSpec: boolean };
  qaHistory: Array<{ question: string; area: string; answer: string }>;
  premises: Array<{ statement: string; type: string }>;
  contradictions: Array<{ description: string; resolved: boolean; resolution: string | undefined }>;
}

function sessionToMarkdown(data: SessionExportData, epic: { title: string }): string {
  return `# Interrogation Session: ${epic.title}

## Summary

- **Rounds**: ${data.session.round}
- **Clarity Score**: ${data.session.clarityScore}%
- **Ready for Spec**: ${data.session.readyForSpec ? 'Yes' : 'No'}

## Q&A History

${data.qaHistory.map(qa => `### ${qa.area.toUpperCase()}
**Q**: ${qa.question}
**A**: ${qa.answer}
`).join('\n')}

## Premises Extracted

${data.premises.map(p => `- [${p.type}] ${p.statement}`).join('\n') || 'None'}

## Contradictions

${data.contradictions.length > 0
  ? data.contradictions.map(c => `- ${c.description} ${c.resolved ? `(Resolved: ${c.resolution})` : '**UNRESOLVED**'}`).join('\n')
  : 'None detected'}
`;
}

function sessionToSummary(data: SessionExportData): string {
  const unresolved = data.contradictions.filter(c => !c.resolved).length;
  return `Session: ${data.session.round} rounds, ${data.session.clarityScore}% clarity
Q&A: ${data.qaHistory.length} pairs
Premises: ${data.premises.length}
Contradictions: ${data.contradictions.length} (${unresolved} unresolved)
Ready: ${data.session.readyForSpec ? 'Yes' : 'No'}`;
}

interface AuditData {
  exportedAt: string;
  epic: { title: string; createdAt: string };
  session: { rounds: number; status: string };
  interrogation: { questionCount: number };
  elenchus: { premiseCount: number; contradictionCount: number };
  quality: { averageScore: number };
  signals: { total: number; addressed: number };
  specification: { version: number } | null;
}

function auditToMarkdown(data: AuditData, epic: { title: string }): string {
  return `# Audit Trail: ${epic.title}

**Exported**: ${data.exportedAt}
**Epic Created**: ${data.epic.createdAt}

## Session Summary

- **Status**: ${data.session.status}
- **Rounds**: ${data.session.rounds}
- **Questions**: ${data.interrogation.questionCount}
- **Premises**: ${data.elenchus.premiseCount}
- **Contradictions**: ${data.elenchus.contradictionCount}
- **Average Score**: ${data.quality.averageScore.toFixed(2)}
- **Signals**: ${data.signals.total} (${data.signals.addressed} addressed)
${data.specification ? `- **Spec Version**: ${data.specification.version}` : '- **Spec**: Not generated'}

*Full audit data available in JSON format.*
`;
}

function auditToSummary(data: AuditData): string {
  return `Audit: ${data.epic.title}
Rounds: ${data.session.rounds}, Questions: ${data.interrogation.questionCount}
Premises: ${data.elenchus.premiseCount}, Contradictions: ${data.elenchus.contradictionCount}
Spec: ${data.specification ? `v${data.specification.version}` : 'Not generated'}`;
}
