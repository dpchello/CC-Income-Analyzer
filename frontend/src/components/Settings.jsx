import { useState } from 'react'
import { useTheme } from '../theme.jsx'
import AddPosition from './AddPosition.jsx'

const THEME_OPTIONS = [
  {
    id: 'system',
    label: 'Auto',
    description: 'Light 7am–7pm · Dark 7pm–7am',
    icon: '🕐',
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Dark background, light text',
    icon: '🌙',
  },
  {
    id: 'light',
    label: 'Light',
    description: 'White background, dark text',
    icon: '☀️',
  },
]

function ThemePicker() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="mb-4">
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Color Scheme</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          Auto mode uses dark theme in the evening and light theme during the day, based on your local time.
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {THEME_OPTIONS.map(opt => {
          const active = theme === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className="p-4 text-left border transition-all"
              style={{
                backgroundColor: active ? 'var(--green)15' : 'var(--bg)',
                borderColor: active ? 'var(--green)' : 'var(--border)',
              }}
            >
              <div className="text-xl mb-2">{opt.icon}</div>
              <div className="text-sm font-semibold" style={{ color: active ? 'var(--green)' : 'var(--text)' }}>
                {opt.label}
                {active && <span className="ml-2 text-xs font-normal">✓ Active</span>}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{opt.description}</div>
            </button>
          )
        })}
      </div>

      {/* Live preview swatch */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Current palette:</span>
        <div className="flex gap-1.5">
          {['var(--bg)', 'var(--surface)', 'var(--border)', 'var(--text)', 'var(--green)', 'var(--red)', 'var(--amber)', 'var(--blue)'].map((v, i) => (
            <div key={i} className="w-5 h-5 border" style={{ backgroundColor: v, borderColor: 'var(--border)' }} title={v} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AlphaUsagePanel({ alphaUsage }) {
  const used = alphaUsage?.calls_today ?? 0
  const limit = 25
  const pct = (used / limit) * 100
  const color = pct >= 80 ? 'var(--red)' : pct >= 60 ? 'var(--amber)' : 'var(--green)'
  const cached = alphaUsage?.cached_endpoints ?? []

  return (
    <div className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="mb-4">
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>AlphaVantage API Usage</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          Free tier limit: 25 calls/day. All data is disk-cached — calls only happen once per day per endpoint.
        </div>
      </div>

      <div className="flex items-end gap-3 mb-3">
        <div className="text-3xl font-bold font-mono" style={{ color }}>
          {used}<span className="text-lg" style={{ color: 'var(--muted)' }}>/{limit}</span>
        </div>
        <div className="text-xs pb-1" style={{ color: 'var(--muted)' }}>API calls used today</div>
      </div>

      <div className="h-2 mb-4" style={{ backgroundColor: 'var(--border)' }}>
        <div className="h-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>

      {cached.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Cached Endpoints Today</div>
          <div className="space-y-1">
            {cached.map((ep, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span style={{ color: 'var(--green)' }}>✓</span>
                <span className="font-mono" style={{ color: 'var(--text)' }}>{ep.key}</span>
                <span style={{ color: 'var(--muted)' }}>cached {ep.age_hrs}h ago</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {alphaUsage == null && (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>Usage data unavailable — backend may not be running.</div>
      )}
    </div>
  )
}

export default function Settings({ onRefresh, alphaUsage }) {
  const [showAdd, setShowAdd] = useState(false)

  const section = 'p-5 border space-y-3'
  const sectionStyle = { backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>Manage positions and app configuration</p>
      </div>

      {/* Theme Picker */}
      <ThemePicker />

      {/* AlphaVantage Usage */}
      <AlphaUsagePanel alphaUsage={alphaUsage} />

      {/* Add position */}
      <div className={section} style={sectionStyle}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Add New Position</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Record a new covered call you've sold</div>
          </div>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="text-xs px-3 py-1.5 border transition-colors"
            style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: showAdd ? 'var(--green)15' : 'transparent' }}
          >
            {showAdd ? 'Cancel' : '+ Add Position'}
          </button>
        </div>
        {showAdd && <AddPosition onAdded={() => { setShowAdd(false); onRefresh() }} />}
      </div>

      {/* Strategy reference */}
      <div className={section} style={sectionStyle}>
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Strategy Quick Reference</div>
        <div className="space-y-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          {[
            ['Target DTE', '30–45 days to expiration for new entries'],
            ['Strike Selection', '2–3% out-of-the-money · delta ~0.10–0.15'],
            ['Profit Exit', 'Close at 50% of premium collected'],
            ['Roll Trigger', '21 DTE — roll before gamma risk accelerates'],
            ['Avoid', 'IV Rank < 15 or SPY 20-day MA slope > 1.5%/mo'],
            ['Position Size', '6 contracts per leg (covers 600 shares)'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <span className="w-36 shrink-0" style={{ color: 'var(--text)' }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data info */}
      <div className={section} style={sectionStyle}>
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Data Sources</div>
        <div className="text-xs space-y-1" style={{ color: 'var(--muted)' }}>
          <p>Market data: <span style={{ color: 'var(--text)' }}>yfinance (free · prices, options chain, VIX, yields)</span></p>
          <p>News & technicals: <span style={{ color: 'var(--text)' }}>AlphaVantage (25 calls/day · disk-cached daily)</span></p>
          <p>Refresh interval: <span style={{ color: 'var(--text)' }}>60 seconds</span></p>
          <p>Position storage: <span style={{ color: 'var(--text)' }}>positions.json (local file)</span></p>
        </div>
      </div>
    </div>
  )
}
