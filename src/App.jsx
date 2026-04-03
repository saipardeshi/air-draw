import { useRef, useEffect, useState } from 'react'
import { initHandTracker, detectHands } from './handTracker'
import { getGesture, updateDrawing, renderStrokes, undoLast, clearAll } from './drawingEngine'

const COLORS = [
  { hex: '#00ffff', name: 'Cyan' },
  { hex: '#ff2d78', name: 'Rose' },
  { hex: '#00ff88', name: 'Mint' },
  { hex: '#a855f7', name: 'Violet' },
  { hex: '#ff6b00', name: 'Ember' },
  { hex: '#facc15', name: 'Gold' },
  { hex: '#38bdf8', name: 'Sky' },
  { hex: '#ffffff', name: 'White' },
]

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
]
const FINGERTIPS = [4, 8, 12, 16, 20]

function drawSkeleton(ctx, lm, W, H, color, gesture) {
  const p = lm.map(l => ({ x: (1 - l.x) * W, y: l.y * H }))

  // Bones
  HAND_CONNECTIONS.forEach(([a, b]) => {
    ctx.beginPath()
    ctx.moveTo(p[a].x, p[a].y)
    ctx.lineTo(p[b].x, p[b].y)
    ctx.strokeStyle = gesture === 'DRAW'  ? `${color}66`  :
                      gesture === 'ERASE' ? '#ff2d7866'   :
                      gesture === 'DRAG'  ? '#facc1566'   :
                      'rgba(255,255,255,0.2)'
    ctx.lineWidth = 2
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.stroke()
  })

  // Joints
  p.forEach((pt, i) => {
    const isTip      = FINGERTIPS.includes(i)
    const isIndexTip = i === 8
    const isThumbTip = i === 4

    const r = isIndexTip ? 11 : isTip ? 7 : i === 0 ? 6 : 4

    ctx.beginPath()
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)

    if (isIndexTip) {
      ctx.fillStyle   = gesture === 'DRAW' ? color : '#ffffff'
      ctx.shadowColor = color
      ctx.shadowBlur  = gesture === 'DRAW' ? 32 : 12
    } else if (isThumbTip && gesture === 'DRAG') {
      ctx.fillStyle   = '#facc15'
      ctx.shadowColor = '#facc15'
      ctx.shadowBlur  = 20
    } else if (isTip) {
      ctx.fillStyle   = 'rgba(255,255,255,0.85)'
      ctx.shadowColor = '#fff'
      ctx.shadowBlur  = 6
    } else {
      ctx.fillStyle   = 'rgba(255,255,255,0.3)'
      ctx.shadowBlur  = 0
    }
    ctx.fill()

    // Outer ring on tips
    if (isTip) {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r + 5, 0, Math.PI * 2)
      ctx.strokeStyle = isIndexTip ? color : 'rgba(255,255,255,0.18)'
      ctx.lineWidth   = 1.5
      ctx.shadowColor = isIndexTip ? color : 'transparent'
      ctx.shadowBlur  = isIndexTip ? 14 : 0
      ctx.stroke()
    }
  })

  // Yellow pinch line for DRAG
  if (gesture === 'DRAG') {
    ctx.beginPath()
    ctx.moveTo(p[4].x, p[4].y)
    ctx.lineTo(p[8].x, p[8].y)
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth   = 2.5
    ctx.shadowColor = '#facc15'
    ctx.shadowBlur  = 18
    ctx.stroke()
    const mx = (p[4].x + p[8].x) / 2
    const my = (p[4].y + p[8].y) / 2
    ctx.beginPath()
    ctx.arc(mx, my, 9, 0, Math.PI * 2)
    ctx.fillStyle   = '#facc15'
    ctx.shadowColor = '#facc15'
    ctx.shadowBlur  = 26
    ctx.fill()
  }

  // Eraser circle
  if (gesture === 'ERASE') {
    const palm = p[9]
    ctx.beginPath()
    ctx.arc(palm.x, palm.y, 70, 0, Math.PI * 2)
    ctx.strokeStyle = '#ff2d7888'
    ctx.lineWidth   = 2
    ctx.shadowColor = '#ff2d78'
    ctx.shadowBlur  = 20
    ctx.stroke()
  }

  ctx.shadowBlur  = 0
  ctx.shadowColor = 'transparent'
}

// ── Finger state tracker for debug panel ──────────────────
function getFingerStates(lm) {
  if (!lm) return null
  const ext = (tip, dip, pip) => lm[tip].y < lm[pip].y - 0.03 && lm[tip].y < lm[dip].y - 0.01
  return {
    index:  ext(8,  7,  6),
    middle: ext(12, 11, 10),
    ring:   ext(16, 15, 14),
    pinky:  ext(20, 19, 18),
    pinch:  Math.sqrt((lm[4].x-lm[8].x)**2 + (lm[4].y-lm[8].y)**2) < 0.055
  }
}

export default function App() {
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const [status,    setStatus]    = useState('Initializing...')
  const [gesture,   setGesture]   = useState('IDLE')
  const [color,     setColor]     = useState('#00ffff')
  const [thickness, setThickness] = useState(6)
  const [glow,      setGlow]      = useState(20)
  const [isReady,   setIsReady]   = useState(false)
  const [fingers,   setFingers]   = useState(null)
  const [showDebug, setShowDebug] = useState(true)

  const colorRef     = useRef(color)
  const thicknessRef = useRef(thickness)
  const glowRef      = useRef(glow)

  useEffect(() => { colorRef.current     = color     }, [color])
  useEffect(() => { thicknessRef.current = thickness }, [thickness])
  useEffect(() => { glowRef.current      = glow      }, [glow])

  useEffect(() => { startEverything() }, [])

  const startEverything = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' }
    })
    videoRef.current.srcObject = stream
    videoRef.current.onloadeddata = async () => {
      setStatus('Loading AI...')
      await initHandTracker()
      setStatus('Ready ✓')
      setIsReady(true)
      detectLoop()
    }
  }

  const detectLoop = () => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!canvas || !video) return
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const results = detectHands(video)

      if (results?.landmarks?.length > 0) {
        const lm = results.landmarks[0]
        const g  = getGesture(lm)
        setGesture(g)
        setFingers(getFingerStates(lm))
        updateDrawing(g, lm, canvas, colorRef.current, thicknessRef.current)
        renderStrokes(ctx, canvas, colorRef.current, thicknessRef.current, glowRef.current)
        drawSkeleton(ctx, lm, canvas.width, canvas.height, colorRef.current, g)
      } else {
        setGesture('IDLE')
        setFingers(null)
        renderStrokes(ctx, canvas, colorRef.current, thicknessRef.current, glowRef.current)
      }

      requestAnimationFrame(loop)
    }
    loop()
  }

  const gi = {
    DRAW:  { icon: '☝️', label: 'Drawing',  bg: color     },
    ERASE: { icon: '🖐️', label: 'Erasing',  bg: '#ff2d78' },
    DRAG:  { icon: '🤏', label: 'Dragging', bg: '#facc15' },
    IDLE:  { icon: '✊',  label: 'Idle',     bg: '#555'    },
  }[gesture] || { icon: '✊', label: 'Idle', bg: '#555' }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        body { background:#000; overflow:hidden; }

        /* ── Panel ── */
        .panel {
          position:absolute; top:50%; right:20px; transform:translateY(-50%);
          width:196px; background:rgba(6,6,10,0.88);
          border:1px solid rgba(255,255,255,0.07); border-radius:24px;
          padding:20px 15px; display:flex; flex-direction:column; gap:18px;
          backdrop-filter:blur(24px); z-index:20;
          box-shadow:0 0 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .logo {
          font-family:'Syne',sans-serif; font-weight:800; font-size:17px;
          color:#fff; text-align:center; letter-spacing:-0.5px;
          padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.06);
        }
        .logo em { color:var(--ac); font-style:normal; }
        .lbl {
          font-family:'Space Mono',monospace; font-size:9px;
          letter-spacing:2px; color:rgba(255,255,255,0.28);
          text-transform:uppercase; margin-bottom:9px;
        }
        .color-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; }
        .dot {
          width:33px; height:33px; border-radius:50%; cursor:pointer;
          transition:transform .15s, box-shadow .15s;
          border:2px solid transparent; position:relative;
        }
        .dot:hover { transform:scale(1.14); }
        .dot.on { border-color:#fff; transform:scale(1.18); }
        .dot.on::after {
          content:''; position:absolute; inset:-5px; border-radius:50%;
          border:1.5px solid rgba(255,255,255,0.22);
        }
        .row { display:flex; justify-content:space-between; align-items:center; }
        .val { font-family:'Space Mono',monospace; font-size:11px; color:rgba(255,255,255,0.45); }
        input[type=range] {
          -webkit-appearance:none; width:100%; height:3px;
          border-radius:2px; background:rgba(255,255,255,0.1); outline:none; margin-top:6px;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance:none; width:13px; height:13px; border-radius:50%;
          background:var(--ac,#00ffff); cursor:pointer;
          box-shadow:0 0 8px var(--ac,#00ffff);
        }
        .btns { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
        .btn {
          background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.65);
          border:1px solid rgba(255,255,255,0.07); border-radius:11px;
          padding:9px 5px; cursor:pointer;
          font-family:'Space Mono',monospace; font-size:10px;
          display:flex; flex-direction:column; align-items:center; gap:3px;
          transition:all .2s;
        }
        .btn:hover { background:rgba(255,255,255,0.1); color:#fff; transform:translateY(-1px); }
        .bi { font-size:15px; }

        /* ── Status ── */
        .statusbar {
          position:absolute; top:20px; left:20px;
          display:flex; align-items:center; gap:8px;
          background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.07);
          border-radius:100px; padding:6px 13px; z-index:20; backdrop-filter:blur(10px);
        }
        .sdot {
          width:7px; height:7px; border-radius:50%;
          animation:pulse 1.5s infinite;
        }
        .stxt { font-family:'Space Mono',monospace; font-size:11px; color:rgba(255,255,255,0.55); }

        /* ── Gesture badge ── */
        .gbadge {
          position:absolute; bottom:26px; left:50%; transform:translateX(-50%);
          display:flex; align-items:center; gap:9px;
          padding:9px 20px; border-radius:100px;
          backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,0.08);
          z-index:20; font-family:'Syne',sans-serif; font-weight:600;
          font-size:14px; color:#fff; white-space:nowrap; transition:all .25s;
        }
        .gdot { width:8px; height:8px; border-radius:50%; animation:pulse 1.2s infinite; }

        /* ── Hints ── */
        .hints {
          position:absolute; top:20px; left:50%; transform:translateX(-50%);
          display:flex; gap:8px; z-index:20;
        }
        .hint {
          display:flex; align-items:center; gap:5px;
          background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.06);
          border-radius:100px; padding:4px 10px;
          font-family:'Space Mono',monospace; font-size:9px;
          color:rgba(255,255,255,0.45); backdrop-filter:blur(8px);
        }

        /* ── Debug panel ── */
        .debug {
          position:absolute; bottom:26px; right:20px;
          background:rgba(0,0,0,0.7); border:1px solid rgba(255,255,255,0.08);
          border-radius:14px; padding:12px 14px; z-index:20;
          backdrop-filter:blur(12px); display:flex; flex-direction:column; gap:6px;
          min-width:130px;
        }
        .debug-title {
          font-family:'Space Mono',monospace; font-size:9px;
          letter-spacing:2px; color:rgba(255,255,255,0.3); margin-bottom:2px;
        }
        .frow {
          display:flex; justify-content:space-between; align-items:center;
          font-family:'Space Mono',monospace; font-size:10px; color:rgba(255,255,255,0.5);
        }
        .frow span { font-size:13px; }
        .pill {
          padding:2px 7px; border-radius:6px; font-size:9px;
          font-family:'Space Mono',monospace; font-weight:700;
        }
        .pill.up   { background:#00ff8833; color:#00ff88; }
        .pill.down { background:#ff2d7822; color:#ff2d7888; }

        @keyframes pulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:.5;transform:scale(.7)}
        }
      `}</style>

      <div style={{ position:'relative', width:'100vw', height:'100vh', '--ac': color }}>

        {/* Camera */}
        <video ref={videoRef} autoPlay playsInline muted style={{
          position:'absolute', width:'100%', height:'100%',
          objectFit:'cover', transform:'scaleX(-1)'
        }} />

        {/* Canvas */}
        <canvas ref={canvasRef} style={{ position:'absolute', width:'100%', height:'100%' }} />

        {/* Status */}
        <div className="statusbar">
          <div className="sdot" style={{ background: isReady ? '#00ff88' : '#facc15' }} />
          <span className="stxt">{status}</span>
        </div>

        {/* Gesture hints */}
        <div className="hints">
          {[['☝️','Draw'],['🤏','Drag'],['🖐️','Erase'],['✊','Idle']].map(([icon,label]) => (
            <div className="hint" key={label}>{icon} {label}</div>
          ))}
        </div>

        {/* Right panel */}
        <div className="panel" style={{ '--ac': color }}>
          <div className="logo">Air<em>Draw</em></div>

          <div>
            <div className="lbl">Color</div>
            <div className="color-grid">
              {COLORS.map(c => (
                <div key={c.hex}
                  className={`dot ${color === c.hex ? 'on' : ''}`}
                  style={{ background: c.hex, boxShadow: color===c.hex ? `0 0 14px ${c.hex}99` : 'none' }}
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="row">
              <div className="lbl" style={{margin:0}}>Thickness</div>
              <div className="val">{thickness}px</div>
            </div>
            <input type="range" min={2} max={20} value={thickness}
              onChange={e => setThickness(+e.target.value)} />
          </div>

          <div>
            <div className="row">
              <div className="lbl" style={{margin:0}}>Glow</div>
              <div className="val">{glow}px</div>
            </div>
            <input type="range" min={0} max={50} value={glow}
              onChange={e => setGlow(+e.target.value)} />
          </div>

          <div className="btns">
            <button className="btn" onClick={undoLast}><span className="bi">↩</span>Undo</button>
            <button className="btn" onClick={clearAll}><span className="bi">🗑</span>Clear</button>
          </div>
        </div>

        {/* Gesture badge */}
        <div className="gbadge" style={{ background:`${gi.bg}20`, borderColor:`${gi.bg}40` }}>
          <div className="gdot" style={{ background: gi.bg }} />
          {gi.icon} {gi.label}
        </div>

        {/* Debug finger panel */}
        {showDebug && (
          <div className="debug">
            <div className="debug-title">FINGER STATE</div>
            {[
              ['☝️', 'Index',  fingers?.index],
              ['🖕', 'Middle', fingers?.middle],
              ['💍', 'Ring',   fingers?.ring],
              ['🤙', 'Pinky',  fingers?.pinky],
              ['🤏', 'Pinch',  fingers?.pinch],
            ].map(([icon, name, state]) => (
              <div className="frow" key={name}>
                <span>{icon} {name}</span>
                <span className={`pill ${state ? 'up' : 'down'}`}>
                  {state ? 'UP' : 'DOWN'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Toggle debug */}
        <button onClick={() => setShowDebug(d => !d)} style={{
          position:'absolute', bottom:26, left:20, zIndex:20,
          background:'rgba(0,0,0,0.45)', border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:10, padding:'6px 12px', cursor:'pointer',
          fontFamily:'Space Mono,monospace', fontSize:10,
          color:'rgba(255,255,255,0.45)', backdropFilter:'blur(8px)'
        }}>
          {showDebug ? 'Hide' : 'Show'} Debug
        </button>

      </div>
    </>
  )
}