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
    // Higher resolution — the feed is now the full-screen AR background, not a thumbnail.
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
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
      // Higher confidence floors → steadier landmarks and fewer phantom pinches.
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
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
    // Browsers pause media elements that get detached from the document; if that
    // happens (e.g. during a background-mode switch) resume so tracking never stalls.
    if (this.video.paused) void this.video.play().catch(() => {});
    if (this.video.readyState >= 2) {
      const result = this.landmarker.detectForVideo(this.video, performance.now());

      const hands = result.landmarks.map((landmarks, i) => ({
        // Mirror x so movement matches user's mental model (their right hand → world's right side).
        landmarks: landmarks.map(
          (l) => ({ x: 1 - l.x, y: l.y, z: l.z }) as HandLandmark,
        ),
        handedness: (result.handedness[i]?.[0]?.categoryName ?? 'Right') as 'Left' | 'Right',
      }));

      // MediaPipe occasionally detects ONE physical hand twice — two overlapping
      // detections read as "two hands" and fired two-hand gestures from a single hand.
      // If the two hand centers nearly coincide, keep only the first.
      if (hands.length === 2) {
        const a = hands[0].landmarks[9];
        const b = hands[1].landmarks[9];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.12) hands.pop();
      }

      // MediaPipe sometimes labels both hands identically on mirrored feeds, which made
      // the second hand invisible to two-hand gestures (resize/zoom/twist). Disambiguate
      // by position: in the mirrored view your right hand appears on the right.
      if (hands.length === 2 && hands[0].handedness === hands[1].handedness) {
        const [a, b] = hands;
        if (a.landmarks[9].x < b.landmarks[9].x) {
          a.handedness = 'Left';
          b.handedness = 'Right';
        } else {
          a.handedness = 'Right';
          b.handedness = 'Left';
        }
      }

      const frame: HandFrame = { hands, timestamp: performance.now() };
      this.listeners.forEach((l) => l(frame));
    }
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}

export const handTracker = new HandTracker();
