import { useState } from 'react'

export default function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      {children}
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="ml-1 text-terminal-muted hover:text-terminal-text text-xs leading-none align-middle focus:outline-none"
        tabIndex={0}
        aria-label="More info"
      >
        ⓘ
      </button>
      {visible && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-[#111827] border border-terminal-border text-terminal-text text-xs font-sans leading-relaxed px-3 py-2 shadow-xl pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111827]" />
        </span>
      )}
    </span>
  )
}
