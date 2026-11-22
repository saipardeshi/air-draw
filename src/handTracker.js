import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// Keep this in sync with the "@mediapipe/tasks-vision" version in package.json,
// otherwise the JS code and the WASM files can disagree.
const MEDIAPIPE_VERSION = '0.10.34'
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

function createLandmarker(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.7,
    minHandPresenceConfidence: 0.7,
    minTrackingConfidence: 0.7,
  })
}

// Loads the hand-tracking model. Tries the GPU first, falls back to the CPU.
// Returns { detect(video), close() }.
export async function createHandTracker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL)

  let landmarker
  try {
    landmarker = await createLandmarker(vision, 'GPU')
  } catch (err) {
    console.warn('GPU hand tracking unavailable, using CPU instead.', err)
    landmarker = await createLandmarker(vision, 'CPU')
  }

  return {
    // Returns the 21 landmarks of the first hand ({x, y, z}, each 0..1), or null.
    detect(video) {
      const result = landmarker.detectForVideo(video, performance.now())
      return result.landmarks?.[0] ?? null
    },
    close() {
      landmarker.close()
    },
  }
}
