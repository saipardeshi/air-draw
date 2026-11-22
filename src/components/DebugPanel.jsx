const ROWS = [
  ['☝️', 'Index', 'index'],
  ['🖕', 'Middle', 'middle'],
  ['💍', 'Ring', 'ring'],
  ['🤙', 'Pinky', 'pinky'],
  ['🤏', 'Pinch', 'pinch'],
]

// Shows what the app "sees": which fingers are up. Handy when a gesture won't register.
export default function DebugPanel({ fingers }) {
  return (
    <div className="debug">
      <div className="label">Finger state</div>
      {ROWS.map(([icon, name, key]) => {
        const on = Boolean(fingers?.[key])
        return (
          <div className="debug-row" key={key}>
            <span>{icon} {name}</span>
            <span className={`pill ${on ? 'up' : 'down'}`}>{on ? 'UP' : 'DOWN'}</span>
          </div>
        )
      })}
    </div>
  )
}
