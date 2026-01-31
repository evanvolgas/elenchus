import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import type { Premise, Contradiction, Signal, Specification } from '../types/index.js';

/**
 * elenchus_export - Export specification or session data
 *
 * Export specs and interrogation data in various formats for
 * documentation, sharing, or integration with other tools.
 */
export const exportTool: Tool = {
  name: 'elenchus_export',
  description: `Export specification or session data.

## Formats

- **json** - Full structured data (default)
- **markdown** - Human-readable document
- **summary** - Condensed overview

## What to Export

- **spec** - The generated specification
- **session** - Full interrogation history (Q&A, premises, contradictions)
- **audit** - Complete audit trail for compliance

## Examples

Export spec as markdown:
\`\`\`json
{ "sessionId": "session-xxx", "what": "spec", "format": "markdown" }
\`\`\`

Export full session audit:
\`\`\`json
{ "sessionId": "session-xxx", "what": "audit", "format": "json" }
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID',
      },
      what: {
        type: 'string',
        enum: ['spec', 'session', 'audit'],
        description: 'What to export',
      },
      format: {
        type: 'string',
        enum: ['json', 'markdown', 'summary'],
        description: 'Export format (default: json)',
      },
    },
    required: ['sessionId', 'what'],
  },
};

/**
 * Result from elenchus_export
 */
export interface ExportResult {
  sessionId: string;
  what: 'spec' | 'session' | 'audit';
  format: 'json' | 'markdown' | 'summary';
  content: string;
  metadata: {
    exportedAt: string;
    epicTitle: string;
    version: number | undefined;
  };
}

/**
 * Handle export requests
 */
export function handleExport(
  args: Record<string, unknown>,
  storage: Storage
): ExportResult {
  const sessionId = args.sessionId as string;
  const what = args.what as 'spec' | 'session' | 'audit';
  const format = (args.format as 'json' | 'markdown' | 'summary') ?? 'json';

  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  if (!what) {
    throw new Error('what is required (spec, session, or audit)');
  }

  // Get session
  const session = storage.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Get epic
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
        sessionId,
        what: 'spec',
        format,
        content,
        metadata: {
          exportedAt: now,
          epicTitle: epic.title,
          version: spec.version,
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
          startedAt: session.startedAt,
          updatedAt: session.updatedAt,
        },
        epic: {
          id: epic.id,
          title: epic.title,
          description: epic.description,
          rawContent: epic.rawContent,
        },
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
        sessionId,
        what: 'session',
        format,
        content,
        metadata: {
          exportedAt: now,
          epicTitle: epic.title,
          version: undefined,
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
          rawContent: epic.rawContent,
          status: epic.status,
          createdAt: epic.createdAt,
        },
        session: {
          id: session.id,
          rounds: session.round,
          status: session.status,
          readyForSpec: session.readyForSpec,
          blockers: session.blockers,
          startedAt: session.startedAt,
          updatedAt: session.updatedAt,
        },
        interrogation: {
          questionCount: session.questions.length,
          answerCount: session.answers.length,
          qaLog: session.questions.map((q, i) => ({
            questionId: q.id,
            question: q.question,
            area: q.type,
            priority: q.priority,
            answer: session.answers[i]?.answer,
            answeredAt: session.answers[i]?.answeredAt,
          })),
        },
        elenchus: {
          premiseCount: premises.length,
          premises: premises.map((p: Premise) => ({
            id: p.id,
            statement: p.statement,
            type: p.type,
            confidence: p.confidence,
            extractedFrom: p.extractedFrom,
            createdAt: p.createdAt,
          })),
          contradictionCount: contradictions.length,
          contradictions: contradictions.map((c: Contradiction) => ({
            id: c.id,
            premiseIds: c.premiseIds,
            description: c.description,
            severity: c.severity,
            resolved: c.resolved,
            resolution: c.resolution,
            createdAt: c.createdAt,
            resolvedAt: c.resolvedAt,
          })),
        },
        quality: {
          evaluationCount: evaluations.length,
          averageScore: evaluations.length > 0
            ? evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length
            : 0,
          evaluations: evaluations.map(e => ({
            answerId: e.answerId,
            score: e.score,
            reasoning: e.reasoning,
          })),
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
          signals: signals.map((s: Signal) => ({
            id: s.id,
            type: s.type,
            content: s.content,
            severity: s.severity,
            addressed: s.addressed,
          })),
        },
        specification: spec ? {
          id: spec.id,
          version: spec.version,
          readinessScore: spec.readinessScore,
          createdAt: spec.createdAt,
        } : null,
      };

      let content: string;
      if (format === 'markdown') {
        content = auditToMarkdown(auditData);
      } else if (format === 'summary') {
        content = auditToSummary(auditData);
      } else {
        content = JSON.stringify(auditData, null, 2);
      }

      return {
        sessionId,
        what: 'audit',
        format,
        content,
        metadata: {
          exportedAt: now,
          epicTitle: epic.title,
          version: spec?.version,
        },
      };
    }

    default:
      throw new Error(`Unknown what: ${what}. Valid: spec, session, audit`);
  }
}

/**
 * Convert spec to markdown
 */
function specToMarkdown(
  spec: Specification,
  epic: { title: string }
): string {
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

/**
 * Convert spec to summary
 */
function specToSummary(
  spec: Specification,
  epic: { title: string }
): string {
  return `Specification: ${epic.title}
Success Metrics: ${spec.successMetrics?.length ?? 0}
Constraints: ${spec.constraints?.length ?? 0}
Risks: ${spec.risks?.length ?? 0}
Phases: ${spec.phases?.length ?? 0}`;
}

/**
 * Session data for export
 */
interface SessionExportData {
  session: { round: number; clarityScore: number; readyForSpec: boolean };
  qaHistory: Array<{ question: string; area: string; answer: string }>;
  premises: Array<{ statement: string; type: string }>;
  contradictions: Array<{ description: string; resolved: boolean; resolution: string | undefined }>;
}

/**
 * Convert session to markdown
 */
function sessionToMarkdown(
  data: SessionExportData,
  epic: { title: string }
): string {
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

/**
 * Convert session to summary
 */
function sessionToSummary(
  data: SessionExportData
): string {
  const unresolved = data.contradictions.filter(c => !c.resolved).length;
  return `Session: ${data.session.round} rounds, ${data.session.clarityScore}% clarity
Q&A: ${data.qaHistory.length} pairs
Premises: ${data.premises.length}
Contradictions: ${data.contradictions.length} (${unresolved} unresolved)
Ready: ${data.session.readyForSpec ? 'Yes' : 'No'}`;
}

/**
 * Convert audit to markdown
 */
function auditToMarkdown(
  data: { exportedAt: string; epic: { title: string; createdAt: string }; session: { rounds: number; status: string }; interrogation: { questionCount: number }; elenchus: { premiseCount: number; contradictionCount: number }; quality: { averageScore: number }; signals: { total: number; addressed: number }; specification: { version: number } | null }
): string {
  return `# Audit Trail: ${data.epic.title}

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

/**
 * Convert audit to summary
 */
function auditToSummary(
  data: { epic: { title: string }; session: { rounds: number }; interrogation: { questionCount: number }; elenchus: { premiseCount: number; contradictionCount: number }; specification: { version: number } | null }
): string {
  return `Audit: ${data.epic.title}
Rounds: ${data.session.rounds}, Questions: ${data.interrogation.questionCount}
Premises: ${data.elenchus.premiseCount}, Contradictions: ${data.elenchus.contradictionCount}
Spec: ${data.specification ? `v${data.specification.version}` : 'Not generated'}`;
}
