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

// ─── Check: Controller bloat ──────────────────────────────────────────────────

export const controllerBloatCheck: Check = {
  id: 'php-laravel/controller-bloat',
  name: 'Controller Bloat',
  dimension: Dimension.Maintainability,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const controllers = context.files.filter((f) =>
      f.match(/[Cc]ontrollers?\/.*\.php$/),
    );

    if (controllers.length === 0) {
      return { message: 'No controllers found', score: 70, maxScore: 100, severity: 'info' };
    }

    const bloated: string[] = [];
    let totalLines = 0;

    for (const file of controllers) {
      const lines = readFile(context, file).split('\n').length;
      totalLines += lines;
      if (lines > 200) {
        bloated.push(`${file} (${lines} lines)`);
      }
    }

    const avgLines = Math.round(totalLines / controllers.length);
    const ratio = bloated.length / controllers.length;
    const score = Math.round(Math.max(0, 100 - ratio * 150 - Math.max(0, avgLines - 100) * 0.2));

    return {
      message: `${bloated.length}/${controllers.length} controllers exceed 200 lines (avg ${avgLines})`,
      score,
      maxScore: 100,
      severity: ratio > 0.4 ? 'critical' : ratio > 0.2 ? 'warning' : 'info',
      files: bloated.slice(0, 5),
      detail: { bloatedCount: bloated.length, total: controllers.length, avgLines },
    };
  },
};

// ─── Check: Service layer presence ───────────────────────────────────────────

export const serviceLayerCheck: Check = {
  id: 'php-laravel/service-layer',
  name: 'Service Layer',
  dimension: Dimension.Maintainability,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const services = context.files.filter((f) =>
      f.match(/[Ss]ervices?\/.*\.php$/),
    );
    const controllers = context.files.filter((f) =>
      f.match(/[Cc]ontrollers?\/.*\.php$/),
    );

    if (controllers.length === 0) {
      return { message: 'No controllers found — cannot assess service layer ratio', score: 50, maxScore: 80, severity: 'info' };
    }

    if (services.length === 0) {
      return {
        message: 'No service layer found — business logic likely lives in controllers',
        score: 20,
        maxScore: 100,
        severity: 'critical',
      };
    }

    const ratio = services.length / controllers.length;
    const score = Math.min(100, Math.round(40 + ratio * 60));

    return {
      message: `${services.length} services for ${controllers.length} controllers`,
      score,
      maxScore: 100,
      severity: ratio < 0.3 ? 'warning' : 'info',
      detail: { serviceCount: services.length, controllerCount: controllers.length, ratio },
    };
  },
};

// ─── Check: Cyclomatic complexity (rough) ─────────────────────────────────────

export const cyclomaticComplexityCheck: Check = {
  id: 'php-laravel/cyclomatic-complexity',
  name: 'Cyclomatic Complexity',
  dimension: Dimension.Maintainability,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const phpFiles = context.files.filter((f) => f.endsWith('.php'));
    if (phpFiles.length === 0) {
      return { message: 'No PHP files found', score: 50, maxScore: 100, severity: 'info' };
    }

    // Count decision points as a proxy for complexity
    const decisionKeywords = /\b(if|elseif|else if|foreach|for|while|case|catch|&&|\|\||\?)\b/g;
    let highComplexity = 0;
    let totalFunctions = 0;

    for (const file of phpFiles) {
      const content = readFile(context, file);
      const functions = content.split(/function\s+\w+\s*\(/);

      for (let i = 1; i < functions.length; i++) {
        totalFunctions++;
        // Extract function body (rough — up to 100 lines)
        const body = functions[i].substring(0, 3000);
        const complexity = (body.match(decisionKeywords) ?? []).length + 1;
        if (complexity > 10) highComplexity++;
      }
    }

    if (totalFunctions === 0) {
      return { message: 'No functions found', score: 50, maxScore: 100, severity: 'info' };
    }

    const ratio = highComplexity / totalFunctions;
    const score = Math.round(Math.max(0, 100 - ratio * 150));

    return {
      message: `${highComplexity}/${totalFunctions} functions have high cyclomatic complexity (>10)`,
      score,
      maxScore: 100,
      severity: ratio > 0.3 ? 'warning' : 'info',
      detail: { highComplexity, totalFunctions },
    };
  },
};
