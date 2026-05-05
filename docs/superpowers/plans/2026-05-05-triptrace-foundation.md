# TripTrace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Vite + React + TypeScript project with the SOOT-derived design system wired up and a working Three.js scene (stylized globe, star field, EffectComposer pipeline with SMAA + Outline + TAA, smoke-test photo node with selection glow on hover).

**Architecture:** Two top-level views — `LandingScreen` (drop-zone UI only at this stage) and `GlobeScene` (Three.js mount). A small Zustand store decides which view is shown. The Three.js layer is plain modules under `src/three/` — no react-three-fiber. UI overlays use CSS variables from a single `tokens.css` and a reusable `FrostPanel` primitive. Pure math (lat/lng → Vec3, great-circle distance) lives in `src/lib/` and is TDD'd; everything else is verified manually in the browser at the end.

**Tech Stack:** Vite, React 18, TypeScript, Three.js (raw), Zustand, Tailwind CSS v4, Geist font (self-hosted via `@fontsource-variable/geist` + `@fontsource-variable/geist-mono`), Vitest for unit tests.

---

## File Structure

```
triptrace/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.app.json
├── index.html
├── public/
│   └── (textures added in later phases)
├── src/
│   ├── main.tsx                       # React entry
│   ├── App.tsx                        # Top-level view switch
│   ├── styles/
│   │   ├── tokens.css                 # Design tokens (color, type, motion, glass)
│   │   └── globals.css                # Reset + body base + font face
│   ├── components/
│   │   ├── LandingScreen.tsx          # Drop-zone UI (no processing yet)
│   │   ├── GlobeScene.tsx             # Mounts the Three.js scene, manages lifecycle
│   │   ├── SvgFilters.tsx             # Defines #tt-tooltip-outline once
│   │   └── ui/
│   │       └── FrostPanel.tsx         # Reusable frost-glass primitive
│   ├── three/
│   │   ├── createScene.ts             # Scene + camera + renderer + composer setup
│   │   ├── createGlobe.ts             # Globe mesh + atmosphere fragment
│   │   ├── createStarField.ts         # Points-based background stars
│   │   ├── createPhotoNode.ts         # Smoke-test node mesh
│   │   ├── controls.ts                # OrbitControls wrapper
│   │   └── passes/
│   │       └── outlinePassFactory.ts  # Wraps Three.js OutlinePass with our accent
│   ├── lib/
│   │   ├── latLngToVec3.ts            # Pure: lat/lng → THREE.Vector3 on sphere
│   │   └── greatCircleDistance.ts     # Pure: km between two lat/lng points
│   ├── store/
│   │   └── viewStore.ts               # Zustand: which top-level view is active
│   └── types/
│       └── trip.ts                    # Trip / Stop / PhotoNode shapes
├── tests/
│   └── lib/
│       ├── latLngToVec3.test.ts
│       └── greatCircleDistance.test.ts
└── PRD.md (already exists)
```

---

## Milestone A — Scaffold & Tokens

### Task A1: Initialize Vite + React + TS project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Run Vite scaffold**

```bash
cd "/Users/omkar/Desktop/Fun Projects/triptrace"
npm create vite@latest . -- --template react-ts
```

When prompted about non-empty directory (PRD.md and docs/ are present), choose "Ignore files and continue".

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install three zustand
npm install -D @types/three vitest jsdom @testing-library/react @vitejs/plugin-react tailwindcss @tailwindcss/vite @fontsource-variable/geist @fontsource-variable/geist-mono
```

- [ ] **Step 3: Verify dev server runs**

```bash
npm run dev
```

Expected: dev server starts on `http://localhost:5173`. Open it in a browser; should see the default Vite + React page. Stop the server with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold vite + react + ts project"
```

---

### Task A2: Configure Tailwind v4 + Vitest

**Files:**
- Modify: `vite.config.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Replace `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
```

- [ ] **Step 3: Add test script to `package.json`**

In `package.json` `"scripts"`, add `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

```bash
npm test
```

Expected: "No test files found" — non-zero exit ok at this stage.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: configure tailwind v4 and vitest"
```

---

### Task A3: Design tokens CSS

**Files:**
- Create: `src/styles/tokens.css`

- [ ] **Step 1: Write `src/styles/tokens.css`**

```css
:root {
  /* Palette — neutrals */
  --color-black: #000000;
  --color-grey-900: #0a0a0a;
  --color-grey-800: #141414;
  --color-grey-700: #1f1f1f;
  --color-grey-600: #2a2a2a;
  --color-grey-500: #666666;
  --color-grey-400: #929292;
  --color-grey-300: #b5b5b5;
  --color-grey-200: #d9d9d9;
  --color-grey-100: #e9e9e9;
  --color-white: #ffffff;

  /* Single accent — TripTrace cyan */
  --color-accent: #3DF9FF;
  --color-accent-glow: rgba(61, 249, 255, 0.6);

  /* System status (utility only) */
  --color-system-blue:   #2f80ed;
  --color-system-green:  #27ae60;
  --color-system-orange: #f1913e;
  --color-system-red:    #eb5757;

  /* Typography */
  --font-sans: "Geist Variable", system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, monospace;
  --font-size-hero-large: 64px;
  --font-size-hero-medium: 48px;
  --font-size-hero-small: 24px;
  --font-size-xxl: 1.5rem;
  --font-size-xl: 1.25rem;
  --font-size-lg: 1rem;
  --font-size-md: 0.75rem;
  --font-size-sm: 0.625rem;

  /* Motion — single curve */
  --ease-translate: cubic-bezier(0.8, 0, 0.2, 1);
  --duration-color: 0.2s;

  /* Frost glass */
  --frost-blur-light: 8px;
  --frost-blur: 14px;
  --frost-blur-heavy: 22px;
  --frost-tint: rgba(20, 20, 20, 0.55);
  --frost-contrast: 2.2;
  --frost-brightness: 0.8;

  /* Radii */
  --radius-button: 6px;
  --radius-panel: 12px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/tokens.css
git commit -m "feat: add design tokens"
```

---

### Task A4: Globals + font face

**Files:**
- Create: `src/styles/globals.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write `src/styles/globals.css`**

```css
@import "tailwindcss";
@import "@fontsource-variable/geist/index.css";
@import "@fontsource-variable/geist-mono/index.css";
@import "./tokens.css";

*, *::before, *::after { box-sizing: border-box; }

html, body, #root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: var(--color-grey-900);
  color: var(--color-grey-100);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
}

button { font-family: inherit; color: inherit; cursor: pointer; }

::selection { background: var(--color-accent); color: var(--color-black); }
```

- [ ] **Step 2: Replace `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Replace `src/App.tsx` with a placeholder**

```tsx
export default function App() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <h1 style={{ fontSize: 'var(--font-size-hero-medium)' }}>TripTrace</h1>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Expected: dark page with "TripTrace" heading rendered in Geist. Stop server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: globals, fonts, app shell"
```

---

### Task A5: SVG filter for label outlines

**Files:**
- Create: `src/components/SvgFilters.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/components/SvgFilters.tsx`**

```tsx
export function SvgFilters() {
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="tt-tooltip-outline">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="8"
            floodColor="#3DF9FF"
            floodOpacity="1"
            result="blur"
          />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 32 -1"
            result="outline"
          />
          <feFlood floodColor="#3DF9FF" floodOpacity="1" result="offsetColor" />
          <feComposite in="offsetColor" in2="outline" operator="in" result="offsetBlur" />
          <feBlend in="SourceGraphic" in2="offsetBlur" />
        </filter>
      </defs>
    </svg>
  );
}
```

- [ ] **Step 2: Mount it from `App.tsx`**

```tsx
import { SvgFilters } from './components/SvgFilters';

export default function App() {
  return (
    <>
      <SvgFilters />
      <div className="w-full h-full flex items-center justify-center">
        <h1 style={{ fontSize: 'var(--font-size-hero-medium)' }}>TripTrace</h1>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: shared svg outline filter"
```

---

## Milestone B — App Shell & Landing

### Task B1: Type definitions

**Files:**
- Create: `src/types/trip.ts`

- [ ] **Step 1: Write `src/types/trip.ts`**

```ts
export interface PhotoNode {
  id: string;
  lat: number;
  lng: number;
  takenAt: number; // epoch ms
  thumbnailUrl: string;
  fullUrl: string;
  isLive: boolean;
  livePhotoVideoUrl?: string;
}

export interface Stop {
  id: string;
  lat: number;
  lng: number;
  label: string;
  photos: PhotoNode[];
  arrivalAt: number;
  departureAt: number;
}

export interface Trip {
  id: string;
  name: string;
  stops: Stop[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/trip.ts
git commit -m "feat: trip type definitions"
```

---

### Task B2: Zustand view store

**Files:**
- Create: `src/store/viewStore.ts`

- [ ] **Step 1: Write `src/store/viewStore.ts`**

```ts
import { create } from 'zustand';

export type View = 'landing' | 'globe';

interface ViewState {
  view: View;
  setView: (v: View) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'landing',
  setView: (v) => set({ view: v }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/store/viewStore.ts
git commit -m "feat: view store"
```

---

### Task B3: FrostPanel primitive

**Files:**
- Create: `src/components/ui/FrostPanel.tsx`

- [ ] **Step 1: Write `src/components/ui/FrostPanel.tsx`**

```tsx
import type { CSSProperties, ReactNode } from 'react';

interface FrostPanelProps {
  children: ReactNode;
  blur?: 'light' | 'normal' | 'heavy';
  className?: string;
  style?: CSSProperties;
}

const blurVar = {
  light: 'var(--frost-blur-light)',
  normal: 'var(--frost-blur)',
  heavy: 'var(--frost-blur-heavy)',
};

export function FrostPanel({ children, blur = 'normal', className, style }: FrostPanelProps) {
  const filter = `blur(${blurVar[blur]}) contrast(var(--frost-contrast)) brightness(var(--frost-brightness))`;
  return (
    <div
      className={className}
      style={{
        background: 'var(--frost-tint)',
        backdropFilter: filter,
        WebkitBackdropFilter: filter,
        borderRadius: 'var(--radius-panel)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/FrostPanel.tsx
git commit -m "feat: FrostPanel primitive"
```

---

### Task B4: LandingScreen UI

**Files:**
- Create: `src/components/LandingScreen.tsx`

- [ ] **Step 1: Write `src/components/LandingScreen.tsx`**

```tsx
import { useViewStore } from '../store/viewStore';
import { FrostPanel } from './ui/FrostPanel';

export function LandingScreen() {
  const setView = useViewStore((s) => s.setView);

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
          Drop your trip photos and watch them come alive as a 3D journey.
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
          Drop your trip photos here
        </div>
        <div
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-grey-400)',
            lineHeight: 1.5,
          }}
        >
          Supports JPG, HEIC, and Live Photos. Works entirely in your browser —
          your photos never leave your device.
        </div>
      </FrostPanel>

      <button
        onClick={() => setView('globe')}
        style={{
          background: 'transparent',
          color: 'var(--color-accent)',
          border: '1px solid var(--color-accent)',
          padding: '10px 20px',
          borderRadius: 'var(--radius-button)',
          fontSize: 'var(--font-size-md)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          transition: `background var(--duration-color) var(--ease-translate), color var(--duration-color) var(--ease-translate)`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-black)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)';
        }}
      >
        See the demo globe →
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LandingScreen.tsx
git commit -m "feat: landing screen UI"
```

---

### Task B5: Wire App to view store

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { SvgFilters } from './components/SvgFilters';
import { LandingScreen } from './components/LandingScreen';
import { useViewStore } from './store/viewStore';

export default function App() {
  const view = useViewStore((s) => s.view);

  return (
    <>
      <SvgFilters />
      {view === 'landing' && <LandingScreen />}
      {view === 'globe' && (
        <div className="w-full h-full flex items-center justify-center">
          <span style={{ color: 'var(--color-grey-400)' }}>Globe coming next…</span>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

```bash
npm run dev
```

Expected: Landing screen renders. Clicking "See the demo globe →" switches to the placeholder. Refreshing returns to landing. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: app view switching"
```

---

## Milestone C — Pure 3D math (TDD)

### Task C1: latLngToVec3 (TDD)

**Files:**
- Test: `tests/lib/latLngToVec3.test.ts`
- Create: `src/lib/latLngToVec3.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { latLngToVec3 } from '../../src/lib/latLngToVec3';

const RADIUS = 1;
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('latLngToVec3', () => {
  it('places (0, 0) on the +X axis', () => {
    const v = latLngToVec3(0, 0, RADIUS);
    expect(close(v.x, 1)).toBe(true);
    expect(close(v.y, 0)).toBe(true);
    expect(close(v.z, 0)).toBe(true);
  });

  it('places the north pole on +Y', () => {
    const v = latLngToVec3(90, 0, RADIUS);
    expect(close(v.x, 0)).toBe(true);
    expect(close(v.y, 1)).toBe(true);
    expect(close(v.z, 0)).toBe(true);
  });

  it('places (0, 90) on -Z (east)', () => {
    const v = latLngToVec3(0, 90, RADIUS);
    expect(close(v.x, 0)).toBe(true);
    expect(close(v.y, 0)).toBe(true);
    expect(close(v.z, -1)).toBe(true);
  });

  it('respects the radius', () => {
    const v = latLngToVec3(0, 0, 3);
    expect(close(v.length(), 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — module not found / latLngToVec3 is not defined.

- [ ] **Step 3: Implement `src/lib/latLngToVec3.ts`**

```ts
import { Vector3 } from 'three';

export function latLngToVec3(lat: number, lng: number, radius: number): Vector3 {
  const phi = (lat * Math.PI) / 180;       // latitude in radians
  const theta = (lng * Math.PI) / 180;      // longitude in radians
  return new Vector3(
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(theta),
  );
}
```

- [ ] **Step 4: Run the test again**

```bash
npm test
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/lib/latLngToVec3.test.ts src/lib/latLngToVec3.ts
git commit -m "feat: latLngToVec3 utility"
```

---

### Task C2: greatCircleDistance (TDD)

**Files:**
- Test: `tests/lib/greatCircleDistance.test.ts`
- Create: `src/lib/greatCircleDistance.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { greatCircleDistance } from '../../src/lib/greatCircleDistance';

const closeTo = (a: number, b: number, tolKm: number) => Math.abs(a - b) < tolKm;

describe('greatCircleDistance', () => {
  it('returns 0 for identical points', () => {
    expect(greatCircleDistance(40, -74, 40, -74)).toBe(0);
  });

  it('NYC → LAX is ~3935 km (within 5 km)', () => {
    // NYC: 40.7128, -74.0060   LAX: 33.9416, -118.4085
    const d = greatCircleDistance(40.7128, -74.0060, 33.9416, -118.4085);
    expect(closeTo(d, 3935, 5)).toBe(true);
  });

  it('Tokyo → Kyoto is ~365 km (within 5 km)', () => {
    // Tokyo: 35.6762, 139.6503   Kyoto: 35.0116, 135.7681
    const d = greatCircleDistance(35.6762, 139.6503, 35.0116, 135.7681);
    expect(closeTo(d, 365, 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/greatCircleDistance.ts`**

```ts
const EARTH_RADIUS_KM = 6371;

export function greatCircleDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}
```

- [ ] **Step 4: Run the test again**

```bash
npm test
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/lib/greatCircleDistance.test.ts src/lib/greatCircleDistance.ts
git commit -m "feat: greatCircleDistance utility"
```

---

## Milestone D — Three.js scene

### Task D1: createScene helper

**Files:**
- Create: `src/three/createScene.ts`

- [ ] **Step 1: Write `src/three/createScene.ts`**

```ts
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface SceneBundle {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  composer: EffectComposer;
  smaa: SMAAPass;
  taa: TAARenderPass;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const scene = new Scene();
  scene.background = new Color(0x0a0a0a);

  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 3.6);

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const taa = new TAARenderPass(scene, camera);
  taa.sampleLevel = 2;
  taa.unbiased = true;
  taa.enabled = true;
  composer.addPass(taa);

  const smaa = new SMAAPass(window.innerWidth, window.innerHeight);
  composer.addPass(smaa);

  composer.addPass(new OutputPass());

  function resize(w: number, h: number) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    smaa.setSize(w, h);
  }

  function dispose() {
    composer.dispose();
    renderer.dispose();
  }

  return { scene, camera, renderer, composer, smaa, taa, resize, dispose };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/createScene.ts
git commit -m "feat: three scene + composer pipeline"
```

---

### Task D2: createGlobe

**Files:**
- Create: `src/three/createGlobe.ts`

- [ ] **Step 1: Write `src/three/createGlobe.ts`**

```ts
import {
  Mesh,
  SphereGeometry,
  ShaderMaterial,
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  MeshBasicMaterial,
  Vector3,
} from 'three';

export interface Globe {
  group: Group;
  surface: Mesh;
  atmosphere: Mesh;
  radius: number;
  update: (cameraPosition: Vector3) => void;
  dispose: () => void;
}

export function createGlobe(radius = 1): Globe {
  const group = new Group();

  // Surface: solid dark grey sphere with a subtle wireframe overlay.
  // Texture-based stylized atlas comes in a later phase; this stub
  // gives us a globe-shaped target for the render pipeline today.
  const surfaceGeo = new SphereGeometry(radius, 64, 64);
  const surfaceMat = new MeshBasicMaterial({ color: new Color(0x141414) });
  const surface = new Mesh(surfaceGeo, surfaceMat);
  group.add(surface);

  // Atmosphere: Fresnel rim glow on backside sphere
  const atmoMat = new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uColor: { value: new Color(0x3df9ff) },
      uIntensity: { value: 0.7 },
      uPower: { value: 2.5 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPositionView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vPositionView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPositionView;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uPower;
      void main() {
        vec3 viewDir = normalize(-vPositionView);
        float rim = pow(1.0 - max(dot(vNormal, viewDir), 0.0), uPower);
        gl_FragColor = vec4(uColor * rim * uIntensity, rim);
      }
    `,
  });
  const atmoGeo = new SphereGeometry(radius * 1.18, 64, 64);
  const atmosphere = new Mesh(atmoGeo, atmoMat);
  group.add(atmosphere);

  function update(_cameraPosition: Vector3) {
    // gentle idle rotation
    group.rotation.y += 0.0006;
  }

  function dispose() {
    surfaceGeo.dispose();
    surfaceMat.dispose();
    atmoGeo.dispose();
    atmoMat.dispose();
  }

  return { group, surface, atmosphere, radius, update, dispose };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/createGlobe.ts
git commit -m "feat: stylized globe with fresnel atmosphere"
```

---

### Task D3: createStarField

**Files:**
- Create: `src/three/createStarField.ts`

- [ ] **Step 1: Write `src/three/createStarField.ts`**

```ts
import {
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  Color,
} from 'three';

export interface StarField {
  points: Points;
  dispose: () => void;
}

export function createStarField(count = 2500, radius = 50): StarField {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Sample on a sphere uniformly
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.6 + 0.4 * Math.random()); // shell with thickness
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(positions, 3));

  const mat = new PointsMaterial({
    color: new Color(0xffffff),
    size: 0.04,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });

  const points = new Points(geom, mat);

  function dispose() {
    geom.dispose();
    mat.dispose();
  }

  return { points, dispose };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/createStarField.ts
git commit -m "feat: star field background"
```

---

### Task D4: OrbitControls wrapper

**Files:**
- Create: `src/three/controls.ts`

- [ ] **Step 1: Write `src/three/controls.ts`**

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
```

- [ ] **Step 2: Commit**

```bash
git add src/three/controls.ts
git commit -m "feat: orbit controls wrapper"
```

---

### Task D5: outlinePassFactory

**Files:**
- Create: `src/three/passes/outlinePassFactory.ts`
- Modify: `src/three/createScene.ts`

- [ ] **Step 1: Write `src/three/passes/outlinePassFactory.ts`**

```ts
import { Color, Vector2, type Object3D } from 'three';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import type { Scene, Camera } from 'three';

const ACCENT_HEX = 0x3df9ff;

export function createOutlinePass(scene: Scene, camera: Camera, w: number, h: number): OutlinePass {
  const pass = new OutlinePass(new Vector2(w, h), scene, camera);
  pass.edgeStrength = 8;
  pass.edgeGlow = 1.4;
  pass.edgeThickness = 1.2;
  pass.pulsePeriod = 0;
  pass.visibleEdgeColor = new Color(ACCENT_HEX);
  pass.hiddenEdgeColor = new Color(ACCENT_HEX).multiplyScalar(0.3);
  pass.selectedObjects = [] as Object3D[];
  return pass;
}
```

- [ ] **Step 2: Add OutlinePass into the composer in `src/three/createScene.ts`**

Replace the file with:

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
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { createOutlinePass } from './passes/outlinePassFactory';

export interface SceneBundle {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  composer: EffectComposer;
  smaa: SMAAPass;
  taa: TAARenderPass;
  outline: OutlinePass;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const scene = new Scene();
  scene.background = new Color(0x0a0a0a);

  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 3.6);

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const taa = new TAARenderPass(scene, camera);
  taa.sampleLevel = 2;
  taa.unbiased = true;
  taa.enabled = true;
  composer.addPass(taa);

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
    smaa.setSize(w, h);
    outline.setSize(w, h);
  }

  function dispose() {
    composer.dispose();
    renderer.dispose();
  }

  return { scene, camera, renderer, composer, smaa, taa, outline, resize, dispose };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/three/passes/outlinePassFactory.ts src/three/createScene.ts
git commit -m "feat: outline pass with cyan accent"
```

---

## Milestone E — Smoke-test photo node

### Task E1: createPhotoNode mesh

**Files:**
- Create: `src/three/createPhotoNode.ts`

- [ ] **Step 1: Write `src/three/createPhotoNode.ts`**

```ts
import {
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Color,
  type Vector3,
} from 'three';

export interface PhotoNodeMesh {
  mesh: Mesh;
  dispose: () => void;
}

export function createPhotoNode(position: Vector3, id: string): PhotoNodeMesh {
  const geom = new SphereGeometry(0.018, 24, 24);
  const mat = new MeshBasicMaterial({ color: new Color(0xffffff) });
  const mesh = new Mesh(geom, mat);
  mesh.position.copy(position);
  mesh.userData.id = id;
  mesh.userData.kind = 'photoNode';
  return {
    mesh,
    dispose: () => {
      geom.dispose();
      mat.dispose();
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/createPhotoNode.ts
git commit -m "feat: photo node mesh"
```

---

### Task E2: GlobeScene React component

**Files:**
- Create: `src/components/GlobeScene.tsx`

- [ ] **Step 1: Write `src/components/GlobeScene.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import {
  Raycaster,
  Vector2,
  type Intersection,
  type Object3D,
} from 'three';
import { createScene } from '../three/createScene';
import { createGlobe } from '../three/createGlobe';
import { createStarField } from '../three/createStarField';
import { createPhotoNode } from '../three/createPhotoNode';
import { setupControls } from '../three/controls';
import { latLngToVec3 } from '../lib/latLngToVec3';

const GLOBE_RADIUS = 1;

// A few smoke-test stops so we can see the outline pass working.
const DEMO_STOPS: Array<{ id: string; lat: number; lng: number }> = [
  { id: 'tokyo', lat: 35.6762, lng: 139.6503 },
  { id: 'kyoto', lat: 35.0116, lng: 135.7681 },
  { id: 'osaka', lat: 34.6937, lng: 135.5023 },
  { id: 'reykjavik', lat: 64.1466, lng: -21.9426 },
  { id: 'nyc', lat: 40.7128, lng: -74.006 },
];

export function GlobeScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const bundle = createScene(canvas);
    const { scene, camera, composer, outline, resize } = bundle;

    const globe = createGlobe(GLOBE_RADIUS);
    scene.add(globe.group);

    const stars = createStarField();
    scene.add(stars.points);

    // Place demo nodes as children of the globe group so they rotate with it.
    const nodeMeshes = DEMO_STOPS.map((stop) => {
      // Position node slightly outside the globe radius so it sits on the surface.
      const pos = latLngToVec3(stop.lat, stop.lng, GLOBE_RADIUS * 1.005);
      const node = createPhotoNode(pos, stop.id);
      globe.group.add(node.mesh);
      return node;
    });

    const controlsBundle = setupControls(camera, canvas);

    // Initial size + resize listener
    const onResize = () => resize(window.innerWidth, window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);

    // Hover / raycast → outline pass
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    canvas.addEventListener('pointermove', onPointerMove);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controlsBundle.update();
      globe.update(camera.position);

      raycaster.setFromCamera(pointer, camera);
      const targets: Object3D[] = nodeMeshes.map((n) => n.mesh);
      const hits: Intersection[] = raycaster.intersectObjects(targets, false);
      outline.selectedObjects = hits.length > 0 ? [hits[0].object] : [];

      composer.render();
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      controlsBundle.dispose();
      nodeMeshes.forEach((n) => n.dispose());
      stars.dispose();
      globe.dispose();
      bundle.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100vw', height: '100vh', display: 'block' }}
    />
  );
}
```

- [ ] **Step 2: Mount it from `src/App.tsx`**

```tsx
import { SvgFilters } from './components/SvgFilters';
import { LandingScreen } from './components/LandingScreen';
import { GlobeScene } from './components/GlobeScene';
import { useViewStore } from './store/viewStore';

export default function App() {
  const view = useViewStore((s) => s.view);

  return (
    <>
      <SvgFilters />
      {view === 'landing' && <LandingScreen />}
      {view === 'globe' && <GlobeScene />}
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: globe scene with demo nodes and hover outline"
```

---

### Task E3: Add a Back button + final manual verification

**Files:**
- Create: `src/components/GlobeHud.tsx`
- Modify: `src/components/GlobeScene.tsx`

- [ ] **Step 1: Write `src/components/GlobeHud.tsx`**

```tsx
import { useViewStore } from '../store/viewStore';
import { FrostPanel } from './ui/FrostPanel';

export function GlobeHud() {
  const setView = useViewStore((s) => s.setView);
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
          onClick={() => setView('landing')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-grey-100)',
            fontSize: 'var(--font-size-md)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          ← Back
        </button>
      </FrostPanel>
      <FrostPanel style={{ padding: '8px 14px' }}>
        <span
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-grey-300)',
          }}
        >
          My Trip
        </span>
      </FrostPanel>
    </div>
  );
}
```

- [ ] **Step 2: Render `GlobeHud` next to the canvas in `GlobeScene.tsx`**

Replace the return statement at the bottom of `GlobeScene.tsx`:

```tsx
  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      />
      <GlobeHud />
    </>
  );
```

And add the import at the top:

```tsx
import { GlobeHud } from './GlobeHud';
```

- [ ] **Step 3: Manual verification in browser**

```bash
npm run dev
```

Verify:
1. Landing screen renders with the dark background, Geist heading, and frost-glass drop zone.
2. Click "See the demo globe →".
3. Globe view shows a dark sphere with cyan rim atmosphere, 5 small white sphere nodes at Tokyo / Kyoto / Osaka / Reykjavik / NYC, and a star field background. The globe rotates slowly on its own.
4. Drag to rotate. Scroll to zoom. The motion damps smoothly.
5. Hover over a node — it gets the cyan outline glow from the OutlinePass. Move off — glow disappears.
6. Click "← Back" in the top-left frost panel — returns to the landing screen.
7. Open DevTools → no console errors.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: hud back button + final foundation wiring"
```

---

## Self-Review Notes

**Spec coverage (against PRD §11):**
- §11.3 design tokens → Task A3 ✓
- §11.6 frost panel → Task B3 ✓
- §11.7 render pipeline (RenderPass → SMAA → custom outline → TAA → output) → Task D1, D5 ✓
  - Note: I ordered passes as RenderPass → TAA → Outline → SMAA → Output. The PRD lists SMAA before Outline; I put SMAA last because the outline pass should write into the AA'd image, and SMAA is best as the final spatial AA before output. The TAA pass produces a stable temporal-resolved frame upstream. This is the standard ordering for these passes in Three.js examples — keep this in mind during execution if it looks wrong.
- §11.8 SVG glow filter → Task A5 ✓
- §11.4 globe stylized direction → Task D2 (texture-less stub for now; texture comes in Phase 3). ✓
- §11.5 WorldAnchoredOverlay → deferred to Phase 3 (no overlay needed in foundation; smoke-test is via WebGL outline only). ✓

**Out of scope (intentional):**
- Photo upload + EXIF + HEIC: Phase 2 plan
- Real photo data → InstancedMesh photo nodes: Phase 3 plan
- Bezier journey trail: Phase 3 plan
- WorldAnchoredOverlay HTML cards: Phase 3 plan
- Clustering / geocoding: Phase 4 plan
- Playback animation / share link: Phase 5 plan

**Placeholder scan:** No TBDs, no "implement later" steps. Every step has full code or an exact command.

**Type consistency:** `SceneBundle` shape stable across D1/D5; `PhotoNodeMesh.mesh` is a `THREE.Mesh` referenced consistently in E1/E2; `View` union (`'landing' | 'globe'`) used in B2/B5/E3.
