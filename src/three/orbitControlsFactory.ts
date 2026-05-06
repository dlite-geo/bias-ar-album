import type { Camera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface ControlsBundle {
  controls: OrbitControls;
  update: () => void;
  dispose: () => void;
}

export function setupControls(camera: Camera, dom: HTMLElement): ControlsBundle {
  const controls = new OrbitControls(camera, dom);

  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.zoomToCursor = true;        // scroll zooms toward the cursor position
  controls.screenSpacePanning = true;  // right-drag pans on the camera-aligned plane

  controls.minDistance = 0.5;
  controls.maxDistance = 60;

  controls.enablePan = true;
  controls.enableRotate = true;

  return {
    controls,
    update: () => controls.update(),
    dispose: () => controls.dispose(),
  };
}
