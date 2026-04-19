export interface CalculatorResult {
  ticker: string
  shares: number
  contracts: number
  monthly_estimate: number
  annualized_yield_pct: number
  strike: number
  expiry: string
  dte: number
  mid: number
}

export interface CalculatorError {
  limit_reached?: boolean
  message?: string
  detail?: string
}

export async function fetchIncomeEstimate(
  ticker: string,
  shares: number
): Promise<{ result?: CalculatorResult; error?: CalculatorError; status: number }> {
  const params = new URLSearchParams({ ticker, shares: String(shares) })
  const res = await fetch(`/api/calculator?${params}`)
  const data = await res.json()
  if (!res.ok) {
    return { error: data.detail || data, status: res.status }
  }
  return { result: data, status: 200 }
}
