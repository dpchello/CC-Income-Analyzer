// ── Central Glossary ──────────────────────────────────────────────────────────
// Plain-English definitions for every financial term used in the UI.
// Used by the <Term> component in Tooltip.jsx.

export const GLOSSARY = {
  // Alert / action codes
  GAMMA_DANGER:    { label: 'Expiring Soon — Act Now',           definition: 'Your option expires in 7 days or fewer. In this zone, small moves in the stock price can cause large, sudden changes in the option price. Act quickly — close or roll to a later date.' },
  BREACH_RISK:     { label: 'Strike Price at Risk',              definition: 'The stock price is very close to your strike price. If the stock closes above your strike at expiry, your shares will be called away (sold). Consider rolling to a higher strike or closing the position.' },
  ROLL_WARNING:    { label: 'Time to Renew',                     definition: 'Your option has 21 days or fewer left. After 21 days, time decay accelerates quickly and small stock moves matter more. A good time to close this position and open a fresh one at a later date.' },
  TAKE_PROFIT:     { label: 'Lock In Profits',                   definition: "You've already captured 50% or more of the maximum income from this trade. Many traders close here — you keep most of the premium and free up your shares for the next trade sooner." },
  RECOVERY_MODE:   { label: 'Market Recovery — Review Calls',    definition: 'The market is bouncing back from a recent dip. When stocks recover strongly, your short call can cap your upside — you could miss out on gains. Consider whether holding the call still makes sense.' },

  // Regime labels
  'SELL PREMIUM':  { label: 'Good Time to Open',                 definition: 'Market conditions are favorable for selling options. Implied volatility is elevated (meaning better prices for sellers), and the trend is not too steep. This is when the strategy has the best historical edge.' },
  HOLD:            { label: 'Hold — Pause New Positions',         definition: 'Signals are mixed. Your existing positions are fine to keep, but this is not a great time to open new ones. Wait for conditions to improve before adding more trades.' },
  CAUTION:         { label: 'Be Careful',                        definition: 'Multiple warning signs are present — either option premiums are too thin, volatility is unstable, or the market trend is too strong. Avoid adding new risk right now.' },
  AVOID:           { label: 'Not a Good Time',                   definition: 'Conditions are unfavorable. The advantage that options sellers usually have is absent, or risk is too elevated. Stay put with existing positions and do not open new ones.' },

  // Metric labels
  DTE:             { label: 'Days Until Expiry',                 definition: 'The number of calendar days remaining before your option contract expires. Lower numbers = more urgency. Under 21 days, options become much more sensitive to stock price movements.' },
  Delta:           { label: 'Assignment Risk',                   definition: 'A number between 0 and 1 that estimates the probability your option will be "in the money" at expiry (i.e., the stock is above your strike and your shares get called away). 0.20 = roughly 20% chance. We target 0.10 – 0.30.' },
  IVRank:          { label: 'Option Price Level',                definition: 'A 0–100 score that tells you whether options are cheap or expensive compared to the past year. Above 50 means options are pricier than usual — great for sellers. Below 20 means premiums are thin.' },
  VVIX:            { label: 'Volatility Stability',              definition: 'A measure of how stable or unstable market volatility itself is. When this number is very high (above 100), volatility could spike suddenly — a riskier environment for selling options.' },
  PremiumCollected:{ label: 'Income Earned',                     definition: 'The total cash received when you sold the option contract. This is the maximum you can make on this trade — your profit is locked in as the option loses value over time.' },
  ProfitCapturePct:{ label: '% of Max Income Collected',         definition: 'How much of your original income you have already "banked" as profit. At 50%, half the option value has decayed away. Many traders close at 50% to free up capital for the next trade.' },
  Contracts:       { label: 'Positions',                         definition: 'Each contract covers 100 shares. If you have 2 contracts, you are selling the right to buy 200 of your shares. The number shown is contracts × 100 shares.' },

  // Additional terms for PIPE-025
  Theta:           { label: 'Daily Income Decay',                definition: 'The amount of value your sold option loses each day purely due to the passage of time — this is your daily income. As the seller, theta decay works in your favor: the option you sold becomes worth less every day, and you keep the difference.' },
  Gamma:           { label: 'Gamma',                             definition: 'How fast your assignment risk (delta) changes when the stock price moves. High gamma near expiry means a small stock move can quickly change the probability of your shares being called away. It is one reason the final 7 days before expiry are risky.' },
  Premium:         { label: 'Premium / Income',                  definition: 'The cash an option buyer pays you when you sell a contract. Think of it as the "rent" you collect for agreeing to sell your shares at the strike price. Your maximum profit on any trade is the premium you collected.' },
  Strike:          { label: 'Strike Price',                      definition: 'The price at which you have agreed to sell your shares if the option is exercised. If SPY closes above your strike at expiry, your shares are sold at that price — this is called assignment.' },
  Expiry:          { label: 'Expiry Date',                       definition: 'The date your option contract ends. At expiry, either the option expires worthless (you keep all the premium) or your shares are called away at the strike price. Most covered call sellers target 30–45 days to expiry when opening a position.' },
  Roll:            { label: 'Roll',                              definition: 'Closing your current option and immediately opening a new one further in the future — usually at the same or a higher strike. Rolling extends your timeline, collects new premium, and avoids locking in a loss. It does not create a new taxable event.' },
  CoveredCall:     { label: 'Covered Call',                      definition: 'A strategy where you sell someone the right to buy your shares at a set price (the strike) in exchange for cash (the premium). You are "covered" because you already own the shares. You profit when the stock stays below your strike — the option expires worthless and you keep the premium.' },
  PutCallRatio:    { label: 'Put/Call Ratio',                    definition: 'The ratio of put option open interest to call option open interest at a given strike or across the whole chain. A high ratio (more puts than calls) can signal that large investors are hedging or expecting a drop. A low ratio suggests bullish sentiment. Used to gauge institutional positioning.' },
  OpenInterest:    { label: 'Open Interest',                     definition: 'The total number of outstanding option contracts that have not yet been closed or exercised. High open interest at a strike means many traders have positions there — these levels often act as magnets or barriers for the stock price near expiry.' },
  CompositeScore:  { label: 'Composite Score',                   definition: 'A single 0–100 number that combines four factors: the market signal (25 pts), the option premium yield (30 pts), assignment risk (20 pts), and expiry quality (25 pts). Higher is better. 75+ means all factors are aligned for a strong trade.' },
  SignalScore:     { label: 'Signal Score',                      definition: 'The market-wide signal score (0–14) that powers the regime (Good Time to Open / Hold / Be Careful / Not a Good Time). It sums scores from six factors: option price level, volatility level, volatility stability, market trend, interest rates, and yield curve.' },
}

// Convenience lookup that falls back gracefully
export function glossaryLabel(key) {
  return GLOSSARY[key]?.label ?? key
}
