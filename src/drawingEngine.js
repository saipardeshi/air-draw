// Holds the drawing (strokes) and changes it based on the current gesture.
//
//   DRAW  -> add points to the stroke being drawn
//   DRAG  -> move every stroke
//   ERASE -> delete strokes touched by the palm circle
//
// Speed trick: finished strokes are painted once onto a hidden "cache" canvas.
// Each frame we only copy that image and paint the stroke being drawn.
// (Painting glowing strokes is slow, so we avoid redoing it for every stroke on every frame.)

import { dist } from './gestures'

export const ERASE_RADIUS = 70   // px, around the palm
const MIN_POINT_GAP = 3          // px, skip points closer than this to the last one

// Smooths the fingertip. Slow movement is smoothed a lot (removes hand shake);
// fast movement is followed closely (no lag).
class Smoother {
  constructor() {
    this.x = null
    this.y = null
  }

  reset() {
    this.x = null
    this.y = null
  }

  next(x, y) {
    if (this.x === null) {
      this.x = x
      this.y = y
    } else {
      const speed = Math.hypot(x - this.x, y - this.y)           // px since last frame
      const t = Math.min(1, speed / 40)                          // 0 = still, 1 = fast
      const follow = 0.25 + 0.6 * t                              // 25% .. 85% of the way
      this.x += (x - this.x) * follow
      this.y += (y - this.y) * follow
    }
    return { x: this.x, y: this.y }  // new object each time: points are stored and edited later
  }
}

// Shortest distance from point p to the line segment a-b.
function distToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

function strokeTouchesCircle(stroke, center, radius) {
  const pts = stroke.points
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(center, pts[i], pts[i + 1]) < radius) return true
  }
  return false
}

// Paints one stroke as a smooth curve (through the midpoints between points).
function paintStroke(ctx, stroke, glow) {
  const pts = stroke.points
  if (pts.length < 2) return

  ctx.save()
  ctx.shadowColor = stroke.color
  ctx.shadowBlur = glow
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.thickness
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2
    const midY = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last.x, last.y)
  ctx.stroke()

  ctx.restore()
}

export class DrawingEngine {
  constructor() {
    this.strokes = []      // finished strokes: { points: [{x, y}], color, thickness }
    this.current = null    // the stroke being drawn right now (or null)
    this.glow = 20
    this.pen = new Smoother()
    this.lastDragPoint = null

    this.cache = null      // hidden canvas holding all finished strokes
    this.cacheCtx = null
    this.cacheStale = true // true = cache must be repainted before the next render
  }

  // Call whenever the visible canvas size is set.
  resize(width, height) {
    this.cache = document.createElement('canvas')
    this.cache.width = width
    this.cache.height = height
    this.cacheCtx = this.cache.getContext('2d')
    this.cacheStale = true
  }

  setGlow(glow) {
    if (glow === this.glow) return
    this.glow = glow
    this.cacheStale = true
  }

  undo() {
    if (this.strokes.pop()) this.cacheStale = true
  }

  clear() {
    this.strokes = []
    this.current = null
    this.lastDragPoint = null
    this.cacheStale = true
  }

  // Called every frame while a hand is visible.
  //   gesture = steady gesture (after the filter), raw = this frame's gesture,
  //   hand = 21 points in canvas px, brush = { color, thickness }
  update(gesture, raw, hand, brush) {
    if (gesture !== 'DRAW') this.endStroke()
    if (gesture !== 'DRAG') this.lastDragPoint = null

    // The hand is changing pose (e.g. the finger is curling) but the filter hasn't
    // switched yet. Ignore those in-between frames so they don't add stray marks.
    if (gesture !== raw) return

    if (gesture === 'DRAW') this.draw(hand[8], brush)
    else if (gesture === 'DRAG') this.drag(hand)
    else if (gesture === 'ERASE') this.erase(hand[9])
  }

  // Called when the hand disappears.
  release() {
    this.endStroke()
    this.lastDragPoint = null
  }

  draw(fingertip, brush) {
    if (!this.current) {
      this.pen.reset()
      const start = this.pen.next(fingertip.x, fingertip.y)
      // Color and thickness are fixed when the stroke starts.
      this.current = { points: [start], color: brush.color, thickness: brush.thickness }
      return
    }
    const point = this.pen.next(fingertip.x, fingertip.y)
    const last = this.current.points[this.current.points.length - 1]
    if (dist(point, last) >= MIN_POINT_GAP) this.current.points.push(point)
  }

  endStroke() {
    const stroke = this.current
    this.current = null
    if (!stroke || stroke.points.length < 2) return  // ignore taps
    this.strokes.push(stroke)
    // Add it to the cache directly instead of repainting everything.
    if (!this.cacheStale && this.cacheCtx) paintStroke(this.cacheCtx, stroke, this.glow)
  }

  drag(hand) {
    // Follow the point between thumb and index finger.
    const grip = { x: (hand[4].x + hand[8].x) / 2, y: (hand[4].y + hand[8].y) / 2 }
    if (this.lastDragPoint) {
      const dx = grip.x - this.lastDragPoint.x
      const dy = grip.y - this.lastDragPoint.y
      for (const stroke of this.strokes) {
        for (const p of stroke.points) {
          p.x += dx
          p.y += dy
        }
      }
      this.cacheStale = true  // strokes moved, so the cache has to be repainted
    }
    this.lastDragPoint = grip
  }

  erase(palm) {
    const before = this.strokes.length
    this.strokes = this.strokes.filter(s => !strokeTouchesCircle(s, palm, ERASE_RADIUS))
    if (this.strokes.length !== before) this.cacheStale = true
  }

  // Draws everything onto the visible canvas.
  render(ctx) {
    if (this.cache) {
      if (this.cacheStale) this.repaintCache()
      ctx.drawImage(this.cache, 0, 0)
    }
    if (this.current) paintStroke(ctx, this.current, this.glow)
  }

  repaintCache() {
    this.cacheCtx.clearRect(0, 0, this.cache.width, this.cache.height)
    for (const stroke of this.strokes) paintStroke(this.cacheCtx, stroke, this.glow)
    this.cacheStale = false
  }
}
