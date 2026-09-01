export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function blendshapeScore(categories: BlendshapeCategory[], name: string): number {
  return categories.find((c) => c.categoryName === name)?.score ?? 0;
}
