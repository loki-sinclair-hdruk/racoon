import * as fs from 'fs';
import * as path from 'path';
import { Check, Dimension, EvidenceItem, Finding, ScanContext } from '../../../core/types.js';
import { classifyFile, mergePathRules, NEXTJS_REACT_PATH_RULES } from '../../../core/path-classifier.js';

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

// ─── Check: ESLint config presence ───────────────────────────────────────────

export const eslintConfigCheck: Check = {
  id: 'nextjs-react/eslint-config',
  name: 'ESLint Configuration',
  dimension: Dimension.Readability,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const configs = [
      '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
      '.eslintrc.yaml', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs',
    ];

    const found = configs.find((c) => context.files.includes(c));

    const pkgFile = context.files.find((f) => f === 'package.json');
    let inPackageJson = false;
    if (pkgFile) {
      inPackageJson = readFile(context, pkgFile).includes('"eslintConfig"');
    }

    const hasConfig = !!found || inPackageJson;

    let usesStrictPreset = false;
    if (found) {
      const content = readFile(context, found);
      usesStrictPreset =
        content.includes('next/core-web-vitals') ||
        content.includes('airbnb') ||
        content.includes('standard');
    }

    const score = hasConfig ? (usesStrictPreset ? 100 : 70) : 20;

    return {
      message: hasConfig
        ? `ESLint config found${usesStrictPreset ? ' with strict preset' : ''}`
        : 'No ESLint configuration found',
      score,
      maxScore: 100,
      severity: hasConfig ? 'info' : 'warning',
      detail: {
        configFile: found ?? (inPackageJson ? 'package.json#eslintConfig' : null),
        usesStrictPreset,
      },
    };
  },
};

// ─── Check: Component size ────────────────────────────────────────────────────

export const componentSizeCheck: Check = {
  id: 'nextjs-react/component-size',
  name: 'Component Size',
  dimension: Dimension.Readability,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const rules = mergePathRules(context.config.pathRules, NEXTJS_REACT_PATH_RULES);
    const componentFiles = context.files.filter(
      (f) => f.match(/\.(jsx|tsx)$/) && !f.includes('node_modules'),
    );

    if (componentFiles.length === 0) {
      return { message: 'No JSX/TSX component files found', score: 50, maxScore: 100, severity: 'info' };
    }

    const evidence: EvidenceItem[] = [];

    for (const file of componentFiles) {
      const { weight, label } = classifyFile(file, rules);
      if (weight === 0) continue;

      const content = readFile(context, file);
      const lines = content.split('\n');
      if (lines.length <= 200) continue;

      // Find the main component export as the evidence anchor
      const exportIdx = lines.findIndex((l) =>
        l.match(/export\s+(?:default\s+)?(?:function|const)\s+[A-Z]/),
      );
      const anchorIdx = exportIdx >= 0 ? exportIdx : 0;

      evidence.push({
        file,
        line: anchorIdx + 1,
        snippet: `${snip(lines[anchorIdx])}  [${lines.length} lines]`,
        weight,
        label,
      });
    }

    evidence.sort((a, b) => {
      const aL = parseInt(a.snippet.match(/\[(\d+) lines\]/)?.[1] ?? '0', 10);
      const bL = parseInt(b.snippet.match(/\[(\d+) lines\]/)?.[1] ?? '0', 10);
      return bL - aL;
    });

    const ratio = evidence.length / componentFiles.length;
    const score = Math.round(Math.max(0, 100 - ratio * 200));

    return {
      message: `${evidence.length}/${componentFiles.length} components exceed 200 lines`,
      score,
      maxScore: 100,
      severity: ratio > 0.3 ? 'warning' : 'info',
      files: evidence.map((e) => e.file),
      evidence,
    };
  },
};
