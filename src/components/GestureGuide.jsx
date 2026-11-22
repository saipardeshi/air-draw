import { GESTURE_INFO } from '../constants'

// The list of gestures, with the one you're doing right now highlighted.
export default function GestureGuide({ active, brushColor }) {
  return (
    <ul className="guide" aria-label="Gestures">
      {Object.entries(GESTURE_INFO).map(([key, g]) => (
        <li
          key={key}
          className={`guide-item ${active === key ? 'active' : ''}`}
          style={{ '--g': g.color ?? brushColor }}
          aria-current={active === key}
        >
          <span className="guide-icon" aria-hidden="true">{g.icon}</span>
          <span className="guide-text">
            <b>{g.label}</b>
            <small>{g.hint}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}
