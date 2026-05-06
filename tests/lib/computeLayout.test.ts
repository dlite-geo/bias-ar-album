import { describe, it, expect } from 'vitest';
import { computeLayout } from '../../src/lib/computeLayout';

describe('computeLayout', () => {
  it('returns an empty array for zero photos', () => {
    expect(computeLayout(0)).toEqual([]);
  });

  it('returns N slots for N photos', () => {
    const result = computeLayout(7);
    expect(result).toHaveLength(7);
  });

  it('every slot has a position and a scale', () => {
    const result = computeLayout(5);
    for (const s of result) {
      expect(typeof s.position.x).toBe('number');
      expect(typeof s.position.y).toBe('number');
      expect(typeof s.position.z).toBe('number');
      expect(Number.isFinite(s.position.x)).toBe(true);
      expect(Number.isFinite(s.position.y)).toBe(true);
      expect(Number.isFinite(s.position.z)).toBe(true);
      expect(typeof s.scale).toBe('number');
    }
  });

  it('scale values stay within [scaleMin, scaleMax]', () => {
    const result = computeLayout(200, { scaleMin: 0.5, scaleMax: 1.5 });
    for (const s of result) {
      expect(s.scale).toBeGreaterThanOrEqual(0.5);
      expect(s.scale).toBeLessThanOrEqual(1.5);
    }
  });

  it('z values stay within ± zJitter', () => {
    const result = computeLayout(200, { zJitter: 0.1 });
    for (const s of result) {
      expect(Math.abs(s.position.z)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });

  it('produces a roughly centered scatter (mean near 0 for x and y)', () => {
    // Large sample → mean of a centered Gaussian should be ~0
    const result = computeLayout(2000, { spread: 1 });
    const meanX = result.reduce((acc, s) => acc + s.position.x, 0) / result.length;
    const meanY = result.reduce((acc, s) => acc + s.position.y, 0) / result.length;
    expect(Math.abs(meanX)).toBeLessThan(0.15);
    expect(Math.abs(meanY)).toBeLessThan(0.15);
  });

  it('is deterministic with a seeded rng', () => {
    const makeSeededRng = () => {
      let s = 0;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };
    const a = computeLayout(20, { spread: 2 }, makeSeededRng());
    const b = computeLayout(20, { spread: 2 }, makeSeededRng());
    expect(a).toEqual(b);
  });
});
