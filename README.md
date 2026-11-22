# Air Draw

Draw in the air with your hand. Your webcam sees your hand, and a hand-tracking model
([MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)) turns finger
poses into drawing actions. Everything runs in your browser; no video leaves your computer.

## Run it

```bash
npm install
npm run dev      # then open the printed URL (http://localhost:5173) and allow the camera
```

Needs an internet connection the first time: the hand-tracking model and fonts load from a CDN.
The camera only works on `localhost` or HTTPS.

## Gestures

| Pose | Action |
| --- | --- |
| ☝️ Index finger up, other fingers curled | **Draw** |
| 🤏 Pinch thumb + index (other fingers curled) | **Drag**: move the whole drawing |
| 🖐️ Open palm | **Erase** strokes inside the pink circle |
| ✊ Fist / anything else | **Idle** |

The side panel changes color, thickness and glow, and has Undo and Clear.
"Show finger debug" displays which fingers the app thinks are up. Use it if a gesture won't register.

## How the code is organized

| File | Job |
| --- | --- |
| `src/App.jsx` | Starts the camera and the tracker, runs the per-frame loop, holds UI state |
| `src/handTracker.js` | Loads the MediaPipe model (GPU first, CPU fallback) |
| `src/gestures.js` | Hand points → DRAW / DRAG / ERASE / IDLE (thresholds at the top; tune here) |
| `src/drawingEngine.js` | Strokes: drawing, smoothing, dragging, erasing, rendering |
| `src/skeleton.js` | Draws the hand outline on the canvas |
| `src/components/` | Control panel, gesture guide, debug panel |
| `src/constants.js` | Colors and gesture labels |

## Scripts

`npm run dev` · `npm run build` · `npm run preview` · `npm run lint`
