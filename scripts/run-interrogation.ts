#!/usr/bin/env tsx
/**
 * Quick runner to invoke interrogation on an epic
 */
import { Storage } from '../src/storage/index.js';
import { handleInterrogate } from '../src/tools/interrogate.js';

const epicId = process.argv[2];

if (!epicId) {
  console.error('Usage: npx tsx scripts/run-interrogation.ts <epicId>');
  process.exit(1);
}

async function main(): Promise<void> {
  const storage = new Storage();

  // Check epic exists
  const epic = storage.getEpic(epicId);
  if (!epic) {
    console.error(`Epic not found: ${epicId}`);
    console.error('\nAvailable epics:');
    const epics = storage.listEpics();
    for (const e of epics) {
      console.error(`  - ${e.id}: ${e.title.slice(0, 60)}...`);
    }
    process.exit(1);
  }

  console.log(`\n🔍 Starting Socratic Interrogation for Epic: ${epicId}\n`);
  console.log(`📋 Title: ${epic.title}\n`);
  console.log('─'.repeat(70));

  const result = await handleInterrogate({ epicId }, storage);

  console.log(`\n📊 Session: ${result.session.id}`);
  console.log(`   Clarity Score: ${result.session.clarityScore}%`);
  console.log(`   Completeness Score: ${result.session.completenessScore}%`);
  console.log(`   Ready for Spec: ${result.readyForSpec ? '✅ Yes' : '❌ No'}\n`);

  if (result.session.blockers.length > 0) {
    console.log('🚧 Blockers:');
    for (const blocker of result.session.blockers) {
      console.log(`   - ${blocker}`);
    }
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('\n❓ Questions to Clarify:\n');

  for (let i = 0; i < result.nextQuestions.length; i++) {
    const q = result.nextQuestions[i]!;
    const priorityEmoji = q.priority === 'critical' ? '🔴' : q.priority === 'important' ? '🟡' : '🟢';

    console.log(`${i + 1}. ${priorityEmoji} [${q.type.toUpperCase()}] ${q.question}`);
    console.log(`   Context: ${q.context}`);

    if (q.suggestedAnswers && q.suggestedAnswers.length > 0) {
      console.log('   Suggested answers:');
      for (const suggestion of q.suggestedAnswers) {
        console.log(`     • ${suggestion}`);
      }
    }

    if (q.inferredDefault) {
      console.log(`   Default: ${q.inferredDefault}`);
    }

    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('\n💡 Recommendations:');
  for (const rec of result.recommendations) {
    console.log(`   • ${rec}`);
  }

  console.log(`\n📝 To answer questions, use: elenchus_answer with sessionId: ${result.session.id}\n`);
}

main().catch(console.error);
