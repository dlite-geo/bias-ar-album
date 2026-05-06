export interface LayoutOptions {
  cols: number;       // photos per row
  rows: number;       // rows per layer
  spacing: number;    // unit distance between slots
  jitter: number;     // random offset as a fraction of spacing
}

export interface PhotoSlot {
  index: number;
  position: { x: number; y: number; z: number };
}

export function computeLayout(
  count: number,
  options: LayoutOptions,
  rng: () => number = Math.random,
): PhotoSlot[] {
  const { cols, rows, spacing, jitter } = options;
  if (count <= 0) return [];

  const perLayer = cols * rows;
  const layersTotal = Math.ceil(count / perLayer);
  const slots: PhotoSlot[] = [];

  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / perLayer);
    const inLayer = i % perLayer;
    const row = Math.floor(inLayer / cols);
    const col = inLayer % cols;

    const baseX = (col - (cols - 1) / 2) * spacing;
    const baseY = (row - (rows - 1) / 2) * spacing;
    const baseZ = (layer - (layersTotal - 1) / 2) * spacing;

    const jx = (rng() - 0.5) * 2 * jitter * spacing;
    const jy = (rng() - 0.5) * 2 * jitter * spacing;
    const jz = (rng() - 0.5) * 2 * jitter * spacing;

    slots.push({
      index: i,
      position: { x: baseX + jx, y: baseY + jy, z: baseZ + jz },
    });
  }

  return slots;
}
