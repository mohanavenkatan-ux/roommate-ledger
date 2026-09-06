# roommate-ledger

A self-hosted, Splitwise-style expense ledger for a household or roommate
group. Track shared expenses over time, see running balances, and settle up
- without a cloud account or a subscription.

**Status:** early — this is Phase 1 (backend foundation) of a larger plan.
There's a working API and data model, but no frontend yet beyond a
placeholder page. See "Roadmap" below.

## Why self-hosted

This is meant to run on a server you control (a home server, NAS, or a
small VPS) so your group's data stays with you, not a third party.

## Identity model - read this before exposing it to the internet

There are no passwords or per-person accounts. A group can have an
optional PIN; anyone with the group's link (and PIN, if set) picks their
name from the member list to identify themselves. This is convenience and
attribution for a small trusted household, **not real security**. Don't
expose this directly to the public internet without adding real
authentication in front of it (e.g. a reverse proxy with its own auth, or a
VPN/Tailscale to your home network).

## Running it

```bash
docker compose up -d
```

The app listens on port 3000 (`http://localhost:3000`), and data persists
in a Docker volume. To run it without Docker:

```bash
npm install
npm start
```

Requires Node.js 22.5+ (uses the built-in `node:sqlite` module, so there's
no native dependency to compile).

## Data model

- **people** - anyone who's ever joined a group
- **groups** - a household/roommate group, with a currency symbol and an optional PIN
- **group_members** - who's in which group
- **expenses** - description, amount, who paid, how it's split (`equal` / `exact` / `percentage` / `shares`), and where it came from (`manual` or `costco-split`, for the future receipt-import bridge)
- **expense_splits** - the resolved per-person cent amount for each expense, stored permanently so history stays accurate even if group membership changes later
- **payments** - a recorded settle-up between two people

All money is stored and computed in integer cents; splits always use a
largest-remainder rounding method so shares sum to the exact total, the
same approach used in the companion
[Costco Split](https://github.com/mohanavenkatan-ux/Costco-split) app.

## API

| Method & path | What it does |
|---|---|
| `POST /api/groups` | Create a group `{name, currency?, pin?}` |
| `GET /api/groups/:id` | Get a group and its members |
| `POST /api/groups/:id/join` | Join/identify as a member `{name, pin?}` |
| `GET /api/groups/:id/people` | List members |
| `GET/POST /api/groups/:id/expenses` | List / create expenses |
| `PATCH/DELETE /api/groups/:id/expenses/:id` | Edit / remove an expense |
| `GET/POST /api/groups/:id/payments` | List / record a settle-up payment |
| `DELETE /api/groups/:id/payments/:id` | Remove a payment record |

Amounts are sent/received as decimal units (e.g. `12.50`), converted to
integer cents internally.

## Roadmap

1. ~~Backend foundation~~ (this)
2. Balance engine - net balance per person per group, and a "simplify
   debts" algorithm to minimize the number of payments needed
3. Frontend - the actual Splitwise-style UI
4. Costco Split bridge - an itemized "shopping receipt" expense type that
   opens [Costco Split](https://github.com/mohanavenkatan-ux/Costco-split)
   with the group pre-filled, and a way to bring its settle-up summary
   back in as an expense
5. Polish & packaging
