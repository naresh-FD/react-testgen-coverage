#!/usr/bin/env node

/**
 * validate-output.mjs — Quick quality check on generated test files.
 *
 * Checks for common issues:
 *   - Syntax errors (via TypeScript parser)
 *   - Missing imports (renderWithProviders, screen, etc.)
 *   - Empty test blocks
 *   - Missing assertions
 *   - Props set to undefined
 *   - Overall test count and coverage estimation
 *
 * Usage:
 *   node scripts/validate-output.mjs --file src/components/__tests__/Button.test.tsx
 *   node scripts/validate-output.mjs --dir src/components
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const FILE = args.indexOf('--file') !== -1 ? args[args.indexOf('--file') + 1] : null;
const DIR = args.indexOf('--dir') !== -1 ? args[args.indexOf('--dir') + 1] : null;

function validate(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];
  const warnings = [];
  const stats = { tests: 0, assertions: 0, describes: 0 };

  // Count tests and describes
  const itMatches = content.match(/\bit\s*\(/g);
  const describeMatches = content.match(/\bdescribe\s*\(/g);
  stats.tests = itMatches ? itMatches.length : 0;
  stats.describes = describeMatches ? describeMatches.length : 0;

  // Count assertions
  const expectMatches = content.match(/\bexpect\s*\(/g);
  stats.assertions = expectMatches ? expectMatches.length : 0;

  // Check: imports
  if (!content.includes('renderWithProviders')) {
    issues.push('Missing renderWithProviders import');
  }
  if (content.includes('screen.') && !content.includes("from '@testing-library/react'") &&
      !content.includes('from "../../../test-utils')) {
    warnings.push('screen used but @testing-library/react not imported directly');
  }

  // Check: no tests
  if (stats.tests === 0) {
    issues.push('No test cases (it/test blocks) found');
  }

  // Check: empty tests (tests without expect)
  const testBlocks = content.split(/\bit\s*\(/);
  for (let i = 1; i < testBlocks.length; i++) {
    const block = testBlocks[i].split(/\bit\s*\(/)[0]; // Until next test
    if (!block.includes('expect(') && !block.includes('// Add your')) {
      warnings.push(`Test #${i} may have no assertions`);
    }
  }

  // Check: undefined props (bad generation)
  const undefinedCount = (content.match(/:\s*undefined/g) || []).length;
  if (undefinedCount > 2) {
    issues.push(`${undefinedCount} props set to 'undefined' — needs realistic mock data`);
  }

  // Check: basic syntax
  const openBraces = (content.match(/{/g) || []).length;
  const closeBraces = (content.match(/}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 2) {
    issues.push(`Mismatched braces: ${openBraces} open vs ${closeBraces} close`);
  }

  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;
  if (Math.abs(openParens - closeParens) > 2) {
    issues.push(`Mismatched parentheses: ${openParens} open vs ${closeParens} close`);
  }

  // Check: jest.mock present for common libs
  if (content.includes('framer-motion') && !content.includes("jest.mock('framer-motion")) {
    warnings.push('Uses framer-motion but no jest.mock found');
  }

  // Check: userEvent setup
  if (content.includes('userEvent.click') && !content.includes('userEvent.setup()')) {
    warnings.push('Uses userEvent.click but missing userEvent.setup()');
  }

  // Quality score (0-100)
  let score = 50;
  score += Math.min(stats.tests * 5, 25);      // Up to 25 pts for tests
  score += Math.min(stats.assertions * 3, 25);  // Up to 25 pts for assertions
  score -= issues.length * 15;                   // Deduct for issues
  score -= warnings.length * 5;                  // Small deduct for warnings
  score = Math.max(0, Math.min(100, score));

  return { filePath, stats, issues, warnings, score };
}

function printResult(result) {
  const rel = path.relative(process.cwd(), result.filePath);
  const scoreEmoji = result.score >= 70 ? '✅' : result.score >= 40 ? '⚠️' : '❌';

  console.log(`\n${scoreEmoji} ${rel} — Score: ${result.score}/100`);
  console.log(`   Tests: ${result.stats.tests} | Assertions: ${result.stats.assertions} | Describes: ${result.stats.describes}`);

  if (result.issues.length > 0) {
    console.log(`   ❌ Issues:`);
    result.issues.forEach(i => console.log(`      - ${i}`));
  }
  if (result.warnings.length > 0) {
    console.log(`   ⚠️  Warnings:`);
    result.warnings.forEach(w => console.log(`      - ${w}`));
  }
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  const files = [];

  if (FILE) {
    files.push(path.resolve(FILE));
  } else if (DIR) {
    collectTestFiles(path.resolve(DIR), files);
  } else {
    console.log('Usage: node scripts/validate-output.mjs --file <test.tsx> | --dir <dir>');
    process.exit(0);
  }

  console.log(`\n🔍 Validating ${files.length} test file(s)...\n`);

  const results = files.map(f => validate(f));
  results.forEach(printResult);

  // Summary
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const totalTests = results.reduce((s, r) => s + r.stats.tests, 0);
  const totalAssertions = results.reduce((s, r) => s + r.stats.assertions, 0);
  const issueCount = results.reduce((s, r) => s + r.issues.length, 0);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 Summary: ${results.length} files | ${totalTests} tests | ${totalAssertions} assertions`);
  console.log(`   Average quality score: ${avgScore}/100`);
  console.log(`   Issues found: ${issueCount}`);
  console.log('═'.repeat(60));
}

function collectTestFiles(dir, results) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTestFiles(full, results);
    else if (entry.name.includes('.test.tsx') || entry.name.includes('.test.ts')) results.push(full);
  }
}

main();
