import { describe, it, expect } from 'vitest';
import {
  isPinching,
  pinchPosition,
  type HandLandmark,
} from '../../src/lib/gestureRecognizer';

// Build a 21-landmark hand where landmarks 4 (thumb tip) and 8 (index tip) are placed at given points.
// All other landmarks are zeroed — they don't matter for pinch detection.
function landmarksWithThumbIndex(
  thumb: { x: number; y: number; z?: number },
  index: { x: number; y: number; z?: number },
): HandLandmark[] {
  const arr: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  arr[4] = { x: thumb.x, y: thumb.y, z: thumb.z ?? 0 };
  arr[8] = { x: index.x, y: index.y, z: index.z ?? 0 };
  return arr;
}

describe('isPinching', () => {
  it('returns true when thumb and index are within threshold', () => {
    const lm = landmarksWithThumbIndex({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.51 });
    expect(isPinching(lm, 0.05)).toBe(true);
  });

  it('returns false when thumb and index are far apart', () => {
    const lm = landmarksWithThumbIndex({ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 });
    expect(isPinching(lm, 0.05)).toBe(false);
  });

  it('considers the z axis (3D distance, not just 2D)', () => {
    // x/y are identical but z differs → should NOT be pinching.
    const lm = landmarksWithThumbIndex({ x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0.2 });
    expect(isPinching(lm, 0.05)).toBe(false);
  });
});

describe('pinchPosition', () => {
  it('returns the midpoint of thumb and index tips', () => {
    const lm = landmarksWithThumbIndex({ x: 0.4, y: 0.6 }, { x: 0.6, y: 0.4 });
    const p = pinchPosition(lm);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });
});

import { GestureRecognizer, type HandData, type HandFrame } from '../../src/lib/gestureRecognizer';

function pinchedHand(handedness: 'Left' | 'Right', x = 0.5, y = 0.5): HandData {
  const landmarks = landmarksWithThumbIndex({ x, y }, { x: x + 0.01, y: y + 0.01 });
  return { landmarks, handedness };
}

function openHand(handedness: 'Left' | 'Right', x = 0.5, y = 0.5): HandData {
  const landmarks = landmarksWithThumbIndex({ x, y }, { x: x + 0.2, y });
  return { landmarks, handedness };
}

function frame(hands: HandData[], timestamp = 0): HandFrame {
  return { hands, timestamp };
}

describe('GestureRecognizer — single-hand pinch state machine', () => {
  it('emits no events when no hands present', () => {
    const r = new GestureRecognizer();
    expect(r.process(frame([]))).toEqual([]);
  });

  it('emits no events for an open hand', () => {
    const r = new GestureRecognizer();
    expect(r.process(frame([openHand('Right')]))).toEqual([]);
  });

  it('emits pinchStart on transition from open to pinch', () => {
    const r = new GestureRecognizer();
    r.process(frame([openHand('Right')]));
    const events = r.process(frame([pinchedHand('Right', 0.4, 0.6)], 16));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pinchStart');
    if (events[0].type === 'pinchStart') {
      expect(events[0].hand).toBe('Right');
      expect(events[0].position.x).toBeCloseTo(0.405, 2);
      expect(events[0].position.y).toBeCloseTo(0.605, 2);
    }
  });

  it('emits pinchMove with delta on subsequent pinch frames', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right', 0.5, 0.5)]));
    const events = r.process(frame([pinchedHand('Right', 0.6, 0.5)], 16));
    const move = events.find((e) => e.type === 'pinchMove');
    expect(move).toBeDefined();
    if (move && move.type === 'pinchMove') {
      expect(move.hand).toBe('Right');
      expect(move.delta.x).toBeCloseTo(0.1, 2);
      expect(move.delta.y).toBeCloseTo(0, 2);
    }
  });

  it('emits pinchEnd when a pinching hand opens', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right')]));
    const events = r.process(frame([openHand('Right')], 16));
    expect(events.some((e) => e.type === 'pinchEnd' && e.hand === 'Right')).toBe(true);
  });

  it('emits pinchEnd when a pinching hand disappears', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right')]));
    const events = r.process(frame([], 16));
    expect(events.some((e) => e.type === 'pinchEnd' && e.hand === 'Right')).toBe(true);
  });

  it('tracks left and right hands independently', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Left'), openHand('Right')]));
    const events = r.process(frame([pinchedHand('Left'), pinchedHand('Right')], 16));
    expect(events.some((e) => e.type === 'pinchStart' && e.hand === 'Right')).toBe(true);
    expect(events.some((e) => e.type === 'pinchStart' && e.hand === 'Left')).toBe(false);
  });
});
