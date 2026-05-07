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
