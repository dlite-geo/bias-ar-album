# Hand Gesture Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add webcam-based hand-gesture control to PinViz so users can pan and zoom the 3D photo space with hand pinches. One-hand pinch-drag pans; two-hand pinch + spread/squeeze zooms. Mouse and trackpad stay functional in parallel — gesture is additive.

**Architecture:** MediaPipe `HandLandmarker` (browser-side WASM + WebGL) processes webcam frames at ~30 fps and yields 21 landmarks per detected hand. A pure `gestureRecognizer` module converts landmark frames into discrete gesture events (`pinchStart` / `pinchMove` / `pinchEnd` / `twoPinchStart` / `twoPinchMove` / `twoPinchEnd`). Events drive the same `targetCameraPos` and `targetOrbitTarget` Vec3 lerp targets that mouse input writes to — so gesture and mouse coexist without a mode switch. A small webcam preview renders in a HUD corner so the user can see what the camera sees.

**Tech Stack:** `@mediapipe/tasks-vision` (Google's HandLandmarker; ~3 MB WASM model loaded from Google's CDN), browser `getUserMedia` for webcam, existing Three.js + Zustand + React stack.

---

## File Structure

```
src/
├── lib/
│   ├── handTracking.ts        # NEW — HandTracker class: webcam + MediaPipe wrapper
│   └── gestureRecognizer.ts   # NEW — landmark frames → gesture events (pure, stateful, TDD'd)
├── store/
│   └── handStore.ts           # NEW — { enabled, status, error }
├── components/
│   ├── HandControl.tsx        # NEW — webcam preview + toggle UI + permission UX
│   ├── SpaceScene.tsx         # MODIFY — subscribe to gesture events, drive camera
│   ├── SpaceHud.tsx           # MODIFY — add 🖐 hand-control toggle pill
│   └── App.tsx                # MODIFY — mount HandControl alongside SpaceHud in space view
tests/lib/
└── gestureRecognizer.test.ts  # NEW — TDD pinch + two-pinch state machine
```

Pure logic (`gestureRecognizer`) gets full TDD coverage — pinch threshold, state machine, two-hand transitions are deterministic and benefit from tests. The MediaPipe wrapper (`handTracking`) is mostly browser-API plumbing — verified manually in the browser.

---

## Milestone A — Setup & store

### Task A1: Install MediaPipe + create handStore

**Files:**
- Modify: `package.json` (add dep)
- Create: `src/store/handStore.ts`

- [ ] **Step 1: Install `@mediapipe/tasks-vision`**

```bash
cd "/Users/omkar/Desktop/Fun Projects/triptrace"
npm install @mediapipe/tasks-vision
```

- [ ] **Step 2: Create `src/store/handStore.ts` with EXACTLY:**

```ts
import { create } from 'zustand';

export type HandStatus = 'off' | 'requesting-permission' | 'loading-model' | 'active' | 'error';

interface HandState {
  enabled: boolean;
  status: HandStatus;
  errorMessage: string | null;
  toggle: () => void;
  setStatus: (status: HandStatus, errorMessage?: string | null) => void;
}

export const useHandStore = create<HandState>((set) => ({
  enabled: false,
  status: 'off',
  errorMessage: null,
  toggle: () => set((s) => ({ enabled: !s.enabled, errorMessage: null })),
  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
}));
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/store/handStore.ts
git commit -m "feat: add mediapipe tasks-vision + handStore scaffold"
```

---

## Milestone B — Gesture recognition (TDD)

### Task B1: Pinch detection utility

**Files:**
- Test: `tests/lib/gestureRecognizer.test.ts`
- Create: `src/lib/gestureRecognizer.ts`

- [ ] **Step 1: Create `tests/lib/gestureRecognizer.test.ts` with EXACTLY:**

```ts
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
```

- [ ] **Step 2: Run tests (expect fail — module not found)**

```bash
npm test
```

Expected: FAIL with "Cannot find module '../../src/lib/gestureRecognizer'".

- [ ] **Step 3: Create `src/lib/gestureRecognizer.ts` with EXACTLY:**

```ts
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandData {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
}

export interface HandFrame {
  hands: HandData[];
  timestamp: number;
}

const THUMB_TIP = 4;
const INDEX_TIP = 8;

export function isPinching(landmarks: HandLandmark[], threshold: number): boolean {
  const t = landmarks[THUMB_TIP];
  const i = landmarks[INDEX_TIP];
  const dx = t.x - i.x;
  const dy = t.y - i.y;
  const dz = t.z - i.z;
  return dx * dx + dy * dy + dz * dz < threshold * threshold;
}

export function pinchPosition(landmarks: HandLandmark[]): { x: number; y: number } {
  const t = landmarks[THUMB_TIP];
  const i = landmarks[INDEX_TIP];
  return { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 };
}
```

- [ ] **Step 4: Run tests (expect pass — 4 tests)**

```bash
npm test
```

Expected: PASS — all gestureRecognizer tests + previous 8 tests = 12 total.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/gestureRecognizer.test.ts src/lib/gestureRecognizer.ts
git commit -m "feat: pinch detection utilities"
```

---

### Task B2: Single-hand pinch state machine

**Files:**
- Modify: `tests/lib/gestureRecognizer.test.ts` (append)
- Modify: `src/lib/gestureRecognizer.ts` (add class)

- [ ] **Step 1: Add helper builders + state-machine tests. Append EXACTLY this block to `tests/lib/gestureRecognizer.test.ts`:**

```ts
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
```

- [ ] **Step 2: Run tests (expect FAIL — `GestureRecognizer` not exported)**

```bash
npm test
```

Expected: FAIL — `GestureRecognizer is not a constructor` or similar.

- [ ] **Step 3: Add `GestureRecognizer` class. Append EXACTLY this block to `src/lib/gestureRecognizer.ts`:**

```ts
export type GestureEvent =
  | {
      type: 'pinchStart';
      hand: 'Left' | 'Right';
      position: { x: number; y: number };
    }
  | {
      type: 'pinchMove';
      hand: 'Left' | 'Right';
      position: { x: number; y: number };
      delta: { x: number; y: number };
    }
  | { type: 'pinchEnd'; hand: 'Left' | 'Right' }
  | {
      type: 'twoPinchStart';
      distance: number;
      center: { x: number; y: number };
    }
  | {
      type: 'twoPinchMove';
      distance: number;
      center: { x: number; y: number };
      distanceDelta: number;
    }
  | { type: 'twoPinchEnd' };

interface PinchState {
  active: boolean;
  position: { x: number; y: number } | null;
}

const PINCH_THRESHOLD = 0.06;

export class GestureRecognizer {
  private leftPinch: PinchState = { active: false, position: null };
  private rightPinch: PinchState = { active: false, position: null };
  private twoPinchActive = false;
  private twoPinchLastDistance = 0;

  process(frame: HandFrame): GestureEvent[] {
    const events: GestureEvent[] = [];

    const left = frame.hands.find((h) => h.handedness === 'Left');
    const right = frame.hands.find((h) => h.handedness === 'Right');

    this.processHand('Left', left, this.leftPinch, events);
    this.processHand('Right', right, this.rightPinch, events);

    this.processTwoPinch(events);

    return events;
  }

  private processHand(
    handedness: 'Left' | 'Right',
    hand: HandData | undefined,
    state: PinchState,
    events: GestureEvent[],
  ): void {
    const pinching = hand ? isPinching(hand.landmarks, PINCH_THRESHOLD) : false;
    const position = hand && pinching ? pinchPosition(hand.landmarks) : null;

    if (pinching && !state.active) {
      // open → pinch
      events.push({ type: 'pinchStart', hand: handedness, position: position! });
      state.active = true;
      state.position = position;
    } else if (pinching && state.active) {
      // pinch → pinch (move)
      const last = state.position!;
      const delta = { x: position!.x - last.x, y: position!.y - last.y };
      events.push({ type: 'pinchMove', hand: handedness, position: position!, delta });
      state.position = position;
    } else if (!pinching && state.active) {
      // pinch → open (or hand gone)
      events.push({ type: 'pinchEnd', hand: handedness });
      state.active = false;
      state.position = null;
    }
  }

  private processTwoPinch(events: GestureEvent[]): void {
    const both = this.leftPinch.active && this.rightPinch.active;
    if (both && !this.twoPinchActive) {
      const distance = pointDistance(this.leftPinch.position!, this.rightPinch.position!);
      const center = midpoint(this.leftPinch.position!, this.rightPinch.position!);
      events.push({ type: 'twoPinchStart', distance, center });
      this.twoPinchActive = true;
      this.twoPinchLastDistance = distance;
    } else if (both && this.twoPinchActive) {
      const distance = pointDistance(this.leftPinch.position!, this.rightPinch.position!);
      const center = midpoint(this.leftPinch.position!, this.rightPinch.position!);
      const distanceDelta = distance - this.twoPinchLastDistance;
      events.push({ type: 'twoPinchMove', distance, center, distanceDelta });
      this.twoPinchLastDistance = distance;
    } else if (!both && this.twoPinchActive) {
      events.push({ type: 'twoPinchEnd' });
      this.twoPinchActive = false;
    }
  }
}

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
npm test
```

Expected: 18+ tests pass (12 + 6 new state-machine tests + 1 left/right test).

- [ ] **Step 5: Commit**

```bash
git add tests/lib/gestureRecognizer.test.ts src/lib/gestureRecognizer.ts
git commit -m "feat: GestureRecognizer single-hand pinch state machine"
```

---

### Task B3: Two-hand pinch tests

**Files:**
- Modify: `tests/lib/gestureRecognizer.test.ts` (append)

The implementation already supports two-hand pinch (added in B2). This task locks in the behavior with tests.

- [ ] **Step 1: Append EXACTLY this block to `tests/lib/gestureRecognizer.test.ts`:**

```ts
describe('GestureRecognizer — two-hand pinch', () => {
  it('emits twoPinchStart only when BOTH hands pinch', () => {
    const r = new GestureRecognizer();
    // Just left pinching — no two-pinch event.
    let events = r.process(frame([pinchedHand('Left', 0.3, 0.5)]));
    expect(events.some((e) => e.type === 'twoPinchStart')).toBe(false);

    // Now both pinch.
    events = r.process(frame([pinchedHand('Left', 0.3, 0.5), pinchedHand('Right', 0.7, 0.5)], 16));
    const start = events.find((e) => e.type === 'twoPinchStart');
    expect(start).toBeDefined();
    if (start && start.type === 'twoPinchStart') {
      expect(start.distance).toBeCloseTo(0.4, 2);
      expect(start.center.x).toBeCloseTo(0.5, 2);
    }
  });

  it('emits twoPinchMove with positive distanceDelta when hands move apart', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Left', 0.4, 0.5), pinchedHand('Right', 0.6, 0.5)]));
    const events = r.process(
      frame([pinchedHand('Left', 0.3, 0.5), pinchedHand('Right', 0.7, 0.5)], 16),
    );
    const move = events.find((e) => e.type === 'twoPinchMove');
    expect(move).toBeDefined();
    if (move && move.type === 'twoPinchMove') {
      expect(move.distanceDelta).toBeGreaterThan(0);
    }
  });

  it('emits twoPinchMove with negative distanceDelta when hands move together', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Left', 0.3, 0.5), pinchedHand('Right', 0.7, 0.5)]));
    const events = r.process(
      frame([pinchedHand('Left', 0.4, 0.5), pinchedHand('Right', 0.6, 0.5)], 16),
    );
    const move = events.find((e) => e.type === 'twoPinchMove');
    expect(move).toBeDefined();
    if (move && move.type === 'twoPinchMove') {
      expect(move.distanceDelta).toBeLessThan(0);
    }
  });

  it('emits twoPinchEnd when one hand stops pinching', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Left', 0.3, 0.5), pinchedHand('Right', 0.7, 0.5)]));
    const events = r.process(frame([pinchedHand('Left', 0.3, 0.5), openHand('Right', 0.7, 0.5)], 16));
    expect(events.some((e) => e.type === 'twoPinchEnd')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests (expect PASS)**

```bash
npm test
```

Expected: 22+ tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/gestureRecognizer.test.ts
git commit -m "test: GestureRecognizer two-hand pinch behavior"
```

---

## Milestone C — Hand tracking infrastructure

### Task C1: HandTracker class

**Files:**
- Create: `src/lib/handTracking.ts`

This is the bridge to the browser: webcam stream + MediaPipe `HandLandmarker`. Verified manually in the browser since it depends on hardware (camera) and a remote model download.

- [ ] **Step 1: Create `src/lib/handTracking.ts` with EXACTLY:**

```ts
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { HandFrame, HandLandmark } from './gestureRecognizer';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

type FrameListener = (frame: HandFrame) => void;

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private listeners = new Set<FrameListener>();
  private running = false;
  private rafHandle: number | null = null;

  /**
   * Start webcam + load MediaPipe model. Resolves once tracking is live.
   * Throws if webcam permission denied or model fails to load.
   */
  async start(): Promise<void> {
    if (this.running) return;

    // 1. Webcam
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    // 2. MediaPipe model
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });

    // 3. Start frame loop
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle != null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  /**
   * Subscribe to landmark frames. Returns an unsubscribe function.
   */
  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns the underlying <video> element so a preview can render it.
   * Null if not started.
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  private tick = (): void => {
    if (!this.running || !this.landmarker || !this.video) return;
    if (this.video.readyState >= 2) {
      const result = this.landmarker.detectForVideo(this.video, performance.now());

      const hands = result.landmarks.map((landmarks, i) => ({
        // Mirror x so movement matches user's mental model (their right hand → world's right side).
        landmarks: landmarks.map(
          (l) => ({ x: 1 - l.x, y: l.y, z: l.z }) as HandLandmark,
        ),
        handedness: (result.handedness[i]?.[0]?.categoryName ?? 'Right') as 'Left' | 'Right',
      }));

      const frame: HandFrame = { hands, timestamp: performance.now() };
      this.listeners.forEach((l) => l(frame));
    }
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}

export const handTracker = new HandTracker();
```

- [ ] **Step 2: Verify build + tsc**

```bash
npm run build
npx tsc -b
```

Expected: build exit 0, tsc clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/handTracking.ts
git commit -m "feat: HandTracker — webcam + mediapipe HandLandmarker wrapper"
```

---

## Milestone D — UI

### Task D1: HandControl component

**Files:**
- Create: `src/components/HandControl.tsx`

Renders a small webcam preview in the bottom-right corner with status badge. Owns the lifecycle: when `useHandStore.enabled` flips true, calls `handTracker.start()`. Also mounts the `<video>` element so the user can see what the camera sees.

- [ ] **Step 1: Create `src/components/HandControl.tsx` with EXACTLY:**

```tsx
import { useEffect, useRef } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useHandStore } from '../store/handStore';
import { handTracker } from '../lib/handTracking';

const PREVIEW_WIDTH = 200;
const PREVIEW_HEIGHT = 150;

export function HandControl() {
  const enabled = useHandStore((s) => s.enabled);
  const status = useHandStore((s) => s.status);
  const errorMessage = useHandStore((s) => s.errorMessage);
  const setStatus = useHandStore((s) => s.setStatus);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      handTracker.stop();
      setStatus('off');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setStatus('requesting-permission');
        await handTracker.start();
        if (cancelled) {
          handTracker.stop();
          return;
        }
        setStatus('active');
        // Mount the video element into the preview slot.
        const video = handTracker.getVideoElement();
        if (video && previewRef.current) {
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'cover';
          // Mirror horizontally so the user sees themselves naturally.
          video.style.transform = 'scaleX(-1)';
          previewRef.current.appendChild(video);
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
              ? 'Camera permission denied. Enable it in your browser settings.'
              : err.message
            : 'Failed to start hand tracking.';
        setStatus('error', msg);
      }
    })();

    return () => {
      cancelled = true;
      handTracker.stop();
    };
  }, [enabled, setStatus]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      <FrostPanel
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          padding: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          ref={previewRef}
          style={{
            width: '100%',
            height: '100%',
            background: 'var(--surface-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {status !== 'active' && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-md)' }}>
              {status === 'requesting-permission' && 'Asking for camera…'}
              {status === 'loading-model' && 'Loading model…'}
              {status === 'error' && '⚠ Camera unavailable'}
              {status === 'off' && '—'}
            </span>
          )}
        </div>
      </FrostPanel>
      {errorMessage && (
        <FrostPanel style={{ padding: '8px 12px', maxWidth: PREVIEW_WIDTH }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-system-red)' }}>
            {errorMessage}
          </span>
        </FrostPanel>
      )}
      <FrostPanel style={{ padding: '6px 10px' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>
          🖐 Pinch to pan · 🤲 Two-hand pinch to zoom
        </span>
      </FrostPanel>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/HandControl.tsx
git commit -m "feat: HandControl preview component + lifecycle"
```

---

### Task D2: SpaceHud toggle pill

**Files:**
- Modify: `src/components/SpaceHud.tsx`

Add a "🖐 Hands" pill that toggles `useHandStore.enabled`. Place it between the Reset View pill and the Save Space pill (or at the end if Save isn't visible).

- [ ] **Step 1: Read current `src/components/SpaceHud.tsx` to confirm structure.**

```bash
cat src/components/SpaceHud.tsx
```

- [ ] **Step 2: Modify SpaceHud. Find this exact block:**

```tsx
        <FrostPanel style={{ padding: '8px 14px' }}>
          <button
            onClick={triggerReset}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            ⊙ Reset view
          </button>
        </FrostPanel>
```

REPLACE with EXACTLY:

```tsx
        <FrostPanel style={{ padding: '8px 14px' }}>
          <button
            onClick={triggerReset}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            ⊙ Reset view
          </button>
        </FrostPanel>
        <FrostPanel style={{ padding: '8px 14px' }}>
          <button
            onClick={toggleHand}
            style={{
              background: 'transparent',
              border: 'none',
              color: handEnabled ? 'var(--color-accent)' : 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              fontWeight: handEnabled ? 600 : 400,
            }}
          >
            🖐 Hands
          </button>
        </FrostPanel>
```

- [ ] **Step 3: Add the imports + hook reads at the top of the component. Find this line:**

```tsx
import { usePhotoStore } from '../store/photoStore';
```

REPLACE with EXACTLY:

```tsx
import { usePhotoStore } from '../store/photoStore';
import { useHandStore } from '../store/handStore';
```

- [ ] **Step 4: Add the hand-store reads. Find this exact block (in the SpaceHud function body, just after the existing store reads):**

```tsx
  const setView = useViewStore((s) => s.setView);
  const triggerReset = useViewStore((s) => s.triggerReset);
  const photos = usePhotoStore((s) => s.photos);
```

REPLACE with EXACTLY:

```tsx
  const setView = useViewStore((s) => s.setView);
  const triggerReset = useViewStore((s) => s.triggerReset);
  const photos = usePhotoStore((s) => s.photos);
  const handEnabled = useHandStore((s) => s.enabled);
  const toggleHand = useHandStore((s) => s.toggle);
```

- [ ] **Step 5: Verify build + tsc**

```bash
npm run build
npx tsc -b
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/SpaceHud.tsx
git commit -m "feat: 🖐 Hands toggle in SpaceHud"
```

---

### Task D3: Mount HandControl in App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read current `src/App.tsx`.**

```bash
cat src/App.tsx
```

- [ ] **Step 2: Find this block:**

```tsx
        {view === 'space' && (
          <>
            <SpaceScene />
            <SpaceHud />
            <PhotoLightbox />
          </>
        )}
```

REPLACE with EXACTLY:

```tsx
        {view === 'space' && (
          <>
            <SpaceScene />
            <SpaceHud />
            <HandControl />
            <PhotoLightbox />
          </>
        )}
```

- [ ] **Step 3: Add import. Find this line:**

```tsx
import { LoadingSpaceScreen } from './components/LoadingSpaceScreen';
```

REPLACE with EXACTLY:

```tsx
import { LoadingSpaceScreen } from './components/LoadingSpaceScreen';
import { HandControl } from './components/HandControl';
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount HandControl in space view"
```

---

## Milestone E — Camera integration

### Task E1: Wire pinch-drag to performPan, two-pinch to zoom

**Files:**
- Modify: `src/components/SpaceScene.tsx`

The hand tracker streams frames; we feed them into a `GestureRecognizer` instance and route the resulting events into the existing `performPan` and zoom helpers. We also need access to those helpers — they're currently defined inside `useEffect`. We'll wire up gesture handling INSIDE the same effect so they share the same closure.

Tuning constants:
- **PAN_SCALE** — converts normalized hand coordinates [0..1] to screen pixels. We want a small hand movement to feel like a meaningful drag. Roughly `canvas.clientWidth * 1.5` per unit gives natural-feeling pan speed.
- **ZOOM_GAIN** — converts inter-hand distance change to zoom factor. `1 + distanceDelta * 4` typically; clamped sane.

- [ ] **Step 1: Modify `src/components/SpaceScene.tsx`. Find this block (the imports near the top of the file):**

```tsx
import { computeLayout } from '../lib/computeLayout';
import { usePhotoStore } from '../store/photoStore';
```

REPLACE with EXACTLY:

```tsx
import { computeLayout } from '../lib/computeLayout';
import { usePhotoStore } from '../store/photoStore';
import { useHandStore } from '../store/handStore';
import { handTracker } from '../lib/handTracking';
import { GestureRecognizer } from '../lib/gestureRecognizer';
```

- [ ] **Step 2: Find this block (the useEffect cleanup return — the existing wheel-event setup is right above it). Look for where the wheel listener is added:**

```tsx
    canvas.addEventListener('wheel', onWheel, { passive: false });
```

Right AFTER that line, add EXACTLY:

```tsx

    // ----- Hand-gesture input (parallel to mouse) -----
    const recognizer = new GestureRecognizer();
    const PAN_SCALE_X = canvas.clientWidth * 1.5;
    const PAN_SCALE_Y = canvas.clientHeight * 1.5;
    const ZOOM_GAIN = 4;

    const unsubFrames = handTracker.onFrame((frame) => {
      const events = recognizer.process(frame);
      for (const ev of events) {
        if (ev.type === 'pinchMove') {
          // Normalized delta → screen-pixel delta → world pan.
          // Negate y because pinch space (image) y goes down, screen y goes down — but our
          // performPan expects screen-pixel deltas where positive y means "drag down" = world up.
          // The signs match. We do, however, negate x because we mirror the webcam in HandTracker.
          performPan(-ev.delta.x * PAN_SCALE_X, ev.delta.y * PAN_SCALE_Y);
        } else if (ev.type === 'twoPinchMove') {
          // distanceDelta > 0 (hands moving apart) → zoom IN.
          // Synthesize a wheel-style deltaY so we reuse performZoom: negative deltaY = zoom in.
          const fakeDeltaY = -ev.distanceDelta * 1000;
          performZoom(fakeDeltaY, 100 / ZOOM_GAIN);
        }
      }
    });
```

- [ ] **Step 3: Find the cleanup return block:**

```tsx
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      unsubReset();
      controlsBundle.dispose();
      cards.forEach((c) => c.dispose());
      bundle.dispose();
    };
```

REPLACE with EXACTLY:

```tsx
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      unsubFrames();
      unsubReset();
      controlsBundle.dispose();
      cards.forEach((c) => c.dispose());
      bundle.dispose();
    };
```

- [ ] **Step 4: Note — `useHandStore` import is added but not used directly in SpaceScene. Remove it from the import list to avoid an unused-locals error. Find this line:**

```tsx
import { useHandStore } from '../store/handStore';
```

REPLACE with EXACTLY (delete the line):

```tsx
```

(Empty replacement — remove the line entirely.)

- [ ] **Step 5: Verify build + tsc**

```bash
npm run build
npx tsc -b
```

Expected: exit 0, no errors.

- [ ] **Step 6: Verify tests still pass**

```bash
npm test
```

Expected: 22+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/SpaceScene.tsx
git commit -m "feat: wire pinch-drag to pan, two-hand pinch to zoom"
```

---

## Milestone F — Manual verification

### Task F1: End-to-end browser test

There's no automation for webcam + WebGL behavior. Verify by running the dev server.

- [ ] **Step 1: Start dev server**

```bash
nohup npm run dev > /tmp/pinviz-dev.log 2>&1 &
sleep 3
curl -sI http://localhost:5173/ | head -1
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 2: Manual checks (controller hands back to user)**

The user opens http://localhost:5173 in a browser and verifies:

1. Sign in → drop a small batch of photos → space view appears.
2. Click the **🖐 Hands** pill in the top-left HUD.
3. Browser prompts for camera permission. Allow.
4. After ~1–3 sec a webcam preview appears in the bottom-right corner (mirrored — your hands look right-handed where they actually are right-handed).
5. **Pinch test:** put your thumb and index finger together, hold. The cursor should "grab" — moving the pinch around should pan the photo cloud. Release fingers → pan stops.
6. **Two-hand zoom test:** pinch with both hands simultaneously. Pull hands apart → zoom in. Bring hands together → zoom out.
7. Mouse should still work alongside hand gestures (drag with mouse pans; scroll wheel zooms).
8. Toggle 🖐 Hands again to turn off — webcam preview disappears, camera light should turn off.
9. Open DevTools console → no errors.

- [ ] **Step 3: Stop dev server**

```bash
pkill -f vite || true
```

---

## Self-Review Notes

**Spec coverage:**
- Webcam + MediaPipe → handTracking.ts ✓
- Pinch detection → gestureRecognizer.ts (TDD) ✓
- Two-hand pinch zoom → twoPinch state machine + tests ✓
- Mouse coexists with hand → both write to same camera lerp targets ✓
- Webcam preview → HandControl ✓
- HUD toggle → SpaceHud 🖐 Hands pill ✓
- Permission UX + error states → HandControl status badges ✓

**Out of scope (intentional):**
- Index-fingertip pointing for hover
- Pinch-tap click (open lightbox via gesture)
- Reset gesture (palms-down, etc.)
- Mobile/touch gesture support
- Calibration / onboarding screen
- Spectator mode for demos

**Type consistency:**
- `HandFrame`, `HandData`, `HandLandmark` defined in B1, used consistently in C1 (`HandTracker`) and re-exported via the recognizer module.
- `GestureEvent` discriminated union defined in B2; matched on `type` in E1.
- Mirror handling: `HandTracker.tick` flips `x` once (so user's right hand → world's right side), then `SpaceScene.E1` negates `x` again to match expected pan direction (right-hand pinch moving right pans world right).

**Placeholder scan:** No TBDs, no "implement later".

**Tuning knobs (for later iteration):**
- `PINCH_THRESHOLD = 0.06` (gestureRecognizer.ts) — distance below which thumb+index count as pinching
- `PAN_SCALE_X / PAN_SCALE_Y = canvas * 1.5` (SpaceScene.tsx) — converts normalized hand delta to pan pixels
- `ZOOM_GAIN = 4` (SpaceScene.tsx) — sensitivity of two-hand zoom
- `numHands: 2` (handTracking.ts) — could go to 1 if perf becomes an issue
