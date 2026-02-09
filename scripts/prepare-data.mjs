#!/usr/bin/env node

/**
 * prepare-data.mjs
 *
 * Reads manual training examples + optionally scans your project for
 * existing component→test pairs, and outputs a JSONL file ready for
 * fine-tuning with LoRA.
 *
 * Usage:
 *   node scripts/prepare-data.mjs
 *   node scripts/prepare-data.mjs --src ../my-project/src --out data/processed
 *   node scripts/prepare-data.mjs --scan-existing  (finds components that already have tests)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadTypeScript } from '../analysis/ts-loader.mjs';
import { ComponentAnalyzer } from '../analysis/component-analyzer.mjs';
import { PromptBuilder } from '../analysis/prompt-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── CLI args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name, defaultVal = null) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
};

const SRC_DIR = getArg('src', null);
const OUT_DIR = getArg('out', path.join(ROOT, 'data', 'processed'));
const EXAMPLES_DIR = path.join(ROOT, 'data', 'manual-examples');
const scanExisting = args.includes('--scan-existing');

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  await loadTypeScript();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allPairs = [];

  // 1. Load manual examples
  console.log('📖 Loading manual training examples...');
  const manualPairs = await loadManualExamples();
  allPairs.push(...manualPairs);
  console.log(`   Found ${manualPairs.length} manual examples`);

  // 2. Optionally scan project for existing component↔test pairs
  if (scanExisting && SRC_DIR) {
    console.log(`🔍 Scanning project for existing test pairs in ${SRC_DIR}...`);
    const scannedPairs = await scanProjectForPairs(SRC_DIR);
    allPairs.push(...scannedPairs);
    console.log(`   Found ${scannedPairs.length} existing component→test pairs`);
  }

  if (allPairs.length === 0) {
    console.error('❌ No training data found! Add examples to data/manual-examples/');
    process.exit(1);
  }

  // 3. Convert to training format
  console.log(`\n📝 Converting ${allPairs.length} pairs to training format...`);

  // Split: 90% train, 10% validation
  const shuffled = allPairs.sort(() => Math.random() - 0.5);
  const splitIdx = Math.max(1, Math.floor(shuffled.length * 0.9));
  const trainPairs = shuffled.slice(0, splitIdx);
  const valPairs = shuffled.slice(splitIdx);

  // Write JSONL files
  const trainPath = path.join(OUT_DIR, 'train.jsonl');
  const valPath = path.join(OUT_DIR, 'val.jsonl');
  const allPath = path.join(OUT_DIR, 'training.jsonl');

  writeJSONL(trainPath, trainPairs);
  writeJSONL(valPath, valPairs);
  writeJSONL(allPath, allPairs);

  console.log(`\n✅ Training data saved:`);
  console.log(`   ${trainPath} (${trainPairs.length} examples)`);
  console.log(`   ${valPath} (${valPairs.length} examples)`);
  console.log(`   ${allPath} (${allPairs.length} total)`);

  // Stats
  const avgInputLen = Math.round(allPairs.reduce((s, p) =>
    s + p.messages[1].content.length, 0) / allPairs.length);
  const avgOutputLen = Math.round(allPairs.reduce((s, p) =>
    s + p.messages[2].content.length, 0) / allPairs.length);

  console.log(`\n📊 Dataset Stats:`);
  console.log(`   Total examples: ${allPairs.length}`);
  console.log(`   Avg input length: ~${avgInputLen} chars (~${Math.round(avgInputLen / 4)} tokens)`);
  console.log(`   Avg output length: ~${avgOutputLen} chars (~${Math.round(avgOutputLen / 4)} tokens)`);
  console.log(`\n💡 Recommendation: Aim for 30-50+ examples for good fine-tuning results.`);
  console.log(`   Currently at ${allPairs.length}. Add more to data/manual-examples/ if needed.`);
}

// ─── Manual Examples ─────────────────────────────────────────────────

async function loadManualExamples() {
  const pairs = [];
  if (!fs.existsSync(EXAMPLES_DIR)) return pairs;

  const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.mjs'));

  for (const file of files) {
    try {
      const filePath = path.join(EXAMPLES_DIR, file);
      const mod = await import(pathToFileURL(filePath).href);
      const sourceCode = mod.COMPONENT_SOURCE;
      const testOutput = mod.TEST_OUTPUT;

      if (!sourceCode || !testOutput) {
        console.warn(`   ⚠️ Skipping ${file}: missing COMPONENT_SOURCE or TEST_OUTPUT`);
        continue;
      }

      // Analyze the component to build rich prompts
      const analyzer = new ComponentAnalyzer(sourceCode.trim(), file.replace('.mjs', '.tsx'));
      const components = analyzer.analyze();

      if (components.length === 0) {
        // Fallback: use raw source as prompt
        const pair = {
          instruction: buildFallbackPrompt(sourceCode),
          output: testOutput.trim(),
        };
        pairs.push(PromptBuilder.toChatML(pair));
        continue;
      }

      // Use the first (primary) component
      const comp = components[0];
      const pair = PromptBuilder.buildTrainingPair(comp, sourceCode.trim(), testOutput.trim());
      pairs.push(PromptBuilder.toChatML(pair));
    } catch (err) {
      console.warn(`   ⚠️ Error processing ${file}: ${err.message}`);
    }
  }

  return pairs;
}

function buildFallbackPrompt(sourceCode) {
  return `Generate a comprehensive Jest + React Testing Library test file for the following React component.
The tests should achieve at least 50% code coverage.
Use renderWithProviders from test-utils. Mock framer-motion and lucide-react if imported.

## Source Code
\`\`\`tsx
${sourceCode.trim()}
\`\`\`

## Test Requirements
- Use renderWithProviders from test-utils (wraps all providers + MemoryRouter)
- Use screen queries (getByRole, getByText, getByLabelText, getByTestId)
- Use userEvent for interactions
- Test: rendering, props, interactions, conditional branches
- Provide realistic mock data
- Each test should assert something meaningful`;
}

// ─── Scan Existing Project ───────────────────────────────────────────

async function scanProjectForPairs(srcDir) {
  const pairs = [];
  const tsxFiles = findFiles(srcDir, '.tsx');

  for (const tsxFile of tsxFiles) {
    // Skip test files, test-utils, etc.
    if (/__tests__|\.test\.|\.spec\.|test-utils/.test(tsxFile)) continue;

    // Look for a matching test file
    const dir = path.dirname(tsxFile);
    const base = path.basename(tsxFile, '.tsx');
    const possibleTestPaths = [
      path.join(dir, '__tests__', `${base}.test.tsx`),
      path.join(dir, '__tests__', `${base}.test.ts`),
      path.join(dir, `${base}.test.tsx`),
      path.join(dir, `${base}.test.ts`),
    ];

    const testFile = possibleTestPaths.find(p => fs.existsSync(p));
    if (!testFile) continue;

    try {
      const sourceCode = fs.readFileSync(tsxFile, 'utf-8');
      const testCode = fs.readFileSync(testFile, 'utf-8');

      // Skip if test is auto-generated with all undefined props
      if (testCode.includes(': undefined') && testCode.split(': undefined').length > 3) continue;

      const analyzer = new ComponentAnalyzer(sourceCode, tsxFile);
      const components = analyzer.analyze();

      if (components.length === 0) continue;

      const comp = components[0];
      const pair = PromptBuilder.buildTrainingPair(comp, sourceCode.trim(), testCode.trim());
      pairs.push(PromptBuilder.toChatML(pair));

      console.log(`   ✓ ${path.relative(srcDir, tsxFile)} ↔ ${path.basename(testFile)}`);
    } catch (err) {
      // Skip files that can't be parsed
    }
  }

  return pairs;
}

function findFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', 'build', 'coverage', '.next'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── JSONL Writer ────────────────────────────────────────────────────

function writeJSONL(filePath, items) {
  const lines = items.map(item => JSON.stringify(item));
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
