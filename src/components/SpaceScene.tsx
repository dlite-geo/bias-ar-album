import { useEffect, useRef } from 'react';
import {
  Group,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
  type Intersection,
} from 'three';
import { createScene } from '../three/createScene';
import { createPhotoCard, type PhotoCard } from '../three/createPhotoCard';
import { setupControls } from '../three/orbitControlsFactory';
import { computeLayout } from '../lib/computeLayout';
import { usePhotoStore } from '../store/photoStore';
import { handTracker } from '../lib/handTracking';
import { GestureRecognizer } from '../lib/gestureRecognizer';
import { useViewStore } from '../store/viewStore';

const ZOOM_STEP = 0.86;          // each scroll tick multiplies distance by this (or its inverse)
const ZOOM_LERP = 0.25;          // smoothing factor — closer to 1 = snappier, closer to 0 = lazier
const MIN_DISTANCE = 0.05;
const MAX_DISTANCE = 5000;
const TARGET_LERP = 0.18;        // smoothing for the controls.target shift

export function SpaceScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bundle = createScene(canvas);
    const { scene, camera, composer, outline, resize } = bundle;

    const cardsRoot = new Group();
    scene.add(cardsRoot);

    const cards: PhotoCard[] = [];
    if (photos.length > 0) {
      const layoutOverride = usePhotoStore.getState().layout;
      const slots = layoutOverride && layoutOverride.length === photos.length
        ? layoutOverride
        : computeLayout(photos.length);
      // Stash the live layout so SaveSpaceModal can persist it.
      usePhotoStore.getState().setLayout(slots);
      for (let i = 0; i < photos.length; i++) {
        const slot = slots[i];
        const card = createPhotoCard(photos[i], slot.scale);
        const { x, y, z } = slot.position;
        card.group.position.set(x, y, z);
        cardsRoot.add(card.group);
        cards.push(card);
      }
    }

    if (cards.length > 0) {
      const spread = Math.max(2.5, Math.cbrt(photos.length) * 1.4);
      const distance = Math.max(8, spread * 5.5);
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
    }

    const controlsBundle = setupControls(camera, canvas);
    controlsBundle.controls.target.set(0, 0, 0);
    controlsBundle.controls.update();

    // ---- Smooth zoom state ----
    let targetDistance = camera.position.distanceTo(controlsBundle.controls.target);
    const targetTarget = controlsBundle.controls.target.clone();
    const camDir = new Vector3();

    // Capture the initial framing so the Reset button can snap back to it.
    const initialDistance = targetDistance;
    const initialTarget = targetTarget.clone();
    const unsubReset = useViewStore.subscribe((state, prev) => {
      if (state.resetCounter !== prev.resetCounter) {
        targetDistance = initialDistance;
        targetTarget.copy(initialTarget);
      }
    });

    const performZoom = (deltaY: number, magnitudeScale: number) => {
      const sign = Math.sign(deltaY);
      if (sign === 0) return;
      const magnitude = Math.min(Math.abs(deltaY) / magnitudeScale, 1.5);
      const factor = sign > 0 ? 1 / Math.pow(ZOOM_STEP, magnitude) : Math.pow(ZOOM_STEP, magnitude);
      targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, targetDistance * factor));

      // Zoom-to-cursor: pull the orbit target toward the world point under the cursor (zoom-in only).
      // The pull is proportional to the per-event zoom magnitude so it stays smooth regardless of
      // event rate (60Hz trackpad scroll vs ~10Hz mouse wheel) and capped at 0.25 per event.
      if (sign < 0) {
        camera.getWorldDirection(camDir);
        const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
        const cursorRay = new Vector3(pointer.x, pointer.y, 0.5).unproject(camera).sub(origin).normalize();
        const planeDistance = controlsBundle.controls.target.clone().sub(origin).dot(camDir) / cursorRay.dot(camDir);
        if (Number.isFinite(planeDistance) && planeDistance > 0) {
          const focal = origin.clone().add(cursorRay.multiplyScalar(planeDistance));
          const pull = Math.min(magnitude * 0.5, 0.3);
          targetTarget.lerp(focal, pull);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // All wheel events zoom. Pan is via mouse-drag.
      // Magnitude divisor tuned per input source so each feels natural:
      //   - Pinch fires many small events → small divisor for gentle response
      //   - Mouse wheel fires few large events → large divisor
      //   - Trackpad two-finger scroll is intermediate
      const isPinch = e.ctrlKey;
      const isMouseWheel = !isPinch && (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50);
      const divisor = isPinch ? 30 : isMouseWheel ? 100 : 60;
      performZoom(e.deltaY, divisor);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ----- Hand-gesture input (parallel to mouse) -----
    // performPan: shift camera + orbit target by the same world-space offset so
    // view direction is preserved (true parallel pan, no rotation).
    const performPan = (dxPx: number, dyPx: number) => {
      const distance = camera.position.distanceTo(controlsBundle.controls.target);
      const fovRad = (camera.fov * Math.PI) / 180;
      const worldPerPixel = (2 * distance * Math.tan(fovRad / 2)) / canvas.clientHeight;
      const right = new Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new Vector3().setFromMatrixColumn(camera.matrix, 1);
      const offset = right
        .multiplyScalar(dxPx * worldPerPixel)
        .add(up.multiplyScalar(-dyPx * worldPerPixel));
      camera.position.add(offset);
      controlsBundle.controls.target.add(offset);
      targetTarget.add(offset);
    };

    const recognizer = new GestureRecognizer();
    const PAN_SCALE_X = canvas.clientWidth * 1.5;
    const PAN_SCALE_Y = canvas.clientHeight * 1.5;
    const ZOOM_GAIN = 4;

    const unsubFrames = handTracker.onFrame((frame) => {
      const events = recognizer.process(frame);
      for (const ev of events) {
        if (ev.type === 'pinchMove') {
          // Pinch-grab: photos follow the pinch. Pinch right → world appears to
          // move right → camera/target shift LEFT (negative dx).
          // Image y goes downward; negate so "pinch down" makes camera move down,
          // which makes photos appear to follow the pinch downward.
          performPan(-ev.delta.x * PAN_SCALE_X, -ev.delta.y * PAN_SCALE_Y);
        } else if (ev.type === 'twoPinchMove') {
          // distanceDelta > 0 (hands apart) → zoom IN. Synthesize negative wheel deltaY.
          const fakeDeltaY = -ev.distanceDelta * 1000;
          performZoom(fakeDeltaY, 100 / ZOOM_GAIN);
        }
      }
    });

    const targets: Object3D[] = cards.map((c) => c.mesh);

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

      for (const c of cards) {
        c.group.quaternion.copy(camera.quaternion);
      }

      if (pointerInCanvas) {
        raycaster.setFromCamera(pointer, camera);
        const hits: Intersection[] = raycaster.intersectObjects(targets, false);
        outline.selectedObjects = hits.length > 0 ? [hits[0].object] : [];
      } else {
        outline.selectedObjects = [];
      }

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
      unsubReset();
      controlsBundle.dispose();
      cards.forEach((c) => c.dispose());
      bundle.dispose();
    };
  }, [photos, setSelected]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100vw', height: '100vh', display: 'block', cursor: 'grab' }}
    />
  );
}
