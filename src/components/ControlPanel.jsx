import { COLORS } from '../constants'

function Slider({ label, value, unit, min, max, onChange }) {
  return (
    <label className="field">
      <span className="field-head">
        <span className="label">{label}</span>
        <span className="value">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function ControlPanel({
  color, onColor, thickness, onThickness, glow, onGlow, onUndo, onClear,
}) {
  return (
    <aside className="panel">
      <h1 className="logo">Air<em>Draw</em></h1>

      <div className="field">
        <div className="label">Color</div>
        <div className="swatches">
          {COLORS.map(c => (
            <button
              key={c.hex}
              type="button"
              className={`swatch ${color === c.hex ? 'selected' : ''}`}
              style={{ '--swatch': c.hex }}
              aria-label={c.name}
              aria-pressed={color === c.hex}
              title={c.name}
              onClick={() => onColor(c.hex)}
            />
          ))}
        </div>
      </div>

      <Slider label="Thickness" value={thickness} unit="px" min={2} max={20} onChange={onThickness} />
      <Slider label="Glow" value={glow} unit="px" min={0} max={50} onChange={onGlow} />

      <div className="actions">
        <button type="button" className="btn" onClick={onUndo}>
          <span aria-hidden="true">↩</span>Undo
        </button>
        <button type="button" className="btn" onClick={onClear}>
          <span aria-hidden="true">🗑</span>Clear
        </button>
      </div>
    </aside>
  )
}
