import { useEffect, useRef, useState } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { handTracker } from '../lib/handTracking';
import type { HandData } from '../lib/gestureRecognizer';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

interface SmoothedFace {
  x: number;
  y: number;
  size: number;
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface FaceCandidate extends SmoothedFace {
  overlapsHand: boolean;
}

function faceRect(face: SmoothedFace): ScreenRect {
  const half = face.size / 2;
  return {
    left: face.x - half,
    right: face.x + half,
    top: face.y - half,
    bottom: face.y + half,
  };
}

function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function handRect(hand: HandData, W: number, H: number): ScreenRect {
  const points = hand.landmarks.map((l) => ({ x: l.x * W, y: l.y * H }));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const pad = Math.max(22, Math.max(right - left, bottom - top) * 0.18);
  return {
    left: left - pad,
    top: top - pad,
    right: right + pad,
    bottom: bottom + pad,
  };
}

function nearestFace(face: SmoothedFace, faces: SmoothedFace[]): { face: SmoothedFace | null; dist: number } {
  let best: SmoothedFace | null = null;
  let bestDist = Infinity;
  for (const p of faces) {
    const dist = Math.hypot(p.x - face.x, p.y - face.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return { face: best, dist: bestDist };
}

/**
 * Privacy layer for camera-background mode: detects faces in the live webcam feed and
 * covers each one with an emoji. The emoji is rendered as DOM text instead of a canvas
 * drawing so it stays fully non-interactive and out of hit-testing.
 */
export function FaceEmojiLayer({ emoji = '😎' }: { emoji?: string }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const latestHandsRef = useRef<HandData[]>([]);
  const [faces, setFaces] = useState<SmoothedFace[]>([]);

  useEffect(() => {
    if (!layerRef.current) return;

    let detector: FaceDetector | null = null;
    let raf = 0;
    let cancelled = false;
    let smoothed: SmoothedFace[] = [];
    let staleFrames = 0;
    const STALE_HOLD_FRAMES = 60;

    const unsubHands = handTracker.onFrame((frame) => {
      latestHandsRef.current = frame.hands;
    });

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const video = handTracker.getVideoElement();
      if (!detector || !video || video.readyState < 2) return;

      const W = window.innerWidth;
      const H = window.innerHeight;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) return;

      const result = detector.detectForVideo(video, performance.now());

      // The visible video is object-fit: cover + mirrored; replicate that mapping so the
      // emoji lands exactly on the on-screen face.
      const scale = Math.max(W / vw, H / vh);
      const offsetX = (W - vw * scale) / 2;
      const offsetY = (H - vh * scale) / 2;
      const handRects = latestHandsRef.current.map((hand) => handRect(hand, W, H));
      const prevOccluded = smoothed.some((face) =>
        handRects.some((rect) => rectsOverlap(faceRect(face), rect)),
      );
      const targets: FaceCandidate[] = result.detections.flatMap((d) => {
        const box = d.boundingBox;
        if (!box) return [];
        const faceRect: ScreenRect = {
          left: W - (offsetX + (box.originX + box.width) * scale),
          right: W - (offsetX + box.originX * scale),
          top: offsetY + box.originY * scale,
          bottom: offsetY + (box.originY + box.height) * scale,
        };
        return [
          {
            x: W - (offsetX + (box.originX + box.width / 2) * scale),
            y: offsetY + (box.originY + box.height / 2) * scale,
            size: Math.max(box.width, box.height) * scale * 1.9,
            overlapsHand: handRects.some((rect) => rectsOverlap(faceRect, rect)),
          },
        ];
      });

      if (targets.length === 0) {
        if (smoothed.length > 0 && prevOccluded) {
          staleFrames = 0;
          if (!cancelled) setFaces(smoothed);
          return;
        }
        staleFrames++;
        if (smoothed.length > 0 && staleFrames < STALE_HOLD_FRAMES) {
          if (!cancelled) setFaces(smoothed);
          return;
        }
        smoothed = [];
        if (!cancelled) setFaces([]);
        return;
      }
      staleFrames = 0;

      // Match against the previous frame so a hand crossing the face keeps covering the
      // same spot, but new hand-shaped false positives are ignored if there is no nearby
      // face to anchor them.
      const prevFaces = smoothed;
      const remaining = [...prevFaces];
      const nextFaces = targets.flatMap((t) => {
        const { face: prev, dist } = nearestFace(t, remaining);
        if (prev) {
          const index = remaining.indexOf(prev);
          if (index >= 0) remaining.splice(index, 1);
        }

        if (t.overlapsHand) {
          if (!prev || dist > 240) return [];
          const a = 0.08;
          return [
            {
              x: prev.x + (t.x - prev.x) * a,
              y: prev.y + (t.y - prev.y) * a,
              size: prev.size + (t.size - prev.size) * a,
            },
          ];
        }

        if (!prev || dist > 220) return [t];
        const a = 0.35;
        return [
          {
            x: prev.x + (t.x - prev.x) * a,
            y: prev.y + (t.y - prev.y) * a,
            size: prev.size + (t.size - prev.size) * a,
          },
        ];
      });

      const preservedFaces = remaining.filter((face) =>
        handRects.some((rect) => rectsOverlap(faceRect(face), rect)),
      );
      const nextState = [...nextFaces, ...preservedFaces];

      if (nextState.length === 0) {
        if (smoothed.length > 0 && prevOccluded) {
          staleFrames = 0;
          if (!cancelled) setFaces(smoothed);
          return;
        }
        staleFrames++;
        if (smoothed.length > 0 && staleFrames < STALE_HOLD_FRAMES) {
          if (!cancelled) setFaces(smoothed);
          return;
        }
        smoothed = [];
        if (!cancelled) setFaces([]);
        return;
      }

      staleFrames = 0;
      smoothed = nextState;
      if (!cancelled) setFaces(nextState);
    };

    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        const d = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
        });
        if (cancelled) {
          d.close();
          return;
        }
        detector = d;
        loop();
      } catch {
        // Face cover is best-effort — if the model fails to load, the app still works.
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      unsubHands();
      detector?.close();
      detector = null;
      smoothed = [];
      staleFrames = 0;
      setFaces([]);
    };
  }, []);

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        touchAction: 'none',
        isolation: 'isolate',
      }}
    >
      {faces.map((f, index) => (
        <span
          key={`face-${index}`}
          style={{
            position: 'absolute',
            left: f.x,
            top: f.y,
            transform: 'translate(-50%, -50%)',
            fontSize: `${f.size}px`,
            lineHeight: 1,
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif',
            filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.24))',
            willChange: 'transform',
            whiteSpace: 'nowrap',
          }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}
