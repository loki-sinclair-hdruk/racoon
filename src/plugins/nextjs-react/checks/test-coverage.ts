import * as fs from 'fs';
import * as path from 'path';
import { Check, Dimension, EvidenceItem, Finding, ScanContext } from '../../../core/types.js';

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

    const hasJest       = 'jest' in deps;
    const hasVitest     = 'vitest' in deps;
    const hasCypress    = 'cypress' in deps;
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
      hasUnit && hasTestingLib           ? 80  :
      hasUnit                            ? 60  :
      hasE2E                             ? 40  : 0;

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

// ─── Check: Critical-path test coverage ──────────────────────────────────────
// Score on whether high-weight files (pages, app routes, components, hooks)
// have a corresponding test file.  Cap maxScore at 80 — existence ≠ quality.

const CRITICAL_PATH_PATTERNS = [
  /^pages\//,
  /^app\//,
  /\/api\//,
  /\/components\//,
  /\/hooks\//,
];

export const testFileRatioCheck: Check = {
  id: 'nextjs-react/test-file-ratio',
  name: 'Critical Path Test Coverage',
  dimension: Dimension.TestCoverage,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const testFiles = context.files.filter((f) =>
      f.match(/\.(test|spec)\.(jsx?|tsx?)$/) ||
      f.match(/__tests__\/.*\.(jsx?|tsx?)$/),
    );

    const criticalFiles = context.files.filter(
      (f) =>
        f.match(/\.(jsx?|tsx?)$/) &&
        !f.match(/\.(test|spec)\.(jsx?|tsx?)$/) &&
        !f.match(/__tests__\//) &&
        !f.includes('node_modules') &&
        CRITICAL_PATH_PATTERNS.some((p) => p.test(f)),
    );

    if (criticalFiles.length === 0) {
      return { message: 'No critical-path source files found', score: 50, maxScore: 80, severity: 'info' };
    }

    // Match by base name: UserCard.tsx → UserCard.test.tsx / UserCard.spec.tsx
    const testBaseNames = new Set(
      testFiles.map((f) => path.basename(f).replace(/\.(test|spec)\.(jsx?|tsx?)$/, '').toLowerCase()),
    );

    const uncovered: EvidenceItem[] = [];
    let covered = 0;

    for (const src of criticalFiles) {
      const base = path.basename(src).replace(/\.(jsx?|tsx?)$/, '').toLowerCase();
      if (testBaseNames.has(base)) {
        covered++;
      } else {
        uncovered.push({ file: src, line: 1, snippet: `no test found for ${path.basename(src)}` });
      }
    }

    const ratio = covered / criticalFiles.length;
    const score = Math.min(80, Math.round(ratio * 80));

    return {
      message: `${covered}/${criticalFiles.length} critical-path files have tests (${Math.round(ratio * 100)}%)`,
      score,
      maxScore: 80,
      severity: ratio < 0.3 ? 'critical' : ratio < 0.6 ? 'warning' : 'info',
      evidence: uncovered.slice(0, 10),
      detail: { covered, total: criticalFiles.length },
    };
  },
};

// ─── Check: Test assertion density ───────────────────────────────────────────
// Counts assertions per test file (Jest/Vitest + Cypress patterns).  A low
// average signals placeholder tests that don't meaningfully exercise behaviour.

const JS_ASSERTION_RE = /\bexpect\s*\(|\bassert\.[a-zA-Z]+\s*\(|\bcy\.[a-zA-Z]+\s*\(/g;

export const assertionDensityCheck: Check = {
  id: 'nextjs-react/assertion-density',
  name: 'Test Assertion Density',
  dimension: Dimension.TestCoverage,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const testFiles = context.files.filter((f) =>
      f.match(/\.(test|spec)\.(jsx?|tsx?)$/) ||
      f.match(/__tests__\/.*\.(jsx?|tsx?)$/),
    );

    if (testFiles.length === 0) {
      return { message: 'No test files to analyse', score: 0, maxScore: 100, severity: 'critical' };
    }

    const sparse: EvidenceItem[] = [];
    let totalAssertions = 0;

    for (const f of testFiles) {
      const content = readFile(context, f);
      const count = (content.match(JS_ASSERTION_RE) ?? []).length;
      totalAssertions += count;
      if (count === 0) {
        sparse.push({ file: f, line: 1, snippet: 'no assertions found — may be a smoke test or placeholder' });
      }
    }

    const avg = totalAssertions / testFiles.length;
    const score =
      avg >= 7 ? 100 :
      avg >= 3 ? 80  :
      avg >= 1 ? 50  : 20;

    return {
      message: `avg ${avg.toFixed(1)} assertions/file (${totalAssertions} total across ${testFiles.length} test files)`,
      score,
      maxScore: 100,
      severity: avg < 1 ? 'critical' : avg < 3 ? 'warning' : 'info',
      evidence: sparse.slice(0, 8),
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

    let hasCoverageScript    = false;
    let hasCoverageThreshold = false;

    if (pkgFile) {
      const pkg = JSON.parse(readFile(context, pkgFile)) as Record<string, unknown>;
      const scripts = pkg.scripts as Record<string, string> ?? {};

      hasCoverageScript = Object.values(scripts).some((s) =>
        s.includes('--coverage') || s.includes('coverage'),
      );

      const jestConfig = pkg.jest as Record<string, unknown> ?? {};
      hasCoverageThreshold = 'coverageThreshold' in jestConfig;
    }

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
