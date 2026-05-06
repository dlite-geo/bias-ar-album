import { describe, it, expect } from 'vitest';
import { computeLayout } from '../../src/lib/computeLayout';

describe('computeLayout', () => {
  it('returns an empty array for zero photos', () => {
    const result = computeLayout(0, { cols: 3, rows: 3, spacing: 2, jitter: 0 });
    expect(result).toEqual([]);
  });

  it('places one photo at the origin when jitter is zero', () => {
    const result = computeLayout(1, { cols: 1, rows: 1, spacing: 2, jitter: 0 });
    expect(result).toHaveLength(1);
    expect(result[0].position.x).toBeCloseTo(0);
    expect(result[0].position.y).toBeCloseTo(0);
    expect(result[0].position.z).toBeCloseTo(0);
  });

  it('centers a 3x3 grid around the origin (no jitter)', () => {
    const result = computeLayout(9, { cols: 3, rows: 3, spacing: 2, jitter: 0 });
    expect(result).toHaveLength(9);
    const sumX = result.reduce((acc, s) => acc + s.position.x, 0);
    const sumY = result.reduce((acc, s) => acc + s.position.y, 0);
    expect(sumX).toBeCloseTo(0);
    expect(sumY).toBeCloseTo(0);
  });

  it('grows layers automatically when count exceeds cols*rows', () => {
    const result = computeLayout(15, { cols: 2, rows: 2, spacing: 2, jitter: 0 });
    expect(result).toHaveLength(15);
    // 2x2 = 4 per layer → 15 photos need 4 layers
    const zValues = new Set(result.map((s) => Math.round(s.position.z * 1000)));
    expect(zValues.size).toBe(4);
  });

  it('is deterministic with a seeded rng', () => {
    const makeSeededRng = () => {
      let s = 0;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };
    const a = computeLayout(20, { cols: 4, rows: 4, spacing: 1, jitter: 0.4 }, makeSeededRng());
    const b = computeLayout(20, { cols: 4, rows: 4, spacing: 1, jitter: 0.4 }, makeSeededRng());
    expect(a).toEqual(b);
  });

  it('respects jitter bounds (offset stays within ± jitter * spacing)', () => {
    const spacing = 2;
    const jitter = 0.3;
    const result = computeLayout(64, { cols: 4, rows: 4, spacing, jitter });
    const jitterMax = jitter * spacing;
    for (const slot of result) {
      const layer = Math.floor(slot.index / 16);
      const inLayer = slot.index % 16;
      const row = Math.floor(inLayer / 4);
      const col = inLayer % 4;
      const baseX = (col - 1.5) * spacing;
      const baseY = (row - 1.5) * spacing;
      const layersTotal = Math.ceil(64 / 16);
      const baseZ = (layer - (layersTotal - 1) / 2) * spacing;
      expect(Math.abs(slot.position.x - baseX)).toBeLessThanOrEqual(jitterMax + 1e-9);
      expect(Math.abs(slot.position.y - baseY)).toBeLessThanOrEqual(jitterMax + 1e-9);
      expect(Math.abs(slot.position.z - baseZ)).toBeLessThanOrEqual(jitterMax + 1e-9);
    }
  });
});
