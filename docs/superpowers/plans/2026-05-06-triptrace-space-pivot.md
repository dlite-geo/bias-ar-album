# TripTrace Space Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the globe-based design with a SOOT-style 3D photo space. User drops a folder of JPGs → photos appear as flat upright textured planes arranged in a jittered 3D grid → user navigates with mouse drag (orbit) and scroll-zoom-toward-cursor → hover gets the cyan WebGL outline glow → click opens a full-res lightbox.

**Architecture:** Photos live in a Zustand `photoStore` populated by the LandingScreen drop handler (drag-and-drop or click-to-pick). A new `SpaceScene` React component reads the store, runs `computeLayout` to assign each photo a 3D position in a jittered grid, creates a textured plane (`PhotoCard`) per photo with the photo's aspect ratio, and adds them to the scene. Cards billboard to face the camera each frame. OrbitControls is wrapped to support zoom-toward-cursor on scroll. The render pipeline is simplified to `RenderPass → OutlinePass → SMAA → OutputPass` — TAA is dropped (it was producing the black screen and adds nothing for static-camera photo work). A `PhotoLightbox` React modal layers above the canvas for click-to-zoom-fullres.

**Tech Stack:** Same as foundation — Vite, React 19, TS, Three.js, Zustand, Vitest. No new libraries.

---

## File Structure

```
src/
├── App.tsx                              # Modified — three views: landing | processing | space
├── main.tsx                             # Unchanged
├── components/
│   ├── LandingScreen.tsx                # Modified — real drop handler
│   ├── ProcessingScreen.tsx             # New — progress UI during photo loading
│   ├── SpaceScene.tsx                   # New — replaces GlobeScene
│   ├── SpaceHud.tsx                     # New — replaces GlobeHud (file count + clear)
│   ├── PhotoLightbox.tsx                # New — full-res modal
│   ├── SvgFilters.tsx                   # Unchanged
│   └── ui/
│       └── FrostPanel.tsx               # Unchanged
├── lib/
│   ├── loadPhoto.ts                     # New — File → { id, name, blobUrl, bitmap, aspectRatio }
│   └── computeLayout.ts                 # New — count → 3D positions, TDD'd
├── store/
│   ├── viewStore.ts                     # Modified — views: 'landing' | 'processing' | 'space'
│   └── photoStore.ts                    # New — loaded photos + selected photo for lightbox
├── styles/                              # Unchanged
├── three/
│   ├── createScene.ts                   # Modified — simpler pipeline (no TAA)
│   ├── createPhotoCard.ts               # New — textured plane mesh
│   ├── createStarField.ts               # Unchanged (kept as ambient background)
│   ├── orbitControlsFactory.ts          # Renamed from controls.ts + zoom-to-cursor
│   └── passes/outlinePassFactory.ts     # Unchanged
├── types/
│   └── photo.ts                         # New — Photo type
tests/
└── lib/
    └── computeLayout.test.ts            # New TDD'd unit tests
```

**Files DELETED:**
- `src/three/createGlobe.ts`
- `src/three/createPhotoNode.ts`
- `src/lib/latLngToVec3.ts`
- `src/lib/greatCircleDistance.ts`
- `src/types/trip.ts`
- `src/components/GlobeScene.tsx`
- `src/components/GlobeHud.tsx`
- `tests/lib/latLngToVec3.test.ts`
- `tests/lib/greatCircleDistance.test.ts`

---

## Milestone A — Render pipeline fix + cleanup

### Task A1: Simplify render pipeline (drop TAA)

**Files:**
- Modify: `src/three/createScene.ts`

The current pipeline `TAA → Outline → SMAA → Output` is producing a black screen because TAA (when used as the first/only scene-rendering pass) needs careful reset/accumulate handling that we don't need. For a static photo space, plain `RenderPass` is correct. SMAA gives crisp edges; OutlinePass gives the selection glow.

- [ ] **Step 1: Replace `src/three/createScene.ts` with EXACTLY:**

```ts
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  ACESFilmicToneMapping,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { createOutlinePass } from './passes/outlinePassFactory';

export interface SceneBundle {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  composer: EffectComposer;
  outline: OutlinePass;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const scene = new Scene();
  scene.background = new Color(0x0a0a0a);

  const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 0, 8);

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const outline = createOutlinePass(scene, camera, window.innerWidth, window.innerHeight);
  composer.addPass(outline);

  const smaa = new SMAAPass(window.innerWidth, window.innerHeight);
  composer.addPass(smaa);

  composer.addPass(new OutputPass());

  function resize(w: number, h: number) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  }

  function dispose() {
    const gl = renderer.getContext();
    const loseContextExt = gl.getExtension('WEBGL_lose_context');
    loseContextExt?.loseContext();
    composer.dispose();
    renderer.dispose();
  }

  return { scene, camera, renderer, composer, outline, resize, dispose };
}
```

- [ ] **Step 2: Verify build still succeeds**

```bash
npm run build
```

Expected: exit 0. Note: `src/components/GlobeScene.tsx` will fail to typecheck because it references `bundle.smaa` and `bundle.taa` (now removed). That's expected — we'll delete that file in Task A2. **However, `npm run build` may fail because of this.** If it does, that is OK and EXPECTED at this point — proceed to A2 to delete the dead file. Just confirm the new `createScene.ts` itself has no errors via `npx tsc -b src/three/createScene.ts` (which won't isolate cleanly with project refs, so accept the broken build as a temporary state).

- [ ] **Step 3: Commit**

```bash
git add src/three/createScene.ts
git commit -m "refactor: simplify render pipeline (drop TAA, add output pass)"
```

---

### Task A2: Delete dead globe + math files

**Files:**
- Delete: `src/three/createGlobe.ts`, `src/three/createPhotoNode.ts`, `src/lib/latLngToVec3.ts`, `src/lib/greatCircleDistance.ts`, `src/types/trip.ts`, `src/components/GlobeScene.tsx`, `src/components/GlobeHud.tsx`, `tests/lib/latLngToVec3.test.ts`, `tests/lib/greatCircleDistance.test.ts`

- [ ] **Step 1: Verify nothing else imports these (excluding the files themselves)**

```bash
grep -rln "createGlobe\|createPhotoNode\|latLngToVec3\|greatCircleDistance\|GlobeScene\|GlobeHud\|types/trip" src/ tests/ | grep -v -E "(createGlobe|createPhotoNode|latLngToVec3|greatCircleDistance|GlobeScene|GlobeHud|trip)\.t" || echo "no external refs"
```

- [ ] **Step 2: Update `src/App.tsx` to no longer import GlobeScene**

Replace `src/App.tsx` with:

```tsx
import { SvgFilters } from './components/SvgFilters';
import { LandingScreen } from './components/LandingScreen';

export default function App() {
  return (
    <>
      <SvgFilters />
      <LandingScreen />
    </>
  );
}
```

(We'll wire the space view back in once `SpaceScene` is built in Task D1.)

- [ ] **Step 3: Update `src/components/LandingScreen.tsx`**

Remove the `setView('globe')` button. Keep the rest of the screen identical for now. Replace the file with:

```tsx
import { FrostPanel } from './ui/FrostPanel';

export function LandingScreen() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-2xl">
        <h1
          style={{
            fontSize: 'var(--font-size-hero-large)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          TripTrace
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--color-grey-300)',
            maxWidth: 520,
          }}
        >
          Drop your trip photos and watch them come alive in a 3D space.
        </p>
      </div>

      <FrostPanel
        style={{
          width: 'min(560px, 90vw)',
          padding: '48px 32px',
          textAlign: 'center',
          borderStyle: 'dashed',
          borderColor: 'rgba(255, 255, 255, 0.18)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--font-size-xl)',
            color: 'var(--color-grey-100)',
            marginBottom: 8,
          }}
        >
          Drop your photos here
        </div>
        <div
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-grey-400)',
            lineHeight: 1.5,
          }}
        >
          JPG/JPEG only for now. Works entirely in your browser — your photos never leave your device.
        </div>
      </FrostPanel>
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/store/viewStore.ts`**

```ts
import { create } from 'zustand';

export type View = 'landing' | 'processing' | 'space';

interface ViewState {
  view: View;
  setView: (v: View) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'landing',
  setView: (v) => set({ view: v }),
}));
```

- [ ] **Step 5: Delete the dead files**

```bash
git rm src/three/createGlobe.ts \
       src/three/createPhotoNode.ts \
       src/lib/latLngToVec3.ts \
       src/lib/greatCircleDistance.ts \
       src/types/trip.ts \
       src/components/GlobeScene.tsx \
       src/components/GlobeHud.tsx \
       tests/lib/latLngToVec3.test.ts \
       tests/lib/greatCircleDistance.test.ts
```

If `src/types/` becomes empty, leave it — Task B1 will populate it.

- [ ] **Step 6: Verify build + tests**

```bash
npm run build
npm test
```

Expected: build exits 0. `npm test` exits non-zero with "No test files found" — that's fine; we'll add tests in Milestone B.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove globe + GPS-related code"
```

---

## Milestone B — Photo data model + layout math

### Task B1: Photo type

**Files:**
- Create: `src/types/photo.ts`

- [ ] **Step 1: Write `src/types/photo.ts`**

```ts
export interface Photo {
  id: string;
  name: string;
  blobUrl: string;        // ObjectURL of the original file (used by lightbox <img>)
  bitmap: ImageBitmap;     // Downscaled bitmap used as the WebGL texture
  aspectRatio: number;     // width / height of the original image
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/photo.ts
git commit -m "feat: photo type"
```

---

### Task B2: photoStore

**Files:**
- Create: `src/store/photoStore.ts`

- [ ] **Step 1: Write `src/store/photoStore.ts`**

```ts
import { create } from 'zustand';
import type { Photo } from '../types/photo';

interface PhotoState {
  photos: Photo[];
  selectedId: string | null;
  setPhotos: (photos: Photo[]) => void;
  clear: () => void;
  setSelected: (id: string | null) => void;
}

export const usePhotoStore = create<PhotoState>((set, get) => ({
  photos: [],
  selectedId: null,
  setPhotos: (photos) => set({ photos }),
  clear: () => {
    // Revoke ObjectURLs and close bitmaps to release memory
    for (const p of get().photos) {
      URL.revokeObjectURL(p.blobUrl);
      p.bitmap.close?.();
    }
    set({ photos: [], selectedId: null });
  },
  setSelected: (id) => set({ selectedId: id }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/store/photoStore.ts
git commit -m "feat: photo store"
```

---

### Task B3: loadPhoto utility

**Files:**
- Create: `src/lib/loadPhoto.ts`

The function takes a `File`, returns a `Photo` with a downscaled bitmap (max 512px on the long edge) for the WebGL texture, and an ObjectURL of the original for the lightbox.

- [ ] **Step 1: Write `src/lib/loadPhoto.ts`**

```ts
import type { Photo } from '../types/photo';

const MAX_TEXTURE_EDGE = 512;

export async function loadPhoto(file: File): Promise<Photo> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Not an image: ${file.name} (type=${file.type})`);
  }

  const blobUrl = URL.createObjectURL(file);

  // Get original dimensions via a temporary ImageBitmap, then make a downscaled copy for WebGL.
  const original = await createImageBitmap(file);
  const aspectRatio = original.width / original.height;

  let targetW = original.width;
  let targetH = original.height;
  if (Math.max(targetW, targetH) > MAX_TEXTURE_EDGE) {
    if (aspectRatio >= 1) {
      targetW = MAX_TEXTURE_EDGE;
      targetH = Math.round(MAX_TEXTURE_EDGE / aspectRatio);
    } else {
      targetH = MAX_TEXTURE_EDGE;
      targetW = Math.round(MAX_TEXTURE_EDGE * aspectRatio);
    }
  }

  const bitmap = await createImageBitmap(file, {
    resizeWidth: targetW,
    resizeHeight: targetH,
    resizeQuality: 'high',
  });
  original.close?.();

  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    blobUrl,
    bitmap,
    aspectRatio,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/loadPhoto.ts
git commit -m "feat: loadPhoto utility (file -> photo with downscaled bitmap)"
```

---

### Task B4: computeLayout (TDD)

**Files:**
- Test: `tests/lib/computeLayout.test.ts`
- Create: `src/lib/computeLayout.ts`

The function assigns each photo a 3D position in a jittered grid centered on the origin. Layers grow automatically with photo count.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeLayout } from '../../src/lib/computeLayout';

describe('computeLayout', () => {
  it('returns an empty array for zero photos', () => {
    const result = computeLayout(0, { cols: 3, rows: 3, spacing: 2, jitter: 0 });
    expect(result).toEqual([]);
  });

  it('places one photo at the origin when jitter is zero', () => {
    const result = computeLayout(1, { cols: 1, rows: 1, spacing: 2, jitter: 0 });
    expect(result).toHaveLength(1);
    expect(result[0].position.x).toBeCloseTo(0);
    expect(result[0].position.y).toBeCloseTo(0);
    expect(result[0].position.z).toBeCloseTo(0);
  });

  it('centers a 3x3 grid around the origin (no jitter)', () => {
    const result = computeLayout(9, { cols: 3, rows: 3, spacing: 2, jitter: 0 });
    expect(result).toHaveLength(9);
    const sumX = result.reduce((acc, s) => acc + s.position.x, 0);
    const sumY = result.reduce((acc, s) => acc + s.position.y, 0);
    expect(sumX).toBeCloseTo(0);
    expect(sumY).toBeCloseTo(0);
  });

  it('grows layers automatically when count exceeds cols*rows', () => {
    const result = computeLayout(15, { cols: 2, rows: 2, spacing: 2, jitter: 0 });
    expect(result).toHaveLength(15);
    // 2x2 = 4 per layer → 15 photos need 4 layers (positions 0..3 in z=z0, 4..7 in z=z1, etc.)
    const zValues = new Set(result.map((s) => Math.round(s.position.z * 1000)));
    expect(zValues.size).toBe(4);
  });

  it('is deterministic with a seeded rng', () => {
    const seededRng = (() => {
      let s = 0;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    });
    const a = computeLayout(20, { cols: 4, rows: 4, spacing: 1, jitter: 0.4 }, seededRng());
    const b = computeLayout(20, { cols: 4, rows: 4, spacing: 1, jitter: 0.4 }, seededRng());
    expect(a).toEqual(b);
  });

  it('respects jitter bounds (offset stays within ± jitter * spacing)', () => {
    const spacing = 2;
    const jitter = 0.3;
    const result = computeLayout(64, { cols: 4, rows: 4, spacing, jitter });
    // For each slot, find its base position (no-jitter) and confirm the actual position
    // is within ±jitter*spacing of it on each axis.
    const jitterMax = jitter * spacing;
    for (const slot of result) {
      const layer = Math.floor(slot.index / 16);
      const inLayer = slot.index % 16;
      const row = Math.floor(inLayer / 4);
      const col = inLayer % 4;
      const baseX = (col - 1.5) * spacing;
      const baseY = (row - 1.5) * spacing;
      const layersTotal = Math.ceil(64 / 16);
      const baseZ = (layer - (layersTotal - 1) / 2) * spacing;
      expect(Math.abs(slot.position.x - baseX)).toBeLessThanOrEqual(jitterMax + 1e-9);
      expect(Math.abs(slot.position.y - baseY)).toBeLessThanOrEqual(jitterMax + 1e-9);
      expect(Math.abs(slot.position.z - baseZ)).toBeLessThanOrEqual(jitterMax + 1e-9);
    }
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
npm test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/computeLayout.ts`**

```ts
export interface LayoutOptions {
  cols: number;       // photos per row
  rows: number;       // rows per layer
  spacing: number;    // unit distance between slots
  jitter: number;     // random offset as a fraction of spacing (0 = perfect grid, 1 = ±spacing)
}

export interface PhotoSlot {
  index: number;
  position: { x: number; y: number; z: number };
}

export function computeLayout(
  count: number,
  options: LayoutOptions,
  rng: () => number = Math.random,
): PhotoSlot[] {
  const { cols, rows, spacing, jitter } = options;
  if (count <= 0) return [];

  const perLayer = cols * rows;
  const layersTotal = Math.ceil(count / perLayer);
  const slots: PhotoSlot[] = [];

  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / perLayer);
    const inLayer = i % perLayer;
    const row = Math.floor(inLayer / cols);
    const col = inLayer % cols;

    const baseX = (col - (cols - 1) / 2) * spacing;
    const baseY = (row - (rows - 1) / 2) * spacing;
    const baseZ = (layer - (layersTotal - 1) / 2) * spacing;

    const jx = (rng() - 0.5) * 2 * jitter * spacing;
    const jy = (rng() - 0.5) * 2 * jitter * spacing;
    const jz = (rng() - 0.5) * 2 * jitter * spacing;

    slots.push({
      index: i,
      position: { x: baseX + jx, y: baseY + jy, z: baseZ + jz },
    });
  }

  return slots;
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/lib/computeLayout.test.ts src/lib/computeLayout.ts
git commit -m "feat: computeLayout (jittered 3D grid)"
```

---

## Milestone C — Three.js photo card + camera controls

### Task C1: createPhotoCard mesh

**Files:**
- Create: `src/three/createPhotoCard.ts`

A photo card is a flat plane sized by the photo's aspect ratio, textured with the photo's bitmap. We'll billboard the entire group from the React component each frame (not per-mesh) for performance, but each card holds a `Group` to make orientation control easy if we want fixed orientations later.

- [ ] **Step 1: Write `src/three/createPhotoCard.ts`**

```ts
import {
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  Group,
} from 'three';
import type { Photo } from '../types/photo';

export interface PhotoCard {
  group: Group;
  mesh: Mesh;
  photoId: string;
  dispose: () => void;
}

const CARD_BASE_HEIGHT = 1.0;

export function createPhotoCard(photo: Photo): PhotoCard {
  const width = CARD_BASE_HEIGHT * photo.aspectRatio;
  const height = CARD_BASE_HEIGHT;

  const geom = new PlaneGeometry(width, height);

  const texture = new CanvasTexture(photo.bitmap as unknown as HTMLCanvasElement);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  const mat = new MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new Mesh(geom, mat);
  mesh.userData.photoId = photo.id;
  mesh.userData.kind = 'photoCard';

  const group = new Group();
  group.add(mesh);
  group.userData.photoId = photo.id;

  return {
    group,
    mesh,
    photoId: photo.id,
    dispose: () => {
      geom.dispose();
      mat.dispose();
      texture.dispose();
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/createPhotoCard.ts
git commit -m "feat: photo card mesh (textured billboarded plane)"
```

---

### Task C2: Orbit controls + zoom-to-cursor

**Files:**
- Rename + modify: `src/three/controls.ts` → `src/three/orbitControlsFactory.ts`

OrbitControls already supports `zoomToCursor` via a property — we just need to enable it and make sure the dom element captures the wheel.

- [ ] **Step 1: Rename and replace**

```bash
git mv src/three/controls.ts src/three/orbitControlsFactory.ts
```

- [ ] **Step 2: Replace contents of `src/three/orbitControlsFactory.ts` with EXACTLY:**

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: orbit controls with zoom-to-cursor"
```

---

## Milestone D — SpaceScene component

### Task D1: SpaceScene — mount + load + render

**Files:**
- Create: `src/components/SpaceScene.tsx`

This is the centerpiece. It:
1. Mounts a Three.js scene (with star field for ambient depth)
2. Reads photos from `photoStore`
3. Computes layout positions
4. Creates one PhotoCard per photo, parents into a single root Group, positions them
5. Each frame: billboards every card to the camera, raycasts for hover, sets outline pass selection
6. On click: writes `selectedId` to the photo store

- [ ] **Step 1: Write `src/components/SpaceScene.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import {
  Group,
  Raycaster,
  Vector2,
  type Object3D,
  type Intersection,
} from 'three';
import { createScene } from '../three/createScene';
import { createStarField } from '../three/createStarField';
import { createPhotoCard, type PhotoCard } from '../three/createPhotoCard';
import { setupControls } from '../three/orbitControlsFactory';
import { computeLayout } from '../lib/computeLayout';
import { usePhotoStore } from '../store/photoStore';

function pickGridDims(count: number): { cols: number; rows: number } {
  // Aim for a roughly square per-layer grid. cols ≈ rows ≈ ceil(sqrt(perLayer)),
  // and we put about 6 photos per layer minimum.
  const perLayerTarget = Math.max(6, Math.ceil(Math.sqrt(count) * 1.2));
  const cols = Math.max(2, Math.ceil(Math.sqrt(perLayerTarget)));
  const rows = Math.max(2, Math.ceil(perLayerTarget / cols));
  return { cols, rows };
}

export function SpaceScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bundle = createScene(canvas);
    const { scene, camera, composer, outline, resize } = bundle;

    // Ambient background
    const stars = createStarField(2500, 80);
    scene.add(stars.points);

    // Photo cards
    const cardsRoot = new Group();
    scene.add(cardsRoot);

    const cards: PhotoCard[] = [];
    if (photos.length > 0) {
      const { cols, rows } = pickGridDims(photos.length);
      const slots = computeLayout(photos.length, {
        cols,
        rows,
        spacing: 1.6,
        jitter: 0.35,
      });
      for (let i = 0; i < photos.length; i++) {
        const card = createPhotoCard(photos[i]);
        const { x, y, z } = slots[i].position;
        card.group.position.set(x, y, z);
        cardsRoot.add(card.group);
        cards.push(card);
      }
    }

    // Frame the cloud
    if (cards.length > 0) {
      const span = Math.max(2, Math.cbrt(cards.length) * 1.6);
      camera.position.set(0, 0, span * 2.5);
      camera.lookAt(0, 0, 0);
    }

    const controlsBundle = setupControls(camera, canvas);

    // Raycast targets are the inner meshes (PlaneGeometry), one per card
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

    const onClick = () => {
      if (!pointerInCanvas) return;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData.photoId as string | undefined;
        if (id) setSelected(id);
      }
    };
    canvas.addEventListener('click', onClick);

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

      // Hover detection
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
      canvas.removeEventListener('click', onClick);
      controlsBundle.dispose();
      cards.forEach((c) => c.dispose());
      stars.dispose();
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SpaceScene.tsx
git commit -m "feat: SpaceScene — photos as billboarded cards in jittered 3d grid"
```

---

### Task D2: SpaceHud (frost panel: count + clear)

**Files:**
- Create: `src/components/SpaceHud.tsx`

- [ ] **Step 1: Write `src/components/SpaceHud.tsx`**

```tsx
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';

export function SpaceHud() {
  const setView = useViewStore((s) => s.setView);
  const photos = usePhotoStore((s) => s.photos);
  const clear = usePhotoStore((s) => s.clear);

  const onClear = () => {
    clear();
    setView('landing');
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: 24,
        zIndex: 10,
        display: 'flex',
        gap: 12,
      }}
    >
      <FrostPanel style={{ padding: '8px 14px' }}>
        <button
          onClick={onClear}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-grey-100)',
            fontSize: 'var(--font-size-md)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          ← New space
        </button>
      </FrostPanel>
      <FrostPanel style={{ padding: '8px 14px' }}>
        <span
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-grey-300)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
      </FrostPanel>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SpaceHud.tsx
git commit -m "feat: SpaceHud (count + clear)"
```

---

## Milestone E — Lightbox + landing-page drop handler + processing screen

### Task E1: PhotoLightbox modal

**Files:**
- Create: `src/components/PhotoLightbox.tsx`

- [ ] **Step 1: Write `src/components/PhotoLightbox.tsx`**

```tsx
import { useEffect } from 'react';
import { usePhotoStore } from '../store/photoStore';

export function PhotoLightbox() {
  const selectedId = usePhotoStore((s) => s.selectedId);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);

  const photo = selectedId ? photos.find((p) => p.id === selectedId) : null;

  useEffect(() => {
    if (!photo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo, setSelected]);

  if (!photo) return null;

  return (
    <div
      onClick={() => setSelected(null)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        cursor: 'zoom-out',
      }}
    >
      <img
        src={photo.blobUrl}
        alt={photo.name}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: 8,
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.5)',
          cursor: 'default',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PhotoLightbox.tsx
git commit -m "feat: PhotoLightbox modal"
```

---

### Task E2: ProcessingScreen

**Files:**
- Create: `src/components/ProcessingScreen.tsx`
- Modify: `src/store/viewStore.ts` (add a progress field)

We need a simple progress UI while photos load. The drop handler will set `loaded`/`total` counts.

- [ ] **Step 1: Replace `src/store/viewStore.ts` with EXACTLY:**

```ts
import { create } from 'zustand';

export type View = 'landing' | 'processing' | 'space';

interface ViewState {
  view: View;
  loaded: number;
  total: number;
  setView: (v: View) => void;
  setProgress: (loaded: number, total: number) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'landing',
  loaded: 0,
  total: 0,
  setView: (v) => set({ view: v }),
  setProgress: (loaded, total) => set({ loaded, total }),
}));
```

- [ ] **Step 2: Write `src/components/ProcessingScreen.tsx`**

```tsx
import { useViewStore } from '../store/viewStore';

export function ProcessingScreen() {
  const loaded = useViewStore((s) => s.loaded);
  const total = useViewStore((s) => s.total);
  const pct = total === 0 ? 0 : Math.round((loaded / total) * 100);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6">
      <div
        style={{
          fontSize: 'var(--font-size-xl)',
          color: 'var(--color-grey-100)',
          letterSpacing: '0.02em',
        }}
      >
        Building your space…
      </div>
      <div
        style={{
          width: 320,
          height: 4,
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width var(--duration-color) var(--ease-translate)',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-md)',
          color: 'var(--color-grey-400)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loaded} / {total} photos
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/store/viewStore.ts src/components/ProcessingScreen.tsx
git commit -m "feat: processing screen + view-store progress"
```

---

### Task E3: Real drop handler in LandingScreen

**Files:**
- Modify: `src/components/LandingScreen.tsx`

- [ ] **Step 1: Replace `src/components/LandingScreen.tsx` with EXACTLY:**

```tsx
import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { loadPhoto } from '../lib/loadPhoto';

const ACCEPTED = /\.(jpe?g)$/i;

export function LandingScreen() {
  const setView = useViewStore((s) => s.setView);
  const setProgress = useViewStore((s) => s.setProgress);
  const setPhotos = usePhotoStore((s) => s.setPhotos);
  const [dragOver, setDragOver] = useState(false);

  const ingest = useCallback(
    async (files: File[]) => {
      const jpgs = files.filter((f) => ACCEPTED.test(f.name));
      if (jpgs.length === 0) return;

      setProgress(0, jpgs.length);
      setView('processing');

      const out: Awaited<ReturnType<typeof loadPhoto>>[] = [];
      for (let i = 0; i < jpgs.length; i++) {
        try {
          const photo = await loadPhoto(jpgs[i]);
          out.push(photo);
        } catch (err) {
          console.warn(`Skipping ${jpgs[i].name}:`, err);
        }
        setProgress(i + 1, jpgs.length);
      }

      setPhotos(out);
      setView('space');
    },
    [setView, setProgress, setPhotos],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const items = e.dataTransfer.files;
      ingest(Array.from(items));
    },
    [ingest],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      ingest(Array.from(files));
    },
    [ingest],
  );

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-2xl">
        <h1
          style={{
            fontSize: 'var(--font-size-hero-large)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          TripTrace
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--color-grey-300)',
            maxWidth: 520,
          }}
        >
          Drop your trip photos and watch them come alive in a 3D space.
        </p>
      </div>

      <FrostPanel
        style={{
          width: 'min(560px, 90vw)',
          padding: '48px 32px',
          textAlign: 'center',
          borderStyle: 'dashed',
          borderColor: dragOver ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.18)',
          transition: `border-color var(--duration-color) var(--ease-translate)`,
        }}
        // FrostPanel forwards `style` only; drop events go on the wrapper below.
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{ display: 'block', cursor: 'pointer' }}
        >
          <input
            type="file"
            multiple
            accept="image/jpeg,.jpg,.jpeg"
            onChange={onPick}
            style={{ display: 'none' }}
          />
          <div
            style={{
              fontSize: 'var(--font-size-xl)',
              color: 'var(--color-grey-100)',
              marginBottom: 8,
            }}
          >
            Drop your photos here
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--color-grey-400)',
              lineHeight: 1.5,
            }}
          >
            JPG/JPEG only for now. Click to choose files. Works entirely in your browser —
            your photos never leave your device.
          </div>
        </label>
      </FrostPanel>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LandingScreen.tsx
git commit -m "feat: landing screen drop handler (jpgs only)"
```

---

### Task E4: Wire App view machine

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `src/App.tsx` with EXACTLY:**

```tsx
import { SvgFilters } from './components/SvgFilters';
import { LandingScreen } from './components/LandingScreen';
import { ProcessingScreen } from './components/ProcessingScreen';
import { SpaceScene } from './components/SpaceScene';
import { SpaceHud } from './components/SpaceHud';
import { PhotoLightbox } from './components/PhotoLightbox';
import { useViewStore } from './store/viewStore';

export default function App() {
  const view = useViewStore((s) => s.view);

  return (
    <>
      <SvgFilters />
      {view === 'landing' && <LandingScreen />}
      {view === 'processing' && <ProcessingScreen />}
      {view === 'space' && (
        <>
          <SpaceScene />
          <SpaceHud />
          <PhotoLightbox />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify everything builds + tests still pass**

```bash
npm run build
npm test
npx tsc -b
```

Expected: build exit 0, tests exit 0 (computeLayout: 6 tests), tsc exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: app view machine (landing → processing → space)"
```

---

## Milestone F — Manual verification

### Task F1: End-to-end smoke test

There's no automation for visual behavior. Verify by running the dev server and dropping a small set of test JPGs.

- [ ] **Step 1: Start dev server**

```bash
nohup npm run dev > /tmp/triptrace-dev.log 2>&1 &
sleep 3
curl -sI http://localhost:5173/ | head -1
```

Expected: `HTTP/1.1 200 OK`. Leave it running.

- [ ] **Step 2: Manual checks (controller verifies in browser)**

The plan has been executed; control returns to the user. The user should:

1. Open `http://localhost:5173`
2. Verify Landing screen renders (dark, hero, dashed frost panel)
3. Click the drop zone or drag-and-drop a small folder of JPG photos onto the panel
4. Processing screen shows with a cyan progress bar advancing
5. Once complete, Space view appears with photo cards floating in 3D
6. Photos are clearly visible (not back-facing); they billboard as you orbit
7. Drag → orbit, scroll → zoom toward the cursor
8. Hover any photo → cyan outline glow
9. Click a photo → full-res lightbox opens; Esc or click background to close
10. Click "← New space" in the HUD → memory released, returns to Landing
11. No console errors

- [ ] **Step 3: Stop dev server when done**

```bash
pkill -f "vite" || true
```

---

## Self-Review Notes

**Spec coverage (against the new scope):**
- Photos arranged in random rows/columns/layers (artistic scatter) → computeLayout (B4) ✓
- Photos visible from any angle ("straight") → billboarded cards in SpaceScene tick loop ✓
- Mouse navigation (orbit) → OrbitControls (C2) ✓
- Scroll-zoom toward cursor → `zoomToCursor: true` on OrbitControls (C2) ✓
- Hover outline → existing OutlinePass + raycaster in SpaceScene (D1) ✓
- Click → lightbox → PhotoLightbox (E1) ✓

**Out of scope (intentional):**
- HEIC, .MOV/Live Photos
- EXIF / GPS / clustering / geocoding
- Trip stats, journey trail
- Share links
- Camera flythrough animation

**Type consistency:** `Photo` is the single shared shape; `PhotoSlot` is the layout output; `PhotoCard` is the Three.js wrapper. No name collisions.

**TDD coverage:** computeLayout has 6 tests covering empty input, centering, layer growth, determinism, and jitter bounds. The rest of the work is React/WebGL where pixel-perfect tests aren't valuable at this scale.

**Placeholder scan:** No TBDs, no "implement later", no unspecified pieces.
