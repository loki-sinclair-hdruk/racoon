import * as fs from 'fs';
import * as path from 'path';
import { Stack } from './types.js';

interface DetectionResult {
  stacks: Stack[];
  evidence: Record<Stack, string[]>;
}

/**
 * Sniffs a project directory and returns the set of detected stacks.
 *
 * Detection is additive — a monorepo may legitimately return multiple stacks.
 * Each detection result includes the evidence files that triggered it.
 */
export function detectStacks(projectRoot: string): DetectionResult {
  const evidence: Record<Stack, string[]> = {
    [Stack.PhpLaravel]:  [],
    [Stack.NextjsReact]: [],
    [Stack.Generic]:     [],
  };

  // ── PHP / Laravel ──────────────────────────────────────────────────────────
  if (exists(projectRoot, 'composer.json')) {
    evidence[Stack.PhpLaravel].push('composer.json');

    const composer = readJson(projectRoot, 'composer.json');
    if (
      hasKey(composer, 'require', 'laravel/framework') ||
      hasKey(composer, 'require-dev', 'laravel/framework')
    ) {
      evidence[Stack.PhpLaravel].push('composer.json → laravel/framework');
    }
  }

  if (exists(projectRoot, 'artisan')) {
    evidence[Stack.PhpLaravel].push('artisan');
  }

  if (existsDir(projectRoot, 'app/Http/Controllers')) {
    evidence[Stack.PhpLaravel].push('app/Http/Controllers/');
  }

  // ── Next.js / React ────────────────────────────────────────────────────────
  const pkg = readJson(projectRoot, 'package.json');

  if (pkg) {
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    if ('next' in deps) {
      evidence[Stack.NextjsReact].push('package.json → next');
    }
    if ('react' in deps) {
      evidence[Stack.NextjsReact].push('package.json → react');
    }
  }

  const nextConfigs = [
    'next.config.js',
    'next.config.ts',
    'next.config.mjs',
    'next.config.cjs',
  ];
  for (const f of nextConfigs) {
    if (exists(projectRoot, f)) {
      evidence[Stack.NextjsReact].push(f);
    }
  }

  if (existsDir(projectRoot, 'pages') || existsDir(projectRoot, 'app')) {
    if (evidence[Stack.NextjsReact].length > 0) {
      evidence[Stack.NextjsReact].push('pages/ or app/ directory');
    }
  }

  // ── Resolve active stacks ─────────────────────────────────────────────────
  const stacks: Stack[] = [];

  if (evidence[Stack.PhpLaravel].length > 0) stacks.push(Stack.PhpLaravel);
  if (evidence[Stack.NextjsReact].length > 0) stacks.push(Stack.NextjsReact);
  if (stacks.length === 0) stacks.push(Stack.Generic);

  return { stacks, evidence };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exists(root: string, rel: string): boolean {
  try {
    fs.accessSync(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

function existsDir(root: string, rel: string): boolean {
  try {
    return fs.statSync(path.join(root, rel)).isDirectory();
  } catch {
    return false;
  }
}

function readJson(root: string, rel: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(path.join(root, rel), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasKey(
  obj: Record<string, unknown> | null,
  section: string,
  key: string,
): boolean {
  if (!obj) return false;
  const sec = obj[section];
  if (typeof sec !== 'object' || sec === null) return false;
  return key in sec;
}
