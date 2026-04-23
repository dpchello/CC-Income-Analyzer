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
  price: number
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

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { error: { message: 'Server error. Please try again.' }, status: res.status }
  }

  if (!res.ok) {
    const err = data as Record<string, unknown>
    return { error: (err?.detail ?? data) as CalculatorError, status: res.status }
  }
  return { result: data as CalculatorResult, status: 200 }
}
