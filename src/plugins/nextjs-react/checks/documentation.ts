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

// ─── Check: README quality ────────────────────────────────────────────────────

export const readmeCheck: Check = {
  id: 'nextjs-react/readme',
  name: 'README Quality',
  dimension: Dimension.Documentation,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const readmeFile = context.files.find((f) => f.match(/^readme\.md$/i));

    if (!readmeFile) {
      return { message: 'No README.md found', score: 0, maxScore: 100, severity: 'warning' };
    }

    const content = readFile(context, readmeFile);
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    const sections = {
      gettingStarted: /##?\s*(getting\s*started|quick\s*start)/i.test(content),
      install:        /##?\s*install/i.test(content),
      envSetup:       /##?\s*(env|environment|configuration)/i.test(content),
      deploy:         /##?\s*deploy/i.test(content),
      testing:        /##?\s*test/i.test(content),
    };

    const sectionScore = Object.values(sections).filter(Boolean).length * 12;
    const lengthScore  = Math.min(40, Math.round((wordCount / 300) * 40));
    const score        = Math.min(100, sectionScore + lengthScore);

    return {
      message: `README found (${wordCount} words, ${Object.values(sections).filter(Boolean).length}/5 key sections)`,
      score,
      maxScore: 100,
      severity: score < 40 ? 'warning' : 'info',
      detail: { wordCount, sections },
    };
  },
};

// ─── Check: JSDoc / TSDoc coverage ───────────────────────────────────────────

export const jsDocCheck: Check = {
  id: 'nextjs-react/jsdoc-coverage',
  name: 'JSDoc / TSDoc Coverage',
  dimension: Dimension.Documentation,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const tsFiles = context.files.filter((f) =>
      f.match(/\.(ts|tsx)$/) && !f.match(/\.d\.ts$/) && !f.includes('node_modules'),
    );

    if (tsFiles.length === 0) {
      return { message: 'No TypeScript files found', score: 50, maxScore: 80, severity: 'info' };
    }

    let exportedFunctions = 0;
    let documented = 0;

    for (const file of tsFiles) {
      const content = readFile(context, file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^export\s+(?:async\s+)?function\s+\w+/) ||
            lines[i].match(/^export\s+const\s+\w+\s*=\s*(?:async\s+)?\(/)) {
          exportedFunctions++;
          const lookback = lines.slice(Math.max(0, i - 4), i).join('\n');
          if (lookback.includes('*/')) documented++;
        }
      }
    }

    if (exportedFunctions === 0) {
      return { message: 'No exported functions found', score: 50, maxScore: 80, severity: 'info' };
    }

    const ratio = documented / exportedFunctions;
    const score = Math.round(ratio * 80);

    return {
      message: `${documented}/${exportedFunctions} exported functions have JSDoc (${Math.round(ratio * 100)}%)`,
      score,
      maxScore: 80,
      severity: ratio < 0.3 ? 'warning' : 'info',
      detail: { documented, exportedFunctions },
    };
  },
};

// ─── Check: Storybook presence ────────────────────────────────────────────────

export const storybookCheck: Check = {
  id: 'nextjs-react/storybook',
  name: 'Storybook',
  dimension: Dimension.Documentation,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const hasStorybookDir  = context.files.some((f) => f.startsWith('.storybook/'));
    const hasStoryFiles    = context.files.some((f) => f.match(/\.stories\.(tsx?|jsx?)$/));

    const score =
      hasStorybookDir && hasStoryFiles ? 100 :
      hasStoryFiles                    ? 60  : 30;

    return {
      message:
        hasStorybookDir && hasStoryFiles ? 'Storybook configured with story files'  :
        hasStoryFiles                    ? 'Story files found but no .storybook/ dir' :
        'No Storybook detected',
      score,
      maxScore: 100,
      severity: 'info',
    };
  },
};
