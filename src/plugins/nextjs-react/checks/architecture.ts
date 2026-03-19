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

// ─── Check: App Router vs Pages Router consistency ────────────────────────────

export const routerConsistencyCheck: Check = {
  id: 'nextjs-react/router-consistency',
  name: 'Router Consistency',
  dimension: Dimension.Architecture,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const hasAppDir    = context.files.some((f) => f.match(/^(?:src\/)?app\/(?!api\/)/));
    const hasPagesDir  = context.files.some((f) => f.match(/^(?:src\/)?pages\/(?!api\/)/));

    if (hasAppDir && hasPagesDir) {
      return {
        message: 'Both app/ and pages/ directories found — mixed routing patterns',
        score: 50,
        maxScore: 100,
        severity: 'warning',
      };
    }

    if (hasAppDir) {
      return {
        message: 'Using App Router (app/ directory) consistently',
        score: 100,
        maxScore: 100,
        severity: 'info',
      };
    }

    if (hasPagesDir) {
      return {
        message: 'Using Pages Router (pages/ directory) consistently',
        score: 80,
        maxScore: 100,
        severity: 'info',
      };
    }

    return {
      message: 'No app/ or pages/ directory found',
      score: 30,
      maxScore: 100,
      severity: 'warning',
    };
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

    // Check if API routes are doing too much (> 80 lines is a smell for routes)
    const bloated: string[] = [];
    for (const file of apiRoutes) {
      const lines = readFile(context, file).split('\n').length;
      if (lines > 80) bloated.push(`${file} (${lines} lines)`);
    }

    const score = bloated.length === 0 ? 80 : Math.max(20, 80 - bloated.length * 15);

    return {
      message: `${apiRoutes.length} API route(s)${bloated.length > 0 ? `, ${bloated.length} overly large` : ''}`,
      score,
      maxScore: 80,
      severity: bloated.length > 3 ? 'warning' : 'info',
      files: bloated.slice(0, 3),
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
    // Only meaningful for App Router projects
    const hasAppDir = context.files.some((f) => f.match(/^(?:src\/)?app\//));

    if (!hasAppDir) {
      return { message: 'App Router not detected — check not applicable', score: 70, maxScore: 80, severity: 'info' };
    }

    const appFiles = context.files.filter((f) =>
      f.match(/^(?:src\/)?app\/.*\.(tsx?|jsx?)$/) && !f.includes('node_modules'),
    );

    if (appFiles.length === 0) {
      return { message: 'No app/ source files found', score: 50, maxScore: 80, severity: 'info' };
    }

    let serverComponents = 0;
    let clientComponents = 0;
    let unspecified = 0;

    // Client components that use server-only APIs
    const serverApiInClientFiles: string[] = [];

    for (const file of appFiles) {
      const content = readFile(context, file);
      const isClient = content.trimStart().startsWith('"use client"') || content.trimStart().startsWith("'use client'");
      const isServer = content.trimStart().startsWith('"use server"') || content.trimStart().startsWith("'use server'");

      if (isClient) {
        clientComponents++;
        // Client components shouldn't use server-only modules
        if (content.includes('import') && (content.includes('server-only') || content.includes('next/headers') || content.includes('next/cookies'))) {
          serverApiInClientFiles.push(file);
        }
      } else if (isServer) {
        serverComponents++;
      } else {
        unspecified++;
      }
    }

    const issues = serverApiInClientFiles.length;
    const score = issues === 0 ? 80 : Math.max(20, 80 - issues * 20);

    return {
      message: `${serverComponents} server, ${clientComponents} client, ${unspecified} unspecified components${issues > 0 ? ` — ${issues} client component(s) import server-only modules` : ''}`,
      score,
      maxScore: 80,
      severity: issues > 0 ? 'critical' : 'info',
      files: serverApiInClientFiles.slice(0, 5),
      detail: { serverComponents, clientComponents, unspecified },
    };
  },
};
