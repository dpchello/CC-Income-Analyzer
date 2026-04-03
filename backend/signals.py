from datetime import datetime, date
import math


class SignalEngine:

    def _dte(self, expiry_str: str) -> int:
        expiry = datetime.strptime(expiry_str, "%Y-%m-%d").date()
        return (expiry - date.today()).days

    def _score_iv_rank(self, iv_rank: float) -> tuple:
        if iv_rank > 70:
            return 3, "STRONG SELL — fat VRP, elevated premium", "STRONG SELL"
        elif iv_rank >= 50:
            return 2, "SELL — good VRP conditions", "SELL"
        elif iv_rank >= 30:
            return 1, "HOLD — marginal premium, proceed carefully", "HOLD"
        elif iv_rank >= 15:
            return -1, "CAUTION — thin premium, below avg VRP", "CAUTION"
        else:
            return -3, "AVOID — premium too thin, no edge per academic research", "AVOID"

    def _score_vix_level(self, vix: float) -> tuple:
        if 20 <= vix <= 28:
            return 2, "Academic sweet spot — fat premium, manageable risk", "GOOD"
        elif 28 < vix <= 35:
            return 0, "Elevated risk — go further OTM if selling", "ELEVATED"
        elif vix > 35:
            return -2, "Danger zone — serial correlation in large down days, covered call risk acute", "DANGER"
        elif 15 <= vix < 20:
            return 1, "Acceptable VIX level", "OK"
        else:
            return -1, "BXM studies show thin premium below VIX 15", "THIN"

    def _score_vvix(self, vvix: float) -> tuple:
        if vvix < 90:
            return 1, "Stable vol regime, safe to sell", "STABLE"
        elif vvix <= 100:
            return 0, "Elevated VVIX, watch closely", "WATCH"
        else:
            return -2, "Vol-of-vol spike = regime change risk, possible VIX jump", "DANGER"

    def _score_trend(self, spy_ma_signal: dict) -> tuple:
        above_ma = spy_ma_signal.get("above_ma", True)
        slope = spy_ma_signal.get("slope_pct", 0)
        if above_ma and slope < 0.5:
            return 2, "Ideal — mild uptrend, calls unlikely to be breached", "FLAT/MILD"
        elif above_ma and slope <= 1.5:
            return 1, "Acceptable — go further OTM", "RISING"
        elif above_ma and slope > 1.5:
            return -2, "AVOID — strong uptrend, high call-away risk per academic research", "STEEP"
        else:
            return 0, "SPY below 20MA — sell very far OTM or skip; downside risk on shares increases", "BELOW MA"

    def _score_rates(self, tnx_history: list, tlt_history: list) -> tuple:
        if len(tnx_history) >= 5 and len(tlt_history) >= 5:
            tnx_change = tnx_history[-1] - tnx_history[-5]  # in percentage points
            tlt_change = tlt_history[-1] - tlt_history[-5]
            if tnx_change < 0 and tlt_change > 0:
                return 1, "Risk-on — rates falling, SPY tailwind", "BULLISH"
            elif tnx_change > 0.10 and tlt_change < 0:
                return -1, "Rates rising sharply — potential SPY headwind", "BEARISH"
            else:
                return 0, "Rates neutral", "NEUTRAL"
        return 0, "Insufficient rate history", "NEUTRAL"

    def _score_curve(self, fvx: float, tnx: float) -> tuple:
        if fvx < tnx:
            return 1, "Normal yield curve (FVX < TNX)", "NORMAL"
        else:
            return -1, "Inverted yield curve (FVX > TNX)", "INVERTED"

    def _compute_regime(self, total_score: int) -> tuple:
        if total_score >= 6:
            return "SELL PREMIUM", "HIGH"
        elif total_score >= 3:
            return "SELL PREMIUM", "MEDIUM"
        elif total_score >= 1:
            return "HOLD", "LOW"
        elif total_score >= -1:
            return "CAUTION", "LOW"
        else:
            return "AVOID", "LOW"

    def _otm_pct_for_vix(self, vix: float, leg: str) -> float:
        if leg == "near":
            if vix <= 28:
                return 0.022
            elif vix <= 35:
                return 0.035
            else:
                return 0.05
        else:  # mid
            if vix <= 28:
                return 0.035
            elif vix <= 35:
                return 0.045
            else:
                return 0.055

    def _round_to_5(self, price: float) -> float:
        return round(price / 5) * 5

    def _build_strike_recommendations(self, spy_price: float, vix: float,
                                       available_expiries: list) -> list:
        recs = []
        today = date.today()

        near_target = None
        mid_target = None
        for exp in available_expiries:
            exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
            dte = (exp_date - today).days
            if 28 <= dte <= 45 and near_target is None:
                near_target = (exp, dte, "near-term")
            elif 40 <= dte <= 60 and mid_target is None:
                mid_target = (exp, dte, "mid-term")

        legs = [l for l in [near_target, mid_target] if l is not None]

        for exp, dte, leg_label in legs:
            leg_key = "near" if "near" in leg_label else "mid"
            otm_pct = self._otm_pct_for_vix(vix, leg_key)
            target_strike = self._round_to_5(spy_price * (1 + otm_pct))
            distance_pct = ((target_strike - spy_price) / spy_price) * 100
            delta_target = 0.12 if otm_pct <= 0.025 else 0.10
            estimated_premium = spy_price * otm_pct * 0.15  # rough heuristic

            recs.append({
                "strike": target_strike,
                "expiry": exp,
                "dte": dte,
                "distance_pct": round(distance_pct, 2),
                "estimated_premium": round(estimated_premium, 2),
                "delta_target": delta_target,
                "leg": leg_label,
                "rationale": (
                    f"VIX {vix:.1f} → target {otm_pct*100:.1f}% OTM, "
                    f"delta ~{delta_target}, {dte} DTE in optimal window"
                ),
            })

        return recs

    def _build_position_alerts(self, open_positions: list, spy_price: float,
                                spy_ma_signal: dict) -> list:
        alerts = []
        today = date.today()

        for pos in open_positions:
            if pos.get("status") != "open":
                continue

            pos_id = pos["id"]
            expiry = pos["expiry"]
            strike = pos["strike"]
            sell_price = pos["sell_price"]
            current_price = pos.get("current_price", 0)

            dte = (datetime.strptime(expiry, "%Y-%m-%d").date() - today).days

            # 50% profit rule
            if current_price > 0 and sell_price > 0:
                profit_pct = (sell_price - current_price) / sell_price * 100
                if profit_pct >= 50:
                    alerts.append({
                        "position_id": pos_id,
                        "type": "TAKE_PROFIT",
                        "message": (
                            f"50% of premium captured on {expiry} ${strike}C — "
                            "consider closing and redeploying capital. "
                            "Academic research supports early exit to improve annualized returns."
                        ),
                        "urgency": "HIGH",
                    })

            # 21 DTE roll rule
            if 0 < dte <= 21:
                alerts.append({
                    "position_id": pos_id,
                    "type": "ROLL_WARNING",
                    "message": (
                        f"Position entering high-gamma zone (DTE ≤ 21). "
                        "Consider rolling to next expiry to maintain 30-45 DTE sweet spot."
                    ),
                    "urgency": "MEDIUM",
                })

            # 7 DTE gamma danger
            if 0 < dte <= 7:
                alerts.append({
                    "position_id": pos_id,
                    "type": "GAMMA_DANGER",
                    "message": f"GAMMA DANGER: {expiry} ${strike}C expires in {dte} day(s) — close or roll immediately.",
                    "urgency": "HIGH",
                })

            # Strike breach risk
            if spy_price > 0 and strike > 0:
                distance_pct = ((strike - spy_price) / spy_price) * 100
                if 0 < distance_pct <= 1.5:
                    alerts.append({
                        "position_id": pos_id,
                        "type": "STRIKE_BREACH",
                        "message": f"SPY within {distance_pct:.1f}% of ${strike} strike — breach imminent.",
                        "urgency": "HIGH",
                    })

        # Trend reversal warning
        above_ma = spy_ma_signal.get("above_ma", True)
        slope = spy_ma_signal.get("slope_pct", 0)
        if slope > 1.5 and above_ma:
            alerts.append({
                "position_id": "global",
                "type": "TREND_REVERSAL",
                "message": "Strong uptrend detected — covered calls will underperform. Consider pausing new entries.",
                "urgency": "MEDIUM",
            })

        return alerts

    def analyze(self, spy_price: float, vix: float, vix_iv_rank: float,
                 vvix: float, tnx: float, fvx: float, tlt: float,
                 spy_ma_signal: dict, open_positions: list,
                 tnx_history: list = None, tlt_history: list = None,
                 available_expiries: list = None) -> dict:

        tnx_history = tnx_history or []
        tlt_history = tlt_history or []
        available_expiries = available_expiries or []

        s1, r1, l1 = self._score_iv_rank(vix_iv_rank)
        s2, r2, l2 = self._score_vix_level(vix)
        s3, r3, l3 = self._score_vvix(vvix)
        s4, r4, l4 = self._score_trend(spy_ma_signal)
        s5, r5, l5 = self._score_rates(tnx_history, tlt_history)
        s6, r6, l6 = self._score_curve(fvx, tnx)

        total_score = s1 + s2 + s3 + s4 + s5 + s6
        regime, confidence = self._compute_regime(total_score)
        should_sell = regime == "SELL PREMIUM"

        warnings = []
        if vix > 35:
            warnings.append("Extreme volatility — covered call risk acute, serial correlation risk elevated")
        if vix_iv_rank < 15:
            warnings.append("IV Rank critically low — VRP absent, no edge to selling premium today")
        if spy_ma_signal.get("slope_pct", 0) > 1.5:
            warnings.append("Strong uptrend detected — covered calls will underperform, consider pausing")
        if vvix > 100:
            warnings.append("VVIX > 100 — elevated vol-of-vol, regime change risk")

        recs = self._build_strike_recommendations(spy_price, vix, available_expiries) if should_sell else []
        position_alerts = self._build_position_alerts(open_positions, spy_price, spy_ma_signal)

        return {
            "regime": regime,
            "confidence": confidence,
            "total_score": total_score,
            "max_score": 12,
            "factor_scores": {
                "iv_rank": {"score": s1, "label": l1, "reasoning": r1},
                "vix_level": {"score": s2, "label": l2, "reasoning": r2},
                "vvix": {"score": s3, "label": l3, "reasoning": r3},
                "spy_trend": {"score": s4, "label": l4, "reasoning": r4},
                "rates": {"score": s5, "label": l5, "reasoning": r5},
                "curve": {"score": s6, "label": l6, "reasoning": r6},
            },
            "should_sell": should_sell,
            "reasoning": [r1, r2, r3, r4, r5, r6],
            "recommended_strikes": recs,
            "position_alerts": position_alerts,
            "warnings": warnings,
        }
