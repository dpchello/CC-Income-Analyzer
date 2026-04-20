import { useState, useEffect } from 'react'
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
    <div className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
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
                backgroundColor: active ? 'var(--gold-dim)' : 'var(--bg)',
                borderColor: active ? 'var(--gold)' : 'var(--border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="text-xl mb-2">{opt.icon}</div>
              <div className="text-sm font-semibold" style={{ color: active ? 'var(--gold)' : 'var(--text)' }}>
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
    <div className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
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

function UpcomingEventsPanel() {
  const [events, setEvents] = useState(null)       // null = loading
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function loadEvents() {
    try {
      const res = await fetch('/api/macro')
      const data = await res.json()
      setEvents(data.user_events || [])
    } catch {
      setEvents([])
    }
  }

  useEffect(() => { loadEvents() }, [])

  async function handleAdd() {
    if (!newDate || !newDesc.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/macro/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, description: newDesc.trim() }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.detail || 'Failed to save event.')
      } else {
        const d = await res.json()
        setEvents(d.user_events || [])
        setNewDate('')
        setNewDesc('')
        setAdding(false)
      }
    } catch {
      setError('Request failed — backend may not be running.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(evDate, evDesc) {
    try {
      const params = new URLSearchParams({ event_date: evDate, description: evDesc })
      const res = await fetch(`/api/macro/events?${params}`, { method: 'DELETE' })
      if (res.ok) {
        const d = await res.json()
        setEvents(d.user_events || [])
      }
    } catch {
      // silent
    }
  }

  return (
    <div className="p-5 border space-y-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Upcoming Events</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Add events like earnings, tariff announcements, or Fed decisions. Action card recommendations will be softened when an event is within 5 days.
          </div>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className="text-xs px-3 py-1.5 border shrink-0 transition-colors"
          style={{ borderColor: 'var(--blue)', color: 'var(--blue)', borderRadius: 'var(--radius-sm)', backgroundColor: adding ? 'var(--blue)15' : 'transparent' }}
        >
          {adding ? 'Cancel' : '+ Add Event'}
        </button>
      </div>

      {/* Built-in notice */}
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        FOMC meeting dates for 2025–2026 are built-in and automatically factored into recommendations.
      </div>

      {/* Add form */}
      {adding && (
        <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-2">
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="text-xs px-2 py-1.5 border flex-shrink-0"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', width: '140px' }}
            />
            <input
              type="text"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="e.g. Tariff announcement, Earnings start"
              className="text-xs px-2 py-1.5 border flex-1"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newDate || !newDesc.trim()}
              className="text-xs px-3 py-1.5 border disabled:opacity-40"
              style={{ borderColor: 'var(--gold)', color: 'var(--gold)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--gold-dim)' }}
            >
              {saving ? 'Saving…' : 'Save Event'}
            </button>
            {error && <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>}
          </div>
        </div>
      )}

      {/* Event list */}
      {events === null ? (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : events.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>No custom events added yet.</div>
      ) : (
        <div className="space-y-1">
          {events.map((ev, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
              <span className="font-mono shrink-0" style={{ color: 'var(--text)' }}>{ev.date}</span>
              <span className="flex-1" style={{ color: 'var(--muted)' }}>{ev.description}</span>
              <button
                onClick={() => handleRemove(ev.date, ev.description)}
                className="text-[10px] px-1.5 py-0.5"
                style={{ color: 'var(--red)', opacity: 0.7 }}
                title="Remove event"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OISnapshotPanel() {
  const [status, setStatus] = useState(null)  // null | 'loading' | {ok, expiries_processed, strikes_recorded, errors, timestamp}
  const [error, setError] = useState(null)

  async function captureSnapshot() {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/api/oi/snapshot', { method: 'POST' })
      const data = await res.json()
      setStatus(data)
    } catch {
      setError('Request failed — backend may not be running.')
      setStatus(null)
    }
  }

  return (
    <div className="p-5 border space-y-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Capture Market Interest Snapshot</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          Records how many traders currently hold contracts at your strike prices. Run once after market close to start tracking daily changes.
        </div>
      </div>
      <button
        onClick={captureSnapshot}
        disabled={status === 'loading'}
        className="text-xs px-3 py-1.5 border transition-colors"
        style={{ borderColor: 'var(--blue)', color: 'var(--blue)', opacity: status === 'loading' ? 0.5 : 1 }}
      >
        {status === 'loading' ? 'Capturing…' : 'Capture Snapshot Now'}
      </button>
      {status && status !== 'loading' && (
        <div className="text-xs space-y-0.5" style={{ color: 'var(--muted)' }}>
          <div style={{ color: 'var(--green)' }}>
            Snapshot captured — {status.expiries_processed} expiries, {status.strikes_recorded} strikes recorded.
          </div>
          {status.errors?.length > 0 && (
            <div style={{ color: 'var(--amber)' }}>
              Errors: {status.errors.join('; ')}
            </div>
          )}
        </div>
      )}
      {error && <div className="text-xs" style={{ color: 'var(--red)' }}>{error}</div>}
    </div>
  )
}

function FeedbackNotificationsPanel() {
  const [cfg, setCfg] = useState(null)       // null = loading
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState(null)

  // Local draft state
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [webhook, setWebhook]   = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [immediate, setImmediate] = useState(true)

  useEffect(() => {
    fetch('/api/feedback/config')
      .then(r => r.json())
      .then(d => {
        setCfg(d)
        setEmail(d.feedback_email || '')
        setPhone(d.feedback_phone || '')
        setWebhook(d.sms_webhook_url || '')
        setSmtpHost(d.smtp_host || '')
        setSmtpPort(String(d.smtp_port || 587))
        setSmtpUser(d.smtp_user || '')
        setImmediate(d.feedback_notify_immediate !== false)
      })
      .catch(() => setCfg({}))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    const body = {
      feedback_email:            email.trim() || null,
      feedback_phone:            phone.trim() || null,
      sms_webhook_url:           webhook.trim() || null,
      smtp_host:                 smtpHost.trim() || null,
      smtp_port:                 parseInt(smtpPort, 10) || 587,
      smtp_user:                 smtpUser.trim() || null,
      feedback_notify_immediate: immediate,
    }
    if (smtpPass.trim()) body.smtp_pass = smtpPass.trim()
    try {
      const res = await fetch('/api/feedback/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.detail || 'Failed to save settings.')
      } else {
        setSaved(true)
        setSmtpPass('')  // clear password field after save
      }
    } catch {
      setError('Request failed — backend may not be running.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--bg)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
    borderRadius: 'var(--radius-sm)',
  }

  return (
    <div className="p-5 border space-y-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Feedback Notifications</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          When you tap "This doesn't make sense to me" on an action card, your feedback is saved locally. Optionally send it to yourself via email or SMS.
        </div>
      </div>

      {cfg === null ? (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : (
        <div className="space-y-4">

          {/* Email */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Email</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full text-xs px-2 py-1.5 border"
              style={inputStyle}
            />
          </div>

          {/* SMTP */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>SMTP Server (for outgoing email)</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={smtpHost}
                onChange={e => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="text-xs px-2 py-1.5 border flex-1"
                style={inputStyle}
              />
              <input
                type="number"
                value={smtpPort}
                onChange={e => setSmtpPort(e.target.value)}
                placeholder="587"
                className="text-xs px-2 py-1.5 border"
                style={{ ...inputStyle, width: '72px' }}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={smtpUser}
                onChange={e => setSmtpUser(e.target.value)}
                placeholder="SMTP username"
                className="text-xs px-2 py-1.5 border flex-1"
                style={inputStyle}
              />
              <input
                type="password"
                value={smtpPass}
                onChange={e => setSmtpPass(e.target.value)}
                placeholder="Password (leave blank to keep existing)"
                className="text-xs px-2 py-1.5 border flex-1"
                style={inputStyle}
              />
            </div>
          </div>

          {/* SMS */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>SMS (optional)</div>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+15551234567"
              className="w-full text-xs px-2 py-1.5 border"
              style={inputStyle}
            />
            <input
              type="url"
              value={webhook}
              onChange={e => setWebhook(e.target.value)}
              placeholder="Twilio webhook URL (your own account)"
              className="w-full text-xs px-2 py-1.5 border"
              style={inputStyle}
            />
          </div>

          {/* Delivery timing */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Delivery timing</div>
            <div className="flex gap-4">
              {[
                { value: true,  label: 'Send immediately' },
                { value: false, label: 'Daily digest (not yet implemented)' },
              ].map(opt => (
                <label key={String(opt.value)} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={immediate === opt.value}
                    onChange={() => setImmediate(opt.value)}
                    disabled={opt.value === false}
                    style={{ accentColor: 'var(--blue)' }}
                  />
                  <span style={{ color: opt.value === false ? 'var(--muted)' : immediate === opt.value ? 'var(--text)' : 'var(--muted)' }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 border disabled:opacity-40"
              style={{ borderColor: 'var(--gold)', color: 'var(--gold)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--gold-dim)' }}
            >
              {saving ? 'Saving…' : 'Save Notification Settings'}
            </button>
            {saved && <span className="text-xs" style={{ color: 'var(--gold)' }}>✓ Saved</span>}
            {error && <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>}
          </div>

        </div>
      )}
    </div>
  )
}

export default function Settings({ onRefresh, alphaUsage }) {
  const [showAdd, setShowAdd] = useState(false)

  const section = 'p-5 border space-y-3'
  const sectionStyle = { backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }

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

      {/* OI Snapshot */}
      <OISnapshotPanel />

      {/* Upcoming Events */}
      <UpcomingEventsPanel />

      {/* Feedback Notifications */}
      <FeedbackNotificationsPanel />

      {/* Add position */}
      <div className={section} style={sectionStyle}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Add New Position</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Record a new position you've opened</div>
          </div>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="text-xs px-3 py-1.5 border transition-colors"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: showAdd ? 'var(--gold-dim)' : 'transparent' }}
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
            ['Days Until Expiry', '30–45 days for new entries — the sweet spot for income vs. risk'],
            ['Strike Selection', '2–3% above the current stock price · assignment risk ~0.10–0.15'],
            ['Lock In Profits', 'Close when you have captured 50% of the original income'],
            ['Time to Renew', '21 days until expiry — renew before option sensitivity spikes'],
            ['Avoid When', 'Option prices are historically cheap (Option Price Level < 15) or market trend is too steep'],
            ['Position Size', '6 positions per trade (covers 600 shares)'],
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
