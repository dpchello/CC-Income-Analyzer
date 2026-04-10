import { useState, useRef, useEffect } from 'react'
import { GLOSSARY } from '../glossary.js'

// Generic tooltip — hover (250ms delay) on desktop, tap-to-toggle on mobile/touch
export default function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef(null)
  const hoverTimer = useRef(null)

  // Close when clicking/touching outside
  useEffect(() => {
    if (!visible) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setVisible(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [visible])

  // Clean up hover timer on unmount
  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  function handleMouseEnter() {
    hoverTimer.current = setTimeout(() => setVisible(true), 250)
  }
  function handleMouseLeave() {
    clearTimeout(hoverTimer.current)
    setVisible(false)
  }
  function handleClick(e) {
    e.stopPropagation()
    setVisible(v => !v)
  }

  return (
    <span ref={ref} className="relative inline-flex items-center">
      {children}
      <button
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onClick={handleClick}
        className="ml-1 text-xs leading-none align-middle focus:outline-none"
        style={{ color: 'var(--muted)', cursor: 'pointer' }}
        tabIndex={0}
        aria-label="More info"
        aria-expanded={visible}
      >
        (?)
      </button>
      {visible && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 text-xs font-sans leading-relaxed px-3 py-2 shadow-xl pointer-events-none"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 'var(--radius-md)',
            maxWidth: '280px',
            width: 'max-content',
          }}
        >
          {text}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: 'var(--border)' }}
          />
        </span>
      )}
    </span>
  )
}

// <Term> wraps any label with a glossary definition tooltip.
// Looks up the definition from the central GLOSSARY automatically.
//
// Usage:
//   <Term id="Delta">Assignment Risk</Term>
//   <Term id="DTE" />            — renders the plain-English label from GLOSSARY
//   <Term id="Delta" />          — renders GLOSSARY.Delta.label
export function Term({ id, children }) {
  const entry = GLOSSARY[id]
  if (!entry) return <>{children ?? id}</>
  const display = children ?? entry.label
  return (
    <Tooltip text={entry.definition}>
      <span>{display}</span>
    </Tooltip>
  )
}
