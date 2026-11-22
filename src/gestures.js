// Turns 21 hand points into one of four gestures: DRAW, DRAG, ERASE or IDLE.
//
// `hand` is an array of 21 {x, y} points in canvas pixels (MediaPipe's landmark
// order). The ones we use: 0 = wrist, 4 = thumb tip, 8 = index tip,
// 9 = base of the middle finger. For each finger, `pip` is the middle joint.
//
// We compare distances to the wrist instead of "is the tip higher on screen",
// so it works with a tilted hand and at any distance from the camera.

const FINGERS = {
  index:  { pip: 6,  tip: 8 },
  middle: { pip: 10, tip: 12 },
  ring:   { pip: 14, tip: 16 },
  pinky:  { pip: 18, tip: 20 },
}

// How far the tip is from the wrist, relative to the middle joint.
// A straight finger is about 1.3, a curled one about 0.7.
const UP_RATIO = 1.15      // at least this = finger is up
const CURLED_RATIO = 1.05  // at most this = finger is curled
// (in between = unsure, which counts as neither, so the result is IDLE)

// Thumb and index tips count as pinched when closer than this fraction of the palm size.
const PINCH_RATIO = 0.35

// A new gesture must be seen this many frames in a row before we switch to it.
const HOLD_FRAMES = 3

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// What the hand looks like right now. Used for the gesture AND the debug panel.
export function analyzeHand(hand) {
  const wrist = hand[0]
  const palmSize = dist(wrist, hand[9]) || 1
  const info = {}
  for (const [name, { pip, tip }] of Object.entries(FINGERS)) {
    const ratio = dist(hand[tip], wrist) / (dist(hand[pip], wrist) || 1)
    info[name] = { up: ratio >= UP_RATIO, curled: ratio <= CURLED_RATIO }
  }
  info.pinch = dist(hand[4], hand[8]) < PINCH_RATIO * palmSize
  return info
}

// The gesture in a single frame (can flicker). Order matters: the first match wins.
export function classifyGesture(info) {
  const othersCurled = info.middle.curled && info.ring.curled && info.pinky.curled
  if (info.pinch && othersCurled) return 'DRAG'
  if (info.index.up && info.middle.up && info.ring.up && info.pinky.up) return 'ERASE'
  if (info.index.up && othersCurled) return 'DRAW'
  return 'IDLE'
}

// Steadies the gesture: only switches after HOLD_FRAMES identical frames in a row.
export class GestureFilter {
  constructor() {
    this.reset()
  }

  reset() {
    this.stable = 'IDLE'
    this.candidate = 'IDLE'
    this.count = 0
  }

  update(raw) {
    if (raw === this.stable) {
      this.candidate = raw
      this.count = 0
      return this.stable
    }
    if (raw === this.candidate) {
      this.count++
    } else {
      this.candidate = raw
      this.count = 1
    }
    if (this.count >= HOLD_FRAMES) {
      this.stable = raw
      this.count = 0
    }
    return this.stable
  }
}
