import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type InterrogationSession,
  type Answer,
  type AnswerInput,
  type InterrogationResult,
  AnswerInputSchema,
} from '../types/index.js';

/**
 * Tool definition for answering questions
 */
export const answerTool: Tool = {
  name: 'elenchus_answer',
  description: `Provide answers to interrogation questions.

Submit answers to one or more questions in a session.
After answering, the system will update clarity scores and may generate follow-up questions.`,

  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'ID of the interrogation session',
      },
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            questionId: { type: 'string' },
            answer: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['questionId', 'answer'],
        },
        description: 'Array of answers to questions',
      },
      answeredBy: {
        type: 'string',
        description: 'Who provided the answers (pm, dev, etc.)',
      },
    },
    required: ['sessionId', 'answers'],
  },
};

/**
 * Handle answer submission
 */
export async function handleAnswer(
  args: Record<string, unknown>,
  storage: Storage
): Promise<InterrogationResult> {
  const input = AnswerInputSchema.parse(args);

  // Get session
  const session = storage.getSession(input.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${input.sessionId}`);
  }

  // Get epic for context
  const epic = storage.getEpic(session.epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${session.epicId}`);
  }

  const now = new Date().toISOString();

  // Process answers
  for (const answerInput of input.answers) {
    // Validate question exists
    const question = session.questions.find(q => q.id === answerInput.questionId);
    if (!question) {
      throw new Error(`Question not found: ${answerInput.questionId}`);
    }

    // Check if already answered
    const existingAnswer = session.answers.find(a => a.questionId === answerInput.questionId);
    if (existingAnswer) {
      // Update existing answer
      existingAnswer.answer = answerInput.answer;
      existingAnswer.answeredAt = now;
      existingAnswer.notes = answerInput.notes;
      existingAnswer.answeredBy = input.answeredBy;
    } else {
      // Add new answer
      const answer: Answer = {
        questionId: answerInput.questionId,
        answer: answerInput.answer,
        usedDefault: answerInput.answer === question.inferredDefault,
        answeredBy: input.answeredBy,
        answeredAt: now,
        notes: answerInput.notes,
      };
      session.answers.push(answer);
    }

    // Update epic with extracted information
    updateEpicFromAnswer(epic, question, answerInput.answer);
  }

  // Recalculate scores
  const { clarityScore, completenessScore } = calculateScores(session);
  session.clarityScore = clarityScore;
  session.completenessScore = completenessScore;

  // Check readiness
  session.readyForSpec = clarityScore >= 70 && completenessScore >= 70;
  session.blockers = getBlockers(session);

  // Update status
  if (session.readyForSpec) {
    session.status = 'complete';
    session.completedAt = now;
  } else {
    session.status = 'in-progress';
  }
  session.updatedAt = now;

  // Generate follow-up questions if needed
  const followUpQuestions = generateFollowUpQuestions(session, input.answers);
  session.questions = [...session.questions, ...followUpQuestions];

  // Save updates
  storage.saveSession(session);
  storage.saveEpic(epic);

  // Get unanswered questions
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const nextQuestions = session.questions.filter(q => !answeredIds.has(q.id));

  return {
    session,
    nextQuestions,
    readyForSpec: session.readyForSpec,
    recommendations: getRecommendations(session),
  };
}

function updateEpicFromAnswer(
  epic: NonNullable<ReturnType<Storage['getEpic']>>,
  question: NonNullable<InterrogationSession['questions'][number]>,
  answer: string
): void {
  // Update epic based on question type
  switch (question.type) {
    case 'scope':
      if (question.id.includes('goals')) {
        epic.extractedGoals = [...epic.extractedGoals, answer];
      }
      break;

    case 'success':
      epic.extractedAcceptanceCriteria = [...epic.extractedAcceptanceCriteria, answer];
      break;

    case 'constraint':
      epic.extractedConstraints = [...epic.extractedConstraints, answer];
      break;

    case 'stakeholder':
      epic.extractedStakeholders = [...(epic.extractedStakeholders ?? []), answer];
      break;
  }

  epic.updatedAt = new Date().toISOString();
}

function calculateScores(session: InterrogationSession): {
  clarityScore: number;
  completenessScore: number;
} {
  const answeredIds = new Set(session.answers.map(a => a.questionId));
  const criticalQuestions = session.questions.filter(q => q.priority === 'critical');
  const importantQuestions = session.questions.filter(q => q.priority === 'important');

  // Clarity: based on quality of answers
  const answeredCritical = criticalQuestions.filter(q => answeredIds.has(q.id)).length;
  const answeredImportant = importantQuestions.filter(q => answeredIds.has(q.id)).length;

  let clarityScore = 30;
  if (criticalQuestions.length > 0) {
    clarityScore += (answeredCritical / criticalQuestions.length) * 40;
  } else {
    clarityScore += 40;
  }
  if (importantQuestions.length > 0) {
    clarityScore += (answeredImportant / importantQuestions.length) * 30;
  } else {
    clarityScore += 30;
  }

  // Completeness: based on coverage of question types
  const answeredTypes = new Set(
    session.questions
      .filter(q => answeredIds.has(q.id))
      .map(q => q.type)
  );

  const requiredTypes = ['scope', 'success', 'constraint'];
  const hasRequired = requiredTypes.filter(t => answeredTypes.has(t as any)).length;
  const completenessScore = 40 + (hasRequired / requiredTypes.length) * 60;

  return {
    clarityScore: Math.min(Math.round(clarityScore), 100),
    completenessScore: Math.min(Math.round(completenessScore), 100),
  };
}

function getBlockers(session: InterrogationSession): string[] {
  const blockers: string[] = [];
  const answeredIds = new Set(session.answers.map(a => a.questionId));

  const unansweredCritical = session.questions.filter(
    q => q.priority === 'critical' && !answeredIds.has(q.id)
  );

  for (const q of unansweredCritical) {
    blockers.push(`Unanswered critical question: "${q.question}"`);
  }

  return blockers;
}

function generateFollowUpQuestions(
  session: InterrogationSession,
  newAnswers: AnswerInput['answers']
): InterrogationSession['questions'] {
  const followUp: InterrogationSession['questions'] = [];

  // Check for vague answers that need clarification
  for (const answerInput of newAnswers) {
    const question = session.questions.find(q => q.id === answerInput.questionId);
    if (!question) continue;

    // Very short answers might need elaboration
    if (answerInput.answer.length < 20 && question.priority === 'critical') {
      const followUpId = `q-followup-${question.id}`;
      if (!session.questions.some(q => q.id === followUpId)) {
        followUp.push({
          id: followUpId,
          type: 'clarification',
          priority: 'important',
          question: `Can you elaborate on your answer to "${question.question}"? More detail will help generate a better spec.`,
          context: `Original answer: "${answerInput.answer}"`,
          dependsOn: [question.id],
          targetAudience: question.targetAudience,
        });
      }
    }
  }

  return followUp;
}

function getRecommendations(session: InterrogationSession): string[] {
  const recommendations: string[] = [];

  if (session.clarityScore < 50) {
    recommendations.push('Answer more questions to improve clarity');
  }

  if (session.readyForSpec) {
    recommendations.push('Ready to generate specification! Use elenchus_generate_spec');
  } else {
    const answeredIds = new Set(session.answers.map(a => a.questionId));
    const unanswered = session.questions.filter(q => !answeredIds.has(q.id));
    if (unanswered.length > 0) {
      recommendations.push(`${unanswered.length} question(s) remaining`);
    }
  }

  if (session.blockers.length > 0) {
    recommendations.push(`${session.blockers.length} blocking issue(s) need resolution`);
  }

  return recommendations;
}
