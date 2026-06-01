# PIPE-034 · SnapTrade Brokerage Import

> **Status:** draft — awaiting approval
> **Depends on:** PIPE-030 (Supabase migration, confirmed prerequisite), PIPE-031 (SnapTrade Supabase tables)
> **Estimated scope:** backend/main.py, backend/snaptrade.py (new), frontend/src/components/ConnectBrokerage.jsx (new), frontend/src/components/Portfolios.jsx

---

## What this does

Adds a "Connect Brokerage" flow to Harvest. The user clicks one button, authenticates with their real brokerage through a SnapTrade portal, and their positions auto-populate in Harvest — no manual entry.

This plan also lays the architectural foundation for **trade execution** (Phase 2: "Roll to this" one-click, one-click close) — the endpoints are designed for it from day one.

**Why this matters for acquisition:** The r/dividends post will be far more compelling if a new user can go from signup → seeing their real income potential in under 60 seconds. Removing manual position-entry friction is the single biggest drop-off in the onboarding funnel.

---

## How SnapTrade Works (TL;DR)

1. Our backend registers a SnapTrade user (returns `snaptrade_user_id` + `snaptrade_user_secret`)
2. Backend generates a short-lived login link → passed to frontend
3. Frontend opens it as an **iframe** inside a Harvest modal
4. User authenticates with their brokerage in the iframe
5. SnapTrade sends a `postMessage`: `{ status: 'SUCCESS', authorizationId: '...' }`
6. We store the `authorizationId` (connection ID) for future use
7. We fetch ALL account data — positions, options, balances — and store raw
8. We run a categorization pass to classify what we received into Harvest types

---

## Environment Variables (new)

```
SNAPTRADE_CLIENT_ID=...
SNAPTRADE_CONSUMER_KEY=...
```

Add to `.env` and Railway config. `CONSUMER_KEY` is sensitive — backend only, never exposed to frontend.

---

## Backend Changes

### New file: `backend/snaptrade.py`

Thin wrapper around the SnapTrade REST API using the Python SDK.

```python
# pip install snaptrade
from snaptrade.api_client import ApiClient
from snaptrade.configuration import Configuration
```

**Functions to implement:**

```python
def register_user(harvest_user_id: str) -> dict:
    """Create a SnapTrade user. Returns { userId, userSecret }."""

def get_connection_link(snaptrade_user_id: str, user_secret: str,
                        redirect_uri: str, connection_id: Optional[str] = None) -> str:
    """Generate the Connection Portal URL for iframe.
    Pass connection_id to reconnect an existing (broken) connection."""

def get_connections(snaptrade_user_id: str, user_secret: str) -> list:
    """List all brokerage connections and their status (ACTIVE / DISABLED / ERROR)."""

def get_accounts(snaptrade_user_id: str, user_secret: str) -> list:
    """List all brokerage accounts across all connections."""

def get_positions(snaptrade_user_id: str, user_secret: str, account_id: str) -> list:
    """Fetch all positions (equity, options, crypto, etc.) — full raw response."""

def get_options_positions(snaptrade_user_id: str, user_secret: str, account_id: str) -> list:
    """Fetch options positions — full raw response."""

def get_balances(snaptrade_user_id: str, user_secret: str, account_id: str) -> list:
    """Fetch account balances (cash, buying power, total value)."""

# Phase 2 — trading (architecture in place, implementation deferred)
def place_order(snaptrade_user_id: str, user_secret: str, account_id: str,
                order: dict) -> dict:
    """Place a trade order. Returns order_id and initial status."""

def get_order_status(snaptrade_user_id: str, user_secret: str,
                     account_id: str, order_id: str) -> dict:
    """Check status of a placed order (PENDING / FILLED / CANCELLED / REJECTED)."""

def cancel_order(snaptrade_user_id: str, user_secret: str,
                 account_id: str, order_id: str) -> dict:
    """Cancel an open order."""
```

---

### `backend/main.py` — New endpoints

#### Registration & Connection

**`POST /api/snaptrade/register`** *(auth required)*
Registers the Harvest user with SnapTrade if not already done. Safe to call multiple times.

**`GET /api/snaptrade/connect-link`** *(auth required)*
Returns a short-lived Connection Portal URL. Frontend opens this in an iframe. The link expires after use — always fetch a fresh one before opening the modal.
Optional `?connection_id=` param to reconnect a broken/expired connection rather than creating a new one.

**`GET /api/snaptrade/connections`** *(auth required)*
Returns all of the user's brokerage connections and their health status. Used by the frontend to show which brokerages are connected and flag any that need re-authentication.

```python
# Response shape:
[
  {
    "connection_id": "...",
    "brokerage_name": "Fidelity",
    "status": "ACTIVE",   # or DISABLED | ERROR
    "last_synced": "2026-04-21T10:00:00",
    "accounts": [{ "id": "...", "name": "Individual Brokerage" }]
  }
]
```

**`DELETE /api/snaptrade/connections/{connection_id}`** *(auth required)*
Disconnects a brokerage. Does not delete imported positions — those stay in Harvest.

#### Import

**`POST /api/snaptrade/import`** *(auth required)*
Called after iframe reports SUCCESS (or manually via "Sync brokerage" button). Fetches all accounts and all position types. Stores everything raw, then runs categorization.

```python
@app.post("/api/snaptrade/import")
def import_from_snaptrade(
    conflict_resolution: str = Query("brokerage"),  # "brokerage" | "harvest" | "ask"
    current_user: User = Depends(get_current_user)
):
    accounts = snaptrade.get_accounts(...)
    result = { "imported": 0, "updated": 0, "skipped": 0, "conflicts": [], "raw_counts": {} }

    for account in accounts:
        # Fetch ALL position types — no filtering at this stage
        raw_positions  = snaptrade.get_positions(account["id"])
        raw_options    = snaptrade.get_options_positions(account["id"])
        raw_balances   = snaptrade.get_balances(account["id"])

        # Store raw snapshot (full SnapTrade response preserved)
        save_raw_import(user_id, account["id"], {
            "positions": raw_positions,
            "options": raw_options,
            "balances": raw_balances,
            "fetched_at": datetime.now().isoformat()
        })

        # Categorize and map (see Data Mapping below)
        for raw in raw_positions + raw_options:
            category = categorize_position(raw)
            mapped   = map_to_harvest(raw, category)
            conflict = find_conflict(mapped, user_id)

            if conflict:
                if conflict_resolution == "brokerage":
                    overwrite_with(mapped, conflict)
                    result["updated"] += 1
                elif conflict_resolution == "harvest":
                    result["skipped"] += 1
                else:  # "ask"
                    result["conflicts"].append({ "incoming": mapped, "existing": conflict })
            else:
                save_position(mapped, user_id)
                result["imported"] += 1

    return result
```

#### Connection Health & Reconnect

**`GET /api/snaptrade/health`** *(auth required)*
Checks all connections. Returns any that are DISABLED or ERROR with a reconnect link.
Called on app load (lightweight — just status check, no data fetch). Surfaces a "Reconnect Fidelity" banner if a connection has gone stale.

**`POST /api/snaptrade/reconnect/{connection_id}`** *(auth required)*
Generates a fresh Connection Portal link pre-targeted at the broken connection. User re-authenticates in the same iframe flow.

#### Webhooks (SnapTrade → Harvest)

**`POST /api/snaptrade/webhook`** *(no auth — verified by SnapTrade signature)*
SnapTrade can POST events when connection status changes. Handle:
- `CONNECTION_BROKEN` → flag connection as needing re-auth, trigger reconnect banner
- `SYNC_COMPLETED` → optional: trigger a background import refresh

```python
@app.post("/api/snaptrade/webhook")
def snaptrade_webhook(request: Request, payload: dict = Body(...)):
    # Verify request is from SnapTrade (HMAC signature in header)
    # Handle event types: CONNECTION_BROKEN, SYNC_COMPLETED
    ...
```

#### Trading (Phase 2 — endpoints defined now, implementation deferred)

**`POST /api/snaptrade/orders`** *(auth required)*
Place a trade (sell-to-open, buy-to-close, roll). Feeds the "Roll to this →" button in PIPE-001 and eventual one-click close.

```python
# Request body shape:
{
  "account_id": "...",
  "action": "SELL",         # BUY | SELL
  "order_type": "Limit",    # Market | Limit | StopLimit
  "symbol": "SPY",
  "option_symbol": {        # present for options trades
    "strike": 560,
    "expiry": "2026-05-16",
    "option_type": "CALL"
  },
  "quantity": 2,
  "limit_price": 3.45
}
```

**`GET /api/snaptrade/orders`** *(auth required)*
List recent orders and their fill status. Shown in a new "Orders" panel (future).

**`DELETE /api/snaptrade/orders/{order_id}`** *(auth required)*
Cancel an open order.

---

## Data Mapping

### Philosophy: map wide, categorize later

We do **not** filter or discard any SnapTrade data at import time. Every position comes in as a raw record. We normalize it into a common intermediate format, store the original SnapTrade payload alongside it, then run categorization logic to assign a `harvest_category`.

This means:
- Future strategy types (cash-secured puts, spreads, long calls) require only a new category rule — no re-import
- We can build UI for "uncategorized" positions so users can review what came in
- We never lose data from a broker format we haven't seen yet

### Intermediate raw record (stored in `snaptrade_raw_imports/{user_id}/{account_id}.json`)

```json
{
  "fetched_at": "2026-04-21T10:00:00",
  "positions": [ ...full SnapTrade response... ],
  "options":   [ ...full SnapTrade response... ],
  "balances":  [ ...full SnapTrade response... ]
}
```

### Normalized position record (what we work with after mapping)

Every position — equity, option, unknown — gets normalized into this shape before categorization:

| Field | Source | Notes |
|---|---|---|
| `snaptrade_id` | position `id` or `symbol.id` | Stable ID for upserts on re-sync |
| `snaptrade_account_id` | account `id` | Which brokerage account |
| `snaptrade_raw` | full position object | Verbatim, for debugging and re-categorization |
| `asset_type` | `symbol.type` | `equity`, `option`, `crypto`, `fixed_income`, `unknown` |
| `ticker` | `symbol.symbol` or `symbol.option_symbol.underlying_symbol` | |
| `quantity` | `quantity` | Negative = short |
| `cost_basis` | `average_purchase_price` | What they paid / received |
| `current_price` | `price` or `current_price` | Mark-to-market |
| `currency` | `currency` | USD, CAD, etc. |
| `option_type` | `symbol.option_symbol.option_type` | `CALL`, `PUT`, or null |
| `strike` | `symbol.option_symbol.strike_price` | null for equities |
| `expiry` | `symbol.option_symbol.expiration_date` | null for equities |
| `harvest_category` | derived (see below) | assigned by `categorize_position()` |

### `categorize_position(raw)` — classification logic

```python
def categorize_position(raw: dict) -> str:
    asset_type  = raw.get("asset_type")
    option_type = raw.get("option_type")
    quantity    = raw.get("quantity", 0)

    if asset_type == "equity" and quantity > 0:
        return "long_stock"
    if asset_type == "option" and option_type == "CALL" and quantity < 0:
        return "covered_call"       # short call — primary Harvest use case
    if asset_type == "option" and option_type == "PUT" and quantity < 0:
        return "cash_secured_put"   # short put
    if asset_type == "option" and option_type == "PUT" and quantity > 0:
        return "protective_put"     # long put hedge
    if asset_type == "option" and option_type == "CALL" and quantity > 0:
        return "long_call"
    if asset_type == "crypto":
        return "crypto"
    if asset_type == "fixed_income":
        return "fixed_income"
    return "uncategorized"          # anything we haven't seen — store, don't discard
```

Only `covered_call` and `long_stock` feed into Harvest's existing positions/holdings UI today. All other categories are stored and visible in a new "Imported — Review" section (described below). This gives us a natural expansion surface for future strategy support.

---

## Frontend Changes

### New component: `frontend/src/components/ConnectBrokerage.jsx`

**State 1 — Prompt:**
```
Connect your brokerage

Import your real positions automatically — no manual entry.

Works with: Fidelity · IBKR · Robinhood · E*TRADE · Webull · and more

[Connect Brokerage →]      [Enter manually instead]
```

**State 2 — iframe portal:** Full-screen modal overlay. Listens for `postMessage`:
- `{ status: "SUCCESS" }` → close iframe, call `POST /api/snaptrade/import`, show result
- `{ status: "ERROR" }` → show error + retry option
- `{ status: "ABANDONED" }` → close modal silently

**State 3 — Success:**
```
✓ Connected to Fidelity

Imported:
  12 stock positions
  3 covered call positions
  2 positions need review  ← uncategorized or non-CC options

[View my positions →]    [Review imported data →]
```

**State 4 — Conflict resolution** (when `conflict_resolution = "ask"`):
Shows a diff for each conflict: incoming brokerage data vs. existing Harvest data. User picks which to keep. Defaults to brokerage data (pre-selected).

### Connection health banner

In `App.jsx` (alongside the existing alert count check), call `GET /api/snaptrade/health` on load. If any connection returns `DISABLED` or `ERROR`, show an amber banner:

```
⚠  Your Fidelity connection needs to be refreshed.  [Reconnect →]
```

Clicking "Reconnect" opens `ConnectBrokerage` in reconnect mode (passes `connection_id`).

### `frontend/src/components/Portfolios.jsx` — wiring

- On empty state: "Connect Brokerage" as primary CTA, "Enter manually" as secondary
- On portfolio header: small "Sync" button for users re-importing after opening new positions
- New "Imported — Review" section (below open positions): shows uncategorized or non-CC items with `harvest_category` label, quantity, and current value. No action required — just visibility.

---

## Conflict Resolution (confirmed behavior)

When import finds an existing Harvest position matching on `ticker + strike + expiry`:

- **Default behavior:** brokerage data wins — overwrite with SnapTrade data
- **User can override per-import** via a toggle in the sync UI ("Keep my edits" / "Use brokerage data")
- **What "brokerage wins" overwrites:** `contracts`, `sell_price`, `current_price`, `cost_basis`
- **What it never touches:** user notes, scorecard history, signal snapshots — these are Harvest-native and always preserved

---

## Freemium Considerations

- **Free users:** All data imports and is stored. The 3-position display limit (PIPE-029) applies at render time, not import time. Show: "3 of 12 positions shown — upgrade to Harvest Pro to see all."
- **SnapTrade registration:** Happens on first connect. No SnapTrade cost until user actually connects a brokerage.
- **Re-syncs:** Manual only (user hits "Sync"). No polling or scheduled syncs — avoids SnapTrade rate costs and keeps behavior predictable.

---

## Storage (Supabase — after PIPE-030 + PIPE-031)

All SnapTrade state lives in Supabase with RLS. Three tables (provisioned by PIPE-031):

**`snaptrade_credentials`**
```sql
user_id          uuid references users(id)
snaptrade_user_id text not null
user_secret      text not null   -- encrypted at rest via Supabase Vault
created_at       timestamptz default now()
```

**`snaptrade_connections`**
```sql
user_id          uuid references users(id)
connection_id    text not null
brokerage_name   text
status           text            -- ACTIVE | DISABLED | ERROR
last_synced      timestamptz
```

**`snaptrade_raw_imports`**
```sql
user_id          uuid references users(id)
account_id       text not null
fetched_at       timestamptz
raw_json         jsonb           -- full SnapTrade response, queryable
```

All three tables have RLS: `USING (user_id = current_setting('app.current_user_id')::uuid)` — same pattern as the rest of the data layer from PIPE-030. The `raw_json` jsonb column means we can query imported data directly (e.g., find all uncategorized positions) without deserializing in Python.

---

## Implementation Order

1. **PIPE-030 + PIPE-031 first** — need Supabase up, RLS policies in place, and SnapTrade tables provisioned
2. `pip install snaptrade` → add to `requirements.txt`
3. `backend/snaptrade.py` — all wrapper functions (register, connect-link, connections, positions, options, balances, trading stubs)
4. `backend/main.py` — registration, connect-link, connections CRUD, import, health, webhook, trading stubs
5. `categorize_position()` and `map_to_harvest()` helpers in `backend/snaptrade.py`
6. `frontend/src/components/ConnectBrokerage.jsx` — modal + iframe + postMessage + conflict UI
7. Wire health check into `App.jsx` load sequence; reconnect banner
8. Wire `ConnectBrokerage` into `Portfolios.jsx` empty state + sync button
9. "Imported — Review" section in `Portfolios.jsx`
10. Test end-to-end with SnapTrade sandbox (5-connection free tier)

---

## Open Questions

1. **Schwab / Tastytrade supported?** Deferred — user will verify against SnapTrade's full brokerage list. Don't promise specific broker names in the r/dividends post until confirmed.

2. **PIPE-030 dependency:** ✅ Confirmed — implement PIPE-030 (multi-tenancy) and PIPE-031 (SQLite) first.

3. **Import conflict handling:** ✅ Confirmed — brokerage data is the default winner. User can toggle to "keep my edits" per sync run. Harvest-native data (notes, signals) is always preserved.

---

## Future: Phase 2 Trading

The order endpoints defined above enable:
- **PIPE-001 "Roll to this →"** — one-click roll from an action card sends a spread order (buy-to-close current + sell-to-open new strike/expiry)
- **One-click close** — buy-to-close a position directly from the action card
- **Order status tracking** — new "Orders" tab showing pending fills

These are out of scope for PIPE-034 but the backend interface is designed so they can be wired in without restructuring.

---

## Add to PIPELINE.md as PIPE-034

Once approved, add after PIPE-033, status `pending`.
Also add to the Feature Log in `STRATEGY.md` once shipped.
