#!/usr/bin/env tsx
/**
 * Generate specification from interrogation session
 */
import { Storage } from '../src/storage/index.js';
import { handleGenerateSpec } from '../src/tools/generate-spec.js';
import * as fs from 'fs';
import * as path from 'path';

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: npx tsx scripts/generate-spec.ts <sessionId>');
  process.exit(1);
}

async function main(): Promise<void> {
  const storage = new Storage();

  console.log(`\n📋 Generating specification from session: ${sessionId}\n`);

  const result = await handleGenerateSpec(
    {
      sessionId,
      format: 'all',
      includeEstimates: true,
    },
    storage
  );

  const spec = result.spec;

  console.log('─'.repeat(70));
  console.log(`\n✅ Specification Generated!\n`);
  console.log(`   ID: ${spec.id}`);
  console.log(`   Epic: ${spec.epicId}`);
  console.log(`   Readiness: ${spec.readinessScore}%`);
  console.log(`   Phases: ${spec.phases.length}`);
  console.log(`   Tasks: ${spec.phases.reduce((acc, p) => acc + p.tasks.length, 0)}`);
  console.log(`   Checkpoints: ${spec.checkpoints.length}`);
  console.log(`   Acceptance Criteria: ${spec.acceptanceCriteria.length}`);
  console.log(`\n   Estimated Duration: ${spec.estimatedDuration.totalMinutes} minutes`);
  console.log(`   Estimated Cost: $${spec.estimatedCost.estimatedCostUSD.toFixed(2)}`);

  // Save outputs to docs folder
  const docsDir = path.join(process.cwd(), 'docs', 'specs');
  fs.mkdirSync(docsDir, { recursive: true });

  const baseName = `spec-${spec.id}`;

  // Save markdown
  const mdPath = path.join(docsDir, `${baseName}.md`);
  fs.writeFileSync(mdPath, result.markdown);
  console.log(`\n📄 Saved: ${mdPath}`);

  // Save YAML
  const yamlPath = path.join(docsDir, `${baseName}.yaml`);
  fs.writeFileSync(yamlPath, result.yaml);
  console.log(`📄 Saved: ${yamlPath}`);

  // Save JSON
  const jsonPath = path.join(docsDir, `${baseName}.json`);
  fs.writeFileSync(jsonPath, result.json);
  console.log(`📄 Saved: ${jsonPath}`);

  console.log('\n─'.repeat(70));
  console.log('\n📋 SPECIFICATION SUMMARY\n');
  console.log(result.markdown);
}

main().catch(console.error);
