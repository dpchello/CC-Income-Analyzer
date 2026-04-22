import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth.jsx'

// ── Phases: prompt → portal → accounts → importing → success | conflict | error
// With syncOnly=true: skip portal, start at accounts

export default function ConnectBrokerage({ onClose, onImported, syncOnly = false }) {
  const { apiFetch } = useAuth()
  const [phase, setPhase]           = useState(syncOnly ? 'accounts' : 'prompt')
  const [link, setLink]             = useState(null)
  const [accounts, setAccounts]     = useState(null)   // null = loading
  const [selected, setSelected]     = useState(new Set())
  const [importResult, setImportResult] = useState(null)
  const [conflicts, setConflicts]   = useState([])
  const [err, setErr]               = useState(null)
  const [importing, setImporting]   = useState(false)
  const iframeRef = useRef(null)

  // Load accounts when entering that phase
  useEffect(() => {
    if (phase !== 'accounts') return
    setAccounts(null)
    apiFetch('/api/snaptrade/accounts')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setAccounts(data)
        setSelected(new Set(data.map(a => a.id)))  // all checked by default
      })
      .catch(() => setAccounts([]))
  }, [phase])  // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for SnapTrade postMessage from the portal iframe
  useEffect(() => {
    if (phase !== 'portal') return
    function onMessage(e) {
      const data = e.data
      if (!data) return
      // SnapTrade may send string or object; normalise to uppercase string
      let msgType = ''
      if (typeof data === 'string') {
        msgType = data.toUpperCase()
      } else if (typeof data === 'object') {
        msgType = (data.messageType || data.type || data.event || '').toUpperCase()
      }
      if (['SUCCESS', 'CLOSE', 'DONE', 'COMPLETE', 'CONNECTED'].includes(msgType)) {
        setPhase('accounts')
      }
      if (msgType === 'ERROR') {
        setErr('Connection error from brokerage portal.')
        setPhase('error')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [phase])

  async function openPortal(reconnectId) {
    setErr(null)
    try {
      await apiFetch('/api/snaptrade/register', { method: 'POST' })
      const params = reconnectId ? `?connection_id=${reconnectId}` : ''
      const r = await apiFetch(`/api/snaptrade/connect-link${params}`)
      if (!r.ok) throw new Error('Could not get connection link')
      const data = await r.json()
      setLink(data.link)
      setPhase('portal')
    } catch (e) {
      setErr(e.message || 'Could not open brokerage portal.')
      setPhase('error')
    }
  }

  async function runImport(conflictResolution = 'brokerage') {
    setImporting(true)
    try {
      const r = await apiFetch('/api/snaptrade/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conflict_resolution: conflictResolution,
          account_ids: selected.size > 0 ? [...selected] : null,
        }),
      })
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}))
        throw new Error(errBody.detail || `Import failed (${r.status})`)
      }
      const data = await r.json()
      setImportResult(data)
      if (data.conflicts?.length > 0) {
        setConflicts(data.conflicts)
        setPhase('conflict')
      } else {
        setPhase('success')
      }
    } catch (e) {
      setErr(e.message || 'Import failed.')
      setPhase('error')
    } finally {
      setImporting(false)
    }
  }

  function toggleAccount(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === accounts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(accounts.map(a => a.id)))
    }
  }

  async function resolveConflicts(resolution) {
    setConflicts([])
    await runImport(resolution)
  }

  function finish() {
    onImported?.()
    onClose?.()
  }

  const isWide = phase === 'portal'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.65)',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', width: '100%',
        maxWidth: isWide ? 900 : 520,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {phase === 'accounts' && !syncOnly && (
              <button
                onClick={() => setPhase('prompt')}
                style={{ color: 'var(--fg-mute)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >←</button>
            )}
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {phase === 'prompt'    ? 'Import from brokerage' :
               phase === 'portal'   ? 'Connect your brokerage' :
               phase === 'accounts' ? 'Select accounts to sync' :
               phase === 'conflict' ? 'Review conflicts' :
               phase === 'success'  ? 'Import complete' :
               phase === 'error'    ? 'Connection error' :
               'Importing…'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--fg-mute)', fontSize: 20, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto' }}>

          {/* ── Prompt ── */}
          {phase === 'prompt' && (
            <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
                Connect your brokerage to automatically import your current positions and stock holdings.
                Harvest uses <strong style={{ color: 'var(--gold)' }}>SnapTrade</strong> — a read-only
                connector that never stores your brokerage credentials.
              </p>
              <ul style={{ paddingLeft: 20, fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.8 }}>
                <li>Supports 50+ brokerages — TD Ameritrade, Robinhood, Schwab, Fidelity and more</li>
                <li>Read-only access — no trading, no withdrawals</li>
                <li>You stay in control — disconnect any time</li>
              </ul>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => openPortal(null)}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600,
                    background: 'var(--gold-dim)', border: '1px solid var(--gold)',
                    color: 'var(--gold)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  }}
                >
                  Connect brokerage
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: '10px 18px', fontSize: 13,
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--fg-mute)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Portal iframe ── */}
          {phase === 'portal' && link && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <iframe
                ref={iframeRef}
                src={link}
                title="Connect brokerage"
                style={{ width: '100%', height: 580, border: 'none', display: 'block' }}
              />
              {/* Manual continue — fallback if postMessage doesn't fire */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 20px', borderTop: '1px solid var(--border)',
                background: 'var(--bg)', flexShrink: 0,
              }}>
                <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
                  Connected your brokerage? Click to choose which accounts to sync.
                </span>
                <button
                  onClick={() => setPhase('accounts')}
                  style={{
                    padding: '7px 16px', fontSize: 13, fontWeight: 600,
                    background: 'var(--gold-dim)', border: '1px solid var(--gold)',
                    color: 'var(--gold)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    whiteSpace: 'nowrap', marginLeft: 12, flexShrink: 0,
                  }}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Account selection ── */}
          {phase === 'accounts' && (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {accounts === null ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--fg-mute)', fontSize: 13 }}>
                  Loading accounts…
                </div>
              ) : accounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--fg-mute)', fontSize: 13 }}>
                  No accounts found. Try reconnecting your brokerage.
                  <br />
                  <button
                    onClick={() => setPhase('prompt')}
                    style={{ marginTop: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
                  >
                    Back to connect
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.5 }}>
                    Choose which accounts to sync into Harvest. All accounts are selected by default.
                  </div>

                  {/* Select all toggle */}
                  <div
                    onClick={toggleAll}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                      border: '1px solid var(--border)',
                      background: selected.size === accounts.length ? 'var(--gold)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected.size === accounts.length && <span style={{ color: '#000', fontSize: 11, lineHeight: 1 }}>✓</span>}
                      {selected.size > 0 && selected.size < accounts.length && <span style={{ color: 'var(--gold)', fontSize: 11, lineHeight: 1 }}>—</span>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                      {selected.size === accounts.length ? 'Deselect all' : 'Select all'}
                    </span>
                  </div>

                  {/* Account list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {accounts.map(acc => {
                      const checked = selected.has(acc.id)
                      return (
                        <div
                          key={acc.id}
                          onClick={() => toggleAccount(acc.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 14px', borderRadius: 'var(--radius-md)',
                            border: `1px solid ${checked ? 'var(--gold)' : 'var(--border)'}`,
                            background: checked ? 'var(--gold-dim)' : 'var(--bg)',
                            cursor: 'pointer', transition: 'all 0.12s',
                          }}
                        >
                          <div style={{
                            width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                            border: `1px solid ${checked ? 'var(--gold)' : 'var(--border)'}`,
                            background: checked ? 'var(--gold)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {checked && <span style={{ color: '#000', fontSize: 11, lineHeight: 1 }}>✓</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {acc.name || acc.number || 'Account'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--fg-mute)', marginTop: 1 }}>
                              {[acc.brokerage_name, acc.type, acc.number].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                    <button
                      onClick={() => { setPhase('importing'); runImport() }}
                      disabled={selected.size === 0}
                      style={{
                        flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600,
                        background: 'var(--gold-dim)', border: '1px solid var(--gold)',
                        color: 'var(--gold)', borderRadius: 'var(--radius-md)',
                        cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                        opacity: selected.size === 0 ? 0.4 : 1,
                      }}
                    >
                      Sync {selected.size} account{selected.size !== 1 ? 's' : ''}
                    </button>
                    <button
                      onClick={onClose}
                      style={{
                        padding: '10px 18px', fontSize: 13,
                        background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--fg-mute)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Importing spinner ── */}
          {(phase === 'importing' || importing) && (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '2px solid var(--gold)', borderTopColor: 'transparent',
                animation: 'spin 0.7s linear infinite', margin: '0 auto 16px',
              }} />
              <p style={{ fontSize: 14, color: 'var(--fg-mute)' }}>Importing positions…</p>
            </div>
          )}

          {/* ── Success ── */}
          {phase === 'success' && importResult && (
            <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 32, textAlign: 'center' }}>✓</div>
              <p style={{ fontSize: 14, color: 'var(--text)', textAlign: 'center', fontWeight: 600 }}>
                Import complete
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                {[
                  { label: 'Imported', value: importResult.imported, color: 'var(--green)' },
                  { label: 'Updated',  value: importResult.updated,  color: 'var(--blue)' },
                  { label: 'Skipped',  value: importResult.skipped,  color: 'var(--fg-mute)' },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: 12, background: 'var(--bg)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-mute)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {importResult.raw_total === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--amber)', textAlign: 'center' }}>
                  No positions were found in the selected accounts — the brokerage may not have returned data yet. Try syncing again in a few minutes.
                </p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--fg-mute)', textAlign: 'center' }}>
                  Positions categorized as &quot;uncategorized&quot; will appear in the Portfolios tab for review.
                </p>
              )}
              {importResult.parse_errors?.length > 0 && (
                <p style={{ fontSize: 11, color: 'var(--red)', textAlign: 'center' }}>
                  {importResult.parse_errors.length} record{importResult.parse_errors.length !== 1 ? 's' : ''} could not be parsed.
                </p>
              )}
              <button
                onClick={finish}
                style={{
                  padding: '10px 0', fontSize: 14, fontWeight: 600,
                  background: 'var(--gold-dim)', border: '1px solid var(--gold)',
                  color: 'var(--gold)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                }}
              >
                View portfolio
              </button>
            </div>
          )}

          {/* ── Conflict resolution ── */}
          {phase === 'conflict' && (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                {conflicts.length} position{conflicts.length !== 1 ? 's' : ''} already exist in Harvest
                with the same ticker, strike, and expiry. Which data should win?
              </p>
              <div style={{ maxHeight: 240, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conflicts.map((c, i) => (
                  <div key={i} style={{
                    padding: 12, background: 'var(--bg)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                    fontSize: 12, fontFamily: 'monospace',
                  }}>
                    <span style={{ color: 'var(--gold)' }}>{c.incoming?.ticker}</span>
                    {' '}${c.incoming?.strike} exp {c.incoming?.expiry}
                    <span style={{ color: 'var(--fg-mute)', marginLeft: 8 }}>
                      brokerage: {c.incoming?.sell_price ?? '—'} vs harvest: {c.existing?.sell_price ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => resolveConflicts('brokerage')}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600,
                    background: 'var(--gold-dim)', border: '1px solid var(--gold)',
                    color: 'var(--gold)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  }}
                >
                  Use brokerage data
                </button>
                <button
                  onClick={() => resolveConflicts('harvest')}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 13,
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--text)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  }}
                >
                  Keep my Harvest data
                </button>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {phase === 'error' && (
            <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: 'var(--red)' }}>{err || 'Something went wrong.'}</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={() => setPhase(syncOnly ? 'accounts' : 'prompt')}
                  style={{
                    padding: '9px 18px', fontSize: 13,
                    background: 'var(--gold-dim)', border: '1px solid var(--gold)',
                    color: 'var(--gold)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  }}
                >
                  Try again
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: '9px 18px', fontSize: 13,
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--fg-mute)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
