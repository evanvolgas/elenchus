#!/usr/bin/env tsx
/**
 * Submit answers to an interrogation session
 */
import { Storage } from '../src/storage/index.js';
import { handleAnswer } from '../src/tools/answer.js';

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: npx tsx scripts/submit-answers.ts <sessionId>');
  process.exit(1);
}

// Answers from user input
const answers = [
  {
    questionId: 'q-scope-goals-1',
    answer: 'Enable Elenchus to properly detect and analyze Python, TypeScript, PHP, and Go projects. Currently Python detection fails for pyproject.toml-based projects (especially uv-managed). This blocks accurate codebase analysis needed for spec generation.',
  },
  {
    questionId: 'q-constraint-tech-1',
    answer: 'Must support uv as primary Python package manager. Must handle large repositories efficiently (PHP repos specifically can be very large). Should detect pyproject.toml, package.json/tsconfig.json, composer.json, and go.mod respectively.',
  },
  {
    questionId: 'q-scope-out-1',
    answer: 'Deep dependency resolution (just detect dependencies from manifest files). Full AST parsing of source code. Support for less common package managers. Migration tools.',
  },
  {
    questionId: 'q-stakeholder-user-1',
    answer: 'Both Elenchus users analyzing their own codebases and AI agents using Elenchus to understand project structure before generating specs.',
  },
  {
    questionId: 'q-timeline-1',
    answer: '1 week (focused POC)',
  },
  {
    questionId: 'q-risk-1',
    answer: 'Variety of manifest file formats across languages. Large PHP monorepos may have performance issues. Edge cases with polyglot repos containing multiple language manifests.',
  },
];

async function main(): Promise<void> {
  const storage = new Storage();

  console.log(`\n📝 Submitting answers to session: ${sessionId}\n`);

  const result = await handleAnswer(
    {
      sessionId,
      answers,
      answeredBy: 'user',
    },
    storage
  );

  console.log('─'.repeat(70));
  console.log(`\n📊 Updated Session Status:`);
  console.log(`   Clarity Score: ${result.session.clarityScore}%`);
  console.log(`   Completeness Score: ${result.session.completenessScore}%`);
  console.log(`   Ready for Spec: ${result.readyForSpec ? '✅ Yes' : '❌ No'}\n`);

  if (result.session.blockers.length > 0) {
    console.log('🚧 Remaining Blockers:');
    for (const blocker of result.session.blockers) {
      console.log(`   - ${blocker}`);
    }
    console.log('');
  }

  if (result.nextQuestions.length > 0) {
    console.log('❓ Follow-up Questions:');
    for (const q of result.nextQuestions) {
      const priorityEmoji = q.priority === 'critical' ? '🔴' : q.priority === 'important' ? '🟡' : '🟢';
      console.log(`   ${priorityEmoji} [${q.type.toUpperCase()}] ${q.question}`);
    }
    console.log('');
  }

  console.log('💡 Recommendations:');
  for (const rec of result.recommendations) {
    console.log(`   • ${rec}`);
  }

  console.log(`\n📋 Session ID: ${result.session.id}`);
  console.log(`📋 Epic ID: ${result.session.epicId}\n`);
}

main().catch(console.error);
