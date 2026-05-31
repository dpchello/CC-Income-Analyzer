// Technical indicators for the Markets tab.
// Pure functions, no deps. All inputs are arrays of numbers (oldest → newest).
// Output arrays are aligned to input length; leading values are null where
// the indicator hasn't accumulated enough data.

// ── EMA helper ──────────────────────────────────────────────────────────────
function ema(values, period) {
  const out = new Array(values.length).fill(null)
  if (values.length === 0 || period <= 0) return out
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) {
      out[i] = prev
      continue
    }
    if (prev == null) {
      // Seed with simple average of the first `period` non-null values
      if (i + 1 < period) continue
      let sum = 0, count = 0
      for (let j = i - period + 1; j <= i; j++) {
        if (values[j] != null) { sum += values[j]; count++ }
      }
      if (count < period) continue
      prev = sum / period
      out[i] = prev
    } else {
      prev = v * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

// ── RSI (Wilder's smoothing) ────────────────────────────────────────────────
// Returns array of RSI values 0–100, leading `period` slots are null.
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gainSum = 0, lossSum = 0
  // Seed with simple average of the first `period` changes
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1]
    if (diff > 0) gainSum += diff
    else lossSum += -diff
  }
  let avgGain = gainSum / period
  let avgLoss = lossSum / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

// ── MACD ────────────────────────────────────────────────────────────────────
// Returns { macd, signal, hist } each as arrays aligned to input length.
export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(values, fast)
  const emaSlow = ema(values, slow)
  const macdLine = values.map((_, i) => {
    if (emaFast[i] == null || emaSlow[i] == null) return null
    return emaFast[i] - emaSlow[i]
  })
  const signalLine = ema(macdLine, signalPeriod)
  const hist = macdLine.map((m, i) =>
    m == null || signalLine[i] == null ? null : m - signalLine[i]
  )
  return { macd: macdLine, signal: signalLine, hist }
}

// ── Bollinger Bands ─────────────────────────────────────────────────────────
// Simple moving average ± stddev * mult. Returns { upper, middle, lower }.
export function bollinger(values, period = 20, mult = 2) {
  const upper = new Array(values.length).fill(null)
  const middle = new Array(values.length).fill(null)
  const lower = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0
    let count = 0
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] == null) { count = 0; break }
      sum += values[j]
      count++
    }
    if (count !== period) continue
    const mean = sum / period
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) {
      variance += (values[j] - mean) ** 2
    }
    const sd = Math.sqrt(variance / period)
    middle[i] = mean
    upper[i] = mean + mult * sd
    lower[i] = mean - mult * sd
  }
  return { upper, middle, lower }
}
