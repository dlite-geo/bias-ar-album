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
  controls.zoomSpeed = 0.6;
  controls.minDistance = 1.6;
  controls.maxDistance = 8;
  controls.enablePan = false;
  return {
    controls,
    update: () => controls.update(),
    dispose: () => controls.dispose(),
  };
}
