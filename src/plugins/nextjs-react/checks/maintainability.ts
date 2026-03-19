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

// ─── Check: TypeScript usage ──────────────────────────────────────────────────

export const typescriptCheck: Check = {
  id: 'nextjs-react/typescript',
  name: 'TypeScript Usage',
  dimension: Dimension.Maintainability,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const hasTsConfig = context.files.includes('tsconfig.json');
    const tsFiles = context.files.filter((f) => f.match(/\.(ts|tsx)$/) && !f.includes('node_modules'));
    const jsFiles = context.files.filter((f) => f.match(/\.(js|jsx)$/) && !f.includes('node_modules') && !f.match(/\.config\.(js|cjs|mjs)$/));

    if (!hasTsConfig && tsFiles.length === 0) {
      return {
        message: 'No TypeScript found — JS-only project',
        score: 30,
        maxScore: 100,
        severity: 'warning',
      };
    }

    const total = tsFiles.length + jsFiles.length;
    const tsRatio = total > 0 ? tsFiles.length / total : 1;
    const score = Math.round(40 + tsRatio * 60);

    return {
      message: `${tsFiles.length} TS/TSX files, ${jsFiles.length} plain JS/JSX files (${Math.round(tsRatio * 100)}% typed)`,
      score,
      maxScore: 100,
      severity: tsRatio < 0.5 ? 'warning' : 'info',
      detail: { tsFiles: tsFiles.length, jsFiles: jsFiles.length, ratio: tsRatio },
    };
  },
};

// ─── Check: Custom hook extraction ────────────────────────────────────────────

export const customHookCheck: Check = {
  id: 'nextjs-react/custom-hooks',
  name: 'Custom Hook Extraction',
  dimension: Dimension.Maintainability,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const hookFiles = context.files.filter((f) =>
      f.match(/use[A-Z][a-zA-Z]+\.(ts|tsx|js|jsx)$/) &&
      !f.includes('node_modules'),
    );

    const componentFiles = context.files.filter((f) =>
      f.match(/\.(jsx|tsx)$/) && !f.includes('node_modules'),
    );

    if (componentFiles.length === 0) {
      return { message: 'No component files found', score: 50, maxScore: 80, severity: 'info' };
    }

    const ratio = hookFiles.length / componentFiles.length;
    const score = hookFiles.length === 0 ? 30 : Math.min(80, Math.round(40 + ratio * 80));

    return {
      message: `${hookFiles.length} custom hook file(s) for ${componentFiles.length} components`,
      score,
      maxScore: 80,
      severity: hookFiles.length === 0 && componentFiles.length > 5 ? 'info' : 'info',
      detail: { hookFiles: hookFiles.length, componentFiles: componentFiles.length },
    };
  },
};

// ─── Check: Prop types / TypeScript interfaces ────────────────────────────────

export const propTypesCheck: Check = {
  id: 'nextjs-react/prop-types',
  name: 'Prop Typing',
  dimension: Dimension.Maintainability,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const componentFiles = context.files.filter((f) =>
      f.match(/\.(jsx|tsx)$/) && !f.includes('node_modules'),
    );

    if (componentFiles.length === 0) {
      return { message: 'No component files found', score: 50, maxScore: 100, severity: 'info' };
    }

    let typedComponents = 0;
    let untyped: string[] = [];

    for (const file of componentFiles) {
      const content = readFile(context, file);

      // TypeScript interface/type for props
      const hasTypeProps =
        content.match(/(?:interface|type)\s+\w*[Pp]rops\w*\s*[={<]/) ||
        content.match(/React\.FC</) ||
        content.match(/:\s*\w+Props\b/) ||
        content.match(/PropTypes\./);

      if (hasTypeProps) {
        typedComponents++;
      } else {
        // Only flag files that actually export a component
        if (content.match(/export\s+(?:default\s+)?(?:function|const)\s+[A-Z]/)) {
          untyped.push(file);
        }
      }
    }

    const exportedComponents = typedComponents + untyped.length;
    if (exportedComponents === 0) {
      return { message: 'No exported components found', score: 50, maxScore: 100, severity: 'info' };
    }

    const ratio = typedComponents / exportedComponents;
    const score = Math.round(ratio * 100);

    return {
      message: `${typedComponents}/${exportedComponents} exported components have typed props`,
      score,
      maxScore: 100,
      severity: ratio < 0.5 ? 'warning' : 'info',
      files: untyped.slice(0, 5),
    };
  },
};
