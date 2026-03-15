/**
 * EnvDetector - Detects target project's testing capabilities before generation.
 *
 * Scans the target project to determine:
 * - Whether @testing-library/jest-dom is installed + types wired
 * - Whether @testing-library/user-event is installed
 * - Whether the project uses Jest globals or explicit imports
 * - What render wrapper exists (renderWithProviders, etc.)
 * - Jest/tsconfig setup conventions
 *
 * This prevents the generator from emitting matchers/imports the project can't resolve.
 */

import fs from 'fs';
import path from 'path';

export class EnvDetector {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.capabilities = {
      hasJestDom: false,
      hasJestDomTypes: false,
      hasUserEvent: false,
      hasJestGlobals: true, // default: Jest injects globals
      renderWrapper: 'renderWithProviders',
      renderWrapperImport: null,
      jestSetupFile: null,
      safeMatcher: 'not.toBeNull', // fallback when jest-dom unavailable
    };
  }

  detect() {
    this._checkPackageJson();
    this._checkJestConfig();
    this._checkTsConfig();
    this._findRenderWrapper();
    this._determineSafeMatcher();
    return this.capabilities;
  }

  _checkPackageJson() {
    const pkgPath = path.join(this.projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      this.capabilities.hasJestDom = '@testing-library/jest-dom' in allDeps;
      this.capabilities.hasUserEvent = '@testing-library/user-event' in allDeps;

      // Check if jest-dom is actually installed in node_modules
      const jestDomPath = path.join(this.projectRoot, 'node_modules', '@testing-library', 'jest-dom');
      if (!fs.existsSync(jestDomPath)) {
        this.capabilities.hasJestDom = false;
      }

      // Check for user-event in node_modules
      const userEventPath = path.join(this.projectRoot, 'node_modules', '@testing-library', 'user-event');
      if (!fs.existsSync(userEventPath)) {
        this.capabilities.hasUserEvent = false;
      }

      // Check if @jest/globals is used (explicit imports mode)
      if ('@jest/globals' in allDeps) {
        this.capabilities.hasJestGlobals = false; // project prefers explicit imports
      }
    } catch {
      // ignore parse errors
    }
  }

  _checkJestConfig() {
    // Look for jest config to find setup files
    const candidates = [
      'jest.config.js', 'jest.config.ts', 'jest.config.mjs',
      'jest.config.cjs', 'jest.config.json',
    ];

    for (const name of candidates) {
      const configPath = path.join(this.projectRoot, name);
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');

          // Check setupFilesAfterSetup for jest-dom
          if (content.includes('jest-dom') || content.includes('setupTests')) {
            this.capabilities.hasJestDomTypes = this.capabilities.hasJestDom;
          }

          // Check for globals: false (explicit imports mode)
          if (content.includes('injectGlobals') && content.includes('false')) {
            this.capabilities.hasJestGlobals = false;
          }

          // Find setup file path
          const setupMatch = content.match(/setupFilesAfterSetup.*?\[([^\]]+)\]/s);
          if (setupMatch) {
            this.capabilities.jestSetupFile = setupMatch[1].trim().replace(/['"]/g, '');
          }
        } catch {
          // ignore
        }
        break;
      }
    }

    // Also check package.json jest field
    const pkgPath = path.join(this.projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.jest) {
          const jestConfig = JSON.stringify(pkg.jest);
          if (jestConfig.includes('jest-dom') || jestConfig.includes('setupTests')) {
            this.capabilities.hasJestDomTypes = this.capabilities.hasJestDom;
          }
        }
      } catch {
        // ignore
      }
    }

    // Check common setup file locations
    const setupFiles = [
      'src/setupTests.ts', 'src/setupTests.tsx', 'src/setupTests.js',
      'jest.setup.ts', 'jest.setup.js', 'test/setup.ts', 'test/setup.js',
    ];
    for (const sf of setupFiles) {
      const sfPath = path.join(this.projectRoot, sf);
      if (fs.existsSync(sfPath)) {
        try {
          const content = fs.readFileSync(sfPath, 'utf-8');
          if (content.includes('jest-dom') || content.includes('@testing-library/jest-dom')) {
            this.capabilities.hasJestDomTypes = this.capabilities.hasJestDom;
            this.capabilities.jestSetupFile = sf;
          }
        } catch {
          // ignore
        }
        break;
      }
    }
  }

  _checkTsConfig() {
    const tsConfigPath = path.join(this.projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsConfigPath)) return;

    try {
      const content = fs.readFileSync(tsConfigPath, 'utf-8');
      // Check if jest-dom types are included
      if (content.includes('jest-dom') || content.includes('@testing-library')) {
        this.capabilities.hasJestDomTypes = this.capabilities.hasJestDom;
      }
    } catch {
      // ignore
    }
  }

  _findRenderWrapper() {
    // Search for common test utility patterns
    const searchDirs = [
      'src/test-utils', 'test-utils', 'src/__tests__/utils',
      'src/testing', 'test', 'tests',
    ];

    for (const dir of searchDirs) {
      const dirPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(dirPath)) continue;

      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue;
          const filePath = path.join(dirPath, file);
          const content = fs.readFileSync(filePath, 'utf-8');

          // Look for exported render wrapper
          const wrapperMatch = content.match(/export\s+(?:function|const)\s+(render\w+)/);
          if (wrapperMatch) {
            this.capabilities.renderWrapper = wrapperMatch[1];
            this.capabilities.renderWrapperImport = dir + '/' + file.replace(/\.[^.]+$/, '');
            return;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  _determineSafeMatcher() {
    if (this.capabilities.hasJestDom && this.capabilities.hasJestDomTypes) {
      this.capabilities.safeMatcher = 'toBeInTheDocument';
    } else if (this.capabilities.hasJestDom) {
      // Runtime available but types not wired — risky
      this.capabilities.safeMatcher = 'not.toBeNull';
    } else {
      this.capabilities.safeMatcher = 'not.toBeNull';
    }
  }

  /**
   * Generate a capability summary string for injection into prompts.
   */
  toPromptString() {
    const cap = this.capabilities;
    const lines = ['## Project Test Environment'];

    if (cap.hasJestDom && cap.hasJestDomTypes) {
      lines.push('- @testing-library/jest-dom: AVAILABLE (types wired) — use toBeInTheDocument()');
    } else if (cap.hasJestDom) {
      lines.push('- @testing-library/jest-dom: installed but TYPES NOT WIRED — use expect(element).not.toBeNull() instead of toBeInTheDocument()');
    } else {
      lines.push('- @testing-library/jest-dom: NOT INSTALLED — use expect(element).not.toBeNull() instead of toBeInTheDocument()');
    }

    if (cap.hasUserEvent) {
      lines.push('- @testing-library/user-event: AVAILABLE — use userEvent.setup() pattern');
    } else {
      lines.push('- @testing-library/user-event: NOT INSTALLED — use fireEvent instead');
    }

    lines.push(`- Render wrapper: ${cap.renderWrapper}`);
    lines.push(`- Safe presence assertion: expect(element).${cap.safeMatcher}()`);

    return lines.join('\n');
  }
}
