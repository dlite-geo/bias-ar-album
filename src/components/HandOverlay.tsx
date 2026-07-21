import { useEffect, useRef } from 'react';
import { handTracker } from '../lib/handTracking';
import {
  PINCH_RATIO,
  isFist,
  isGrabAll,
  isPinchingScaled,
  palmWidth,
} from '../lib/gestureRecognizer';
import type { HandFrame, HandLandmark } from '../lib/gestureRecognizer';
import { useHandStore } from '../store/handStore';

// MediaPipe 21-landmark hand topology.
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

// Palm outline: wrist → thumb base → finger knuckles → back to wrist.
const PALM = [0, 1, 5, 9, 13, 17];

/**
 * Visualizes hands when the webcam feed itself is hidden (black/white background):
 *  - 'real': cuts the pixels around each tracked hand out of the (hidden) webcam frame
 *  - 'skeleton': glowing joints + bones from the 21 landmarks
 *  - 'emoji': a hand emoji following each hand, reflecting pinch/fist state
 * Landmarks arrive already mirrored, and are mapped to the viewport by stretch-fill —
 * the same mapping SpaceScene uses for interaction, so visuals line up with grabbing.
 */
export function HandOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!maskRef.current) maskRef.current = document.createElement('canvas');
    const mask = maskRef.current;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      mask.width = canvas.width;
      mask.height = canvas.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const unsub = handTracker.onFrame((frame) => drawFrame(ctx, mask, frame));

    return () => {
      window.removeEventListener('resize', resize);
      unsub();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  frame: HandFrame,
): void {
  const { handStyle, background } = useHandStore.getState();
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (frame.hands.length === 0) return;

  // Camera mode shows the real feed — 'real' style needs only the aim cursor, but the
  // skeleton/emoji styles draw on top of the video too.
  if (background === 'camera') {
    if (handStyle === 'skeleton') drawSkeletons(ctx, frame, W, H, false);
    else if (handStyle === 'emoji') drawEmojiHands(ctx, frame, W, H, false);
    drawPointerCursor(ctx, frame, W, H, false);
    return;
  }

  const onWhite = background === 'white';
  if (handStyle === 'real') drawRealHands(ctx, mask, frame, W, H, dpr);
  else if (handStyle === 'skeleton') drawSkeletons(ctx, frame, W, H, onWhite);
  else drawEmojiHands(ctx, frame, W, H, onWhite);

  // The grab point is the INDEX FINGERTIP, not the hand emoji/silhouette — draw a small
  // cursor ring there in the non-skeleton styles so aiming at a photo is precise.
  if (handStyle !== 'skeleton') drawPointerCursor(ctx, frame, W, H, onWhite);
}

/** Cut the webcam pixels around each hand out of the hidden video and composite them. */
function drawRealHands(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  frame: HandFrame,
  W: number,
  H: number,
  dpr: number,
): void {
  const video = handTracker.getVideoElement();
  if (!video || video.videoWidth === 0) return;
  const mctx = mask.getContext('2d');
  if (!mctx) return;

  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.globalCompositeOperation = 'source-over';
  mctx.clearRect(0, 0, W, H);

  // Feathered alpha mask that hugs the hand's actual silhouette: stroke the skeleton
  // with finger-thick round lines and fill the palm polygon. Far tighter than a convex
  // hull — the gaps between spread fingers (often your face behind them) stay masked out.
  mctx.filter = 'blur(6px)';
  mctx.strokeStyle = '#fff';
  mctx.fillStyle = '#fff';
  mctx.lineCap = 'round';
  mctx.lineJoin = 'round';
  for (const hand of frame.hands) {
    const pts = hand.landmarks.map((l) => ({ x: l.x * W, y: l.y * H }));
    const lw = Math.min(64, Math.max(14, palmWidth(hand.landmarks) * W * 0.45));
    mctx.lineWidth = lw;
    for (const [a, b] of CONNECTIONS) {
      mctx.beginPath();
      mctx.moveTo(pts[a].x, pts[a].y);
      mctx.lineTo(pts[b].x, pts[b].y);
      mctx.stroke();
    }
    mctx.beginPath();
    PALM.forEach((idx, i) => {
      if (i === 0) mctx.moveTo(pts[idx].x, pts[idx].y);
      else mctx.lineTo(pts[idx].x, pts[idx].y);
    });
    mctx.closePath();
    mctx.fill();
  }
  mctx.filter = 'none';

  // Keep video pixels only where the mask is opaque. The video is drawn mirrored and
  // stretch-filled so its pixels land exactly where the (mirrored) landmarks map.
  mctx.globalCompositeOperation = 'source-in';
  mctx.save();
  mctx.translate(W, 0);
  mctx.scale(-W / video.videoWidth, H / video.videoHeight);
  mctx.drawImage(video, 0, 0);
  mctx.restore();
  mctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(mask, 0, 0, W, H);
}

function drawSkeletons(
  ctx: CanvasRenderingContext2D,
  frame: HandFrame,
  W: number,
  H: number,
  onWhite: boolean,
): void {
  for (const hand of frame.hands) {
    const pts = hand.landmarks.map((l) => ({ x: l.x * W, y: l.y * H }));
    const pinching = isPinchingScaled(hand.landmarks, PINCH_RATIO);
    // 🤌 = space-rotation knob: the whole hand turns PURPLE while it's engaged.
    const knob = isGrabAll(hand.landmarks);
    const bone = knob
      ? 'rgba(168, 85, 247, 0.95)'
      : onWhite ? 'rgba(20, 90, 220, 0.85)' : 'rgba(110, 220, 255, 0.9)';
    const joint = knob ? '#c084fc' : onWhite ? '#1a56d6' : '#aef1ff';
    const glow = knob
      ? 'rgba(168, 85, 247, 0.85)'
      : onWhite ? 'rgba(20, 90, 220, 0.5)' : 'rgba(110, 220, 255, 0.8)';
    const pinchColor = onWhite ? '#e0338a' : '#ff7ad9';

    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = bone;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    pts.forEach((p, i) => {
      const tip = FINGERTIPS.has(i);
      // Highlight the pinch pair (thumb + index tip) while pinching.
      const active = pinching && (i === 4 || i === 8);
      ctx.fillStyle = active ? pinchColor : joint;
      ctx.beginPath();
      ctx.arc(p.x, p.y, active ? 8 : tip ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}

function drawPointerCursor(
  ctx: CanvasRenderingContext2D,
  frame: HandFrame,
  W: number,
  H: number,
  onWhite: boolean,
): void {
  for (const hand of frame.hands) {
    const tip = hand.landmarks[8];
    const pinching = isPinchingScaled(hand.landmarks, PINCH_RATIO);
    // 🤌 = space-rotation knob engaged → PURPLE ring, drawn at the gathered fingertips.
    const knob = isGrabAll(hand.landmarks);
    ctx.save();
    ctx.shadowColor = knob
      ? 'rgba(168, 85, 247, 0.9)'
      : onWhite ? 'rgba(20, 90, 220, 0.5)' : 'rgba(110, 220, 255, 0.8)';
    ctx.shadowBlur = knob ? 16 : 10;
    ctx.strokeStyle = knob
      ? '#a855f7'
      : pinching
        ? onWhite ? '#e0338a' : '#ff7ad9'
        : onWhite ? 'rgba(20, 90, 220, 0.9)' : 'rgba(174, 241, 255, 0.95)';
    ctx.lineWidth = knob ? 4 : 3;
    ctx.beginPath();
    ctx.arc(tip.x * W, tip.y * H, knob ? 14 : pinching ? 7 : 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawEmojiHands(
  ctx: CanvasRenderingContext2D,
  frame: HandFrame,
  W: number,
  H: number,
  _onWhite: boolean,
): void {
  for (const hand of frame.hands) {
    const emoji = pickEmoji(hand.landmarks);
    // Anchor at the index fingertip — the exact grab point — so aiming the emoji at a
    // photo and pinching grabs precisely what's under it.
    const tip = hand.landmarks[8];
    const size = Math.min(150, Math.max(56, palmWidth(hand.landmarks) * W * 1.3));
    ctx.save();
    ctx.translate(tip.x * W, tip.y * H);
    // Mirror the emoji for the left hand so both read naturally.
    if (hand.handedness === 'Left') ctx.scale(-1, 1);
    ctx.font = `${size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  }
}

function pickEmoji(landmarks: HandLandmark[]): string {
  if (isGrabAll(landmarks)) return '🤌';
  if (isFist(landmarks)) return '✊';
  if (isPinchingScaled(landmarks, PINCH_RATIO)) return '🤏';
  return '🖐️';
}
