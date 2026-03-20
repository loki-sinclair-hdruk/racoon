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

// ─── Check: App Router vs Pages Router consistency ────────────────────────────

export const routerConsistencyCheck: Check = {
  id: 'nextjs-react/router-consistency',
  name: 'Router Consistency',
  dimension: Dimension.Architecture,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const hasAppDir   = context.files.some((f) => f.match(/^(?:src\/)?app\/(?!api\/)/));
    const hasPagesDir = context.files.some((f) => f.match(/^(?:src\/)?pages\/(?!api\/)/));

    if (hasAppDir && hasPagesDir) {
      return {
        message: 'Both app/ and pages/ directories found — mixed routing patterns',
        score: 50,
        maxScore: 100,
        severity: 'warning',
      };
    }

    if (hasAppDir) {
      return { message: 'Using App Router (app/ directory) consistently', score: 100, maxScore: 100, severity: 'info' };
    }

    if (hasPagesDir) {
      return { message: 'Using Pages Router (pages/ directory) consistently', score: 80, maxScore: 100, severity: 'info' };
    }

    return { message: 'No app/ or pages/ directory found', score: 30, maxScore: 100, severity: 'warning' };
  },
};

// ─── Check: API routes organisation ──────────────────────────────────────────

export const apiRoutesCheck: Check = {
  id: 'nextjs-react/api-routes',
  name: 'API Routes Organisation',
  dimension: Dimension.Architecture,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const apiRoutes = context.files.filter((f) =>
      f.match(/^(?:src\/)?(?:pages|app)\/api\//) && f.match(/\.(js|ts)$/),
    );

    if (apiRoutes.length === 0) {
      return { message: 'No API routes found', score: 70, maxScore: 80, severity: 'info' };
    }

    const evidence: EvidenceItem[] = [];

    for (const file of apiRoutes) {
      const content = readFile(context, file);
      const lines = content.split('\n');
      if (lines.length <= 80) continue;

      // Find the handler export as anchor
      const handlerIdx = lines.findIndex((l) =>
        l.match(/export\s+(?:default\s+)?(?:async\s+)?function/) ||
        l.match(/export\s+const\s+\w+\s*=\s*(?:async\s+)?(?:req|request)/),
      );
      const anchorIdx = handlerIdx >= 0 ? handlerIdx : 0;

      evidence.push({
        file,
        line: anchorIdx + 1,
        snippet: `${snip(lines[anchorIdx])}  [${lines.length} lines]`,
        weight: 1.5,
        label: 'API route',
      });
    }

    evidence.sort((a, b) => {
      const aL = parseInt(a.snippet.match(/\[(\d+) lines\]/)?.[1] ?? '0', 10);
      const bL = parseInt(b.snippet.match(/\[(\d+) lines\]/)?.[1] ?? '0', 10);
      return bL - aL;
    });

    const score = evidence.length === 0 ? 80 : Math.max(20, 80 - evidence.length * 15);

    return {
      message: `${apiRoutes.length} API route(s)${evidence.length > 0 ? `, ${evidence.length} overly large (>80 lines)` : ''}`,
      score,
      maxScore: 80,
      severity: evidence.length > 3 ? 'warning' : 'info',
      files: evidence.map((e) => e.file),
      evidence,
    };
  },
};

// ─── Check: Server vs Client component separation ─────────────────────────────

export const serverClientSeparationCheck: Check = {
  id: 'nextjs-react/server-client-separation',
  name: 'Server / Client Component Separation',
  dimension: Dimension.Architecture,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const rules = mergePathRules(context.config.pathRules, NEXTJS_REACT_PATH_RULES);
    const hasAppDir = context.files.some((f) => f.match(/^(?:src\/)?app\//));

    if (!hasAppDir) {
      return {
        message: 'App Router not detected — check not applicable',
        score: 70,
        maxScore: 80,
        severity: 'info',
      };
    }

    const appFiles = context.files.filter(
      (f) => f.match(/^(?:src\/)?app\/.*\.(tsx?|jsx?)$/) && !f.includes('node_modules'),
    );

    if (appFiles.length === 0) {
      return { message: 'No app/ source files found', score: 50, maxScore: 80, severity: 'info' };
    }

    let serverComponents = 0;
    let clientComponents = 0;
    let unspecified = 0;
    const evidence: EvidenceItem[] = [];

    for (const file of appFiles) {
      const { weight, label } = classifyFile(file, rules);
      // Don't skip weight=0 here — server/client violations are always critical
      const content = readFile(context, file);
      const lines = content.split('\n');

      const isClient =
        content.trimStart().startsWith('"use client"') ||
        content.trimStart().startsWith("'use client'");
      const isServer =
        content.trimStart().startsWith('"use server"') ||
        content.trimStart().startsWith("'use server'");

      if (isClient) {
        clientComponents++;
        // Client components importing server-only modules is a violation
        if (
          content.includes('import') &&
          (content.includes('server-only') ||
            content.includes('next/headers') ||
            content.includes('next/cookies'))
        ) {
          // Find the problematic import line
          for (let i = 0; i < lines.length; i++) {
            if (
              lines[i].includes('server-only') ||
              lines[i].includes('next/headers') ||
              lines[i].includes('next/cookies')
            ) {
              evidence.push({
                file,
                line: i + 1,
                snippet: snip(lines[i]),
                weight: weight === 0 ? 0.5 : weight, // always show violations, even in reduced-weight files
                label,
              });
              break;
            }
          }
        }
      } else if (isServer) {
        serverComponents++;
      } else {
        unspecified++;
      }
    }

    evidence.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

    const score = evidence.length === 0 ? 80 : Math.max(20, 80 - evidence.length * 20);

    return {
      message: `${serverComponents} server, ${clientComponents} client, ${unspecified} unspecified components${evidence.length > 0 ? ` — ${evidence.length} client component(s) import server-only modules` : ''}`,
      score,
      maxScore: 80,
      severity: evidence.length > 0 ? 'critical' : 'info',
      files: [...new Set(evidence.map((e) => e.file))],
      evidence,
      detail: { serverComponents, clientComponents, unspecified },
    };
  },
};
