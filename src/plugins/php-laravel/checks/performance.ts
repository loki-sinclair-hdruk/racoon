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

// ─── Check: N+1 query risk ────────────────────────────────────────────────────

export const nPlusOneCheck: Check = {
  id: 'php-laravel/n-plus-one',
  name: 'N+1 Query Risk',
  dimension: Dimension.Performance,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const phpFiles = context.files.filter(
      (f) => f.endsWith('.php') && !f.startsWith('vendor/'),
    );

    const hits: string[] = [];

    for (const file of phpFiles) {
      const content = readFile(context, file);
      const lines = content.split('\n');

      // Heuristic: a loop that contains a query/relationship access
      // Pattern: foreach/for followed within 5 lines by ->find, ->where, ->first, relationship access
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/\b(foreach|for)\s*\(/)) {
          const window = lines.slice(i + 1, i + 8).join('\n');
          if (
            window.match(/->(?:find|where|first|get|all)\s*\(/) ||
            window.match(/DB::(?:table|select|statement)\s*\(/)
          ) {
            hits.push(`${file}:${i + 1}`);
          }
        }
      }
    }

    const score = hits.length === 0 ? 100 : Math.max(0, 100 - hits.length * 15);

    return {
      message: hits.length === 0
        ? 'No obvious N+1 query patterns detected'
        : `${hits.length} potential N+1 query pattern(s) found`,
      score,
      maxScore: 100,
      severity: hits.length > 3 ? 'critical' : hits.length > 0 ? 'warning' : 'info',
      files: hits.slice(0, 5),
    };
  },
};

// ─── Check: Cache usage ───────────────────────────────────────────────────────

export const cacheUsageCheck: Check = {
  id: 'php-laravel/cache-usage',
  name: 'Cache Usage',
  dimension: Dimension.Performance,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const phpFiles = context.files.filter(
      (f) => f.endsWith('.php') && !f.startsWith('vendor/'),
    );

    let cacheUsage = 0;

    for (const file of phpFiles) {
      const content = readFile(context, file);
      if (
        content.includes('Cache::') ||
        content.includes('cache()') ||
        content.includes('Redis::') ||
        content.includes('->cache(')
      ) {
        cacheUsage++;
      }
    }

    // Presence of any cache usage is positive; we can't know if it's enough
    const score = cacheUsage > 0 ? 80 : 40;

    return {
      message: cacheUsage > 0
        ? `Cache usage found in ${cacheUsage} file(s)`
        : 'No cache usage detected (Cache::, cache(), Redis::)',
      score,
      maxScore: 80,
      severity: cacheUsage === 0 ? 'info' : 'info',
      detail: { filesWithCache: cacheUsage },
    };
  },
};

// ─── Check: Eager loading ─────────────────────────────────────────────────────

export const eagerLoadingCheck: Check = {
  id: 'php-laravel/eager-loading',
  name: 'Eager Loading (with)',
  dimension: Dimension.Performance,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const phpFiles = context.files.filter(
      (f) => f.endsWith('.php') && !f.startsWith('vendor/'),
    );

    let withCount = 0;
    let relationCallCount = 0;

    for (const file of phpFiles) {
      const content = readFile(context, file);
      withCount       += (content.match(/->with\s*\(/g) ?? []).length;
      withCount       += (content.match(/::with\s*\(/g) ?? []).length;
      relationCallCount += (content.match(/->(?:hasMany|hasOne|belongsTo|belongsToMany|morphTo|morphMany)\s*\(/g) ?? []).length;
    }

    if (relationCallCount === 0) {
      return { message: 'No Eloquent relationships detected', score: 70, maxScore: 100, severity: 'info' };
    }

    // Relationships exist — check if eager loading is used at all
    const score = withCount > 0 ? Math.min(100, 60 + withCount * 5) : 30;

    return {
      message: `${withCount} eager load(s) (->with()) across ${relationCallCount} relationship definition(s)`,
      score,
      maxScore: 100,
      severity: withCount === 0 && relationCallCount > 3 ? 'warning' : 'info',
      detail: { withCount, relationCallCount },
    };
  },
};
