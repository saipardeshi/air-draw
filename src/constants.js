// Brush colors shown in the control panel.
export const COLORS = [
  { hex: '#00ffff', name: 'Cyan' },
  { hex: '#ff2d78', name: 'Rose' },
  { hex: '#00ff88', name: 'Mint' },
  { hex: '#a855f7', name: 'Violet' },
  { hex: '#ff6b00', name: 'Ember' },
  { hex: '#facc15', name: 'Gold' },
  { hex: '#38bdf8', name: 'Sky' },
  { hex: '#ffffff', name: 'White' },
]

// What the user sees for each gesture. `color: null` means "use the brush color".
export const GESTURE_INFO = {
  DRAW:  { icon: '☝️', label: 'Draw',  hint: 'Index finger up', color: null },
  DRAG:  { icon: '🤏', label: 'Drag',  hint: 'Pinch',           color: '#facc15' },
  ERASE: { icon: '🖐️', label: 'Erase', hint: 'Open palm',       color: '#ff2d78' },
  IDLE:  { icon: '✊', label: 'Idle',  hint: 'Fist',            color: '#8a8f98' },
}
