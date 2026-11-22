import { useEffect, useRef, useState } from 'react'
import { createHandTracker } from './handTracker'
import { analyzeHand, classifyGesture, GestureFilter } from './gestures'
import { DrawingEngine } from './drawingEngine'
import { drawSkeleton } from './skeleton'
import ControlPanel from './components/ControlPanel'
import GestureGuide from './components/GestureGuide'
import DebugPanel from './components/DebugPanel'
import './App.css'

// If the hand is missing for more than this many camera frames, finish the stroke.
// (A frame or two of missed tracking in the middle of a line is ignored.)
const LOST_HAND_FRAMES = 5

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Camera access was blocked. Allow the camera in your browser (lock icon in the address bar), then retry.'
    case 'NotFoundError':
      return 'No camera was found. Connect one and retry.'
    case 'NotReadableError':
      return 'The camera is being used by another app. Close it and retry.'
    default:
      return `Could not start the camera. ${err?.message ?? ''}`.trim()
  }
}

const sameFingers = (a, b) => a === b || (a && b && Object.keys(a).every(k => a[k] === b[k]))

export default function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  // The drawing lives outside React state: it changes every frame.
  const [engine] = useState(() => new DrawingEngine())

  // phase: 'camera' -> 'model' -> 'ready' (or 'error')
  const [phase, setPhase] = useState('camera')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)        // bump to retry starting up

  const [gesture, setGesture] = useState('IDLE')
  const [fingers, setFingers] = useState(null)     // null = no hand visible
  const [showDebug, setShowDebug] = useState(false)

  const [color, setColor] = useState('#00ffff')
  const [thickness, setThickness] = useState(6)
  const [glow, setGlow] = useState(20)

  // The frame loop reads the brush from a ref so it never needs restarting.
  const brushRef = useRef({ color, thickness })
  useEffect(() => { brushRef.current = { color, thickness } }, [color, thickness])
  useEffect(() => { engine.setGlow(glow) }, [engine, glow])

  // Camera + hand tracking + the per-frame loop. Everything is cleaned up on unmount/retry.
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const filter = new GestureFilter()

    let stopped = false
    let stream = null
    let tracker = null
    let frameId = 0
    let lastVideoTime = -1
    let missedFrames = 0

    const fail = message => {
      if (stopped) return
      setError(message)
      setPhase('error')
    }

    function processFrame() {
      const landmarks = tracker.detect(video)
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      if (landmarks) {
        missedFrames = 0
        // Camera points (0..1, not mirrored) -> canvas pixels (mirrored like the video).
        const hand = landmarks.map(l => ({ x: (1 - l.x) * width, y: l.y * height }))
        const info = analyzeHand(hand)
        const raw = classifyGesture(info)
        const steady = filter.update(raw)
        const brush = brushRef.current

        engine.update(steady, raw, hand, brush)
        engine.render(ctx)
        drawSkeleton(ctx, hand, steady, brush.color)

        const states = {
          index: info.index.up, middle: info.middle.up,
          ring: info.ring.up, pinky: info.pinky.up, pinch: info.pinch,
        }
        setGesture(steady)
        setFingers(prev => (sameFingers(prev, states) ? prev : states))  // only re-render on change
      } else {
        if (++missedFrames > LOST_HAND_FRAMES) {
          filter.reset()
          engine.release()
          setGesture('IDLE')
          setFingers(null)
        }
        engine.render(ctx)
      }
    }

    function onFrame() {
      frameId = requestAnimationFrame(onFrame)
      // Only work when the camera delivered a new picture (it is slower than the screen).
      if (video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime
      try {
        processFrame()
      } catch (err) {
        console.error(err)
      }
    }

    async function start() {
      // 1. Camera
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This page needs HTTPS (or localhost) to use the camera.')
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: false,
        })
        if (stopped) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        video.srcObject = stream
        await video.play()
      } catch (err) {
        fail(cameraErrorMessage(err))
        return
      }
      if (stopped) return

      // Make the canvas the same size as the camera picture, so points line up.
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      engine.resize(canvas.width, canvas.height)

      // 2. Hand-tracking model
      setPhase('model')
      try {
        tracker = await createHandTracker()
      } catch (err) {
        console.error(err)
        fail('Could not load the hand-tracking model. Check your internet connection and retry.')
        return
      }
      if (stopped) {
        tracker.close()
        tracker = null
        return
      }

      // 3. Go
      setPhase('ready')
      frameId = requestAnimationFrame(onFrame)
    }

    // Start on the next tick: in development React mounts, unmounts and re-mounts right
    // away, and this way the first (throw-away) mount never opens the camera at all.
    const startTimer = setTimeout(start, 0)

    return () => {
      stopped = true
      clearTimeout(startTimer)
      cancelAnimationFrame(frameId)
      engine.release()
      tracker?.close()
      stream?.getTracks().forEach(t => t.stop())
      video.srcObject = null
    }
  }, [engine, attempt])

  const retry = () => {
    setError('')
    setPhase('camera')
    setAttempt(n => n + 1)
  }

  return (
    <main className="app" style={{ '--accent': color }}>
      {/* The canvas has the same size/crop as the video, so drawings line up with your hand. */}
      <video ref={videoRef} className="layer video" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="layer drawing" />

      <StatusPill phase={phase} handVisible={fingers !== null} />
      <GestureGuide active={gesture} brushColor={color} />

      <ControlPanel
        color={color} onColor={setColor}
        thickness={thickness} onThickness={setThickness}
        glow={glow} onGlow={setGlow}
        onUndo={() => engine.undo()}
        onClear={() => engine.clear()}
      />

      {showDebug && <DebugPanel fingers={fingers} />}
      <button type="button" className="debug-toggle" onClick={() => setShowDebug(s => !s)}>
        {showDebug ? 'Hide' : 'Show'} finger debug
      </button>

      {phase !== 'ready' && <StartupOverlay phase={phase} error={error} onRetry={retry} />}
    </main>
  )
}

function StatusPill({ phase, handVisible }) {
  let text = 'Starting camera…'
  let tone = 'wait'
  if (phase === 'model') text = 'Loading hand tracking…'
  if (phase === 'error') { text = 'Problem'; tone = 'bad' }
  if (phase === 'ready') {
    text = handVisible ? 'Hand detected' : 'Show your hand to the camera'
    tone = handVisible ? 'good' : 'wait'
  }
  return (
    <div className="status" role="status">
      <span className={`status-dot ${tone}`} />
      <span>{text}</span>
    </div>
  )
}

function StartupOverlay({ phase, error, onRetry }) {
  if (phase === 'error') {
    return (
      <div className="overlay" role="alert">
        <div className="overlay-card">
          <h2>Can’t start Air Draw</h2>
          <p>{error}</p>
          <button type="button" className="btn primary" onClick={onRetry}>Retry</button>
        </div>
      </div>
    )
  }
  return (
    <div className="overlay" role="status">
      <div className="overlay-card">
        <div className="spinner" aria-hidden="true" />
        <p>{phase === 'camera' ? 'Waiting for camera permission…' : 'Loading hand tracking (first load can take a few seconds)…'}</p>
      </div>
    </div>
  )
}
