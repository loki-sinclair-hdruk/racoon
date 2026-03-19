import { Dimension } from '../core/types.js';

export interface DimensionMeta {
  dimension: Dimension;
  label: string;
  description: string;
  /**
   * Default weight in the overall score.
   * All defaults sum to 1.0.
   */
  defaultWeight: number;
}

export const DIMENSIONS: DimensionMeta[] = [
  {
    dimension: Dimension.Readability,
    label: 'Readability',
    description: 'How easy the code is to read and understand at a glance.',
    defaultWeight: 0.10,
  },
  {
    dimension: Dimension.Maintainability,
    label: 'Maintainability',
    description: 'How easy the code is to change, debug, and extend safely.',
    defaultWeight: 0.15,
  },
  {
    dimension: Dimension.Extensibility,
    label: 'Extensibility',
    description: 'How well the codebase accommodates new features without rework.',
    defaultWeight: 0.10,
  },
  {
    dimension: Dimension.TestCoverage,
    label: 'Test Coverage',
    description: 'Breadth and quality of automated tests.',
    defaultWeight: 0.15,
  },
  {
    dimension: Dimension.Security,
    label: 'Security',
    description: 'Resistance to common vulnerabilities and secret exposure.',
    defaultWeight: 0.20,
  },
  {
    dimension: Dimension.Performance,
    label: 'Performance',
    description: 'Code patterns that influence runtime and build-time efficiency.',
    defaultWeight: 0.10,
  },
  {
    dimension: Dimension.Documentation,
    label: 'Documentation',
    description: 'Quality of inline docs, READMEs, and developer-facing guidance.',
    defaultWeight: 0.10,
  },
  {
    dimension: Dimension.Architecture,
    label: 'Architecture',
    description: 'Structural quality: separation of concerns, layering, conventions.',
    defaultWeight: 0.10,
  },
];

export const DIMENSION_MAP = new Map<Dimension, DimensionMeta>(
  DIMENSIONS.map((d) => [d.dimension, d]),
);

/** Returns the label for a dimension, or the raw enum value as fallback. */
export function dimensionLabel(d: Dimension): string {
  return DIMENSION_MAP.get(d)?.label ?? d;
}

/** Returns resolved weights, merging defaults with any per-project overrides. */
export function resolveWeights(
  overrides: Partial<Record<Dimension, number>> = {},
): Record<Dimension, number> {
  const result = {} as Record<Dimension, number>;
  for (const meta of DIMENSIONS) {
    result[meta.dimension] = overrides[meta.dimension] ?? meta.defaultWeight;
  }
  return result;
}
