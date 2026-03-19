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

function jsFiles(context: ScanContext): string[] {
  return context.files.filter((f) =>
    f.match(/\.(js|jsx|ts|tsx)$/) && !f.includes('node_modules'),
  );
}

// ─── Check: ESLint config presence ───────────────────────────────────────────

export const eslintConfigCheck: Check = {
  id: 'nextjs-react/eslint-config',
  name: 'ESLint Configuration',
  dimension: Dimension.Readability,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const configs = [
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.json',
      '.eslintrc.yaml',
      '.eslintrc.yml',
      'eslint.config.js',
      'eslint.config.mjs',
    ];

    const found = configs.find((c) => context.files.includes(c));

    // Also check package.json for eslintConfig key
    const pkgFile = context.files.find((f) => f === 'package.json');
    let inPackageJson = false;
    if (pkgFile) {
      const pkg = readFile(context, pkgFile);
      inPackageJson = pkg.includes('"eslintConfig"');
    }

    const hasConfig = !!found || inPackageJson;

    // Check if next/core-web-vitals or similar strict preset is used
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
      detail: { configFile: found ?? (inPackageJson ? 'package.json#eslintConfig' : null), usesStrictPreset },
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
    const componentFiles = context.files.filter((f) =>
      f.match(/\.(jsx|tsx)$/) && !f.includes('node_modules'),
    );

    if (componentFiles.length === 0) {
      return { message: 'No JSX/TSX component files found', score: 50, maxScore: 100, severity: 'info' };
    }

    const largeComponents: string[] = [];

    for (const file of componentFiles) {
      const lines = readFile(context, file).split('\n').length;
      if (lines > 200) {
        largeComponents.push(`${file} (${lines} lines)`);
      }
    }

    const ratio = largeComponents.length / componentFiles.length;
    const score = Math.round(Math.max(0, 100 - ratio * 200));

    return {
      message: `${largeComponents.length}/${componentFiles.length} components exceed 200 lines`,
      score,
      maxScore: 100,
      severity: ratio > 0.3 ? 'warning' : 'info',
      files: largeComponents.slice(0, 5),
    };
  },
};
