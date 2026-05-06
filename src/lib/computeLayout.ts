export interface LayoutOptions {
  spread?: number;       // standard deviation of the Gaussian scatter (in scene units)
  scaleMin?: number;     // minimum random scale per card
  scaleMax?: number;     // maximum random scale per card
  zJitter?: number;      // small z-axis jitter so overlapping cards have stable depth ordering
}

export interface PhotoSlot {
  index: number;
  position: { x: number; y: number; z: number };
  scale: number;
}

// Box-Muller transform → standard normal (mean 0, stddev 1)
function gaussian(rng: () => number): number {
  // Avoid u=0 producing log(0) = -Infinity by sampling u in (0, 1].
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function computeLayout(
  count: number,
  options: LayoutOptions = {},
  rng: () => number = Math.random,
): PhotoSlot[] {
  if (count <= 0) return [];

  const spread = options.spread ?? Math.max(2.5, Math.cbrt(count) * 1.4);
  const scaleMin = options.scaleMin ?? 0.5;
  const scaleMax = options.scaleMax ?? 2.0;
  const zJitter = options.zJitter ?? 0.05;

  const slots: PhotoSlot[] = [];
  for (let i = 0; i < count; i++) {
    const x = gaussian(rng) * spread;
    const y = gaussian(rng) * spread;
    const z = (rng() - 0.5) * 2 * zJitter;
    const scale = scaleMin + rng() * (scaleMax - scaleMin);
    slots.push({
      index: i,
      position: { x, y, z },
      scale,
    });
  }
  return slots;
}
