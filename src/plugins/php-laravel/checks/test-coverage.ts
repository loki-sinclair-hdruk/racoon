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

// ─── Check: Test file ratio ───────────────────────────────────────────────────

export const testFileRatioCheck: Check = {
  id: 'php-laravel/test-file-ratio',
  name: 'Test File Ratio',
  dimension: Dimension.TestCoverage,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const sourceFiles = context.files.filter(
      (f) =>
        f.endsWith('.php') &&
        !f.startsWith('tests/') &&
        !f.startsWith('Tests/') &&
        !f.endsWith('Test.php') &&
        !f.endsWith('Spec.php'),
    );

    const testFiles = context.files.filter(
      (f) =>
        f.endsWith('.php') &&
        (f.startsWith('tests/') || f.startsWith('Tests/') || f.endsWith('Test.php') || f.endsWith('Spec.php')),
    );

    if (sourceFiles.length === 0) {
      return { message: 'No source PHP files found', score: 50, maxScore: 100, severity: 'info' };
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
    // Ideal is 1:1; score linearly up to that
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
