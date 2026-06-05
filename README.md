# PinViz

Drop a folder of photos and watch them float around you in a 3D AR space — the live webcam is the backdrop, and you arrange the photos with hand gestures (or mouse). Runs **entirely in your browser**: no sign-in, no uploads, no server. Your photos never leave your device.

## Stack

- React 19 + Vite + TypeScript
- Three.js (raw — custom render pipeline with SMAA + OutlinePass over a transparent canvas)
- Zustand for state
- `@mediapipe/tasks-vision` (HandLandmarker) for webcam hand tracking — browser-side WASM + WebGL
- Vercel for static hosting

No backend. No database. No accounts.

## Local development

1. Clone the repo.
2. Install: `npm install`
3. `npm run dev` → http://localhost:5173

That's it — there's nothing to configure.

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo at vercel.com/new.
3. Deploy. Vercel auto-detects Vite and serves the static build. No environment variables needed.

Pushing to `main` auto-rebuilds the production deploy.

## How it works

Drop JPG/PNG/WebP files → they're decoded locally into WebGL textures and scattered in 3D. Turn on the camera (on by default) and the webcam fills the background while the photos float in front. Pinch-grab a photo to pull it close, resize it, and place it anywhere; swipe to spin the whole cloud; bring two hands together/apart to zoom. Everything is in-memory for the session — reload and you start fresh.

Run `npm test` for the unit tests (layout + gesture recognizer).
