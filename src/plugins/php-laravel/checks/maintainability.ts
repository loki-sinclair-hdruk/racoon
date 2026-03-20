import * as fs from 'fs';
import * as path from 'path';
import { Check, Dimension, EvidenceItem, Finding, ScanContext } from '../../../core/types.js';
import { classifyFile, mergePathRules, PHP_LARAVEL_PATH_RULES } from '../../../core/path-classifier.js';

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

function snip(line: string, maxLen = 80): string {
  const t = line.trim();
  return t.length > maxLen ? t.slice(0, maxLen - 1) + '…' : t;
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

    const evidence: EvidenceItem[] = [];
    let totalLines = 0;

    for (const file of controllers) {
      const content = readFile(context, file);
      const lines = content.split('\n');
      totalLines += lines.length;

      if (lines.length > 200) {
        // Find the class declaration line for the evidence anchor
        const classLineIdx = lines.findIndex((l) => l.match(/^class\s+\w+/));
        const anchorIdx = classLineIdx >= 0 ? classLineIdx : 0;
        evidence.push({
          file,
          line: anchorIdx + 1,
          snippet: `${snip(lines[anchorIdx])}  [${lines.length} lines]`,
          weight: 1.5,
          label: 'controller',
        });
      }
    }

    evidence.sort((a, b) => {
      // Sort by line count descending (encoded in snippet)
      const aLines = parseInt(a.snippet.match(/\[(\d+) lines\]/)?.[1] ?? '0', 10);
      const bLines = parseInt(b.snippet.match(/\[(\d+) lines\]/)?.[1] ?? '0', 10);
      return bLines - aLines;
    });

    const avgLines = Math.round(totalLines / controllers.length);
    const ratio = evidence.length / controllers.length;
    const score = Math.round(Math.max(0, 100 - ratio * 150 - Math.max(0, avgLines - 100) * 0.2));

    return {
      message: `${evidence.length}/${controllers.length} controllers exceed 200 lines (avg ${avgLines})`,
      score,
      maxScore: 100,
      severity: ratio > 0.4 ? 'critical' : ratio > 0.2 ? 'warning' : 'info',
      files: evidence.map((e) => e.file),
      evidence,
      detail: { bloatedCount: evidence.length, total: controllers.length, avgLines },
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
    const services = context.files.filter((f) => f.match(/[Ss]ervices?\/.*\.php$/));
    const controllers = context.files.filter((f) => f.match(/[Cc]ontrollers?\/.*\.php$/));

    if (controllers.length === 0) {
      return {
        message: 'No controllers found — cannot assess service layer ratio',
        score: 50,
        maxScore: 80,
        severity: 'info',
      };
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
    const rules = mergePathRules(context.config.pathRules, PHP_LARAVEL_PATH_RULES);
    const phpFiles = context.files.filter((f) => f.endsWith('.php'));

    if (phpFiles.length === 0) {
      return { message: 'No PHP files found', score: 50, maxScore: 100, severity: 'info' };
    }

    const decisionKeywords = /\b(if|elseif|else if|foreach|for|while|case|catch|&&|\|\||\?)\b/g;
    const evidence: EvidenceItem[] = [];
    let totalFunctions = 0;

    for (const file of phpFiles) {
      const { weight, label } = classifyFile(file, rules);
      if (weight === 0) continue;

      const content = readFile(context, file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const fnMatch = lines[i].match(/(?:public|protected|private|static)?\s*function\s+(\w+)\s*\(/);
        if (!fnMatch) continue;

        totalFunctions++;
        // Grab up to 100 lines of function body for complexity estimate
        const body = lines.slice(i, i + 100).join('\n');
        const complexity = (body.match(decisionKeywords) ?? []).length + 1;

        if (complexity > 10) {
          evidence.push({
            file,
            line: i + 1,
            snippet: `${snip(lines[i])}  [complexity ≈${complexity}]`,
            weight,
            label,
          });
        }
      }
    }

    if (totalFunctions === 0) {
      return { message: 'No functions found', score: 50, maxScore: 100, severity: 'info' };
    }

    evidence.sort((a, b) => {
      const aC = parseInt(a.snippet.match(/complexity ≈(\d+)/)?.[1] ?? '0', 10);
      const bC = parseInt(b.snippet.match(/complexity ≈(\d+)/)?.[1] ?? '0', 10);
      return bC - aC;
    });

    const ratio = evidence.length / totalFunctions;
    const score = Math.round(Math.max(0, 100 - ratio * 150));

    return {
      message: `${evidence.length}/${totalFunctions} functions have high cyclomatic complexity (>10)`,
      score,
      maxScore: 100,
      severity: ratio > 0.3 ? 'warning' : 'info',
      files: [...new Set(evidence.map((e) => e.file))],
      evidence: evidence.slice(0, 10),
      detail: { highComplexity: evidence.length, totalFunctions },
    };
  },
};
