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

// ─── Check: Hardcoded secrets ─────────────────────────────────────────────────

export const hardcodedSecretsCheck: Check = {
  id: 'php-laravel/hardcoded-secrets',
  name: 'Hardcoded Secrets',
  dimension: Dimension.Security,
  weight: 4,

  async run(context: ScanContext): Promise<Finding> {
    const phpFiles = context.files.filter(
      (f) => f.endsWith('.php') && !f.startsWith('vendor/'),
    );

    // Patterns that strongly suggest hardcoded credentials
    const secretPatterns = [
      { pattern: /(['"])(?:password|passwd|pwd|secret|api[_-]?key|auth[_-]?token)\1\s*=\s*(['"])[^'"]{6,}\2/gi, label: 'password/key assignment' },
      { pattern: /\$_ENV\[['"][A-Z_]+['"]\]\s*=\s*['"][^'"]{6,}['"]/g, label: 'ENV override' },
      { pattern: /define\(['"][A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z_]*['"],\s*['"][^'"]{6,}['"]/g, label: 'define() constant' },
    ];

    const hits: string[] = [];

    for (const file of phpFiles) {
      const content = readFile(context, file);
      for (const { pattern, label } of secretPatterns) {
        const matches = content.match(pattern) ?? [];
        if (matches.length > 0) {
          hits.push(`${file} (${label})`);
        }
      }
    }

    const score = hits.length === 0 ? 100 : Math.max(0, 100 - hits.length * 25);

    return {
      message: hits.length === 0
        ? 'No hardcoded secrets detected'
        : `${hits.length} potential hardcoded secret(s) found`,
      score,
      maxScore: 100,
      severity: hits.length > 0 ? 'critical' : 'info',
      files: hits.slice(0, 5),
    };
  },
};

// ─── Check: SQL injection risk ────────────────────────────────────────────────

export const sqlInjectionCheck: Check = {
  id: 'php-laravel/sql-injection',
  name: 'SQL Injection Risk',
  dimension: Dimension.Security,
  weight: 4,

  async run(context: ScanContext): Promise<Finding> {
    const phpFiles = context.files.filter(
      (f) => f.endsWith('.php') && !f.startsWith('vendor/'),
    );

    // Raw DB::statement or DB::select with string interpolation = dangerous
    const riskyPatterns = [
      /DB::(?:statement|select|insert|update|delete)\s*\(\s*["'`][^)]*\$[a-zA-Z_]/g,
      /\$(?:pdo|db|conn)\s*->\s*query\s*\(\s*["'`][^)]*\$[a-zA-Z_]/g,
      /whereRaw\s*\(\s*["'`][^)]*\$[a-zA-Z_]/g,
      /selectRaw\s*\(\s*["'`][^)]*\$[a-zA-Z_]/g,
    ];

    const hits: string[] = [];

    for (const file of phpFiles) {
      const content = readFile(context, file);
      for (const pattern of riskyPatterns) {
        if (pattern.test(content)) {
          hits.push(file);
          break;
        }
      }
    }

    const score = hits.length === 0 ? 100 : Math.max(0, 100 - hits.length * 20);

    return {
      message: hits.length === 0
        ? 'No raw SQL with variable interpolation detected'
        : `${hits.length} file(s) with potential SQL injection risk`,
      score,
      maxScore: 100,
      severity: hits.length > 0 ? 'critical' : 'info',
      files: hits.slice(0, 5),
    };
  },
};

// ─── Check: .env file exposure ────────────────────────────────────────────────

export const envExposureCheck: Check = {
  id: 'php-laravel/env-exposure',
  name: '.env Exposure',
  dimension: Dimension.Security,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const issues: string[] = [];

    // .env should not be committed (presence is a sign it might be)
    if (context.files.includes('.env')) {
      issues.push('.env file present in repository');
    }

    // .env.example is fine (and good), but .env.* production files are not
    const envFiles = context.files.filter(
      (f) => f.match(/^\.env\.(prod|production|staging|live)$/),
    );
    for (const f of envFiles) {
      issues.push(`${f} found in repository`);
    }

    // .gitignore should include .env
    const gitignore = context.files.find((f) => f === '.gitignore');
    if (gitignore) {
      const content = readFile(context, gitignore);
      if (!content.includes('.env')) {
        issues.push('.gitignore does not exclude .env');
      }
    } else {
      issues.push('No .gitignore found');
    }

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 30);

    return {
      message: issues.length === 0
        ? '.env handling looks safe'
        : issues.join('; '),
      score,
      maxScore: 100,
      severity: issues.some((i) => i.includes('.env file present')) ? 'critical' : 'warning',
    };
  },
};

// ─── Check: Mass assignment protection ───────────────────────────────────────

export const massAssignmentCheck: Check = {
  id: 'php-laravel/mass-assignment',
  name: 'Mass Assignment Protection',
  dimension: Dimension.Security,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const models = context.files.filter(
      (f) => f.match(/[Mm]odels?\/.*\.php$/) || f.match(/app\/.*(?<!Test)\.php$/),
    );

    if (models.length === 0) {
      return { message: 'No model files found', score: 70, maxScore: 100, severity: 'info' };
    }

    let guardedCount = 0;
    let fillableCount = 0;
    let unprotectedModels = 0;
    const unprotected: string[] = [];

    for (const file of models) {
      const content = readFile(context, file);

      // Only check files that extend Model
      if (!content.includes('extends Model') && !content.includes('extends Authenticatable')) {
        continue;
      }

      const hasGuarded  = content.includes('$guarded');
      const hasFillable = content.includes('$fillable');

      if (hasGuarded) guardedCount++;
      else if (hasFillable) fillableCount++;
      else {
        unprotectedModels++;
        unprotected.push(file);
      }
    }

    const totalModels = guardedCount + fillableCount + unprotectedModels;
    if (totalModels === 0) {
      return { message: 'No Eloquent models found', score: 70, maxScore: 100, severity: 'info' };
    }

    const score = Math.round(Math.max(0, 100 - (unprotectedModels / totalModels) * 100));

    return {
      message: `${unprotectedModels}/${totalModels} models lack $fillable/$guarded`,
      score,
      maxScore: 100,
      severity: unprotectedModels > 0 ? 'warning' : 'info',
      files: unprotected.slice(0, 5),
    };
  },
};
