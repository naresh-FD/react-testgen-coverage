#!/usr/bin/env node

/**
 * generate.mjs — Generate Jest+RTL test files using the fine-tuned LLM.
 *
 * Usage:
 *   node scripts/generate.mjs --file src/components/MyComponent.tsx
 *   node scripts/generate.mjs --dir src/components
 *   node scripts/generate.mjs --file src/Button.tsx --model react-testgen
 *   node scripts/generate.mjs --file src/Button.tsx --overwrite
 *   node scripts/generate.mjs --file src/Button.tsx --dry-run  (preview prompt only)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTypeScript } from '../analysis/ts-loader.mjs';
import { ComponentAnalyzer } from '../analysis/component-analyzer.mjs';
import { PromptBuilder } from '../analysis/prompt-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI Config ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : def;
};
const hasFlag = (name) => args.includes(`--${name}`);

const OLLAMA_URL = getArg('url', 'http://localhost:11434');
const MODEL = getArg('model', 'react-testgen');
const FILE = getArg('file');
const DIR = getArg('dir');
const OVERWRITE = hasFlag('overwrite');
const DRY_RUN = hasFlag('dry-run');
const VERBOSE = hasFlag('verbose');

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  if (!FILE && !DIR) {
    console.log(`
Usage:
  node scripts/generate.mjs --file <path.tsx>     Generate test for one file
  node scripts/generate.mjs --dir <dir>           Generate tests for all TSX in directory

Options:
  --model <name>     Ollama model name (default: react-testgen)
  --url <url>        Ollama API URL (default: http://localhost:11434)
  --overwrite        Overwrite existing test files
  --dry-run          Print the prompt without generating
  --verbose          Show detailed output
    `);
    process.exit(0);
  }

  await loadTypeScript();

  // Check Ollama is running
  if (!DRY_RUN) {
    const isRunning = await checkOllama();
    if (!isRunning) {
      console.error('❌ Ollama is not running. Start it with: ollama serve');
      console.error('   Then create the model: ollama create react-testgen -f inference/Modelfile');
      process.exit(1);
    }
  }

  // Collect files to process
  const files = [];
  if (FILE) {
    files.push(path.resolve(FILE));
  } else if (DIR) {
    collectTSXFiles(path.resolve(DIR), files);
  }

  console.log(`\n🔍 Found ${files.length} component file(s) to process\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const testPath = getTestPath(file);
    const relativePath = path.relative(process.cwd(), file);

    if (fs.existsSync(testPath) && !OVERWRITE) {
      console.log(`⏭️  Skip ${relativePath} (test exists, use --overwrite to replace)`);
      skipped++;
      continue;
    }

    try {
      console.log(`🔍 Analyzing ${relativePath}...`);
      const testCode = await generateTest(file);

      if (testCode) {
        fs.mkdirSync(path.dirname(testPath), { recursive: true });
        fs.writeFileSync(testPath, testCode, 'utf-8');
        console.log(`✅ Generated ${path.relative(process.cwd(), testPath)}`);
        generated++;
      } else {
        console.log(`⚠️  No components found in ${relativePath}`);
        skipped++;
      }
    } catch (err) {
      console.error(`❌ Failed ${relativePath}: ${err.message}`);
      if (VERBOSE) console.error(err.stack);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${generated} generated, ${skipped} skipped, ${failed} failed\n`);
}

// ─── Core Generation ─────────────────────────────────────────────────

async function generateTest(filePath) {
  const sourceCode = fs.readFileSync(filePath, 'utf-8');

  // Analyze component
  const analyzer = new ComponentAnalyzer(sourceCode, filePath);
  const components = analyzer.analyze();

  if (components.length === 0) return null;

  // Use the primary (first exported) component
  const comp = components.find(c => c.isExported || c.isDefault) || components[0];

  // Build prompt
  const prompt = PromptBuilder.buildInferencePrompt(comp, sourceCode);

  if (DRY_RUN) {
    console.log('\n' + '═'.repeat(80));
    console.log('PROMPT PREVIEW:');
    console.log('═'.repeat(80));
    console.log(prompt);
    console.log('═'.repeat(80) + '\n');
    return null;
  }

  // Call Ollama
  console.log(`🤖 Generating test with ${MODEL}...`);
  const response = await callOllama(prompt);

  // Extract code from response (handle markdown code blocks)
  const testCode = extractCode(response);

  // Add header
  const header = `/**
 * @generated by react-testgen-llm
 * Generated: ${new Date().toISOString().split('T')[0]}
 * Source: ${path.basename(filePath)}
 */\n`;

  return header + testCode;
}

// ─── Ollama API ──────────────────────────────────────────────────────

async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

async function callOllama(prompt) {
  const startTime = Date.now();

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3,
        top_p: 0.9,
        num_predict: 4096,
        repeat_penalty: 1.1,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (VERBOSE) {
    console.log(`   ⏱️  Generated in ${elapsed}s (${data.eval_count || '?'} tokens)`);
  }

  return data.response;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractCode(response) {
  // If response is wrapped in ```tsx ... ``` or ```typescript ... ```, extract it
  const codeBlockMatch = response.match(/```(?:tsx?|typescript|javascript)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // If it starts with import or /**, it's already clean code
  if (response.trim().startsWith('import') || response.trim().startsWith('/**') ||
      response.trim().startsWith('//')) {
    return response.trim();
  }

  // Try to find the code portion
  const importIdx = response.indexOf('import');
  if (importIdx !== -1) return response.substring(importIdx).trim();

  return response.trim();
}

function getTestPath(componentPath) {
  const dir = path.dirname(componentPath);
  const base = path.basename(componentPath, path.extname(componentPath));
  return path.join(dir, '__tests__', `${base}.test.tsx`);
}

function collectTSXFiles(dir, results) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['__tests__', 'node_modules', 'dist', 'test-utils'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTSXFiles(fullPath, results);
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
      results.push(fullPath);
    }
  }
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
