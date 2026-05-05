# TripTrace — Product Requirements Document

**Version:** 0.2
**Status:** Draft
**Author:** Omkar
**Last Updated:** 2026-05-05

---

## 1. Overview

### 1.1 Product Summary

TripTrace is a web app that transforms your travel photos into an interactive 3D journey. Upload your trip photos — JPG, HEIC, or Live Photos — and watch your memories come alive as a navigable 3D globe with your journey path traced through it, each stop pinned with the photos you took there.

### 1.2 The Core Insight

Travel photos are fundamentally different from everyday photos. They have location, chronology, and emotional weight. Most gallery apps treat them like any other photo. TripTrace treats them like what they are — chapters of a journey.

### 1.3 The Hero Moment

> You upload your Japan trip photos. A 3D globe appears. A glowing trail traces your path — Tokyo to Kyoto to Osaka. You hover over a node in Arashiyama — a 3-second Live Photo plays, bamboo swaying in the wind. You hit share. Someone opens your link and flies through your trip.

That moment is the product.

---

## 2. Problem Statement

### 2.1 Current Pain

- Google Photos and Apple Photos have a "Places" map view, but it's flat, utilitarian, and buried in menus
- There is no delightful, shareable way to visualize a trip as a spatial journey
- Live Photos are almost never surfaced in a meaningful context outside Apple's own apps
- People take hundreds of travel photos and rarely revisit them in a meaningful way

### 2.2 Target User

**Primary:** iPhone users aged 22–40 who travel at least 2–3 times a year and care about documenting their trips.
**Secondary:** Anyone with a camera who goes on trips and wants a better way to relive and share them.

### 2.3 Jobs To Be Done

- *Relive* a trip in a visually immersive way
- *Share* a trip with friends and family in a way more compelling than a photo dump
- *Discover* forgotten moments by exploring photos spatially

---

## 3. Goals & Non-Goals

### 3.1 Goals (v1)

- Upload local photos (JPG, HEIC, Live Photo pairs) via browser
- Extract GPS and timestamp EXIF data client-side
- Plot photos as nodes on an interactive 3D globe (Three.js)
- Connect nodes chronologically as a glowing journey trail
- On hover/tap: show photo thumbnail; for Live Photos, play the .MOV clip
- Auto-cluster nodes by location proximity (day stops)
- Animate trip playback — camera flies along the journey path
- Generate a shareable public link for a trip
- Basic trip stats: km traveled, countries/cities visited, number of days, photo count

### 3.2 Non-Goals (v1)

- Google Photos API integration — too restricted, deferred to v2
- RAW, TIFF, AVIF, or other niche formats
- User accounts or persistent storage on the server
- Photo editing or filtering
- Social feed or following other users
- Mobile native app
- Photos without GPS metadata (graceful warning shown, photos excluded)
- AI-generated captions or tags (possible v2)

---

## 4. Core Features

### 4.1 Photo Upload & Processing

**Local folder upload via browser**

- Use the File System Access API (`showDirectoryPicker`) for folder selection
- Fallback: standard `<input type="file" multiple>` for broader browser support
- Accept: `.jpg`, `.jpeg`, `.heic`, `.heif`, `.mov` (for Live Photo video pairs)
- Client-side only — no photos are uploaded to any server in v1

**EXIF Extraction**

- Library: `exifr` (handles JPG, HEIC, and MOV metadata)
- Extract: GPS latitude/longitude, GPS altitude (optional), DateTimeOriginal
- Silently skip photos with no GPS data; show count of skipped photos to user
- If GPS exists but no timestamp: use file modified date as fallback

**HEIC Decoding**

- Library: `libheif-js` (WASM-based)
- Decode HEIC to canvas/bitmap client-side before rendering
- Show a loading progress bar during batch decode — this will be slow for large libraries
- Process in batches of 10 to avoid blocking the main thread; use Web Workers
- **Safari fast path:** Safari 16+ renders HEIC natively in `<img>`. Skip libheif-js when `document.createElement('img').decode()` succeeds on a HEIC blob — major perf win for the most likely user (iPhone owner on Mac Safari).

**Live Photo Pairing**

- Match `.HEIC`/`.JPG` with same filename `.MOV` (e.g., `IMG_1234.HEIC` + `IMG_1234.MOV`)
- Store video blob URL alongside the image node
- Flag node as "live" for special hover behavior

---

### 4.2 3D Globe & Journey Visualization

**Renderer**

- Three.js (r155+) with WebGL2
- Globe: sphere geometry with a stylized dark atlas texture (not Google Maps, not real Earth photo — see §11.4 for visual direction)
- Background: deep space / star field particle system
- Camera: OrbitControls for user rotation/zoom; programmatic animation for playback

**Photo Nodes**

- Each node: a small neutral white sphere positioned at GPS coordinates on the globe surface
- **Single-accent discipline:** all nodes share one neutral color. The accent color appears only on hover/selected/playing — never as a default state.
- Live Photos signaled by motion (subtle ripple animation), not by a different color.
- On hover: node receives the selection glow via the WebGL OutlinePass; photo thumbnail appears as an HTML card anchored to the node's projected screen position (see §11.5).
- On click: full photo lightbox opens (modal overlay, outside Three.js canvas)

**Journey Trail**

- Nodes connected chronologically by a glowing bezier curve that arcs slightly above the globe surface (not a straight line — it should feel like a flight path)
- Trail renders progressively in playback mode
- Color: cool neutral with the accent color flowing along it during playback (a single hue, not a gradient between two colors)

**Location Clustering**

- Use a spatial clustering algorithm (k-means or simple radius clustering) to group photos taken within ~500m of each other
- Each cluster becomes one "stop" node
- Cluster label: reverse geocoded city/landmark name (use a free API: Nominatim / OpenStreetMap, no API key required)
- Cluster thumbnail: the first photo chronologically in that cluster

**Globe Controls**

- Mouse drag: rotate globe
- Scroll: zoom in/out
- Click node: open photo
- Double-click empty space: reset to full globe view
- Touch support: pinch zoom, swipe rotate

---

### 4.3 Trip Playback

- A "Play Journey" button triggers an animated camera flythrough
- Camera flies to the first stop, pauses 2 seconds (Live Photo plays if applicable), then flies to the next
- Trail draws itself progressively as the camera moves
- Playback speed control: Slow / Normal / Fast
- User can pause/resume at any time
- Skip to specific stop via a timeline scrubber at the bottom
- All easing uses the project's single motion curve (see §11.3)

---

### 4.4 Live Photo Behavior

- On desktop: hover over a Live Photo node → video plays in the floating card
- On mobile/touch: tap once to see still, tap again to play video
- Video plays muted, loops once, then stops (not a loop — one play per hover)
- Visual indicator on the node: a subtle ripple animation to signal it's a Live Photo

---

### 4.5 Trip Stats Panel

Shown as a collapsible side panel using the frost-glass component (see §11.6):

| Stat | How Calculated |
|---|---|
| Total Distance | Sum of great-circle distances between stops |
| Countries Visited | Reverse geocoded from stop coordinates |
| Cities / Places | Cluster labels |
| Trip Duration | Last photo timestamp − First photo timestamp |
| Photo Count | Total photos with valid GPS |
| Live Photos | Count of paired Live Photos |
| Furthest Point | Stop with greatest distance from home (if baseline set) |

---

### 4.6 Share Trip

- "Share" button generates a compressed trip data payload
- Encode trip as a URL-safe base64 JSON blob containing: stop coordinates, cluster metadata, photo thumbnails (downscaled to ~200px, base64 encoded), stats
- Shared link opens TripTrace with the trip pre-loaded — no server required
- URL will be long but functional. Add a "Copy Link" button.
- Note to user: original full-res photos are never shared — only thumbnails in the link
- v2: proper short links with server-side storage

---

## 5. Technical Architecture

### 5.1 Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | React 18 + Vite + TypeScript | Fast dev, ecosystem, type safety |
| 3D Rendering | Three.js (raw, not react-three-fiber) | Full control of render pipeline; r3f abstracts away post-processing setup |
| Post-processing | Three.js EffectComposer + SMAAPass + custom OutlinePass + TAA | Single accent glow on selection requires a real WebGL outline pass, not CSS |
| EXIF | exifr | Best multi-format support including HEIC |
| HEIC Decode | libheif-js (Chrome/Firefox) + native `<img>` (Safari) | Only viable client-side options |
| Geocoding | Nominatim (OSM) | Free, no API key |
| Styling | CSS variables (design tokens) + Tailwind utilities | Tokens drive consistency; utilities for layout |
| State | Zustand | Lightweight, no boilerplate |
| File Access | File System Access API + `<input>` fallback | Browser support balance |
| Typography | Geist Sans + Geist Mono (free, similar mood to SOOT's Diatype Rounded) | Free alternative |

### 5.2 Data Flow

```
User selects folder
  → File list filtered by type
  → EXIF extracted (exifr) per file
  → HEIC decoded (libheif-js or native) if needed
  → Live Photo pairs matched by filename
  → Photos with GPS coords: clustered by proximity
  → Clusters reverse geocoded (Nominatim)
  → Trip data object constructed
  → Three.js scene built: globe + nodes + trail
  → UI panels populated with stats
```

### 5.3 Performance Considerations

- HEIC decode is the bottleneck. Use Web Workers + batch processing (10 at a time)
- Show a progress indicator with estimated time during HEIC processing
- Three.js texture for globe should be a single 2K image — avoid tiling
- Photo thumbnails: generate a 200px canvas thumbnail client-side for node display; only load full-res on lightbox open
- Nominatim has a 1 req/sec rate limit — throttle geocoding requests, cache results in localStorage keyed by rounded lat/lng
- Use `InstancedMesh` for photo nodes if count exceeds ~50 — single draw call vs N

### 5.4 Browser Support Target

| Browser | Support Level |
|---|---|
| Chrome 110+ | Full |
| Edge 110+ | Full |
| Safari 16+ | Full (native HEIC support helps) |
| Firefox | Partial (no File System Access API — fallback to file input) |
| Mobile Safari | Full |
| Mobile Chrome | Full |

---

## 6. UX & Design Direction

### 6.1 Aesthetic

- **Dark mode only** — deep blacks, dark navy, subtle glows
- **Single-accent discipline** — neutral greys + one accent color (see §11.2). The accent appears only on interaction (hover, selected, playing). Live Photos signaled by motion, not color.
- Minimal UI chrome — the 3D scene should dominate the screen; UI panels are frost-glass overlays (§11.6)
- Reference: SOOT (https://play.soot.com), but applied to a real globe and travel photos

### 6.2 Key Screens

**1. Landing / Upload Screen**
- Full screen dark background
- Large drag-and-drop zone: "Drop your trip photos here"
- Subtext: "Supports JPG, HEIC, and Live Photos. Works entirely in your browser — your photos never leave your device."
- Small example thumbnail of what the globe looks like

**2. Processing Screen**
- Animated globe wireframe (loading state)
- Progress bar with step labels: Reading files → Extracting locations → Building your trip
- Count: "47 photos found, 3 skipped (no location data)"

**3. Globe View (Main Screen)**
- Full-screen Three.js canvas
- Top-left: Trip name (editable, defaults to "My Trip") in frost-glass pill
- Top-right: Share button, Stats toggle, Playback button
- Bottom: Timeline scrubber (hidden until playback starts)
- Photo lightbox: modal overlay triggered by node click

**4. Share Preview**
- Modal showing what the shared link will look like
- Thumbnail preview of the globe
- Warning: "Only low-res thumbnails are shared. Your full photos stay on your device."
- Copy link button

### 6.3 Empty States

- No GPS data in any photos: Full-screen message, friendly explanation, suggestion to enable location on camera
- Less than 2 photos with GPS: Show a single pinned location, no trail
- Single country trip: No "countries visited" stat shown

---

## 7. Milestones & Phasing

### Phase 1 — Foundation (Target: 1 week)
- [ ] Vite + React + TS scaffold
- [ ] Design tokens (color, type, motion, glass) wired up
- [ ] Landing screen UI (drop zone, no processing)
- [ ] Three.js scene with EffectComposer + SMAA + OutlinePass + TAA
- [ ] Stylized globe + star field
- [ ] Smoke-test photo node with selection glow on hover (single hardcoded node)

### Phase 2 — Photo Ingestion (Target: 1 week)
- [ ] File upload + folder picker + drag-drop
- [ ] EXIF extraction (JPG first, then HEIC)
- [ ] libheif-js Web Worker pipeline
- [ ] Live Photo .MOV pairing
- [ ] Trip data model

### Phase 3 — Real Globe (Target: 1 week)
- [ ] Photo nodes plotted from real GPS data (InstancedMesh)
- [ ] Bezier journey trail
- [ ] Hover → world-anchored HTML card with thumbnail
- [ ] Click → lightbox

### Phase 4 — Stats, Clustering, Geocoding (Target: 1 week)
- [ ] Proximity clustering
- [ ] Reverse geocoding via Nominatim (cached)
- [ ] Trip stats panel

### Phase 5 — Playback + Share (Target: 1 week)
- [ ] Camera flythrough animation
- [ ] Timeline scrubber
- [ ] Share link generation (base64 JSON)

### Phase 6 — Optional Stretch
- [ ] Multiple trips saved in localStorage
- [ ] AI-generated trip summary/caption
- [ ] Custom globe textures (satellite, terrain, minimal)

---

## 8. Open Questions

| Question | Priority | Notes |
|---|---|---|
| What's the URL sharing strategy for large photo sets? | High | Base64 URLs can exceed browser limits at ~50+ photos. v1 cap at 20 stops; v2 server-side store. |
| Do we need a backend at all for v1? | High | No — pure client-side |
| How do we handle photos taken in the same location (e.g., hotel)? | Medium | Cluster radius tuning needed |
| Should the globe be a real world map or a stylized one? | Resolved | Stylized — see §11.4 |
| What happens on a device with no WebGL? | Low | Show a flat map fallback or graceful error |
| Nominatim ToS for rate of use on production traffic? | Medium | May need to switch to a different geocoding API at scale |

---

## 9. Success Metrics (Side Project Definition)

Since this is a side project, success is defined simply:

- The hero moment (3D globe + Live Photo hover) works end-to-end
- At least one person shares a trip link and someone else opens it
- The app runs entirely client-side with no backend costs
- You ship it and put it in your portfolio

---

## 10. Out of Scope (Explicitly)

- User accounts or authentication
- Server-side photo storage
- Social features (likes, comments, following)
- Video trips or GoPro footage
- Non-travel photo use cases
- Monetization

---

## 11. Visual & Technical Reference (SOOT-derived)

This section locks in the visual and rendering decisions, derived from a teardown of SOOT's bundle (https://play.soot.com). SOOT is the canonical reference for "feel" — dark space, single accent, crisp WebGL outlines on selection, frost-glass panels, asymmetric ease curve.

### 11.1 What we borrow from SOOT

- Render pipeline: Three.js EffectComposer with SMAA + custom OutlinePass + TAA
- Single-accent discipline: greys + one color, used only on interaction
- HTML labels anchored to 3D points (the `WorldAnchoredOverlay` pattern)
- Frost-glass panel recipe (backdrop-filter blur + contrast + brightness)
- One motion curve, used everywhere
- KTX2 compressed textures (when texture count grows)

### 11.2 What we explicitly do NOT borrow

- Vue 3 → we use React
- Apollo / GraphQL → no backend in v1
- Mux + Media Chrome + HLS.js → we just play `.MOV` blobs in `<video>`
- ABC Diatype Rounded (paid font) → we use Geist (free, similar mood)
- Yellow `#ECFF0F` accent → we pick our own (see §11.3)

### 11.3 Design tokens

```css
:root {
  /* Palette — neutral greys (SOOT's, kept) */
  --color-black: #000000;
  --color-grey-900: #0a0a0a;       /* page background */
  --color-grey-800: #141414;
  --color-grey-700: #1f1f1f;
  --color-grey-600: #2a2a2a;
  --color-grey-500: #666666;
  --color-grey-400: #929292;
  --color-grey-300: #b5b5b5;
  --color-grey-200: #d9d9d9;
  --color-grey-100: #e9e9e9;
  --color-white: #ffffff;

  /* Single accent — TripTrace cyan (chosen over SOOT yellow to avoid feeling derivative; cyan reads as "atlas/sky/water") */
  --color-accent: #3DF9FF;
  --color-accent-glow: rgba(61, 249, 255, 0.6);

  /* System status (utility only — never decorative) */
  --color-system-blue:   #2f80ed;
  --color-system-green:  #27ae60;
  --color-system-orange: #f1913e;
  --color-system-red:    #eb5757;

  /* Typography */
  --font-sans: "Geist", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --font-size-hero-large: 64px;
  --font-size-hero-medium: 48px;
  --font-size-hero-small: 24px;
  --font-size-xxl: 1.5rem;
  --font-size-xl: 1.25rem;
  --font-size-lg: 1rem;
  --font-size-md: 0.75rem;
  --font-size-sm: 0.625rem;

  /* Motion — single curve (SOOT's, kept) */
  --ease-translate: cubic-bezier(0.8, 0, 0.2, 1);
  --duration-color: 0.2s;

  /* Frost glass (SOOT's recipe, kept) */
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

### 11.4 Globe visual direction

- Sphere geometry, radius normalized to 1 in scene units
- Texture: stylized dark atlas — NOT Google Maps, NOT a real Earth photo. A 2K dark-grey landmass-on-near-black map (sourced from Natural Earth or hand-stylized later).
- Slight rim atmosphere via a fragment shader (Fresnel term × accent color × low intensity)
- Subtle rotation drift when idle (~1° per 8s)

### 11.5 WorldAnchoredOverlay pattern

A React component that:
1. Takes a `THREE.Vector3` (a point on the globe in scene space)
2. Each frame, projects it to NDC via the active camera, then to screen pixels
3. Positions its absolutely-positioned children at that screen coord via `transform: translate3d(...)`
4. Hides itself when the point is on the back of the sphere (dot product < 0 against camera direction)

This is how floating photo cards, location labels, and tooltips are rendered — as DOM, not canvas-text. Keeps typography crisp and accessible.

### 11.6 Frost-glass panel

A reusable component using the recipe from SOOT:

```css
.frost-panel {
  background: var(--frost-tint);
  backdrop-filter: blur(var(--frost-blur)) contrast(var(--frost-contrast)) brightness(var(--frost-brightness));
  -webkit-backdrop-filter: blur(var(--frost-blur)) contrast(var(--frost-contrast)) brightness(var(--frost-brightness));
  border-radius: var(--radius-panel);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
```

### 11.7 Render pipeline (Three.js)

```
RenderPass(scene, camera)
  → SMAAPass(width, height)
  → CustomOutlinePass(selectedObjects, accentColor)
  → TAARenderPass(scene, camera)  // for stable temporal AA
  → OutputPass()
```

The custom outline pass is the centerpiece of the SOOT feel — it produces the WebGL-rendered glow on selected meshes. Implementation lives in `src/three/passes/OutlinePass.ts`.

### 11.8 SVG glow filter (for HTML labels)

To match the WebGL outline on HTML overlay text, define this SVG filter once and reference it from CSS:

```svg
<filter id="tt-tooltip-outline">
  <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#3DF9FF" flood-opacity="1" result="blur" />
  <feColorMatrix in="blur" mode="matrix"
    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 32 -1" result="outline" />
  <feFlood flood-color="#3DF9FF" flood-opacity="1" result="offsetColor" />
  <feComposite in="offsetColor" in2="outline" operator="in" result="offsetBlur" />
  <feBlend in="SourceGraphic" in2="offsetBlur" />
</filter>
```

---

*This document is a living draft. Update version number and date on each revision.*
