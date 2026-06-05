# PinViz — Progress Checkpoint

**Last session:** 2026-06-05
**Status:** Local-only pivot shipped. Removed Supabase auth + cloud storage entirely (was burning the free tier after an Instagram traffic spike). The app now runs 100% in the browser: drop photos → visualize in a 3D **AR passthrough** space → arrange with hand gestures. No accounts, no uploads, no server.

---

## TL;DR

PinViz is a browser toy — drop a folder of photos, they appear floating in a 3D space SOOT-WORLD-style, **the live webcam is the backdrop (AR passthrough)**, and you navigate/arrange with **hand gestures via webcam** (or mouse/trackpad as a fallback). Everything is in-memory and local; reload starts fresh. Hosted as a static build on Vercel.

- **Live:** https://pin-viz.vercel.app
- **Repo:** https://github.com/aivsomkar/PinViz
- **Working directory locally:** `/Users/omkar/Desktop/Fun Projects/triptrace` (folder name still says "triptrace" — the *project* is PinViz; `mv` it if you like)
- **Auto-deploy:** push to `main` → Vercel rebuilds (no env vars required)

---

## Tech stack (committed choices)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Fast iteration, no Next.js overkill |
| 3D | Three.js (raw, not r3f) | Custom render pipeline (SMAA + OutlinePass) needs control r3f obscures |
| State | Zustand | Lightweight, three small stores |
| Hand tracking | `@mediapipe/tasks-vision` (HandLandmarker) | Browser-side WASM + WebGL, no server, ~30 fps |
| Hosting | Vercel (static) | Auto-deploy on push, hobby tier free, no backend |
| Style | CSS variables + Tailwind v4 | Tokens-driven, no design system framework |
| Fonts | Geist (variable) | Free, similar mood to SOOT's paid Diatype |

**Explicitly NOT chosen:** any backend/DB/auth (the whole point of the pivot — no Supabase, no accounts), Next.js, R3F.

---

## File map (key files only)

```
src/
├── main.tsx                              # entry: mounts <App /> (no init/auth)
├── App.tsx                               # view machine: landing | processing | space
├── styles/
│   ├── tokens.css                        # design tokens (light theme + yellow accent)
│   └── globals.css                       # reset, font face, SVG filter
├── components/
│   ├── LandingScreen.tsx                 # drop zone (jpg/png/webp), local decode
│   ├── ProcessingScreen.tsx              # progress UI during photo decode
│   ├── CameraLayer.tsx                   # full-screen mirrored webcam backdrop + gesture cheat-sheet + camera lifecycle
│   ├── SpaceScene.tsx                    # Three.js scene (transparent canvas); mouse + trackpad + hand inputs
│   ├── SpaceHud.tsx                      # ← New space / ⊙ Reset view / 🖐 Hands / photo count
│   ├── PhotoLightbox.tsx                 # full-res modal
│   ├── SvgFilters.tsx                    # shared SVG outline filter
│   └── ui/FrostPanel.tsx                 # frost-glass primitive
├── three/
│   ├── createScene.ts                    # transparent renderer + composer (RenderPass → Outline → SMAA → Output)
│   ├── createPhotoCard.ts                # textured plane mesh + white border, billboard-friendly
│   ├── orbitControlsFactory.ts           # OrbitControls config (zoom disabled — we handle it)
│   └── passes/outlinePassFactory.ts      # yellow #ECFF0F outline pass
├── lib/
│   ├── photoHash.ts                      # content hash (vestigial — kept for the loadPhoto pipeline)
│   ├── loadPhoto.ts                      # File → ImageBitmap → Canvas (texture-ready)
│   ├── computeLayout.ts                  # gaussian 2D scatter w/ z-depth + min xy-distance + scale variation
│   ├── handTracking.ts                   # HandTracker class — webcam + MediaPipe HandLandmarker (1280×720)
│   └── gestureRecognizer.ts              # pure: landmark frames → events + per-hand snapshot (TDD'd)
├── store/
│   ├── viewStore.ts                      # current view + progress + reset trigger
│   ├── photoStore.ts                     # photos + files + hashes + layout (all in-memory)
│   └── handStore.ts                      # 🖐 toggle state (enabled — DEFAULT ON, status, errorMessage)
└── types/
    └── photo.ts                          # Photo (canvas + blobUrl + aspect + name + id)

tests/lib/
├── computeLayout.test.ts                 # 8 tests, gaussian scatter + scale + z + minXyDistance
└── gestureRecognizer.test.ts             # 26 tests, pinch/swipe/fist/two-hand state machine + helpers + snapshot
```

**Removed in the local-only pivot:** `components/{AuthGate,AuthForm,SpacesList,LoadingSpaceScreen,SaveSpaceModal}.tsx`, `store/{authStore,spaceStore}.ts`, `lib/{supabase,storage}.ts`, `types/space.ts`, the `supabase/` migrations, `.env*`, and the `@supabase/supabase-js` dependency.

---

## Design decisions worth remembering

### AR passthrough (the backdrop)
- The WebGL canvas is **transparent** (`createScene.ts`: `alpha: true`, `scene.background = null`, `renderer.setClearColor(0,0)`, `RenderPass.clearAlpha = 0`). The full post-processing chain (Outline → SMAA → Output) preserves alpha, so the page behind the canvas shows through. *Verified in isolation — the chain does NOT black out the background.*
- `CameraLayer.tsx` renders the live `<video>` full-screen, **mirrored** (`scaleX(-1)`), at `zIndex: 0`; the canvas sits at `zIndex: 1`. Result: you see yourself + room, photos float in front.
- Webcam bumped to **1280×720** since the feed is now the whole backdrop, not a thumbnail.
- Camera/hand-tracking is **on by default** (`handStore.enabled = true`). Toggle 🖐 in the HUD to turn it off (background falls back to gray).

### Layout
- **Gaussian 2D scatter** (`gaussian(rng) * spread` for x/y, `gaussian * spread * 0.6` for z). Denser at center, sparser at edges.
- **Variable scale 0.5×–2.0×** per photo. Random per-slot, gives visual rhythm.
- **`minXyDistance` rejection sampling** (default 1.2 units) so two photos don't sit at the exact same xy spot.

### Camera + zoom (mouse / trackpad — the fallback)
- **OrbitControls' built-in zoom is DISABLED.** OrbitControls doesn't damp the dolly, so trackpad wheel events felt choppy.
- **Custom smooth zoom** in `SpaceScene.tsx`: tracks a scalar `targetDistance` + a `targetTarget` Vec3, lerped each frame (`ZOOM_LERP = 0.25`, `TARGET_LERP = 0.18`).
- **Zoom-to-cursor (mouse only):** on zoom-in, `targetTarget` is pulled toward the world point under the cursor. Hand zoom bypasses this (no cursor focus point).
- **No rotation** — `controls.enableRotate = false`. Drag = pan only.

### Hand gestures — two-mode model (the headline)
The recognizer (`gestureRecognizer.ts`) is scene-agnostic: it emits discrete **events** (`pinchStart/Move/End`, `swipe`, `fist`, `twoHandMove`, `twoHandTwist`) AND exposes a per-frame **`snapshot`** of each hand's derived features (pinch, fist, roll, palm-width depth proxy, thumb-middle spread, index-tip pointer, center). `SpaceScene.tsx` interprets these by mode.

- **MediaPipe HandLandmarker**, up to 2 hands × 21 landmarks. Model lazy-loaded from Google's CDN. Webcam x is mirrored once in `HandTracker` so the user's right hand maps to screen-right.
- **Navigate mode** (nothing grabbed):
  - ☝️ point → the targeted photo highlights (hand-driven hover via index-tip raycast)
  - 🤏 pinch a photo → grab (→ Edit mode); pinch empty space + drag → pan
  - 👋 swipe one open hand → spin the whole cloud on a free axis, with momentum (decays via friction)
  - ✊ fist → brake the spin instantly
  - 🤲 two open hands apart/together → zoom the whole cloud
  - 🔄 two pinched hands twist → turntable-rotate the cloud (deliberate, no momentum)
- **Edit mode** (a photo is held — sustained pinch):
  - move hand → reposition; move hand toward camera (palm grows) → pull closer / push away
  - thumb↔middle-finger spread → resize (one-handed); or bring the other open hand up and spread both hands → resize (two-handed). Mutually exclusive by second-hand presence, with baselines re-captured on switch to avoid jumps.
  - 🌀 roll the wrist → roll the photo in its plane (session-only; see below)
  - **release the pinch → drop in place.** New position + scale are written back into `photoStore.layout`, so placement sticks for the session.
- **Disambiguation:** two-hand zoom needs *both open*; twist needs *both pinched*; two-hand resize-while-holding needs *second hand open* — no two gestures fire from one pose. Anything that mutates the cloud (zoom/twist/swipe) is suppressed while a photo is held.
- **Roll vs billboarding:** cards always face the camera (quaternion copied from camera each frame), so per-card roll is re-applied as a `rotateZ` on top. It's session-only — there's no persistence layer anymore, so it resets on reload regardless.

### Render pipeline (final state)
```
RenderPass(scene, camera) → OutlinePass (yellow) → SMAAPass → OutputPass
```
All passes preserve alpha for the AR passthrough. TAA was dropped early (black screen as the sole render pass, unneeded for static content).

### Photo card
- Two planes per card: white border plane (slightly larger) + photo plane in front at z=0.001. Polaroid feel.
- Decoded into a 2D `<canvas>` before becoming the texture source — ImageBitmap's flipY is browser-inconsistent, canvas is reliable.

---

## How to pick up locally

```bash
cd "/Users/omkar/Desktop/Fun Projects/triptrace"
npm install      # in case node_modules is wiped
npm run dev      # http://localhost:5173
npm test         # 34 unit tests
npm run build    # tsc -b && vite build
```

No `.env`, no keys, nothing to configure. Drop photos, allow the camera, gesture away.

---

## Tuning knobs (where to twiddle if something feels off)

These gesture/feel constants were reasoned, not yet tuned on real hardware over many sessions — expect to tweak.

| Behavior | File | Value |
|---|---|---|
| Photo scatter spread | `src/lib/computeLayout.ts` | `spread = Math.cbrt(count) * 1.4` |
| Z depth (parallax) | same | `depthRatio = 0.6` |
| Card size variation | same | `scaleMin = 0.5`, `scaleMax = 2.0` |
| Min distance between photos | same | `minXyDistance = 1.2` |
| Zoom step per scroll event | `src/components/SpaceScene.tsx` | `ZOOM_STEP = 0.86` |
| Zoom smoothing | same | `ZOOM_LERP = 0.25`, `TARGET_LERP = 0.18` |
| Camera framing distance | same | `distance = spread * 5.5` |
| **Pinch detection threshold** | `src/lib/gestureRecognizer.ts` | `PINCH_THRESHOLD = 0.06` |
| **Swipe trigger threshold** | same | `SWIPE_THRESHOLD = 0.035` (per-frame normalized travel) |
| **Two-hand zoom gain** | `src/components/SpaceScene.tsx` | `TWO_HAND_GAIN = 3.0` |
| **Two-hand twist gain** | same | `TWIST_GAIN = 1.6` |
| **Swipe→spin gain / friction / clamp** | same | `SPIN_GAIN = 0.9`, `SPIN_FRICTION = 0.95`, `SPIN_MAX = 0.12` |
| **Held-photo depth range** | same | `HELD_MIN_DIST = 1.5`, `HELD_MAX_DIST = 40` |
| **Hand-pan sensitivity** | same | `PAN_SCALE_X/Y = canvas * 0.5` |
| Outline color / strength | `src/three/passes/outlinePassFactory.ts` | `0xecff0f`, `edgeStrength = 10` |
| WebGL texture size | `src/lib/loadPhoto.ts` | `MAX_TEXTURE_EDGE = 512` |
| Card border thickness | `src/three/createPhotoCard.ts` | `BORDER_RATIO = 0.05` |
| Webcam resolution | `src/lib/handTracking.ts` | `1280×720` (ideal) |

---

## What's next (rough priority)

1. **Tune gesture feel on real hardware.** The constants above are reasoned, not hand-tested over time. Likely first targets: swipe threshold (twitchy vs sluggish), spin friction, two-hand zoom gain, held-photo depth mapping. If one-handed move+depth+roll+scale-at-once feels chaotic, gate depth/roll behind a deadzone.
2. **Pinch-tap to open the lightbox.** Gestures handle navigation/arrangement; opening the full-res lightbox still needs a mouse click. Add a quick-pinch ("tap": short pinch with minimal travel) → raycast at the index-tip → `setSelected`.
3. **Shuffle / regenerate layout.** Reset only re-frames the camera; the scatter is fixed at mount. Add `triggerReshuffle()` on viewStore + watch in SpaceScene.
4. **Gesture onboarding.** The cheat-sheet in `CameraLayer` lists everything, but a first-run animated walkthrough would land better.
5. **Sort/arrange modes** (SOOT's Name / Color / Date) — each a distinct strategy in `computeLayout.ts`. "Color" = cluster by dominant hue computed at decode.
6. **Performance at ~500+ photos** — `InstancedMesh` for cards, spatial partitioning for the raycaster, texture atlas.
7. **Optional: bring back saving — locally.** If you ever want persistence without a backend, serialize `photoStore` (layout + downscaled photo blobs) to IndexedDB and offer "export/import a space" as a file. Keeps the no-server property.
8. **Fix folder name (cosmetic)** — local dir is `triptrace`, product is PinViz.

---

## Known limitations / quirks

- **Nothing persists.** Reload = blank slate. By design (local-only, no storage). See follow-up #7 for an offline-only persistence path.
- **Hand control needs decent lighting.** Dim rooms → jittery tracking. MediaPipe is robust, not magic.
- **No gesture-click** to open the lightbox yet (mouse only). See follow-up #2.
- **Desktop-oriented.** Phone use is awkward (one hand holds the device). Mobile would be a different interaction design.
- **MediaPipe model is CDN-hosted.** First load needs network to fetch the ~3 MB model; offline first-visits won't get hand tracking. Mouse still works.
- **Camera permission required** for the AR backdrop + gestures. Deny it and you get the gray fallback + mouse controls.

---

## Cost summary (current)

| Vendor | Tier | Cost | Notes |
|---|---|---|---|
| Vercel | Hobby | $0 | static build, 100 GB bandwidth/mo |
| MediaPipe | Google CDN | $0 | ~3 MB model, lazy-loaded |

**Total monthly cost: $0**, and crucially **no per-request backend cost** — the reason for the pivot. No Supabase, no DB, no storage egress.

> ⚠️ The old Supabase project (`vokhxjvfcxtdgwyatcqj`) still exists. The app no longer touches it, but **pause/delete it in the Supabase dashboard** to fully guarantee zero usage. Also remove the now-unused `VITE_SUPABASE_*` env vars in Vercel project settings (harmless, just tidy).

---

## Important URLs

- **Production app:** https://pin-viz.vercel.app
- **GitHub repo:** https://github.com/aivsomkar/PinViz
- **Vercel project:** https://vercel.com/dashboard (PinViz project)

---

*To resume: `cd` into the project, `npm run dev`, open http://localhost:5173, drop photos, allow the camera. To deploy: `git push` to `main`. Gestures: pinch a photo to grab/pull/resize/place, swipe to spin, fist to stop, two open hands to zoom, two pinched hands to turntable-rotate.*
