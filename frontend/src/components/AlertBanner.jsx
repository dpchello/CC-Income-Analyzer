export default function AlertBanner({ alerts, signalData, dashData }) {
  const warnings = signalData?.warnings || []

  const allMessages = [
    ...alerts.map(a => ({ msg: a.message, type: a.type })),
    ...warnings.map(w => ({ msg: w, type: 'WARN' })),
  ]

  if (allMessages.length === 0) return null

  return (
    <div className="bg-terminal-red/10 border-b border-terminal-red px-4 py-2 space-y-1">
      {allMessages.map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-xs font-mono text-terminal-red pulse-red">
          <span className="shrink-0">
            {item.type === 'TAKE_PROFIT' ? '💰' :
             item.type === 'GAMMA_DANGER' ? '🔥' :
             item.type === 'STRIKE_BREACH' ? '🚨' : '⚠️'}
          </span>
          <span>{item.msg}</span>
        </div>
      ))}
    </div>
  )
}
