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

// ─── Check: README presence & quality ────────────────────────────────────────

export const readmeCheck: Check = {
  id: 'php-laravel/readme',
  name: 'README Quality',
  dimension: Dimension.Documentation,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const readmeFile = context.files.find((f) =>
      f.match(/^readme\.md$/i) || f.match(/^readme\.txt$/i),
    );

    if (!readmeFile) {
      return { message: 'No README found', score: 0, maxScore: 100, severity: 'warning' };
    }

    const content = readFile(context, readmeFile);
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    const hasSections = {
      install: /##?\s*install/i.test(content),
      usage:   /##?\s*usage/i.test(content),
      env:     /##?\s*(env|environment|config)/i.test(content),
      testing: /##?\s*test/i.test(content),
    };
    const sectionScore = Object.values(hasSections).filter(Boolean).length * 15;
    const lengthScore  = Math.min(40, Math.round((wordCount / 200) * 40));
    const score        = Math.min(100, sectionScore + lengthScore);

    return {
      message: `README found (${wordCount} words, ${Object.values(hasSections).filter(Boolean).length}/4 key sections)`,
      score,
      maxScore: 100,
      severity: score < 40 ? 'warning' : 'info',
      detail: { wordCount, sections: hasSections },
    };
  },
};

// ─── Check: PHPDoc coverage ───────────────────────────────────────────────────

export const phpDocCoverageCheck: Check = {
  id: 'php-laravel/phpdoc-coverage',
  name: 'PHPDoc Coverage',
  dimension: Dimension.Documentation,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const rules = mergePathRules(context.config.pathRules, PHP_LARAVEL_PATH_RULES);
    const phpFiles = context.files.filter(
      (f) => f.endsWith('.php') && !f.startsWith('vendor/'),
    );

    if (phpFiles.length === 0) {
      return { message: 'No PHP files found', score: 50, maxScore: 100, severity: 'info' };
    }

    let publicMethods = 0;
    let documentedMethods = 0;
    const evidence: EvidenceItem[] = [];

    for (const file of phpFiles) {
      const { weight, label } = classifyFile(file, rules);
      if (weight === 0) continue;

      const content = readFile(context, file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].match(/^\s+public\s+function\s+\w+/)) continue;

        publicMethods++;
        const lookback = lines.slice(Math.max(0, i - 5), i).join('\n');
        if (lookback.includes('*/')) {
          documentedMethods++;
        } else {
          evidence.push({
            file,
            line: i + 1,
            snippet: snip(lines[i]),
            weight,
            label,
          });
        }
      }
    }

    if (publicMethods === 0) {
      return { message: 'No public methods found', score: 50, maxScore: 100, severity: 'info' };
    }

    // Sort: highest-impact paths first
    evidence.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

    const ratio = documentedMethods / publicMethods;
    const score = Math.round(ratio * 100);

    return {
      message: `${documentedMethods}/${publicMethods} public methods have PHPDoc blocks (${Math.round(ratio * 100)}%)`,
      score,
      maxScore: 100,
      severity: ratio < 0.3 ? 'warning' : 'info',
      files: [...new Set(evidence.map((e) => e.file))],
      evidence: evidence.slice(0, 10),
      detail: { documentedMethods, publicMethods, ratio },
    };
  },
};

// ─── Check: CHANGELOG ────────────────────────────────────────────────────────

export const changelogCheck: Check = {
  id: 'php-laravel/changelog',
  name: 'CHANGELOG',
  dimension: Dimension.Documentation,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const hasChangelog = context.files.some((f) =>
      f.match(/^changelog(\.md|\.txt)?$/i),
    );

    return {
      message: hasChangelog ? 'CHANGELOG present' : 'No CHANGELOG found',
      score: hasChangelog ? 80 : 30,
      maxScore: 80,
      severity: 'info',
    };
  },
};
