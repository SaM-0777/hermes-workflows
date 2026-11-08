export const CARD_ACCENTS = [
  "[--catalog-accent:var(--ui-blue)]",
  "[--catalog-accent:var(--ui-orange)]",
  "[--catalog-accent:var(--ui-purple)]",
  "[--catalog-accent:var(--ui-green)]",
  "[--catalog-accent:var(--ui-red)]",
  "[--catalog-accent:var(--ui-cyan)]",
  "[--catalog-accent:var(--ui-yellow)]",
] as const;

export const CURVE = {
  durationMs: 2200,
  particleCount: 92,
  pulseDurationMs: 2000,
  strokeWidth: 4.2,
  trailSpan: 0.31,
  point(progress: number, detailScale: number) {
    const t = progress * Math.PI * 2;
    const mix = 1 + detailScale * 0.16;
    const x =
      17 * Math.cos(t) +
      7.5 * Math.cos(3 * t + 0.6 * mix) +
      3.2 * Math.sin(5 * t - 0.4);
    const y =
      15 * Math.sin(t) +
      8.2 * Math.sin(2 * t + 0.25) -
      4.2 * Math.cos(4 * t - 0.5 * mix);

    return { x: 50 + x, y: 50 + y };
  },
};
