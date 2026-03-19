/**
 * Core type definitions for Racoon — the extensible codebase quality scanner.
 *
 * Data flow:
 *   Check.run() → Finding
 *   [Finding[]] → DimensionResult (via ScoringEngine)
 *   [DimensionResult[]] → ScanReport (via ScoringEngine)
 *   ScanReport → output (via Reporter)
 */

// ─── Dimensions ─────────────────────────────────────────────────────────────

export enum Dimension {
  Readability    = 'readability',
  Maintainability = 'maintainability',
  Extensibility  = 'extensibility',
  TestCoverage   = 'test_coverage',
  Security       = 'security',
  Performance    = 'performance',
  Documentation  = 'documentation',
  Architecture   = 'architecture',
}

// ─── Stacks ──────────────────────────────────────────────────────────────────

export enum Stack {
  PhpLaravel  = 'php-laravel',
  NextjsReact = 'nextjs-react',
  Generic     = 'generic',
}

// ─── Scan Context ─────────────────────────────────────────────────────────────

/** Everything a Check needs to evaluate a project. */
export interface ScanContext {
  /** Absolute path to the root of the project being scanned. */
  projectRoot: string;
  /** Detected stacks for this project. */
  stacks: Stack[];
  /** Raw file contents cache — populated lazily by the scanner. */
  fileCache: Map<string, string>;
  /** Resolved list of all project file paths (relative to projectRoot). */
  files: string[];
  /** Optional config loaded from .racoon.json in the project root. */
  config: RacoonConfig;
}

// ─── Findings ─────────────────────────────────────────────────────────────────

export type Severity = 'info' | 'warning' | 'critical';

export interface Finding {
  /** Human-readable description of what was found. */
  message: string;
  /** 0–100 score contribution for this finding. */
  score: number;
  /** Maximum possible score this check can award (contributes to ceiling). */
  maxScore: number;
  severity: Severity;
  /** File path(s) most relevant to this finding, relative to project root. */
  files?: string[];
  /** Additional structured detail for verbose/JSON output. */
  detail?: Record<string, unknown>;
}

// ─── Checks ──────────────────────────────────────────────────────────────────

export interface Check {
  /** Unique identifier, e.g. "php-laravel/controller-bloat" */
  id: string;
  /** Human-readable name shown in output. */
  name: string;
  dimension: Dimension;
  /**
   * Relative weight of this check within its dimension.
   * All weights within a dimension are normalised, so only ratios matter.
   */
  weight: number;
  run(context: ScanContext): Promise<Finding>;
}

// ─── Plugins ─────────────────────────────────────────────────────────────────

export interface Plugin {
  /** Unique plugin identifier, e.g. "php-laravel" */
  id: string;
  /** Stacks this plugin applies to. */
  stacks: Stack[];
  checks: Check[];
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface DimensionResult {
  dimension: Dimension;
  /** Weighted 0–100 score. */
  score: number;
  /** Maximum achievable score given current project state. */
  ceiling: number;
  /** Individual findings that contributed to this result. */
  findings: Array<{ check: Check; finding: Finding }>;
  /** Findings that indicate actionable gaps (score < maxScore). */
  gaps: Array<{ check: Check; finding: Finding }>;
}

export interface ScanReport {
  projectRoot: string;
  stacks: Stack[];
  dimensions: DimensionResult[];
  /** Weighted overall score across all dimensions. */
  overallScore: number;
  /** Weighted overall ceiling — realistic best-case if all gaps closed. */
  overallCeiling: number;
  /** Top findings that are lifting the overall score. */
  strengths: Array<{ check: Check; finding: Finding; dimension: Dimension }>;
  /** Top findings that are holding the score back. */
  weaknesses: Array<{ check: Check; finding: Finding; dimension: Dimension }>;
  durationMs: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface DimensionWeight {
  dimension: Dimension;
  weight: number;
}

export interface RacoonConfig {
  /** Override dimension weights. Must sum to 1.0 if all provided. */
  dimensionWeights?: Partial<Record<Dimension, number>>;
  /** Check IDs to skip entirely. */
  skip?: string[];
  /** Output format when not overridden by CLI flag. */
  outputFormat?: 'terminal' | 'json';
}
