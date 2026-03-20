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

// ─── Check: Method length ─────────────────────────────────────────────────────

export const methodLengthCheck: Check = {
  id: 'php-laravel/method-length',
  name: 'Method Length',
  dimension: Dimension.Readability,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const rules = mergePathRules(context.config.pathRules, PHP_LARAVEL_PATH_RULES);
    const phpFiles = context.files.filter((f) => f.endsWith('.php'));

    if (phpFiles.length === 0) {
      return { message: 'No PHP files found', score: 50, maxScore: 100, severity: 'info' };
    }

    const evidence: EvidenceItem[] = [];
    let totalMethods = 0;

    for (const file of phpFiles) {
      const { weight, label } = classifyFile(file, rules);
      if (weight === 0) continue;

      const content = readFile(context, file);
      const lines = content.split('\n');

      let inMethod = false;
      let methodStart = 0;
      let braceDepth = 0;
      let signatureLine = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const methodMatch = line.match(/^\s+(?:public|protected|private|static)\s+function\s+(\w+)/);

        if (methodMatch && !inMethod) {
          inMethod = true;
          methodStart = i;
          braceDepth = 0;
          signatureLine = line;
        }

        if (inMethod) {
          braceDepth += (line.match(/\{/g) ?? []).length;
          braceDepth -= (line.match(/\}/g) ?? []).length;

          if (braceDepth <= 0 && i > methodStart) {
            totalMethods++;
            const length = i - methodStart;
            if (length > 30) {
              evidence.push({
                file,
                line: methodStart + 1,
                snippet: `${snip(signatureLine)}  [${length} lines]`,
                weight,
                label,
              });
            }
            inMethod = false;
          }
        }
      }
    }

    if (totalMethods === 0) {
      return { message: 'No methods found to analyse', score: 50, maxScore: 100, severity: 'info' };
    }

    evidence.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

    const ratio = evidence.length / totalMethods;
    const score = Math.round(Math.max(0, 100 - ratio * 200));

    return {
      message: `${evidence.length}/${totalMethods} methods exceed 30 lines`,
      score,
      maxScore: 100,
      severity: ratio > 0.3 ? 'warning' : 'info',
      files: [...new Set(evidence.map((e) => e.file))],
      evidence: evidence.slice(0, 10),
      detail: { longMethodCount: evidence.length, totalMethods },
    };
  },
};

// ─── Check: Naming conventions ────────────────────────────────────────────────

export const namingConventionsCheck: Check = {
  id: 'php-laravel/naming-conventions',
  name: 'Naming Conventions',
  dimension: Dimension.Readability,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const rules = mergePathRules(context.config.pathRules, PHP_LARAVEL_PATH_RULES);
    const phpFiles = context.files.filter((f) => f.endsWith('.php'));

    if (phpFiles.length === 0) {
      return { message: 'No PHP files found', score: 50, maxScore: 100, severity: 'info' };
    }

    let classCount = 0;
    let badClasses = 0;
    let methodCount = 0;
    let badMethods = 0;
    const evidence: EvidenceItem[] = [];

    for (const file of phpFiles) {
      const { weight, label } = classifyFile(file, rules);
      if (weight === 0) continue;

      const content = readFile(context, file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const classMatch = line.match(/^class\s+(\w+)/);
        if (classMatch) {
          classCount++;
          if (!/^[A-Z][A-Za-z0-9]*$/.test(classMatch[1])) {
            badClasses++;
            if (evidence.length < 15) {
              evidence.push({ file, line: i + 1, snippet: snip(line), weight, label });
            }
          }
        }

        const methodMatches = [...line.matchAll(/function\s+([a-zA-Z_]\w*)\s*\(/g)];
        for (const m of methodMatches) {
          const name = m[1];
          if (name.startsWith('__')) continue;
          methodCount++;
          if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
            badMethods++;
            if (evidence.length < 15) {
              evidence.push({ file, line: i + 1, snippet: snip(line), weight, label });
            }
          }
        }
      }
    }

    const total = classCount + methodCount;
    if (total === 0) {
      return { message: 'No classes or methods found', score: 50, maxScore: 100, severity: 'info' };
    }

    evidence.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

    const bad = badClasses + badMethods;
    const score = Math.round(Math.max(0, 100 - (bad / total) * 150));

    return {
      message: `${bad}/${total} identifiers violate naming conventions`,
      score,
      maxScore: 100,
      severity: bad > 5 ? 'warning' : 'info',
      files: [...new Set(evidence.map((e) => e.file))],
      evidence,
      detail: { badClasses, badMethods, classCount, methodCount },
    };
  },
};
