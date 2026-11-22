// Draws the tracked hand (bones, joints, and the gesture highlights) on the canvas.
// Glow (shadowBlur) is slow, so it's only used on the few shapes that need it.

import { ERASE_RADIUS } from './drawingEngine'

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]
const FINGERTIPS = [4, 8, 12, 16, 20]
const DRAG_COLOR = '#facc15'
const ERASE_COLOR = '#ff2d78'

function circle(ctx, x, y, radius) {
  ctx.moveTo(x + radius, y)  // start here so circles in one path aren't joined by lines
  ctx.arc(x, y, radius, 0, Math.PI * 2)
}

export function drawSkeleton(ctx, hand, gesture, brushColor) {
  const accent =
    gesture === 'DRAW' ? brushColor :
    gesture === 'DRAG' ? DRAG_COLOR :
    gesture === 'ERASE' ? ERASE_COLOR : null

  ctx.save()

  // Bones (one path, one stroke)
  ctx.beginPath()
  for (const [a, b] of BONES) {
    ctx.moveTo(hand[a].x, hand[a].y)
    ctx.lineTo(hand[b].x, hand[b].y)
  }
  ctx.strokeStyle = accent ? `${accent}66` : 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Joints (small dots) and fingertips (bigger dots), one fill each
  ctx.beginPath()
  hand.forEach((p, i) => { if (!FINGERTIPS.includes(i)) circle(ctx, p.x, p.y, i === 0 ? 6 : 4) })
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fill()

  ctx.beginPath()
  for (const i of FINGERTIPS) if (i !== 8) circle(ctx, hand[i].x, hand[i].y, 7)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fill()

  // Index fingertip: the "pen". Glows in the brush color while drawing.
  const tip = hand[8]
  ctx.shadowColor = brushColor
  ctx.shadowBlur = gesture === 'DRAW' ? 28 : 10
  ctx.beginPath()
  circle(ctx, tip.x, tip.y, 11)
  ctx.fillStyle = gesture === 'DRAW' ? brushColor : '#ffffff'
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.beginPath()
  circle(ctx, tip.x, tip.y, 16)
  ctx.strokeStyle = brushColor
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Drag: line between thumb and index with a dot in the middle
  if (gesture === 'DRAG') {
    const thumb = hand[4]
    ctx.shadowColor = DRAG_COLOR
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.moveTo(thumb.x, thumb.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.strokeStyle = DRAG_COLOR
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.beginPath()
    circle(ctx, (thumb.x + tip.x) / 2, (thumb.y + tip.y) / 2, 9)
    ctx.fillStyle = DRAG_COLOR
    ctx.fill()
  }

  // Erase: circle showing what will be erased (same radius the engine uses)
  if (gesture === 'ERASE') {
    ctx.shadowColor = ERASE_COLOR
    ctx.shadowBlur = 18
    ctx.beginPath()
    circle(ctx, hand[9].x, hand[9].y, ERASE_RADIUS)
    ctx.strokeStyle = `${ERASE_COLOR}aa`
    ctx.lineWidth = 2
    ctx.stroke()
  }

  ctx.restore()
}
