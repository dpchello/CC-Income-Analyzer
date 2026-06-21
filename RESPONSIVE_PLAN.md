# Harvest — Mobile Responsive Plan (PIPE-024)

> Plan + execution record for making the Harvest dashboard usable on a phone.
> This activates **PIPE-024 "Mobile Layout (Full Responsive Redesign)"**, which was
> previously deferred in PIPELINE.md pending "a mobile access path to the app."

---

## 0. Strategy check (per CLAUDE.md)

- **Conflict?** None with any *locked decision* in STRATEGY.md. Nothing forbids mobile.
- **Deferral being overridden.** PIPE-024 was parked because the app is a **self-hosted
  local Mac app** (`uvicorn` on `127.0.0.1:8000`) with no obvious phone access path. The
  user is now explicitly greenlighting the work, so we proceed and resolve the access-path
  question in the Business section below.
- **Cascade:** on completion, update the Feature Log in STRATEGY.md, mark PIPE-024 done in
  PIPELINE.md, bump VERSION + CHANGELOG.

---

## 1. Business perspective

**Why mobile matters even for a localhost app.** A covered-call *holder* (not a day trader)
checks positions a few times a week, usually away from the desk: "is my AAPL call getting
tested?", "did I bank that premium?". That glance-and-go behavior is inherently a phone
behavior. The desktop grid is where you *act*; the phone is where you *monitor and get
nudged*. Shipping a usable mobile view directly serves the "calm, check-on-the-go" promise.

**The access path (resolving PIPE-024's blocker).** Three tiers, near→far:

1. **LAN access (now, zero infra):** the Mac app already serves on `127.0.0.1:8000`; binding
   the dev/prod server to `0.0.0.0` lets the user reach `http://<mac-lan-ip>:8000` from their
   phone on the same Wi-Fi. This is the immediate, honest answer — no cloud, no new cost,
   consistent with the "self-hosted local Mac app" locked decision. *(Server-bind change is
   out of scope for this frontend PR; documented here as the recommended next step.)*
2. **Tunnel (optional):** a Tailscale/ngrok tunnel for off-network access, still self-hosted.
3. **Cloud host (future):** only "when revenue justifies it" per STRATEGY.md.

**Where the responsive work pays off twice.** The same responsive primitives benefit the
**marketing site + public calculator** (already on Vercel, already mobile-reachable, already
the top-of-funnel lead-gen surface). A holder who reads the r/dividends post on their phone
and taps through to the calculator must land on something that works at 375px. So mobile is
on the revenue path *today* via the funnel, independent of the app's access path.

**Cost / risk.** Frontend-only, no backend or data-model change, no new dependency. Risk is
visual regression on desktop — mitigated by gating every change behind a breakpoint so the
desktop layout is byte-for-byte unchanged above 768px.

**Success metric.** The full free-user flow (sign in → see positions → see an action card →
run the calculator) is completable on a 375×812 viewport with no horizontal page scroll and
no clipped controls.

---

## 2. Design perspective

Anchored to the existing design system (index.css tokens) — we **adapt, not redesign**.

- **Breakpoints:** `mobile ≤ 768px`, `narrow ≤ 480px`. Desktop (>768px) is untouched.
- **One source of truth:** a `useIsMobile()` hook drives JS layout switches (inline-style
  grids can't be overridden by CSS media queries due to specificity); CSS `@media` handles
  everything class/element-driven (padding, type scale, scroll, safe-area).
- **Type scale:** the hero serif display (52–60px) is too tall for a phone — step down to
  ~36px on mobile so the "is everything okay?" number still leads without wrapping.
- **Density → stacking:** multi-column stat rows collapse to 2-up (key numbers) or 1-up.
  Wide data tables keep their column widths and gain **horizontal scroll** rather than being
  crushed — financial tables are read column-by-column; squashing them destroys legibility.
- **Spacing:** page gutter drops from 32px → 16px on mobile to reclaim width.
- **Touch:** minimum 40px tap targets for nav/buttons; tooltips already support tap (PIPE-025).
- **Chrome:** the 240px sidebar becomes an off-canvas **drawer** behind a hamburger; the
  topbar collapses (title + hamburger + one primary action; ⌘K search hidden on phones).
- **Aesthetic invariant:** "document, not app" — small radii, warm paper bg, mono numerals —
  all preserved. Nothing about the brand changes; only the layout reflows.

---

## 3. UX perspective

**Primary mobile job:** *monitor + respond*, not *configure*. Optimize the read path.

- **Navigation:** hamburger → full-height drawer overlay with backdrop; tapping any item or
  the backdrop closes it; the drawer reuses the exact desktop nav (no divergent IA).
- **First screen:** Dashboard hero answers "is everything okay?" above the fold on a phone —
  portfolio value + today's move + count of positions needing attention.
- **Action without zoom:** action cards, roll targets, and the "Sell a call" CTA must be
  tappable at full size; no pinch-zoom required (we keep user zoom *enabled* for a11y, but
  the layout must not depend on it).
- **Tables:** the holdings/positions tables scroll horizontally inside a contained track, so
  the page itself never scrolls sideways (a classic mobile foot-gun). A subtle scroll affords
  discoverability.
- **Forms:** Add Position / Add Holding / Auth inputs go full-width, single-column, with
  `font-size ≥ 16px` on inputs to stop iOS Safari from auto-zooming on focus.
- **No dead ends:** empty states (PIPE-027) and upgrade modals must fit a 92vw card.

---

## 4. Engineering plan

Frontend-only. React 18 + Vite, inline-styles + token CSS. No router (tab state in App.jsx).

### Files & changes
1. **`frontend/src/hooks/useMediaQuery.js`** *(new)* — `useMediaQuery(q)`, `useIsMobile()`
   (`≤768px`), `useIsNarrow()` (`≤480px`). `matchMedia` + `addEventListener`, SSR-safe.
2. **`frontend/index.html`** — `viewport-fit=cover` for iOS safe areas (keep user-scalable).
3. **`frontend/src/App.jsx`** — root grid `1fr` on mobile; drawer `open` state; render Sidebar
   as overlay + backdrop on mobile; `navigate()` closes drawer; reduce `main` padding.
4. **`frontend/src/components/Sidebar.jsx`** — `Sidebar` accepts `isMobile/open/onClose`
   (fixed off-canvas drawer on mobile); `TopBar` accepts `isMobile/onMenu` (hamburger, hide
   search, condense). Wire the orphaned `MobileMenuButton` concept into TopBar.
5. **`frontend/src/index.css`** — `@media (max-width:768px)` block: page-gutter var, `.h-display`
   step-down, `.h-scroll-x` table wrapper utility, 16px input font, safe-area insets, 40px taps.
6. **`frontend/src/components/Dashboard.jsx`** — hero stat grid → 2-up; holdings table → scroll
   track w/ min-width; secondary grids stack.
7. **`frontend/src/components/Portfolios.jsx`** — 9-col position rows → horizontal scroll track
   with min-width (keeps column legibility; lowest-risk for the core view).
8. **`frontend/src/components/SignalTracker.jsx`** (`ScreenerPanel`) — results row wraps/scrolls.
9. **`frontend/src/components/Recommendations.jsx`** — `minmax(480px,1fr)` →
   `minmax(min(480px,100%),1fr)` (pure CSS, removes overflow on phones).
10. **Modals/auth** — `UpgradeModal`, `AuthGate`, `ConnectBrokerage`: `maxWidth: min(Xpx, 92vw)`.

### Strategy
- **Gate every change behind the breakpoint** → desktop layout provably unchanged.
- **Prefer horizontal-scroll tracks** for dense financial tables over reflowing into cards
  (lower risk, preserves the numeric reading pattern; card-ification can come later if asked).
- **No new deps.** Charts already use `@visx/responsive` `ParentSize` ✓.

### Verification
- `npm run build` clean.
- Manual: per project CLAUDE.md, Playwright screenshots are blocked on this Mac — ask the
  user to verify at 375×812 (iPhone) and confirm: no horizontal page scroll, drawer opens,
  hero readable, tables scroll within their track, modals fit.

### Out of scope (documented, not done here)
- Server `0.0.0.0` bind for LAN access (backend/deploy change — recommended follow-up).
- Card-ification of tables, bottom-tab nav, PWA/installability — future polish.
