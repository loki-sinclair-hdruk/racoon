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

/** Replace secret values in a line with [REDACTED] for safe display. */
function redact(line: string): string {
  return line
    .replace(
      /((?:apiKey|api_key|apikey|secret|password|passwd|token)\s*[:=]\s*)(['"`])[^'"`]{4,}(['"`])/gi,
      '$1$2[REDACTED]$3',
    )
    .replace(/((?:sk-|pk_live_|pk_test_))[a-zA-Z0-9]{10,}/g, '$1[REDACTED]');
}

function jsFiles(context: ScanContext): string[] {
  return context.files.filter(
    (f) => f.match(/\.(js|jsx|ts|tsx)$/) && !f.includes('node_modules'),
  );
}

// ─── Check: dangerouslySetInnerHTML usage ────────────────────────────────────

export const xssRiskCheck: Check = {
  id: 'nextjs-react/xss-risk',
  name: 'XSS Risk (dangerouslySetInnerHTML)',
  dimension: Dimension.Security,
  weight: 4,

  async run(context: ScanContext): Promise<Finding> {
    const rules = mergePathRules(context.config.pathRules, NEXTJS_REACT_PATH_RULES);
    const evidence: EvidenceItem[] = [];

    for (const file of jsFiles(context)) {
      const { weight, label } = classifyFile(file, rules);
      if (weight === 0) continue;

      const content = readFile(context, file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('dangerouslySetInnerHTML')) {
          evidence.push({ file, line: i + 1, snippet: snip(lines[i]), weight, label });
        }
      }
    }

    evidence.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

    const score = evidence.length === 0 ? 100 : Math.max(0, 100 - evidence.length * 20);

    return {
      message: evidence.length === 0
        ? 'No dangerouslySetInnerHTML usage found'
        : `dangerouslySetInnerHTML used in ${evidence.length} location(s)`,
      score,
      maxScore: 100,
      severity: evidence.length > 0 ? 'warning' : 'info',
      files: [...new Set(evidence.map((e) => e.file))],
      evidence,
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
    const rules = mergePathRules(context.config.pathRules, NEXTJS_REACT_PATH_RULES);
    const evidence: EvidenceItem[] = [];

    for (const file of jsFiles(context)) {
      const { weight, label } = classifyFile(file, rules);
      if (weight === 0) continue;

      const content = readFile(context, file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/\beval\s*\(/) || lines[i].match(/new\s+Function\s*\(/)) {
          evidence.push({ file, line: i + 1, snippet: snip(lines[i]), weight, label });
        }
      }
    }

    evidence.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

    const score = evidence.length === 0 ? 100 : Math.max(0, 100 - evidence.length * 30);

    return {
      message: evidence.length === 0
        ? 'No eval() or new Function() usage found'
        : `eval()/Function() used in ${evidence.length} location(s)`,
      score,
      maxScore: 100,
      severity: evidence.length > 0 ? 'critical' : 'info',
      files: [...new Set(evidence.map((e) => e.file))],
      evidence,
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
    const rules = mergePathRules(context.config.pathRules, NEXTJS_REACT_PATH_RULES);
    const secretPatterns = [
      /(?:apiKey|api_key|apikey)\s*[:=]\s*['"`][a-zA-Z0-9_\-]{20,}['"`]/,
      /(?:secret|password|passwd|token)\s*[:=]\s*['"`][^'"`]{8,}['"`]/i,
      /(?:sk-|pk_live_|pk_test_)[a-zA-Z0-9]{20,}/,
    ];

    const evidence: EvidenceItem[] = [];

    for (const file of jsFiles(context)) {
      if (file.match(/\.env/) || file.match(/\.config\.(js|ts|mjs|cjs)$/)) continue;

      const { weight, label } = classifyFile(file, rules);
      if (weight === 0) continue;

      const content = readFile(context, file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        for (const pattern of secretPatterns) {
          if (pattern.test(lines[i])) {
            evidence.push({
              file,
              line: i + 1,
              snippet: snip(redact(lines[i])),
              weight,
              label,
            });
            break;
          }
        }
      }
    }

    evidence.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

    const score = evidence.length === 0 ? 100 : Math.max(0, 100 - evidence.length * 25);

    return {
      message: evidence.length === 0
        ? 'No hardcoded secrets detected'
        : `${evidence.length} potential hardcoded secret(s) found`,
      score,
      maxScore: 100,
      severity: evidence.length > 0 ? 'critical' : 'info',
      files: [...new Set(evidence.map((e) => e.file))],
      evidence,
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
      csp:        content.includes('Content-Security-Policy'),
      hsts:       content.includes('Strict-Transport-Security'),
      xFrame:     content.includes('X-Frame-Options'),
      xContent:   content.includes('X-Content-Type-Options'),
      referrer:   content.includes('Referrer-Policy'),
      hasHeaders: content.includes('headers()') || content.includes('headers:'),
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
