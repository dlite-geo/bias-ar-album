import { useEffect, useRef, useState } from 'react';
import {
  Group,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
  type Intersection,
} from 'three';
import { FrostPanel } from './ui/FrostPanel';
import { createScene } from '../three/createScene';
import { createPhotoCard, type PhotoCard } from '../three/createPhotoCard';
import { setupControls } from '../three/orbitControlsFactory';
import { computeLayout, type PhotoSlot } from '../lib/computeLayout';
import { usePhotoStore } from '../store/photoStore';
import { handTracker } from '../lib/handTracking';
import {
  GestureRecognizer,
  type FrameSnapshot,
  type HandSnapshot,
} from '../lib/gestureRecognizer';
import { useViewStore } from '../store/viewStore';
import { useHandStore } from '../store/handStore';

const ZOOM_STEP = 0.86;          // each scroll tick multiplies distance by this (or its inverse)
const ZOOM_LERP = 0.25;          // smoothing factor — closer to 1 = snappier, closer to 0 = lazier
const MIN_DISTANCE = 0.05;
const MAX_DISTANCE = 5000;
const TARGET_LERP = 0.18;        // smoothing for the controls.target shift

export function SpaceScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragHintTimerRef = useRef<number | null>(null);
  const controlModeRef = useRef(useHandStore.getState().controlMode);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);
  const [dragHint, setDragHint] = useState<string | null>(null);

  const clearDragHint = () => {
    if (dragHintTimerRef.current != null) {
      window.clearTimeout(dragHintTimerRef.current);
      dragHintTimerRef.current = null;
    }
    setDragHint(null);
  };

  const setPersistentDragHint = (message: string) => {
    clearDragHint();
    setDragHint(message);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bundle = createScene(canvas);
    const { scene, camera, composer, outline, outlineBack, resize } = bundle;

    // Front/would-grab highlight is red; occluded-behind candidates are yellow.
    outline.visibleEdgeColor.set(0xff2b2b);
    outline.hiddenEdgeColor.set(0xff2b2b).multiplyScalar(0.3);
    outlineBack.visibleEdgeColor.set(0xffd60a);
    outlineBack.hiddenEdgeColor.set(0xffd60a).multiplyScalar(0.3);

    const cardsRoot = new Group();
    scene.add(cardsRoot);

    const cards: PhotoCard[] = [];
    const cardIndex = new Map<PhotoCard, number>();
    const bakedScales: number[] = [];
    // Keep every card inside a view cone with enough slack for drift and throw bounces.
    const spread = Math.max(3, Math.cbrt(Math.max(photos.length, 1)) * 1.55);
    const cameraDistance = Math.max(8, spread * 5.5);
    const pureHalfTan = Math.tan((45 / 2) * (Math.PI / 180)); // fov 45°
    const halfTan = pureHalfTan * 0.8; // extra slack for narrow windows
    const cardMargin = 1.0; // half-diagonal of a default card
    const DRIFT_AMP = 0.55;
    // Placements live inside the camera's view CONE, not a small central sphere:
    // anywhere on screen is a valid parking spot — even right up close to the camera,
    // as long as it stays inside the cone (a photo pulled to your face parks there).
    // The carousel spins around the view axis (z), which preserves both z and the
    // distance from that axis, so anything inside the cone STAYS inside while spinning —
    // photos can never rotate off screen.
    const zMin = -spread * 0.8; // don't drift far behind the cloud
    const zMax = cameraDistance - 2.5; // can come almost all the way to the camera
    const xyMaxAt = (z: number): number =>
      Math.max(0.2, (cameraDistance - z) * halfTan - cardMargin);
    const clampToView = (v: Vector3): Vector3 => {
      v.z = Math.max(zMin, Math.min(zMax, v.z));
      const maxXy = xyMaxAt(v.z);
      const xy = Math.hypot(v.x, v.y);
      if (xy > maxXy) {
        const sc = maxXy / xy;
        v.x *= sc;
        v.y *= sc;
      }
      return v;
    };
    // Each card's current anchor. The "중앙 모으기" button restores originalHomes.
    const homePositions: Vector3[] = [];
    const originalHomes: Vector3[] = [];

    const layoutAnchors = [
      { x: -0.78, y: -0.52 },
      { x: 0.0, y: -0.64 },
      { x: 0.76, y: -0.46 },
      { x: -0.92, y: -0.06 },
      { x: -0.18, y: 0.0 },
      { x: 0.22, y: 0.08 },
      { x: 0.92, y: 0.02 },
      { x: -0.60, y: 0.55 },
      { x: 0.0, y: 0.68 },
      { x: 0.66, y: 0.5 },
    ];
    const layoutOrder = layoutAnchors.map((_, i) => i);
    for (let i = layoutOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [layoutOrder[i], layoutOrder[j]] = [layoutOrder[j], layoutOrder[i]];
    }

    // Default arrangement: a loose scatter that keeps photos distributed across the
    // screen instead of pinning them to a single orbit.
    const buildFreeLayout = (count: number): PhotoSlot[] => {
      const base = computeLayout(count, {
        spread: spread * 0.85,
        depthRatio: 0.75,
        scaleMin: 0.55,
        scaleMax: 1.15,
        minXyDistance: 0.9,
      });
      const maxXy = xyMaxAt(0);
      return base.map((slot, i) => {
        const anchor = layoutAnchors[layoutOrder[i % layoutOrder.length]];
        const anchorScale = maxXy * (0.48 + Math.random() * 0.28);
        const x = anchor.x * anchorScale + slot.position.x * 0.16;
        const y = anchor.y * anchorScale + slot.position.y * 0.16;
        const z = slot.position.z + (Math.random() - 0.5) * spread * 0.55;
        const pos = clampToView(new Vector3(x, y, z));
        return {
          index: slot.index,
          position: { x: pos.x, y: pos.y, z: pos.z },
          scale: slot.scale * (0.88 + Math.random() * 0.22),
        };
      });
    };

    let slots = usePhotoStore.getState().layout;
    if (photos.length > 0) {
      slots =
        slots && slots.length === photos.length ? slots : buildFreeLayout(photos.length);
      // Stash the live layout so drop-to-place repositioning sticks for the session.
      usePhotoStore.getState().setLayout(slots);
      for (let i = 0; i < photos.length; i++) {
        const slot = slots[i];
        const card = createPhotoCard(photos[i], slot.scale);
        const { x, y, z } = slot.position;
        const pos = clampToView(new Vector3(x, y, z));
        card.group.position.copy(pos);
        homePositions.push(pos.clone());
        originalHomes.push(pos.clone());
        cardsRoot.add(card.group);
        cards.push(card);
        cardIndex.set(card, i);
        bakedScales.push(slot.scale);
      }
    }

    if (cards.length > 0) {
      camera.position.set(0, 0, cameraDistance);
      camera.lookAt(0, 0, 0);
    }

    // Snow-globe drift: each card gets its own tiny orbital basis so the whole cloud
    // feels like many different specks of dust, not one uniform wobble.
    const driftParams = cards.map(() => {
      const u = new Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      const ref = Math.abs(u.z) < 0.85 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
      const v = new Vector3().crossVectors(u, ref).normalize();
      const w = new Vector3().crossVectors(u, v).normalize();
      return {
        u,
        v,
        w,
        ax: DRIFT_AMP * (0.22 + Math.random() * 0.22),
        ay: DRIFT_AMP * (0.12 + Math.random() * 0.18),
        az: DRIFT_AMP * (0.18 + Math.random() * 0.28),
        fx: 0.16 + Math.random() * 0.22,
        fy: 0.11 + Math.random() * 0.19,
        fz: 0.08 + Math.random() * 0.15,
        px: Math.random() * Math.PI * 2,
        py: Math.random() * Math.PI * 2,
        pz: Math.random() * Math.PI * 2,
      };
    });
    // Per-card drift strength 0→1 — reset to 0 when a card is dropped so it eases back
    // into floating from exactly where it was released, without a visible hop.
    const driftEase: number[] = cards.map(() => 1);
    // Global drift damper (observer effect) — read via accessor because the value is
    // owned by the interaction section below.
    const driftDampRef = () => driftDamp;
    const driftVec = new Vector3();
    const driftOffset = (i: number, t: number): Vector3 => {
      const d = driftParams[i];
      const waveA = Math.sin(t * d.fx + d.px);
      const waveB = Math.sin(t * d.fy + d.py);
      const waveC = Math.sin(t * d.fz + d.pz);
      return driftVec
        .set(0, 0, 0)
        .addScaledVector(d.u, waveA * d.ax)
        .addScaledVector(d.v, waveB * d.ay)
        .addScaledVector(d.w, waveC * d.az)
        .multiplyScalar(driftEase[i] * driftDampRef());
    };

    const controlsBundle = setupControls(camera, canvas);
    controlsBundle.controls.target.set(0, 0, 0);
    controlsBundle.controls.update();

    // ---- Smooth zoom state ----
    let targetDistance = camera.position.distanceTo(controlsBundle.controls.target);
    const targetTarget = controlsBundle.controls.target.clone();
    const rootInvQuat = new Quaternion();

    // Capture the initial framing so the Reset button can snap back to it.
    const initialDistance = targetDistance;
    const initialTarget = targetTarget.clone();
    // Cards animating back toward a target position (gather button / out-of-bounds drop).
    const returnTargets = new Map<PhotoCard, Vector3>();
    // When a full reset unwinds the cloud, this flag eases the rotation back to identity.
    let unwindRotation = false;
    const identityQuat = new Quaternion();
    // A freshly activated camera stream needs a short warm-up window before pinch-grabs
    // feel reliable. During that time we confirm grabs on the first stable frame.
    let grabWarmupUntil = 0;
    const refreshGrabWarmup = () => {
      grabWarmupUntil = performance.now() + 2400;
    };
    if (useHandStore.getState().status === 'active') refreshGrabWarmup();

    const unsubHandMode = useHandStore.subscribe((state, prev) => {
      if (state.controlMode !== prev.controlMode) {
        controlModeRef.current = state.controlMode;
      }
    });
    const unsubHandStatus = useHandStore.subscribe((state, prev) => {
      if (state.status === 'active' && prev.status !== 'active') {
        refreshGrabWarmup();
      }
    });

    const unsubReset = useViewStore.subscribe((state, prev) => {
      if (state.resetCounter !== prev.resetCounter) {
        targetDistance = initialDistance;
        targetTarget.copy(initialTarget);
        grabSuppressionFrames = 0;
        clearPendingGrabs();
      }
      if (state.fullResetCounter !== prev.fullResetCounter) {
        // FULL reset: drop anything held, restore every photo's original slot, original
        // size and rotation, unwind the space, and reframe the camera.
        if (held) {
          cardsRoot.attach(held.card.group);
          held = null;
          heldSecond = false;
        }
        clearDragHint();
        spinMomentumX = 0;
        spinMomentumZ = 0;
        spinCooldown = 0;
        knob = null;
        knobTarget = null;
        knobFrames = 0;
        zoomVel = 0;
        zoomReturnPending = false;
        zoomReturnDelayUntil = 0;
        zoomReturnStartedAt = 0;
        zoomReturnFromDistance = initialDistance;
        grabSuppressionFrames = 0;
        clearPendingGrabs();
        flying.clear();
        heldVelocity.set(0, 0, 0);
        heldHasPrev = false;
        returnTargets.clear();
        unwindRotation = true;
        targetDistance = initialDistance;
        targetTarget.copy(initialTarget);
        rollAngles.clear();
        for (const c of cards) {
          c.group.scale.setScalar(1);
          const idx = cardIndex.get(c);
          if (idx == null) continue;
          homePositions[idx] = originalHomes[idx].clone();
          returnTargets.set(c, homePositions[idx]);
        }
      }
      if (state.gatherCounter !== prev.gatherCounter) {
        // Gather: every card glides back to its original slot, but the camera framing
        // and current cloud orientation stay as they are.
        if (held) {
          cardsRoot.attach(held.card.group);
          held = null;
          heldSecond = false;
          heldHasPrev = false;
        }
        spinMomentumX = 0;
        spinMomentumZ = 0;
        spinCooldown = 0;
        knob = null;
        knobTarget = null;
        knobFrames = 0;
        zoomVel = 0;
        zoomReturnPending = false;
        zoomReturnDelayUntil = 0;
        zoomReturnStartedAt = 0;
        zoomReturnFromDistance = initialDistance;
        grabSuppressionFrames = 0;
        clearPendingGrabs();
        flying.clear();
        unwindRotation = false;
        clearDragHint();
        for (const c of cards) {
          const idx = cardIndex.get(c);
          if (idx == null) continue;
          homePositions[idx] = originalHomes[idx].clone();
          driftEase[idx] = 0;
          returnTargets.set(c, homePositions[idx]);
        }
      }
      if (state.shuffleCounter !== prev.shuffleCounter) {
        // Shuffle: regenerate a new scatter and animate every card into the fresh layout.
        if (held) {
          cardsRoot.attach(held.card.group);
          held = null;
          heldSecond = false;
        }
        grabSuppressionFrames = 0;
        clearPendingGrabs();
        spinMomentumX = 0;
        spinMomentumZ = 0;
        spinCooldown = 0;
        knob = null;
        knobTarget = null;
        knobFrames = 0;
        knobMissing = 0;
        zoomVel = 0;
        framesSinceZoom = 100;
        zoomReturnPending = false;
        flying.clear();
        heldVelocity.set(0, 0, 0);
        heldHasPrev = false;
        returnTargets.clear();
        unwindRotation = false;
        clearDragHint();

        const nextSlots = buildFreeLayout(cards.length).map((slot) => {
          const pos = clampToView(new Vector3(slot.position.x, slot.position.y, slot.position.z));
          return {
            index: slot.index,
            position: { x: pos.x, y: pos.y, z: pos.z },
            scale: slot.scale,
          };
        });

        slots = nextSlots;
        usePhotoStore.getState().setLayout(nextSlots);

        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          const next = nextSlots[i];
          const actualScale = bakedScales[i] * card.group.scale.x;
          bakedScales[i] = next.scale;
          card.group.scale.setScalar(actualScale / next.scale);
          homePositions[i] = new Vector3(next.position.x, next.position.y, next.position.z);
          driftEase[i] = 0;
          returnTargets.set(card, homePositions[i].clone());
        }
      }
    });

    const performZoom = (deltaY: number, magnitudeScale: number) => {
      const sign = Math.sign(deltaY);
      if (sign === 0) return;
      zoomReturnPending = false; // wheel zoom is deliberate — no auto-return
      const magnitude = Math.min(Math.abs(deltaY) / magnitudeScale, 1.5);
      const factor = sign > 0 ? 1 / Math.pow(ZOOM_STEP, magnitude) : Math.pow(ZOOM_STEP, magnitude);
      targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, targetDistance * factor));
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // All wheel events zoom. Pan is via mouse-drag, and trackpad pinch stays centered.
      const isPinch = e.ctrlKey;
      const isMouseWheel = !isPinch && (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50);
      const divisor = isPinch ? 30 : isMouseWheel ? 100 : 60;
      performZoom(e.deltaY, divisor);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ----- Hand-gesture input (parallel to mouse) -----
    const recognizer = new GestureRecognizer();
    const TWO_HAND_PULL_GAIN = 3.2; // hands apart → zoom in, a little snappier
    const TWO_HAND_PUSH_GAIN = 1.1;  // hands together → zoom out, intentionally softer
    const TWO_HAND_PULL_DEADZONE = 0.004;
    const TWO_HAND_PUSH_DEADZONE = 0.018;
    const IDLE_SPIN = 0.0015;       // snow-globe: the cloud always turns, slowly (rad/frame)
    const HELD_MAX_DIST = Math.max(48, cameraDistance * 3.5); // farthest a held photo can be pushed
    const GRAB_CONFIRM_FRAMES = 2;  // shorter confirmation makes pinch-grab feel responsive
    const GRAB_ASSIST_RADIUS = 2.35; // screen-space fallback radius multiplier for grabs
    const projTmp = new Vector3();  // scratch for screen-space nearest-card grabs
    const returnGoal = new Vector3();
    // Interaction model is intentionally minimal so every gesture does EXACTLY what the
    // cheat sheet says: a held photo follows the hand at the depth it was grabbed, and
    // only the deliberate two-hand stretch resizes it. (Palm-size depth control and
    // thumb-middle scaling were removed — both misfired constantly during drags.)
    const targets: Object3D[] = cards.map((c) => c.mesh);
    const meshToCard = new Map<Object3D, PhotoCard>(cards.map((c) => [c.mesh, c]));

    // ---- Hand-gesture interaction state ----
    // Carousel spins keep a bit of momentum: swipe impulses add to the current angular
    // velocity and friction lets the cloud coast to a stop. Horizontal and vertical
    // flicks now drive different axes so up/down swipes feel like up/down mixing.
    let spinMomentumX = 0;
    let spinMomentumZ = 0;
    let spinCooldown = 0;
    // Grab is deferred a couple of frames per hand: while fingers curl into 🤌 the
    // thumb+index touch first and would false-grab a photo. Keeping a queue per hand
    // stops one side from overwriting the other during two-hand interactions.
    const pendingGrabs: Record<'Left' | 'Right', { frames: number } | null> = {
      Left: null,
      Right: null,
    };
    const clearPendingGrabs = () => {
      pendingGrabs.Left = null;
      pendingGrabs.Right = null;
    };
    const GRAB_SUPPRESSION_FRAMES = 18;
    let grabSuppressionFrames = 0;
    // 🤌 knob: while all five fingertips are gathered, the space follows the hand —
    // wrist roll turns it, moving the hand tilts it. Engagement needs 3 consecutive
    // frames and survives 6 missing ones (the gesture flickers at the threshold), and
    // rotation eases toward the hand instead of snapping — no more jitter.
    let knob: {
      baseRoll: number;
      baseCenter: { x: number; y: number };
      baseRotZ: number;
      baseRotX: number;
      baseRotY: number;
    } | null = null;
    let knobFrames = 0;
    let knobMissing = 0;
    let knobTarget: { z: number; x: number; y: number } | null = null;
    // Two-hand zoom inertia: the last zoom speed coasts on after the hands stop.
    let zoomVel = 0;
    let framesSinceZoom = 100;
    // After a two-hand squeeze reaches its limit, the view eases back to the original
    // framing over roughly a second so it feels elastic instead of snapping back.
    let zoomReturnPending = false;
    let zoomReturnDelayUntil = 0;
    let zoomReturnStartedAt = 0;
    let zoomReturnFromDistance = initialDistance;
    // True only while a second pinch that STARTED during the hold is down — an idle,
    // half-curled other hand can never hijack the hold into two-hand mode.
    let heldSecond = false;
    // Thrown cards: local-space velocity per card, integrated with friction in tick and
    // bounced off the bounds sphere so a throw can never leave the screen.
    const flying = new Map<PhotoCard, Vector3>();
    const heldVelocity = new Vector3();
    const heldPrevPos = new Vector3();
    let heldHasPrev = false;
    let driftDamp = 1;
    // Per-card in-plane roll (radians). Session-only — billboarding overwrites orientation
    // each frame, so we re-apply roll on top.
    const rollAngles = new Map<PhotoCard, number>();
    // A single photo can be "held" — lifted out of the cloud, floating in front of you.
    // Releasing the pinch drops it exactly where it is (placement persists on Save).
    let held:
      | {
          card: PhotoCard;
          hand: 'Left' | 'Right';
          grabSpan: number;       // palm width at grab — depth baseline
          grabDistance: number;   // camera distance at grab
          lastDistance: number;   // smoothed current hold distance
          grabRoll: number;       // hand roll at grab
          baseRoll: number;       // card roll at grab
          // Two-hand stretch baseline — 'pinch' = both hands pinched on the photo
          // (Iron-Man corner grip: midpoint moves it, turning the pair rotates it),
          // 'open' = second hand open, spread to resize.
          two: {
            mode: 'pinch' | 'open';
            // Dominance lock: the first intent to cross its threshold (spread → 'scale',
            // turn → 'rotate') wins for the whole stretch; the other channel stays off.
            gesture: 'none' | 'scale' | 'rotate';
            baseDist: number;
            baseScale: number;
            baseAngle: number;
            basePhotoRoll: number;
          } | null;
        }
      | null = null;
    let snapshot: FrameSnapshot = { Left: null, Right: null };

    // Convert a normalized (mirrored) hand pointer to a world ray direction from the camera.
    const rayDir = new Vector3();
    const ndcToRayDir = (px: number, py: number): Vector3 => {
      const ndcX = px * 2 - 1;
      const ndcY = 1 - py * 2;
      rayDir.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
      return rayDir;
    };

    // Write a dropped card's new position + size back into the shared layout so Save persists it.
    const persistPlacement = (card: PhotoCard) => {
      const idx = cardIndex.get(card);
      if (idx == null || !slots) return;
      slots[idx] = {
        index: idx,
        position: {
          x: card.group.position.x,
          y: card.group.position.y,
          z: card.group.position.z,
        },
        scale: bakedScales[idx] * card.group.scale.x,
      };
      usePhotoStore.getState().setLayout([...slots]);
    };

    // The actual grab: raycast from the pinch point; if it misses, take the FRONT-most
    // card whose center is within a size-aware screen radius (small/far photos keep a
    // fair hit area, and overlapping stacks yield the photo you actually see).
    const performGrab = (hand: 'Left' | 'Right', snap: HandSnapshot) => {
      const ndcX = snap.pointer.x * 2 - 1;
      const ndcY = 1 - snap.pointer.y * 2;
      raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
      const hits = raycaster.intersectObjects(targets, false);
      let card = hits.length > 0 ? meshToCard.get(hits[0].object) : undefined;
      if (!card) {
        let bestCamDist = Infinity;
        for (const c of cards) {
          const wp = c.group.getWorldPosition(projTmp);
          const camDist = wp.distanceTo(camera.position);
          const ci = cardIndex.get(c);
          const worldH = 0.8 * (ci != null ? bakedScales[ci] : 1) * c.group.scale.x;
          const projHalf = worldH / 2 / (camDist * pureHalfTan);
          const grabRadius = Math.max(0.12, projHalf * GRAB_ASSIST_RADIUS);
          wp.project(camera);
          const d = Math.hypot(wp.x - ndcX, wp.y - ndcY);
          if (d < grabRadius && camDist < bestCamDist) {
            bestCamDist = camDist;
            card = c;
          }
        }
      }
      // Pinching empty space does nothing on purpose: a missed grab must never move
      // the photos (panning is still available with the mouse).
      if (!card) return;
      returnTargets.delete(card);
      flying.delete(card);
      heldVelocity.set(0, 0, 0);
      heldHasPrev = false;
      const worldPos = card.group.getWorldPosition(new Vector3());
      const grabDistance = camera.position.distanceTo(worldPos);
      held = {
        card,
        hand,
        grabSpan: Math.max(snap.span, 1e-3),
        grabDistance,
        lastDistance: grabDistance,
        grabRoll: snap.roll,
        baseRoll: rollAngles.get(card) ?? 0,
        two: null,
      };
      // Lift out of the (spinning) cloud so it floats steadily in front of you.
      scene.attach(card.group);
      setPersistentDragHint('사진을 드래그해서 옮겨보세요.');
    };

    const processPendingGrab = (hand: 'Left' | 'Right'): boolean => {
      if (held) {
        clearPendingGrabs();
        return false;
      }
      if (grabSuppressionFrames > 0) {
        clearPendingGrabs();
        return false;
      }
      const pending = pendingGrabs[hand];
      if (!pending) return false;
      const snap = hand === 'Left' ? snapshot.Left : snapshot.Right;
      if (!snap) {
        pendingGrabs[hand] = null;
        return false;
      }
      if (!snap.pinching || snap.grabAll) {
        pendingGrabs[hand] = null; // the "pinch" was a 🤌 forming — knob, not grab
        return false;
      }
      pending.frames++;
      const requiredFrames = performance.now() < grabWarmupUntil ? 1 : GRAB_CONFIRM_FRAMES;
      if (pending.frames >= requiredFrames) {
        performGrab(hand, snap);
        clearPendingGrabs();
        return true;
      }
      return false;
    };

    const unsubFrames = handTracker.onFrame((frame) => {
      const events = recognizer.process(frame);
      snapshot = recognizer.snapshot;
      if (grabSuppressionFrames > 0) grabSuppressionFrames--;

      // 🤌 knob — space rotation follows the hand (eased in tick). Wrist roll turns the
      // carousel; moving the gathered hand tilts it. Solo-hand only, so it can never
      // fire in the middle of a two-hand zoom.
      const soloCount = (snapshot.Left ? 1 : 0) + (snapshot.Right ? 1 : 0);
      const knobHand =
        !held && soloCount === 1
          ? snapshot.Left?.grabAll
            ? snapshot.Left
            : snapshot.Right?.grabAll
              ? snapshot.Right
              : null
          : null;
      if (knobHand) {
        knobMissing = 0;
        knobFrames++;
        if (knobFrames === 3) {
          knob = {
            baseRoll: knobHand.roll,
            baseCenter: { x: knobHand.center.x, y: knobHand.center.y },
            baseRotZ: cardsRoot.rotation.z,
            baseRotX: cardsRoot.rotation.x,
            baseRotY: cardsRoot.rotation.y,
          };
        }
        if (knob) {
          let dRoll = knobHand.roll - knob.baseRoll;
          while (dRoll > Math.PI) dRoll -= 2 * Math.PI;
          while (dRoll < -Math.PI) dRoll += 2 * Math.PI;
          // Tilts are clamped: big x/y rotations could swing ring photos out of the view
          // cone, so the knob allows a bounded lean, not a full tumble.
          const dy = knobHand.center.y - knob.baseCenter.y;
          const dx = knobHand.center.x - knob.baseCenter.x;
          knobTarget = {
            z: knob.baseRotZ - dRoll,
            x: Math.max(-0.6, Math.min(0.6, knob.baseRotX + dy * 2.2)),
            y: Math.max(-0.6, Math.min(0.6, knob.baseRotY + dx * 2.2)),
          };
        }
      } else if (knob || knobFrames > 0) {
        knobMissing++;
        // Brief flicker at the gesture threshold — keep steering toward the last target.
        if (knobMissing > 10) {
          knob = null;
          knobTarget = null;
          knobFrames = 0;
        }
      }

      for (const ev of events) {
        if (ev.type === 'pinchStart') {
          if (held) {
            // A second pinch during a hold joins the stretch — it never grabs another photo.
            if (ev.hand !== held.hand) heldSecond = true;
            continue;
          }
          if (grabSuppressionFrames > 0) continue;
          pendingGrabs[ev.hand] = { frames: 0 };
          const snap = ev.hand === 'Left' ? snapshot.Left : snapshot.Right;
          if (snap && !snap.grabAll) {
            setPersistentDragHint('사진을 잡는 중…');
          }
        } else if (ev.type === 'pinchMove') {
          if (held && held.hand === ev.hand) {
            const card = held.card;
            const span = Math.max(ev.span, 1e-3);
            // Nearest allowed hold distance: the photo may fill most of the screen but
            // never overflow it — bigger (or scaled-up) photos stop farther out.
            const heldIdx = cardIndex.get(card);
            const worldH = 0.8 * (heldIdx != null ? bakedScales[heldIdx] : 1) * card.group.scale.x;
            const minHoldDist = Math.max(1.2, (worldH / 2 / pureHalfTan) * 1.15);
            if (held.lastDistance < minHoldDist) held.lastDistance = minHoldDist;
            const other = held.hand === 'Left' ? snapshot.Right : snapshot.Left;
            const otherPalmFacing = !!other?.palmFacing;
            const mode: 'pinch' | 'open' | null =
              heldSecond && other && other.present
                ? 'pinch'
                : other && other.present && !other.pinching && other.fingers >= 4 && otherPalmFacing
                  ? 'open'
                  : null;

            if (mode && other) {
              // ---- Two-hand stretch (second hand pinched OR open) ----
              const handDist = Math.max(
                Math.hypot(ev.pointer.x - other.pointer.x, ev.pointer.y - other.pointer.y),
                1e-3,
              );
              const angle = Math.atan2(
                other.pointer.y - ev.pointer.y,
                other.pointer.x - ev.pointer.x,
              );
              if (!held.two || held.two.mode !== mode) {
                held.two = {
                  mode,
                  gesture: 'none',
                  baseDist: handDist,
                  baseScale: card.group.scale.x,
                  baseAngle: angle,
                  basePhotoRoll: rollAngles.get(card) ?? 0,
                };
              }
              let dAngle = angle - held.two.baseAngle;
              while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
              while (dAngle < -Math.PI) dAngle += 2 * Math.PI;
              const distLog = Math.log(handDist / held.two.baseDist);

              // Lock onto the FIRST clear intent: spreading = scale, turning = rotate.
              // Rebaseline at the lock so the photo eases from its current state.
              if (held.two.gesture === 'none') {
                if (Math.abs(distLog) > 0.12) {
                  held.two.gesture = 'scale';
                  held.two.baseDist = handDist;
                  held.two.baseScale = card.group.scale.x;
                } else if (mode === 'pinch' && Math.abs(dAngle) > 0.22) {
                  held.two.gesture = 'rotate';
                  held.two.baseAngle = angle;
                  held.two.basePhotoRoll = rollAngles.get(card) ?? 0;
                }
              }
              if (held.two.gesture === 'scale') {
                const scale = Math.max(
                  0.3,
                  Math.min(6, held.two.baseScale * (handDist / held.two.baseDist)),
                );
                card.group.scale.setScalar(scale);
              } else if (held.two.gesture === 'rotate') {
                let d2 = angle - held.two.baseAngle;
                while (d2 > Math.PI) d2 -= 2 * Math.PI;
                while (d2 < -Math.PI) d2 += 2 * Math.PI;
                rollAngles.set(card, held.two.basePhotoRoll - d2);
              }

              if (mode === 'pinch') {
                // Both hands pinched on it — gripping two corners: the midpoint carries it.
                const dir = ndcToRayDir(
                  (ev.pointer.x + other.pointer.x) / 2,
                  (ev.pointer.y + other.pointer.y) / 2,
                );
                card.group.position.copy(camera.position).addScaledVector(dir, held.lastDistance);
              } else {
                const dir = ndcToRayDir(ev.pointer.x, ev.pointer.y);
                card.group.position.copy(camera.position).addScaledVector(dir, held.lastDistance);
                rollAngles.set(card, held.baseRoll - (ev.roll - held.grabRoll));
              }
              // Depth stays FROZEN during any stretch — spreading arms turns the palms,
              // which would otherwise read as a fake depth move.
            } else {
              // ---- Solo hold: move + depth + wrist roll ----
              if (held.two) {
                // Stretch just ended — rebaseline depth and roll from the current pose.
                held.grabSpan = span;
                held.grabDistance = held.lastDistance;
                held.grabRoll = ev.roll;
                held.baseRoll = rollAngles.get(card) ?? 0;
                held.two = null;
              }
              const rollDelta = ev.roll - held.grabRoll;
              // Depth from palm width — but NOT while the wrist is twisted: rolling
              // foreshortens the knuckle line, which would read as a fake depth move.
              if (Math.abs(rollDelta) < 0.35) {
                const ratio = held.grabSpan / span; // hand nearer → span↑ → closer
                const targetDist = Math.max(
                  minHoldDist,
                  Math.min(HELD_MAX_DIST, held.grabDistance * Math.pow(ratio, 1.4)),
                );
                held.lastDistance += (targetDist - held.lastDistance) * 0.18;
              }
              const dir = ndcToRayDir(ev.pointer.x, ev.pointer.y);
              card.group.position.copy(camera.position).addScaledVector(dir, held.lastDistance);
              rollAngles.set(card, held.baseRoll - rollDelta);
            }

            // Track hand velocity (world units/frame, smoothed) for throw-on-release.
            if (heldHasPrev) {
              heldVelocity.lerp(projTmp.subVectors(card.group.position, heldPrevPos), 0.4);
            }
            heldPrevPos.copy(card.group.position);
            heldHasPrev = true;
          }
        } else if (ev.type === 'pinchEnd') {
          pendingGrabs[ev.hand] = null;
          if (held && ev.hand !== held.hand) heldSecond = false;
          if (held && held.hand === ev.hand) {
            // Drop in place: reparent into the cloud frame (preserving world transform) and persist.
            cardsRoot.attach(held.card.group);
            const dropIdx = cardIndex.get(held.card);
            if (dropIdx != null) {
              // Released while moving → throw it: the card keeps the hand's velocity and
              // coasts (friction + wall bounce in tick). A gentle release settles in place.
              const invQ = cardsRoot.quaternion.clone().invert();
              const viewDir = camera.position.clone().sub(controlsBundle.controls.target).normalize();
              const throwVelocity = heldVelocity.clone();
              throwVelocity.addScaledVector(viewDir, -throwVelocity.dot(viewDir));
              const vLocal = throwVelocity.applyQuaternion(invQ);
              if (vLocal.length() > 0.08) {
                if (vLocal.length() > 1.2) vLocal.setLength(1.2);
                flying.set(held.card, vLocal);
              } else {
                // The drop point becomes the card's new drift anchor; if it lies outside
                // the view cone, glide it back in so spinning can't carry it off screen.
                const home = clampToView(held.card.group.position.clone());
                homePositions[dropIdx] = home;
                driftEase[dropIdx] = 0;
                if (held.card.group.position.distanceTo(home) > 0.01) {
                  returnTargets.set(held.card, home);
                }
              }
            }
            persistPlacement(held.card);
            held = null;
            heldSecond = false;
            heldHasPrev = false;
            spinCooldown = Math.max(spinCooldown, 20); // block the throw from becoming a cloud spin
            clearDragHint();
          } else if (!pendingGrabs.Left && !pendingGrabs.Right) {
            clearDragHint();
          }
        } else if (ev.type === 'twoHandMove') {
          if (held) continue;
          // Hands APART → zoom in (photos come closer); together → zoom out.
          framesSinceZoom = 0;
          const effectiveDelta =
            ev.distanceDelta > 0
              ? Math.max(0, ev.distanceDelta - TWO_HAND_PULL_DEADZONE)
              : Math.min(0, ev.distanceDelta + TWO_HAND_PUSH_DEADZONE);

          if (Math.abs(effectiveDelta) > 1e-4) {
            const gain = effectiveDelta > 0 ? TWO_HAND_PULL_GAIN : TWO_HAND_PUSH_GAIN;
            const factor = Math.max(0.86, Math.min(1.14, 1 - effectiveDelta * gain));
            targetDistance = Math.max(
              initialDistance * 0.35,
              Math.min(initialDistance * 3, targetDistance * factor),
            );
            // Remember the zoom speed — it coasts on with friction when the hands stop.
            zoomVel = zoomVel * 0.5 + (factor - 1) * 0.5;
            if (targetDistance > initialDistance * 1.03) {
              zoomReturnPending = true;
              zoomReturnFromDistance = Math.max(zoomReturnFromDistance, targetDistance);
              zoomReturnDelayUntil = performance.now() + 120;
              zoomReturnStartedAt = 0;
            } else {
              zoomReturnPending = false;
              zoomReturnDelayUntil = 0;
              zoomReturnStartedAt = 0;
              zoomReturnFromDistance = initialDistance;
            }
          }
        } else if (ev.type === 'swipe') {
          // Right after a two-hand zoom, one hand often drops out of tracking and the
          // other reads as a fast flick — that must not fire a spin.
          if (held || spinCooldown > 0 || framesSinceZoom < 15) continue;
          const horizontal = Math.abs(ev.velocity.x) >= Math.abs(ev.velocity.y);
          const speed = Math.hypot(ev.velocity.x, ev.velocity.y);
          const direction = horizontal
            ? ev.velocity.x > 0
              ? -1
              : 1
            : ev.velocity.y > 0
              ? -1
              : 1;
          const impulse = Math.min(0.42, Math.max(0.08, speed * (horizontal ? 1.95 : 1.7)));
          if (horizontal) {
            spinMomentumZ = Math.max(-0.42, Math.min(0.42, spinMomentumZ + direction * impulse));
          } else {
            spinMomentumX = Math.max(-0.42, Math.min(0.42, spinMomentumX + direction * impulse));
          }
          spinCooldown = 35; // ~0.6s before the next flick registers
          grabSuppressionFrames = GRAB_SUPPRESSION_FRAMES;
          clearPendingGrabs();
          clearDragHint();
        } else if (ev.type === 'fist') {
          // Make a fist to stop all space motion where it is.
          spinMomentumX = 0;
          spinMomentumZ = 0;
          zoomVel = 0;
          zoomReturnPending = false;
          zoomReturnDelayUntil = 0;
          zoomReturnStartedAt = 0;
          zoomReturnFromDistance = initialDistance;
          clearPendingGrabs();
          clearDragHint();
        }
      }

      // Deferred grab confirm: still pinching after a couple of frames and NOT a 🤌 → grab.
      if (!processPendingGrab('Left')) processPendingGrab('Right');
      if (held) {
        clearPendingGrabs();
      }
    });

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let pointerInCanvas = false;
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInCanvas = true;
    };
    const onPointerLeave = () => {
      pointerInCanvas = false;
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx * dx + dy * dy > 16) return;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData.photoId as string | undefined;
        if (id) setSelected(id);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    const onResize = () => resize(window.innerWidth, window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Smooth zoom: lerp camera distance and target.
      controlsBundle.controls.target.lerp(targetTarget, TARGET_LERP);
      controlsBundle.update();
      const currentDistance = camera.position.distanceTo(controlsBundle.controls.target);
      const newDistance = currentDistance + (targetDistance - currentDistance) * ZOOM_LERP;
      if (Math.abs(newDistance - currentDistance) > 1e-4) {
        const dir = camera.position.clone().sub(controlsBundle.controls.target).normalize();
        camera.position.copy(controlsBundle.controls.target).add(dir.multiplyScalar(newDistance));
      }

      const tSec = performance.now() / 1000;
      const now = performance.now();

      canvas.style.cursor = held || pendingGrabs.Left || pendingGrabs.Right ? 'grabbing' : 'grab';

      // Keep the cloud steady, but do not push it away when fingers approach.
      driftDamp += (1 - driftDamp) * 0.08;

      if (held) {
        zoomVel = 0;
        zoomReturnPending = false;
        zoomReturnDelayUntil = 0;
        zoomReturnStartedAt = 0;
        zoomReturnFromDistance = targetDistance;
      }

      // Snow-globe carousel: the ring always turns gently around the screen axis, so the
      // photos visibly orbit the center (your face, in camera mode).
      if (!unwindRotation) cardsRoot.rotation.z += IDLE_SPIN * driftDamp;

      // Swipe cooldown: a quick flick shouldn't immediately retrigger while the motion
      // is still settling.
      if (spinCooldown > 0) spinCooldown--;

      // 🤌 knob easing: rotation glides toward the hand's target — smooth, no jitter.
      if (knobTarget) {
        cardsRoot.rotation.z += (knobTarget.z - cardsRoot.rotation.z) * 0.25;
        cardsRoot.rotation.x += (knobTarget.x - cardsRoot.rotation.x) * 0.25;
        cardsRoot.rotation.y += (knobTarget.y - cardsRoot.rotation.y) * 0.25;
      }

      // Zoom inertia: after the hands stop, the zoom coasts and slows with friction.
      framesSinceZoom++;
      if (!held && framesSinceZoom > 3) {
        if (Math.abs(zoomVel) > 1e-4) {
          targetDistance = Math.max(
            initialDistance * 0.35,
            Math.min(initialDistance * 3, targetDistance * (1 + zoomVel)),
          );
          zoomVel *= 0.93;
        } else {
          zoomVel = 0;
        }
      }

      // Return only after zooming out to the outer limit; the animation takes about 1s.
      if (zoomReturnPending && !held && framesSinceZoom > 3) {
        if (now >= zoomReturnDelayUntil) {
          if (zoomReturnStartedAt === 0) zoomReturnStartedAt = now;
          zoomVel = 0;
          const elapsed = now - zoomReturnStartedAt;
          const progress = Math.min(1, elapsed / 1000);
          const ease = progress * progress * (3 - 2 * progress);
          targetDistance =
            zoomReturnFromDistance + (initialDistance - zoomReturnFromDistance) * ease;
          if (progress >= 1 || Math.abs(targetDistance - initialDistance) < 0.02) {
            targetDistance = initialDistance;
            zoomReturnPending = false;
            zoomReturnDelayUntil = 0;
            zoomReturnStartedAt = 0;
            zoomReturnFromDistance = initialDistance;
          }
        }
      }
      // Carousel inertia: swipe impulses keep spinning and then decay smoothly.
      if (Math.abs(spinMomentumZ) > 1e-4) {
        cardsRoot.rotation.z += spinMomentumZ;
        spinMomentumZ *= 0.968;
        if (Math.abs(spinMomentumZ) < 0.001) spinMomentumZ = 0;
      }
      if (Math.abs(spinMomentumX) > 1e-4) {
        cardsRoot.rotation.x += spinMomentumX;
        spinMomentumX *= 0.968;
        if (Math.abs(spinMomentumX) < 0.001) spinMomentumX = 0;
      }

      // Thrown cards: integrate velocity with friction; bounce off the view-cone walls
      // (reflect + damp) so a hard throw rebounds instead of leaving the screen.
      for (const [card, vel] of flying) {
        card.group.position.add(vel);
        vel.multiplyScalar(0.94);
        const p = card.group.position;
        if (p.z < zMin) {
          p.z = zMin;
          vel.z = Math.abs(vel.z);
          vel.multiplyScalar(0.72);
        } else if (p.z > zMax) {
          p.z = zMax;
          vel.z = -Math.abs(vel.z);
          vel.multiplyScalar(0.72);
        }
        const maxXy = xyMaxAt(p.z);
        const xy = Math.hypot(p.x, p.y);
        if (xy > maxXy) {
          const nx = p.x / xy;
          const ny = p.y / xy;
          p.x = nx * maxXy;
          p.y = ny * maxXy;
          const vn = vel.x * nx + vel.y * ny;
          if (vn > 0) {
            vel.x -= 2 * vn * nx;
            vel.y -= 2 * vn * ny;
          }
          vel.multiplyScalar(0.72);
        }
        if (vel.length() < 0.01) {
          flying.delete(card);
          const idx = cardIndex.get(card);
          if (idx != null) {
            homePositions[idx] = card.group.position.clone();
            driftEase[idx] = 0;
          }
          persistPlacement(card);
        }
      }

      // Gather: ease the cloud's rotation back to identity.
      if (unwindRotation) {
        cardsRoot.quaternion.slerp(identityQuat, 0.12);
        if (cardsRoot.quaternion.angleTo(identityQuat) < 0.01) {
          cardsRoot.quaternion.copy(identityQuat);
          unwindRotation = false;
        }
        cardsRoot.rotation.setFromQuaternion(cardsRoot.quaternion);
      }

      // Glide cards toward their (gently drifting) return targets — the goal includes
      // the drift offset so arrival hands off to the float without a visible hop.
      for (const [card, target] of returnTargets) {
        const i = cardIndex.get(card);
        if (i == null) {
          returnTargets.delete(card);
          continue;
        }
        returnGoal.copy(target).add(driftOffset(i, tSec));
        card.group.position.lerp(returnGoal, 0.12);
        if (card.group.position.distanceTo(returnGoal) < 0.08) {
          returnTargets.delete(card);
          persistPlacement(card);
        }
      }

      // Snow-globe drift: every free card floats around its home point.
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (held && held.card === c) continue;
        if (returnTargets.has(c)) continue;
        if (flying.has(c)) continue;
        if (driftEase[i] < 1) driftEase[i] = Math.min(1, driftEase[i] + 0.008);
        c.group.position.copy(homePositions[i]).add(driftOffset(i, tSec));
      }

      // Billboard every card toward the camera, then re-apply its in-plane roll. Cards in the
      // (rotating) cloud need the cluster's inverse rotation; a held card lives under the
      // scene root (identity).
      rootInvQuat.copy(cardsRoot.quaternion).invert();
      for (const c of cards) {
        if (held && held.card === c) {
          c.group.quaternion.copy(camera.quaternion);
        } else {
          c.group.quaternion.copy(camera.quaternion).premultiply(rootInvQuat);
        }
        const roll = rollAngles.get(c);
        if (roll) c.group.rotateZ(roll);
      }

      // Aim highlight:
      // - YELLOW = a card the user is lining up to grab
      // - RED = the card currently pinched/held
      let candidate: Object3D | null = null;
      let activeTarget: Object3D | null = null;
      const occluded: Object3D[] = [];
      const collect = (hits: Intersection[]) => {
        for (const h of hits) {
          if (!candidate) candidate = h.object;
          else if (h.object !== candidate && !occluded.includes(h.object)) occluded.push(h.object);
        }
      };
      if (held) {
        activeTarget = held.card.mesh;
      } else {
        const handPtr =
          snapshot.Right?.pinching
            ? snapshot.Right
            : snapshot.Left?.pinching
              ? snapshot.Left
              : snapshot.Right ?? snapshot.Left;
        if (controlModeRef.current === 'hand' && handPtr) {
          raycaster.setFromCamera(
            new Vector2(handPtr.pointer.x * 2 - 1, 1 - handPtr.pointer.y * 2),
            camera,
          );
          collect(raycaster.intersectObjects(targets, false));
          if (handPtr.pinching) activeTarget = candidate;
        } else if (controlModeRef.current === 'pointer' && pointerInCanvas) {
          raycaster.setFromCamera(pointer, camera);
          collect(raycaster.intersectObjects(targets, false));
        }
      }
      outline.selectedObjects = activeTarget ? [activeTarget] : [];
      outlineBack.selectedObjects = candidate
        ? activeTarget
          ? occluded
          : [candidate, ...occluded]
        : [];

      composer.render();
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      unsubFrames();
      unsubHandMode();
      unsubHandStatus();
      unsubReset();
      clearDragHint();
      controlsBundle.dispose();
      cards.forEach((c) => c.dispose());
      bundle.dispose();
    };
  }, [photos, setSelected]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          display: 'block',
          cursor: 'grab',
          zIndex: 1,
          background: 'transparent',
        }}
      />
      {dragHint && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 28,
            transform: 'translateX(-50%)',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <FrostPanel
            style={{
              padding: '10px 16px',
              borderColor: 'rgba(236, 255, 15, 0.45)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.28)',
            }}
          >
            <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-primary)' }}>
              {dragHint}
            </span>
          </FrostPanel>
        </div>
      )}
    </>
  );
}
