import { useEffect, useRef } from 'react';
import {
  Group,
  Raycaster,
  Vector2,
  type Object3D,
  type Intersection,
} from 'three';
import { createScene } from '../three/createScene';
import { createPhotoCard, type PhotoCard } from '../three/createPhotoCard';
import { setupControls } from '../three/orbitControlsFactory';
import { computeLayout } from '../lib/computeLayout';
import { usePhotoStore } from '../store/photoStore';

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
      const slots = computeLayout(photos.length);
      for (let i = 0; i < photos.length; i++) {
        const slot = slots[i];
        const card = createPhotoCard(photos[i], slot.scale);
        const { x, y, z } = slot.position;
        card.group.position.set(x, y, z);
        cardsRoot.add(card.group);
        cards.push(card);
      }
    }

    // Camera: face the scatter from a generous distance so perspective is gentle
    if (cards.length > 0) {
      const spread = Math.max(2.5, Math.cbrt(photos.length) * 1.4);
      const distance = Math.max(8, spread * 4.5);
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
    }

    const controlsBundle = setupControls(camera, canvas);
    controlsBundle.controls.target.set(0, 0, 0);
    controlsBundle.controls.update();

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

    // Distinguish a true click from a pan-drag: only register click if pointer didn't move much.
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx * dx + dy * dy > 16) return; // ignore drags
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
      controlsBundle.update();

      // Billboard each card to face the camera
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
