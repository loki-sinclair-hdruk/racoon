import * as fs from 'fs';
import * as path from 'path';
import { Check, Dimension, Finding, ScanContext } from '../../../core/types.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

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

function phpFiles(context: ScanContext): string[] {
  return context.files.filter((f) => f.endsWith('.php'));
}

// ─── Check: Method length ─────────────────────────────────────────────────────

export const methodLengthCheck: Check = {
  id: 'php-laravel/method-length',
  name: 'Method Length',
  dimension: Dimension.Readability,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const files = phpFiles(context);
    if (files.length === 0) {
      return { message: 'No PHP files found', score: 50, maxScore: 100, severity: 'info' };
    }

    const longMethods: string[] = [];
    let totalMethods = 0;

    for (const file of files) {
      const content = readFile(context, file);
      const lines = content.split('\n');

      let inMethod = false;
      let methodStart = 0;
      let braceDepth = 0;
      let methodName = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect method declaration
        const methodMatch = line.match(/^\s+(?:public|protected|private|static)\s+function\s+(\w+)/);
        if (methodMatch && !inMethod) {
          inMethod = true;
          methodStart = i;
          braceDepth = 0;
          methodName = methodMatch[1];
        }

        if (inMethod) {
          braceDepth += (line.match(/\{/g) ?? []).length;
          braceDepth -= (line.match(/\}/g) ?? []).length;

          if (braceDepth <= 0 && i > methodStart) {
            totalMethods++;
            const length = i - methodStart;
            if (length > 30) {
              longMethods.push(`${file}:${methodStart + 1} (${methodName}, ${length} lines)`);
            }
            inMethod = false;
          }
        }
      }
    }

    if (totalMethods === 0) {
      return { message: 'No methods found to analyse', score: 50, maxScore: 100, severity: 'info' };
    }

    const ratio = longMethods.length / totalMethods;
    const score = Math.round(Math.max(0, 100 - ratio * 200));

    return {
      message: `${longMethods.length}/${totalMethods} methods exceed 30 lines`,
      score,
      maxScore: 100,
      severity: ratio > 0.3 ? 'warning' : 'info',
      files: longMethods.slice(0, 10),
      detail: { longMethodCount: longMethods.length, totalMethods },
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
    const files = phpFiles(context);
    if (files.length === 0) {
      return { message: 'No PHP files found', score: 50, maxScore: 100, severity: 'info' };
    }

    let classCount = 0;
    let badClasses = 0;
    let methodCount = 0;
    let badMethods = 0;

    for (const file of files) {
      const content = readFile(context, file);

      // Classes should be PascalCase
      for (const match of content.matchAll(/^class\s+(\w+)/gm)) {
        classCount++;
        if (!/^[A-Z][A-Za-z0-9]*$/.test(match[1])) badClasses++;
      }

      // Methods should be camelCase
      for (const match of content.matchAll(/function\s+([a-zA-Z_]\w*)\s*\(/g)) {
        const name = match[1];
        if (name.startsWith('__')) continue; // magic methods
        methodCount++;
        if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) badMethods++;
      }
    }

    const total = classCount + methodCount;
    if (total === 0) {
      return { message: 'No classes or methods found', score: 50, maxScore: 100, severity: 'info' };
    }

    const bad = badClasses + badMethods;
    const score = Math.round(Math.max(0, 100 - (bad / total) * 150));

    return {
      message: `${bad}/${total} identifiers violate naming conventions`,
      score,
      maxScore: 100,
      severity: bad > 5 ? 'warning' : 'info',
      detail: { badClasses, badMethods, classCount, methodCount },
    };
  },
};
