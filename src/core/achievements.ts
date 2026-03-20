import { BaselineData, Dimension, EarnedAchievement, ScanReport } from './types.js';

// ─── Internal definition type ─────────────────────────────────────────────────

interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  check: (
    report: ScanReport,
    baseline: BaselineData | null,
    consecutiveImprovements: number,
  ) => boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dimScore(report: ScanReport, dimension: Dimension): number {
  return report.dimensions.find((d) => d.dimension === dimension)?.score ?? 0;
}

// ─── Achievement catalogue ────────────────────────────────────────────────────

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // ── Dimension excellence ──────────────────────────────────────────────────
  {
    id: 'security-champion',
    name: 'Security Champion',
    icon: '🛡',
    description: 'Security dimension scored 90+',
    check: (r) => dimScore(r, Dimension.Security) >= 90,
  },
  {
    id: 'test-enthusiast',
    name: 'Test Enthusiast',
    icon: '🧪',
    description: 'Test Coverage scored 80+',
    check: (r) => dimScore(r, Dimension.TestCoverage) >= 80,
  },
  {
    id: 'well-documented',
    name: 'Well Documented',
    icon: '📚',
    description: 'Documentation scored 80+',
    check: (r) => dimScore(r, Dimension.Documentation) >= 80,
  },
  {
    id: 'solid-architecture',
    name: 'Solid Architecture',
    icon: '🏛',
    description: 'Architecture scored 80+',
    check: (r) => dimScore(r, Dimension.Architecture) >= 80,
  },
  // ── Overall health ────────────────────────────────────────────────────────
  {
    id: 'perfectionist',
    name: 'Perfectionist',
    icon: '⭐',
    description: 'Scored 100 on at least one dimension',
    check: (r) => r.dimensions.some((d) => d.score >= 100),
  },
  {
    id: 'clean-sweep',
    name: 'Clean Sweep',
    icon: '✨',
    description: 'All dimensions scored 70+',
    check: (r) => r.dimensions.every((d) => d.score >= 70),
  },
  {
    id: 'no-critical-gaps',
    name: 'No Critical Gaps',
    icon: '🔒',
    description: 'Zero critical-severity findings across all dimensions',
    check: (r) =>
      !r.dimensions.some((d) =>
        d.gaps.some((g) => g.finding.severity === 'critical'),
      ),
  },
  {
    id: 's-tier',
    name: 'S-Tier Codebase',
    icon: '🏆',
    description: 'Overall score reached 90+',
    check: (r) => r.overallScore >= 90,
  },
  // ── Momentum (require baseline) ───────────────────────────────────────────
  {
    id: 'regression-free',
    name: 'Regression Free',
    icon: '📈',
    description: 'No regressions detected since last scan',
    check: (r) => r.delta !== undefined && r.delta.regressions.length === 0,
  },
  {
    id: 'most-improved',
    name: 'Most Improved',
    icon: '🚀',
    description: 'Score improved by 10+ points in a single scan',
    check: (r) => r.delta !== undefined && r.delta.scoreDelta >= 10,
  },
  {
    id: 'on-a-roll',
    name: 'On a Roll',
    icon: '🔥',
    description: '3 consecutive scans with an improving score',
    check: (_r, _b, consecutiveImprovements) => consecutiveImprovements >= 3,
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate which achievements the current scan has earned.
 * Marks achievements as `isNew` when they weren't in the stored baseline.
 *
 * @param report                 Completed scan report (delta already attached).
 * @param baseline               Previously persisted baseline, or null.
 * @param consecutiveImprovements Running improvement streak after this scan.
 */
export function computeAchievements(
  report: ScanReport,
  baseline: BaselineData | null,
  consecutiveImprovements: number,
): EarnedAchievement[] {
  const previouslyEarned = new Set(baseline?.earnedAchievements ?? []);

  return ACHIEVEMENT_DEFS
    .filter((def) => def.check(report, baseline, consecutiveImprovements))
    .map((def) => ({
      id: def.id,
      name: def.name,
      icon: def.icon,
      description: def.description,
      isNew: !previouslyEarned.has(def.id),
    }));
}
