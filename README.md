# PinViz

This project is a heavily modified fork built on the original source from [aivsomkar/PinViz](https://github.com/aivsomkar/PinViz), used and modified with the original author's permission (granted July 2026).

Drop a folder of photos and watch them float around you in a 3D AR space — the live webcam is the backdrop, and you arrange the photos with hand gestures (or mouse). The same app can run in the browser or inside Electron on macOS and Windows. No sign-in, no uploads, no server. Your photos never leave your device.

## Stack

- React 19 + Vite + TypeScript
- Three.js (raw — custom render pipeline with SMAA + OutlinePass over a transparent canvas)
- Zustand for state
- `@mediapipe/tasks-vision` (HandLandmarker) for webcam hand tracking — browser-side WASM + WebGL
- Electron desktop shell for macOS and Windows

No backend. No database. No accounts.

## Run locally

Browser mode:

1. Clone this repository from GitHub.
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`
4. Open http://localhost:5173

Desktop mode:

1. Clone this repository from GitHub.
2. Install dependencies: `npm install`
3. Start the Electron app: `npm run dev:desktop`
4. If the OS asks for camera permission, allow it so the AR view can start.

That's it — there's nothing else to configure.

## How it works

Drop JPG/PNG/WebP files → they're decoded locally into WebGL textures and scattered in 3D. Turn on the camera (on by default) and the webcam fills the background while the photos float in front. Pinch-grab a photo to pull it close, resize it, and place it anywhere; swipe to spin the whole cloud; bring two hands together/apart to zoom. Everything is in-memory for the session — reload and you start fresh.

Run `npm test` for the unit tests (layout + gesture recognizer).
