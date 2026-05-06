import type { Camera } from 'three';
import { MOUSE, TOUCH } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface ControlsBundle {
  controls: OrbitControls;
  update: () => void;
  dispose: () => void;
}

export function setupControls(camera: Camera, dom: HTMLElement): ControlsBundle {
  const controls = new OrbitControls(camera, dom);

  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  controls.enableRotate = false; // SOOT-style: drag pans, never rotates
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.zoomToCursor = true;
  controls.zoomSpeed = 1.0;
  controls.panSpeed = 1.0;
  controls.screenSpacePanning = true;

  controls.minDistance = 0.5;
  controls.maxDistance = 200;

  // Drag with the primary mouse button = pan; single-finger touch = pan
  controls.mouseButtons = {
    LEFT: MOUSE.PAN,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.PAN,
  };
  controls.touches = {
    ONE: TOUCH.PAN,
    TWO: TOUCH.DOLLY_PAN,
  };

  return {
    controls,
    update: () => controls.update(),
    dispose: () => controls.dispose(),
  };
}
