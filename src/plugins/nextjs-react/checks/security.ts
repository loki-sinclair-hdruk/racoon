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

// ─── Check: dangerouslySetInnerHTML usage ────────────────────────────────────

export const xssRiskCheck: Check = {
  id: 'nextjs-react/xss-risk',
  name: 'XSS Risk (dangerouslySetInnerHTML)',
  dimension: Dimension.Security,
  weight: 4,

  async run(context: ScanContext): Promise<Finding> {
    const hits: string[] = [];

    for (const file of jsFiles(context)) {
      const content = readFile(context, file);
      if (content.includes('dangerouslySetInnerHTML')) {
        hits.push(file);
      }
    }

    const score = hits.length === 0 ? 100 : Math.max(0, 100 - hits.length * 20);

    return {
      message: hits.length === 0
        ? 'No dangerouslySetInnerHTML usage found'
        : `dangerouslySetInnerHTML used in ${hits.length} file(s)`,
      score,
      maxScore: 100,
      severity: hits.length > 0 ? 'warning' : 'info',
      files: hits.slice(0, 5),
    };
  },
};

// ─── Check: eval() / Function() usage ────────────────────────────────────────

export const evalUsageCheck: Check = {
  id: 'nextjs-react/eval-usage',
  name: 'eval() / Function() Usage',
  dimension: Dimension.Security,
  weight: 3,

  async run(context: ScanContext): Promise<Finding> {
    const hits: string[] = [];

    for (const file of jsFiles(context)) {
      const content = readFile(context, file);
      if (content.match(/\beval\s*\(/) || content.match(/new\s+Function\s*\(/)) {
        hits.push(file);
      }
    }

    const score = hits.length === 0 ? 100 : Math.max(0, 100 - hits.length * 30);

    return {
      message: hits.length === 0
        ? 'No eval() or new Function() usage found'
        : `eval()/Function() used in ${hits.length} file(s)`,
      score,
      maxScore: 100,
      severity: hits.length > 0 ? 'critical' : 'info',
      files: hits,
    };
  },
};

// ─── Check: Hardcoded secrets ─────────────────────────────────────────────────

export const hardcodedSecretsCheck: Check = {
  id: 'nextjs-react/hardcoded-secrets',
  name: 'Hardcoded Secrets',
  dimension: Dimension.Security,
  weight: 4,

  async run(context: ScanContext): Promise<Finding> {
    const secretPatterns = [
      /(?:apiKey|api_key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/g,
      /(?:secret|password|passwd|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      /(?:sk-|pk_live_|pk_test_)[a-zA-Z0-9]{20,}/g,
    ];

    const hits: string[] = [];

    for (const file of jsFiles(context)) {
      // Skip .env files and config files
      if (file.match(/\.env/) || file.match(/\.config\.(js|ts|mjs|cjs)$/)) continue;

      const content = readFile(context, file);
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          hits.push(file);
          break;
        }
      }
    }

    const score = hits.length === 0 ? 100 : Math.max(0, 100 - hits.length * 25);

    return {
      message: hits.length === 0
        ? 'No hardcoded secrets detected'
        : `${hits.length} file(s) with potential hardcoded secrets`,
      score,
      maxScore: 100,
      severity: hits.length > 0 ? 'critical' : 'info',
      files: hits.slice(0, 5),
    };
  },
};

// ─── Check: Next.js security headers ─────────────────────────────────────────

export const securityHeadersCheck: Check = {
  id: 'nextjs-react/security-headers',
  name: 'Security Headers',
  dimension: Dimension.Security,
  weight: 2,

  async run(context: ScanContext): Promise<Finding> {
    const nextConfigFile = context.files.find((f) =>
      f.match(/^next\.config\.(js|ts|mjs|cjs)$/),
    );

    if (!nextConfigFile) {
      return { message: 'No next.config found', score: 30, maxScore: 100, severity: 'info' };
    }

    const content = readFile(context, nextConfigFile);

    const headers = {
      csp:          content.includes('Content-Security-Policy'),
      hsts:         content.includes('Strict-Transport-Security'),
      xFrame:       content.includes('X-Frame-Options'),
      xContent:     content.includes('X-Content-Type-Options'),
      referrer:     content.includes('Referrer-Policy'),
      hasHeaders:   content.includes('headers()') || content.includes("headers:"),
    };

    const definedCount = Object.values(headers).filter(Boolean).length;
    const score = Math.round((definedCount / 6) * 100);

    return {
      message: headers.hasHeaders
        ? `Security headers configured (${definedCount - 1}/5 key headers found)`
        : 'No security headers found in next.config',
      score,
      maxScore: 100,
      severity: !headers.hasHeaders ? 'warning' : 'info',
      detail: headers,
    };
  },
};
