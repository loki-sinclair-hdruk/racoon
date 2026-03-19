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

// ─── Check: Feature-based file structure ──────────────────────────────────────

export const fileStructureCheck: Check = {
  id: 'nextjs-react/file-structure',
  name: 'File Structure Organisation',
  dimension: Dimension.Extensibility,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    // Feature-based is preferred: src/features/, src/modules/, src/components/
    const hasFeatureDir   = context.files.some((f) => f.match(/^src\/features?\//));
    const hasModulesDir   = context.files.some((f) => f.match(/^src\/modules?\//));
    const hasComponentDir = context.files.some((f) => f.match(/^(?:src\/)?components\//));
    const hasHooksDir     = context.files.some((f) => f.match(/^(?:src\/)?hooks\//));
    const hasTypesDir     = context.files.some((f) => f.match(/^(?:src\/)?types?\//));
    const hasUtilsDir     = context.files.some((f) => f.match(/^(?:src\/)?(?:utils?|helpers?|lib)\//));

    const indicators = [
      hasFeatureDir || hasModulesDir,
      hasComponentDir,
      hasHooksDir,
      hasTypesDir,
      hasUtilsDir,
    ].filter(Boolean).length;

    const score = Math.round((indicators / 5) * 100);

    const missing: string[] = [];
    if (!hasFeatureDir && !hasModulesDir) missing.push('features/ or modules/ dir');
    if (!hasComponentDir)                 missing.push('components/ dir');
    if (!hasHooksDir)                     missing.push('hooks/ dir');
    if (!hasTypesDir)                     missing.push('types/ dir');
    if (!hasUtilsDir)                     missing.push('utils/ dir');

    return {
      message: missing.length === 0
        ? 'Well-structured project directory layout'
        : `Missing conventional dirs: ${missing.join(', ')}`,
      score,
      maxScore: 100,
      severity: indicators < 2 ? 'warning' : 'info',
      detail: { hasFeatureDir, hasModulesDir, hasComponentDir, hasHooksDir, hasTypesDir, hasUtilsDir },
    };
  },
};

// ─── Check: Environment variable usage ───────────────────────────────────────

export const envVarUsageCheck: Check = {
  id: 'nextjs-react/env-var-usage',
  name: 'Environment Variable Hygiene',
  dimension: Dimension.Extensibility,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const hasEnvExample = context.files.some((f) =>
      f.match(/^\.env\.(?:example|sample|template)$/),
    );
    const hasEnvLocal = context.files.includes('.env.local');
    const hasEnvProd  = context.files.some((f) =>
      f.match(/^\.env\.(?:prod|production)$/),
    );

    const issues: string[] = [];
    if (!hasEnvExample) issues.push('No .env.example found');
    if (hasEnvProd)     issues.push('.env.production committed to repo');

    // Check .gitignore covers .env files
    const gitignore = context.files.find((f) => f === '.gitignore');
    if (gitignore) {
      const content = readFile(context, gitignore);
      if (!content.includes('.env')) issues.push('.gitignore does not cover .env files');
    }

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 30);

    return {
      message: issues.length === 0
        ? 'Environment variable handling looks good'
        : issues.join('; '),
      score,
      maxScore: 100,
      severity: hasEnvProd ? 'critical' : issues.length > 0 ? 'warning' : 'info',
    };
  },
};

// ─── Check: API abstraction layer ─────────────────────────────────────────────

export const apiAbstractionCheck: Check = {
  id: 'nextjs-react/api-abstraction',
  name: 'API Abstraction Layer',
  dimension: Dimension.Extensibility,
  weight: 1,

  async run(context: ScanContext): Promise<Finding> {
    const apiFiles = context.files.filter((f) =>
      f.match(/^(?:src\/)?(?:api|services?|lib)\/.+\.(ts|tsx|js|jsx)$/) &&
      !f.includes('node_modules'),
    );

    const componentFiles = context.files.filter((f) =>
      f.match(/\.(jsx|tsx)$/) &&
      !f.match(/^(?:pages|app)\/api\//) &&
      !f.includes('node_modules'),
    );

    // Check for raw fetch/axios calls directly in components
    let rawFetchInComponents = 0;
    for (const file of componentFiles) {
      const content = readFile(context, file);
      if (
        content.match(/\bfetch\s*\(/) ||
        content.match(/axios\.(?:get|post|put|delete|patch)\s*\(/)
      ) {
        rawFetchInComponents++;
      }
    }

    const hasAbstraction = apiFiles.length > 0;
    const score = hasAbstraction
      ? Math.max(40, 100 - rawFetchInComponents * 10)
      : Math.max(0, 40 - rawFetchInComponents * 5);

    return {
      message: hasAbstraction
        ? `${apiFiles.length} API abstraction file(s); ${rawFetchInComponents} component(s) with raw fetch calls`
        : `No API abstraction layer — ${rawFetchInComponents} component(s) make raw fetch/axios calls`,
      score,
      maxScore: 100,
      severity: !hasAbstraction && rawFetchInComponents > 3 ? 'warning' : 'info',
      detail: { apiFiles: apiFiles.length, rawFetchInComponents },
    };
  },
};
