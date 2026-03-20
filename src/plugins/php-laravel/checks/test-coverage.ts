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

// ─── Check: PHPUnit / Pest presence ──────────────────────────────────────────

export const testFrameworkCheck: Check = {
  id: 'php-laravel/test-framework',
  name: 'Test Framework',
  dimension: Dimension.TestCoverage,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const hasPHPUnit = context.files.some((f) => f === 'phpunit.xml' || f === 'phpunit.xml.dist');
    const hasPest    = context.files.some((f) => f === 'pest.php' || f === 'Pest.php');
    const hasComposerTest = (() => {
      const composerFile = context.files.find((f) => f === 'composer.json');
      if (!composerFile) return false;
      const content = readFile(context, composerFile);
      return content.includes('phpunit/phpunit') || content.includes('pestphp/pest');
    })();

    const found = hasPHPUnit || hasPest || hasComposerTest;

    return {
      message: found
        ? `Test framework detected (${hasPest ? 'Pest' : 'PHPUnit'})`
        : 'No test framework detected (phpunit.xml / pest.php / composer.json dependency)',
      score: found ? 100 : 0,
      maxScore: 100,
      severity: found ? 'info' : 'critical',
    };
  },
};

// ─── Check: Critical-path test coverage ──────────────────────────────────────
// Rather than a naive file-count ratio, score on whether high-weight files
// (controllers, services, repositories, jobs, listeners, middleware) have a
// corresponding test file.  Cap maxScore at 80 — file existence alone cannot
// prove quality.

const CRITICAL_PATH_PATTERNS = [
  /Controllers?\//,
  /Services?\//,
  /Repositories?\//,
  /Jobs?\//,
  /Listeners?\//,
  /Middleware\//,
];

export const testFileRatioCheck: Check = {
  id: 'php-laravel/test-file-ratio',
  name: 'Critical Path Test Coverage',
  dimension: Dimension.TestCoverage,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const testFiles = context.files.filter(
      (f) =>
        f.endsWith('.php') &&
        (f.startsWith('tests/') || f.startsWith('Tests/') || f.endsWith('Test.php') || f.endsWith('Spec.php')),
    );

    const criticalFiles = context.files.filter(
      (f) =>
        f.endsWith('.php') &&
        !f.startsWith('tests/') &&
        !f.startsWith('Tests/') &&
        CRITICAL_PATH_PATTERNS.some((p) => p.test(f)),
    );

    if (criticalFiles.length === 0) {
      return { message: 'No critical-path source files found', score: 50, maxScore: 80, severity: 'info' };
    }

    // Match by base name: UserController.php → UserControllerTest.php / UserControllerSpec.php
    const testBaseNames = new Set(
      testFiles.map((f) => path.basename(f).replace(/(Test|Spec)\.php$/, '').toLowerCase()),
    );

    const uncovered: EvidenceItem[] = [];
    let covered = 0;

    for (const src of criticalFiles) {
      const base = path.basename(src, '.php').toLowerCase();
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
// Counts assertions per test file (PHPUnit + Pest patterns).  A low average
// signals placeholder / smoke tests that don't meaningfully exercise behaviour.

const PHP_ASSERTION_RE = /->assert[A-Za-z]+\s*\(|\bexpect\s*\(|\bassertSame\b|\bassertEquals\b|\bassertTrue\b|\bassertFalse\b|\bassertCount\b|\bassertContains\b/g;

export const assertionDensityCheck: Check = {
  id: 'php-laravel/assertion-density',
  name: 'Test Assertion Density',
  dimension: Dimension.TestCoverage,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const testFiles = context.files.filter(
      (f) =>
        f.endsWith('.php') &&
        (f.startsWith('tests/') || f.startsWith('Tests/') || f.endsWith('Test.php') || f.endsWith('Spec.php')),
    );

    if (testFiles.length === 0) {
      return { message: 'No test files to analyse', score: 0, maxScore: 100, severity: 'critical' };
    }

    const sparse: EvidenceItem[] = [];
    let totalAssertions = 0;

    for (const f of testFiles) {
      const content = readFile(context, f);
      const count = (content.match(PHP_ASSERTION_RE) ?? []).length;
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

// ─── Check: Feature vs Unit test balance ─────────────────────────────────────

export const testTypeBalanceCheck: Check = {
  id: 'php-laravel/test-type-balance',
  name: 'Feature vs Unit Test Balance',
  dimension: Dimension.TestCoverage,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const featureTests = context.files.filter((f) =>
      f.match(/tests\/[Ff]eature\//),
    ).length;
    const unitTests = context.files.filter((f) =>
      f.match(/tests\/[Uu]nit\//),
    ).length;
    const total = featureTests + unitTests;

    if (total === 0) {
      return { message: 'No test structure found (tests/Feature, tests/Unit)', score: 30, maxScore: 80, severity: 'warning' };
    }

    // Healthy: mix of both. Penalise if only one type.
    const hasBoth = featureTests > 0 && unitTests > 0;
    const score = hasBoth ? 80 : 40;

    return {
      message: `${featureTests} feature tests, ${unitTests} unit tests`,
      score,
      maxScore: 80,
      severity: hasBoth ? 'info' : 'warning',
      detail: { featureTests, unitTests },
    };
  },
};
