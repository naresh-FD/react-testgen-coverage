let _ts;

export async function loadTypeScript() {
  try {
    const tsModule = await import('typescript');
    _ts = tsModule.default || tsModule;
  } catch {
    console.error('❌ TypeScript not found. Run: npm install typescript');
    process.exit(1);
  }
}

export function getTS() {
  if (!_ts) throw new Error('TypeScript not loaded. Call loadTypeScript() first.');
  return _ts;
}

export function createSourceFile(filePath, sourceCode) {
  const ts = getTS();
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX
    : filePath.endsWith('.ts') ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
  return ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true, kind);
}
