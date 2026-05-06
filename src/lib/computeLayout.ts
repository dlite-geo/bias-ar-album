export interface LayoutOptions {
  spread?: number;       // standard deviation of the Gaussian scatter on x/y (in scene units)
  depthRatio?: number;   // z spread as a fraction of `spread` (1.0 = isotropic cloud, 0 = flat plane)
  scaleMin?: number;     // minimum random scale per card
  scaleMax?: number;     // maximum random scale per card
}

export interface PhotoSlot {
  index: number;
  position: { x: number; y: number; z: number };
  scale: number;
}

// Box-Muller transform → standard normal (mean 0, stddev 1)
function gaussian(rng: () => number): number {
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
  const depthRatio = options.depthRatio ?? 0.6;
  const scaleMin = options.scaleMin ?? 0.5;
  const scaleMax = options.scaleMax ?? 2.0;

  const slots: PhotoSlot[] = [];
  for (let i = 0; i < count; i++) {
    const x = gaussian(rng) * spread;
    const y = gaussian(rng) * spread;
    const z = gaussian(rng) * spread * depthRatio;
    const scale = scaleMin + rng() * (scaleMax - scaleMin);
    slots.push({
      index: i,
      position: { x, y, z },
      scale,
    });
  }
  return slots;
}
