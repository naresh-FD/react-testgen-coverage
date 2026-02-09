#!/usr/bin/env node

/**
 * add-example.mjs — Add a component→test pair as a training example.
 *
 * After you generate a test and fix it manually, use this script to save
 * the pair as training data for the next fine-tuning round.
 *
 * Usage:
 *   node scripts/add-example.mjs --component src/Button.tsx --test src/__tests__/Button.test.tsx
 *   node scripts/add-example.mjs -c src/Button.tsx -t src/__tests__/Button.test.tsx
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXAMPLES_DIR = path.join(ROOT, 'data', 'manual-examples');

const args = process.argv.slice(2);
const getArg = (short, long) => {
  let idx = args.indexOf(`--${long}`);
  if (idx === -1) idx = args.indexOf(`-${short}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const compPath = getArg('c', 'component');
const testPath = getArg('t', 'test');

if (!compPath || !testPath) {
  console.log('Usage: node scripts/add-example.mjs -c <component.tsx> -t <test.test.tsx>');
  process.exit(0);
}

const compAbsPath = path.resolve(compPath);
const testAbsPath = path.resolve(testPath);

if (!fs.existsSync(compAbsPath)) { console.error(`❌ Not found: ${compAbsPath}`); process.exit(1); }
if (!fs.existsSync(testAbsPath)) { console.error(`❌ Not found: ${testAbsPath}`); process.exit(1); }

const componentSource = fs.readFileSync(compAbsPath, 'utf-8');
const testOutput = fs.readFileSync(testAbsPath, 'utf-8');

// Generate filename
const baseName = path.basename(compAbsPath, '.tsx').toLowerCase().replace(/[^a-z0-9]/g, '-');
const existingFiles = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.mjs'));
const nextNum = String(existingFiles.length + 1).padStart(2, '0');
const outFile = path.join(EXAMPLES_DIR, `${nextNum}-${baseName}.mjs`);

const content = `// COMPONENT: ${path.basename(compAbsPath, '.tsx')}
// SOURCE: ${path.relative(process.cwd(), compAbsPath)}
// Added: ${new Date().toISOString().split('T')[0]}

export const COMPONENT_SOURCE = ${JSON.stringify(componentSource)};

export const TEST_OUTPUT = ${JSON.stringify(testOutput)};
`;

fs.writeFileSync(outFile, content, 'utf-8');
console.log(`✅ Training example saved: ${path.relative(ROOT, outFile)}`);
console.log(`   Component: ${path.basename(compAbsPath)}`);
console.log(`   Test: ${path.basename(testAbsPath)}`);
console.log(`\n💡 Run 'npm run prepare-data' to rebuild the training JSONL`);
