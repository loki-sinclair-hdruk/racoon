import * as fs from 'fs';
import * as path from 'path';
import { Check, Dimension, Finding, ScanContext } from '../../../core/types.js';

function readFile(context: ScanContext, rel: string): string {
  if (context.fileCache.has(rel)) return context.fileCache.get(rel)!;
  try {
    const content = fs.readFileSync(path.join(context.projectRoot, rel), 'utf8');
    context.fileCache.set(rel, content);
    return content;
  } catch {
    return '';
  }
}

// ─── Check: Test framework presence ──────────────────────────────────────────

export const testFrameworkCheck: Check = {
  id: 'nextjs-react/test-framework',
  name: 'Test Framework',
  dimension: Dimension.TestCoverage,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const pkgFile = context.files.find((f) => f === 'package.json');
    if (!pkgFile) {
      return { message: 'No package.json found', score: 0, maxScore: 100, severity: 'critical' };
    }

    const pkg = JSON.parse(readFile(context, pkgFile)) as Record<string, unknown>;
    const deps = {
      ...(pkg.dependencies as Record<string, unknown> ?? {}),
      ...(pkg.devDependencies as Record<string, unknown> ?? {}),
    };

    const hasJest     = 'jest' in deps;
    const hasVitest   = 'vitest' in deps;
    const hasCypress  = 'cypress' in deps;
    const hasPlaywright = '@playwright/test' in deps;
    const hasTestingLib = '@testing-library/react' in deps;

    const frameworks: string[] = [];
    if (hasJest)       frameworks.push('Jest');
    if (hasVitest)     frameworks.push('Vitest');
    if (hasCypress)    frameworks.push('Cypress');
    if (hasPlaywright) frameworks.push('Playwright');

    const hasUnit = hasJest || hasVitest;
    const hasE2E  = hasCypress || hasPlaywright;

    const score =
      hasUnit && hasE2E && hasTestingLib ? 100 :
      hasUnit && hasTestingLib           ? 80 :
      hasUnit                            ? 60 :
      hasE2E                             ? 40 : 0;

    return {
      message: frameworks.length > 0
        ? `Test frameworks: ${frameworks.join(', ')}${hasTestingLib ? ' + Testing Library' : ''}`
        : 'No test framework detected',
      score,
      maxScore: 100,
      severity: frameworks.length === 0 ? 'critical' : 'info',
      detail: { hasJest, hasVitest, hasCypress, hasPlaywright, hasTestingLib },
    };
  },
};

// ─── Check: Test file ratio ───────────────────────────────────────────────────

export const testFileRatioCheck: Check = {
  id: 'nextjs-react/test-file-ratio',
  name: 'Test File Ratio',
  dimension: Dimension.TestCoverage,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const sourceFiles = context.files.filter((f) =>
      f.match(/\.(jsx?|tsx?)$/) &&
      !f.match(/\.(test|spec)\.(jsx?|tsx?)$/) &&
      !f.match(/__tests__\//) &&
      !f.includes('node_modules'),
    );

    const testFiles = context.files.filter((f) =>
      f.match(/\.(test|spec)\.(jsx?|tsx?)$/) ||
      f.match(/__tests__\/.*\.(jsx?|tsx?)$/),
    );

    if (sourceFiles.length === 0) {
      return { message: 'No source files found', score: 50, maxScore: 100, severity: 'info' };
    }

    if (testFiles.length === 0) {
      return {
        message: `0 test files for ${sourceFiles.length} source files`,
        score: 0,
        maxScore: 100,
        severity: 'critical',
      };
    }

    const ratio = testFiles.length / sourceFiles.length;
    const score = Math.min(100, Math.round(ratio * 100));

    return {
      message: `${testFiles.length} test files for ${sourceFiles.length} source files (${Math.round(ratio * 100)}% ratio)`,
      score,
      maxScore: 100,
      severity: ratio < 0.2 ? 'critical' : ratio < 0.5 ? 'warning' : 'info',
      detail: { testFiles: testFiles.length, sourceFiles: sourceFiles.length, ratio },
    };
  },
};

// ─── Check: Coverage config ───────────────────────────────────────────────────

export const coverageConfigCheck: Check = {
  id: 'nextjs-react/coverage-config',
  name: 'Coverage Configuration',
  dimension: Dimension.TestCoverage,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const pkgFile = context.files.find((f) => f === 'package.json');

    let hasCoverageScript = false;
    let hasCoverageThreshold = false;

    if (pkgFile) {
      const pkg = JSON.parse(readFile(context, pkgFile)) as Record<string, unknown>;
      const scripts = pkg.scripts as Record<string, string> ?? {};

      hasCoverageScript = Object.values(scripts).some((s) =>
        s.includes('--coverage') || s.includes('coverage'),
      );

      // jest coverage threshold
      const jestConfig = pkg.jest as Record<string, unknown> ?? {};
      hasCoverageThreshold = 'coverageThreshold' in jestConfig;
    }

    // Also check jest.config.* or vitest.config.*
    const configFile = context.files.find((f) =>
      f.match(/^(?:jest|vitest)\.config\.(js|ts|cjs|mjs)$/),
    );
    if (configFile) {
      const content = readFile(context, configFile);
      if (content.includes('coverageThreshold') || content.includes('thresholds')) {
        hasCoverageThreshold = true;
      }
      if (content.includes('coverage')) {
        hasCoverageScript = true;
      }
    }

    const score =
      hasCoverageScript && hasCoverageThreshold ? 100 :
      hasCoverageScript                         ? 60  : 20;

    return {
      message: hasCoverageScript
        ? `Coverage script found${hasCoverageThreshold ? ' with threshold enforcement' : ' but no threshold set'}`
        : 'No coverage script or configuration found',
      score,
      maxScore: 100,
      severity: hasCoverageScript ? 'info' : 'warning',
    };
  },
};
