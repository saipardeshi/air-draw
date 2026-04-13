const strokes = []
let currentStroke = []
let isDrawing = false

// ── Smoothing (increased buffer + weighted averaging) ──────
const buf = []
const BUF = 8  // Increased from 4 to 8 for smoother lines

function smooth(x, y) {
  buf.push({ x, y })
  if (buf.length > BUF) buf.shift()
  // Weighted average — recent points count more
  let wx = 0, wy = 0, wt = 0
  buf.forEach((p, i) => {
    const w = i + 1  // weight increases with recency
    wx += p.x * w
    wy += p.y * w
    wt += w
  })
  return { x: wx / wt, y: wy / wt }
}

// ── Gesture hysteresis — prevents rapid flickering ─────────
let lastGesture = 'IDLE'
const GESTURE_HOLD_FRAMES = 3   // Must see new gesture for N frames before switching
let gestureCandidateCount = 0
let gestureCandidate = 'IDLE'

// ── Gesture Detection ──────────────────────────────────────
function fingerExtended(tip, dip, pip) {
  // More robust: tip must be well above both pip and dip
  return tip.y < pip.y - 0.04 && tip.y < dip.y - 0.02
}

function fingerCurled(tip, pip) {
  return tip.y > pip.y - 0.01
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function getRawGesture(lm) {
  const thumbTip  = lm[4]
  const indexTip  = lm[8],  indexDIP  = lm[7],  indexPIP  = lm[6]
  const middleTip = lm[12], middleDIP = lm[11], middlePIP = lm[10]
  const ringTip   = lm[16], ringDIP   = lm[15], ringPIP   = lm[14]
  const pinkyTip  = lm[20], pinkyDIP  = lm[19], pinkyPIP  = lm[18]

  const indexUp  = fingerExtended(indexTip,  indexDIP,  indexPIP)
  const middleUp = fingerExtended(middleTip, middleDIP, middlePIP)
  const ringUp   = fingerExtended(ringTip,   ringDIP,   ringPIP)
  const pinkyUp  = fingerExtended(pinkyTip,  pinkyDIP,  pinkyPIP)

  const middleCurled = fingerCurled(middleTip, middlePIP)
  const ringCurled   = fingerCurled(ringTip,   ringPIP)
  const pinkyCurled  = fingerCurled(pinkyTip,  pinkyPIP)

  // PINCH = thumb tip close to index tip, other fingers clearly down
  const pinchDist = dist(thumbTip, indexTip)
  if (pinchDist < 0.06 && middleCurled && ringCurled && pinkyCurled) return 'DRAG'

  // ERASE = all 4 fingers clearly extended
  if (indexUp && middleUp && ringUp && pinkyUp) return 'ERASE'

  // DRAW = ONLY index finger extended, all others clearly curled
  if (indexUp && middleCurled && ringCurled && pinkyCurled) return 'DRAW'

  return 'IDLE'
}

export function getGesture(lm) {
  const raw = getRawGesture(lm)

  // Same gesture — reset candidate and confirm
  if (raw === lastGesture) {
    gestureCandidateCount = 0
    gestureCandidate = raw
    return lastGesture
  }

  // New gesture candidate
  if (raw === gestureCandidate) {
    gestureCandidateCount++
    if (gestureCandidateCount >= GESTURE_HOLD_FRAMES) {
      lastGesture = raw
      gestureCandidateCount = 0
    }
  } else {
    gestureCandidate = raw
    gestureCandidateCount = 1
  }

  return lastGesture  // Return stable (old) gesture until new one is confirmed
}

// ── Drag ───────────────────────────────────────────────────
let lastDragX = null
let lastDragY = null

function applyDrag(lm, canvasW, canvasH) {
  const mx = (1 - (lm[4].x + lm[8].x) / 2) * canvasW
  const my = ((lm[4].y + lm[8].y) / 2) * canvasH
  if (lastDragX !== null) {
    const dx = mx - lastDragX
    const dy = my - lastDragY
    strokes.forEach(s => s.points.forEach(p => { p.x += dx; p.y += dy }))
  }
  lastDragX = mx; lastDragY = my
}

// ── Erase ──────────────────────────────────────────────────
let lastPalmX = null
let lastPalmY = null

function applyErase(lm, canvasW, canvasH) {
  const px = (1 - lm[9].x) * canvasW
  const py = lm[9].y * canvasH
  if (lastPalmX !== null) {
    const moved = dist({ x: px, y: py }, { x: lastPalmX, y: lastPalmY })
    if (moved > 3) {  // Lowered threshold for more responsive erasing
      const R = 70
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].points.some(p => dist(p, { x: px, y: py }) < R)) {
          strokes.splice(i, 1)
        }
      }
    }
  }
  lastPalmX = px; lastPalmY = py
}

// ── Min distance between draw points (avoids point-cloud artifacts) ──
const MIN_DRAW_DIST = 3  // pixels

// ── Main update ────────────────────────────────────────────
export function updateDrawing(gesture, lm, canvas, color, thickness) {
  const rawX = (1 - lm[8].x) * canvas.width
  const rawY = lm[8].y * canvas.height
  const { x, y } = smooth(rawX, rawY)

  if (gesture === 'DRAW') {
    lastDragX = null; lastPalmX = null; lastPalmY = null
    if (!isDrawing) {
      buf.length = 0  // Reset smoothing buffer at stroke start
      buf.push({ x: rawX, y: rawY })  // Seed buffer with current position
      currentStroke = [{ x: rawX, y: rawY }]
      isDrawing = true
    } else {
      const last = currentStroke[currentStroke.length - 1]
      // Only add point if moved enough (prevents static dot clusters)
      if (dist({ x, y }, last) >= MIN_DRAW_DIST) {
        currentStroke.push({ x, y })
      }
    }

  } else if (gesture === 'DRAG') {
    if (isDrawing && currentStroke.length > 1)
      strokes.push({ points: [...currentStroke], color, thickness })
    currentStroke = []; isDrawing = false; buf.length = 0
    lastPalmX = null; lastPalmY = null
    applyDrag(lm, canvas.width, canvas.height)

  } else if (gesture === 'ERASE') {
    if (isDrawing && currentStroke.length > 1)
      strokes.push({ points: [...currentStroke], color, thickness })
    currentStroke = []; isDrawing = false; buf.length = 0
    lastDragX = null
    applyErase(lm, canvas.width, canvas.height)

  } else {
    lastDragX = null; lastPalmX = null; lastPalmY = null
    if (isDrawing && currentStroke.length > 1)
      strokes.push({ points: [...currentStroke], color, thickness })
    currentStroke = []; isDrawing = false; buf.length = 0
  }
}

// ── Render (with Catmull-Rom spline for smoother curves) ───
export function renderStrokes(ctx, canvas, color, thickness, glow) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const all = [
    ...strokes,
    currentStroke.length > 1 ? { points: currentStroke, color, thickness } : null
  ].filter(Boolean)

  all.forEach(s => {
    if (s.points.length < 2) return
    ctx.save()
    ctx.shadowColor = s.color
    ctx.shadowBlur = glow
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.thickness
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const pts = s.points
    ctx.beginPath()

    if (pts.length === 2) {
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(pts[1].x, pts[1].y)
    } else {
      // Smooth quadratic spline through midpoints
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2
        const my = (pts[i].y + pts[i + 1].y) / 2
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
      }
      const last = pts[pts.length - 1]
      ctx.lineTo(last.x, last.y)
    }

    ctx.stroke()
    ctx.restore()
  })
}

export function undoLast() { strokes.pop() }
export function clearAll() {
  strokes.length = 0
  currentStroke = []
  buf.length = 0
  lastGesture = 'IDLE'
  gestureCandidate = 'IDLE'
  gestureCandidateCount = 0
}