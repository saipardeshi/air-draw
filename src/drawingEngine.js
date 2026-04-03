const strokes = []
let currentStroke = []
let isDrawing = false

// ── Smoothing ──────────────────────────────────────────────
const buf = []
const BUF = 4

function smooth(x, y) {
  buf.push({ x, y })
  if (buf.length > BUF) buf.shift()
  return {
    x: buf.reduce((s, p) => s + p.x, 0) / buf.length,
    y: buf.reduce((s, p) => s + p.y, 0) / buf.length,
  }
}

// ── Gesture Detection ──────────────────────────────────────
function fingerExtended(tip, dip, pip, mcp) {
  // A finger is extended if tip is significantly above pip AND dip
  return tip.y < pip.y - 0.03 && tip.y < dip.y - 0.01
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

export function getGesture(lm) {
  const thumbTip  = lm[4],  thumbIP   = lm[3],  thumbMCP  = lm[2]
  const indexTip  = lm[8],  indexDIP  = lm[7],  indexPIP  = lm[6],  indexMCP  = lm[5]
  const middleTip = lm[12], middleDIP = lm[11], middlePIP = lm[10], middleMCP = lm[9]
  const ringTip   = lm[16], ringDIP   = lm[15], ringPIP   = lm[14], ringMCP   = lm[13]
  const pinkyTip  = lm[20], pinkyDIP  = lm[19], pinkyPIP  = lm[18], pinkyMCP  = lm[17]
  const wrist     = lm[0]

  const indexUp  = fingerExtended(indexTip,  indexDIP,  indexPIP,  indexMCP)
  const middleUp = fingerExtended(middleTip, middleDIP, middlePIP, middleMCP)
  const ringUp   = fingerExtended(ringTip,   ringDIP,   ringPIP,   ringMCP)
  const pinkyUp  = fingerExtended(pinkyTip,  pinkyDIP,  pinkyPIP,  pinkyMCP)

  // PINCH = thumb tip close to index tip
  const pinchDist = dist(thumbTip, indexTip)
  if (pinchDist < 0.055 && !middleUp && !ringUp && !pinkyUp) return 'DRAG'

  // ERASE = all 4 fingers clearly extended
  if (indexUp && middleUp && ringUp && pinkyUp) return 'ERASE'

  // DRAW = ONLY index finger extended, all others down
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return 'DRAW'

  return 'IDLE'
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
    if (moved > 5) {
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

// ── Main update ────────────────────────────────────────────
export function updateDrawing(gesture, lm, canvas, color, thickness) {
  const rawX = (1 - lm[8].x) * canvas.width
  const rawY = lm[8].y * canvas.height
  const { x, y } = smooth(rawX, rawY)

  if (gesture === 'DRAW') {
    lastDragX = null; lastPalmX = null; lastPalmY = null
    if (!isDrawing) { currentStroke = [{ x, y }]; isDrawing = true }
    else { currentStroke.push({ x, y }) }

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

// ── Render ─────────────────────────────────────────────────
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
    ctx.beginPath()
    ctx.moveTo(s.points[0].x, s.points[0].y)
    for (let i = 1; i < s.points.length - 1; i++) {
      const mx = (s.points[i].x + s.points[i + 1].x) / 2
      const my = (s.points[i].y + s.points[i + 1].y) / 2
      ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mx, my)
    }
    const last = s.points[s.points.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
    ctx.restore()
  })
}

export function undoLast() { strokes.pop() }
export function clearAll() { strokes.length = 0; currentStroke = [] }