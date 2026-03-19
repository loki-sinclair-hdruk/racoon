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

// ─── Check: next/image usage ──────────────────────────────────────────────────

export const nextImageCheck: Check = {
  id: 'nextjs-react/next-image',
  name: 'Next.js Image Optimisation',
  dimension: Dimension.Performance,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    let rawImgTags = 0;
    let nextImageImports = 0;

    for (const file of jsFiles(context)) {
      const content = readFile(context, file);
      rawImgTags       += (content.match(/<img\s/g) ?? []).length;
      nextImageImports += (content.match(/from\s+['"]next\/image['"]/g) ?? []).length;
    }

    const total = rawImgTags + nextImageImports;
    if (total === 0) {
      return { message: 'No image usage found', score: 80, maxScore: 100, severity: 'info' };
    }

    const ratio = nextImageImports / total;
    const score = Math.round(ratio * 100);

    return {
      message: `${nextImageImports} next/image, ${rawImgTags} raw <img> tag(s)`,
      score,
      maxScore: 100,
      severity: rawImgTags > 0 && ratio < 0.5 ? 'warning' : 'info',
      detail: { rawImgTags, nextImageImports },
    };
  },
};

// ─── Check: Dynamic imports / code splitting ─────────────────────────────────

export const codeSplittingCheck: Check = {
  id: 'nextjs-react/code-splitting',
  name: 'Code Splitting',
  dimension: Dimension.Performance,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    let dynamicImports = 0;
    let reactLazy = 0;
    let suspense = 0;

    for (const file of jsFiles(context)) {
      const content = readFile(context, file);
      dynamicImports += (content.match(/import\s*\(/g) ?? []).length;
      reactLazy      += (content.match(/React\.lazy\s*\(|lazy\s*\(\s*\(\s*\)/g) ?? []).length;
      suspense       += (content.match(/<Suspense\b/g) ?? []).length;
    }

    const hasCodeSplitting = dynamicImports > 0 || reactLazy > 0;
    const score = hasCodeSplitting ? Math.min(100, 60 + dynamicImports * 3 + reactLazy * 5) : 30;

    return {
      message: hasCodeSplitting
        ? `${dynamicImports} dynamic import(s), ${reactLazy} React.lazy(), ${suspense} Suspense boundary(s)`
        : 'No dynamic imports or React.lazy() detected',
      score,
      maxScore: 100,
      severity: !hasCodeSplitting ? 'info' : 'info',
      detail: { dynamicImports, reactLazy, suspense },
    };
  },
};

// ─── Check: React.memo / useMemo / useCallback ────────────────────────────────

export const memoizationCheck: Check = {
  id: 'nextjs-react/memoization',
  name: 'Memoization Usage',
  dimension: Dimension.Performance,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const componentFiles = context.files.filter((f) =>
      f.match(/\.(jsx|tsx)$/) && !f.includes('node_modules'),
    );

    if (componentFiles.length === 0) {
      return { message: 'No component files found', score: 50, maxScore: 80, severity: 'info' };
    }

    let memoCount = 0;
    let useMemoCount = 0;
    let useCallbackCount = 0;

    for (const file of componentFiles) {
      const content = readFile(context, file);
      memoCount       += (content.match(/React\.memo\s*\(|export\s+default\s+memo\s*\(/g) ?? []).length;
      useMemoCount    += (content.match(/\buseMemo\s*\(/g) ?? []).length;
      useCallbackCount += (content.match(/\buseCallback\s*\(/g) ?? []).length;
    }

    const total = memoCount + useMemoCount + useCallbackCount;
    const score = total > 0 ? Math.min(80, 40 + total * 4) : 30;

    return {
      message: total > 0
        ? `${memoCount} React.memo, ${useMemoCount} useMemo, ${useCallbackCount} useCallback`
        : 'No memoization patterns detected',
      score,
      maxScore: 80,
      severity: 'info',
      detail: { memoCount, useMemoCount, useCallbackCount },
    };
  },
};
