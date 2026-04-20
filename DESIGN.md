# Harvest — Design System

**Direction: Deep Field**

Cool pre-dawn navy foundation, wheat-gold accent, income numbers that breathe.
The Bloomberg terminal if it cared about craft.

---

## Design Principles

1. **Gold = brand/premium/action.** Upgrade CTAs, active nav, Pro badge, headline accent.
2. **Green = money positive.** P&L gains, healthy status, income numbers. Never use for UI chrome.
3. **Elevation over borders.** Cards float via shadow, not hard edges. Borders are whispers.
4. **Numbers are the hero.** Large metrics get size, weight, and tabular alignment. Everything else steps back.
5. **Restraint.** One accent color per view. Whitespace is not waste.

---

## Color Tokens

```css
/* Backgrounds (3 depth levels) */
--bg:          #080d1a   /* page floor — pre-dawn sky */
--surface:     #0d1526   /* cards — float above the page */
--surface-2:   #131e33   /* hover states, nested elements */

/* Borders (near-invisible — shadows handle depth) */
--border:      rgba(255,255,255,0.08)
--border-strong: rgba(255,255,255,0.14)

/* Text */
--text:        #dce8f5   /* cool white — easier on eyes over 8h */
--muted:       #5e7a96   /* clear hierarchy jump from primary */
--label:       #8fa8c4   /* captions, timestamps, secondary labels */

/* Brand Accent — THE change from v1 */
--gold:        #c9a84c   /* harvest wheat — active nav, upgrade CTAs, Pro badge */
--gold-dim:    rgba(201,168,76,0.12)  /* gold background tints */

/* Financial Status */
--green:       #3ecf8e   /* income positive, healthy status */
--green-dim:   rgba(62,207,142,0.12)
--red:         #f87171   /* risk, loss — informational not alarming */
--red-dim:     rgba(248,113,113,0.12)
--amber:       #f59e0b   /* warning, watch */
--amber-dim:   rgba(245,158,11,0.12)
--blue:        #60a5fa   /* info, links */

/* Glows (key metrics only) */
--glow-green:  0 0 24px rgba(62,207,142,0.15)
--glow-gold:   0 0 24px rgba(201,168,76,0.12)
```

---

## Typography

- **Body:** DM Sans, 14px/400, line-height 1.5
- **Labels/captions:** DM Sans, 12px/400, `--label` color
- **Nav items:** DM Sans, 13px/500
- **Headings:** DM Sans, 600–700
- **Metric numbers:** IBM Plex Mono, `font-variant-numeric: tabular-nums`
  - Hero metric: 28–32px/700
  - Sub-metric: 18–20px/600
  - Table data: 13px/400

---

## Elevation

Cards use shadow + slight background lift, not hard borders.

```css
--shadow-sm:  0 1px 3px rgba(0,0,0,.5), 0 1px 2px rgba(0,0,0,.4)
--shadow-md:  0 4px 16px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.4)
--shadow-lg:  0 8px 32px rgba(0,0,0,.7), 0 4px 8px rgba(0,0,0,.5)
```

---

## Spacing

8px base grid: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px

---

## Radii

```css
--radius-sm:  4px   /* badges, small inputs */
--radius-md:  8px   /* cards, buttons, inputs */
--radius-lg:  12px  /* modals, large cards */
--radius-xl:  16px  /* sheet overlays */
```

---

## Component Patterns

### Cards
```
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-md)
box-shadow: var(--shadow-sm)
```

### Primary CTA (upgrade, submit)
```
background: var(--gold)
color: #1a1208   ← dark enough on gold
font-weight: 700
border-radius: var(--radius-md)
```

### Active nav item
```
background: var(--gold-dim)
color: var(--gold)
```

### Status badge (healthy, watch, urgent)
```
background: var(--green-dim) / --amber-dim / --red-dim
color: var(--green) / --amber / --red
border-radius: var(--radius-sm)
padding: 2px 8px
font-size: 11px, font-weight: 600
```

### Positive metric number
```
color: var(--green)
font-family: IBM Plex Mono
font-variant-numeric: tabular-nums
```

### Large headline metric
```
font-size: 28–32px
font-weight: 700
font-family: IBM Plex Mono
color: var(--text)
```

---

## What NOT to do

- Don't use `--green` for nav, buttons, links, or upgrade CTAs — that's `--gold`
- Don't use hard `1px solid var(--border)` as the only card separation — add shadow
- Don't use bright colors for secondary information
- Don't center-align tables or left-align numbers — numbers right-align, labels left-align
