# roommate-ledger

A self-hosted, Splitwise-style expense ledger for a household or roommate
group. Track shared expenses over time, see running balances, and settle up
- without a cloud account or a subscription.

Pairs with [Costco Split](https://github.com/mohanavenkatan-ux/Costco-split):
add a "shopping receipt" expense here and it opens Costco Split, pre-filled
with your group, for itemized splitting - then brings the result back in.

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

Since the app is installable (see below) and offline-capable, serving it
over HTTPS - even just via a reverse proxy with a self-signed or Let's
Encrypt certificate - gets you the most out of it; the service worker
won't register over plain HTTP on a non-localhost address.

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
no native dependency to compile). The Docker image hasn't been build-tested
on this particular development machine (a Windows/WSL2 issue got in the
way, unrelated to the app itself) - if `docker compose up` doesn't work
cleanly for you, please open an issue with what broke.

## Using it

1. Create a group (name, currency, optional PIN) and send the link it gives
   you to your roommates.
2. Everyone who opens the link picks their name (or types a new one) to
   identify themselves - remembered in their own browser after that.
3. Add expenses as they happen: equal split, exact amounts, percentages, or
   shares. For an itemized grocery/warehouse-store run, use **Import
   shopping receipt** instead - it opens Costco Split pre-filled with your
   group, and imports the finished split back in once you paste its summary.
4. Check **Settle up** any time for the minimum set of payments needed to
   zero everyone out, and record a payment with one click once it's paid.
5. **Export data** any time for a JSON backup of the group, its expenses,
   payments, and current balances.

Everything is installable - "Add to Home Screen" from your phone's browser
gets you an app icon and offline access to the UI (live balances still need
a connection, deliberately - see below).

## Data model

- **people** - anyone who's ever joined a group
- **groups** - a household/roommate group, with a currency symbol and an optional PIN
- **group_members** - who's in which group
- **expenses** - description, amount, who paid, how it's split (`equal` / `exact` / `percentage` / `shares`), and where it came from (`manual` or `costco-split`)
- **expense_splits** - the resolved per-person cent amount for each expense, stored permanently so history stays accurate even if group membership changes later
- **payments** - a recorded settle-up between two people

All money is stored and computed in integer cents; splits always use a
largest-remainder rounding method so shares sum to the exact total, the
same approach used in the companion
[Costco Split](https://github.com/mohanavenkatan-ux/Costco-split) app.

## Balances and settling up

`GET /api/groups/:id/balances` nets every expense (payer credited the full
amount, each participant debited their share) and payment (settling moves
cents between the two people) into one number per person - positive means
the group owes them, negative means they owe the group. A greedy
largest-creditor/largest-debtor pass then collapses that into the minimum
practical number of payments, shown under Settle Up with a one-click
"record this payment" button.

## The Costco Split bridge

Costco Split's "Copy summary" button produces plain text (receipt
description, `Total: $X`, one `name: $amount` line per person, then who
paid). Importing here parses that directly into an `exact`-split expense.
One detail worth knowing: the expense's amount is the **sum of the
per-person amounts being imported**, not Costco Split's printed total -
those only match once every item on the receipt has been assigned to
someone. If part of a receipt is still unassigned, the import screen warns
you rather than silently under- or over-counting.

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
| `GET /api/groups/:id/balances` | Net balances and suggested settlements |

Amounts are sent/received as decimal units (e.g. `12.50`), converted to
integer cents internally.

## Development

```bash
npm install
npm test    # runs everything under test/ via node:test
npm run dev # auto-restarts on file changes
```

The balance/debt-simplification math and the Costco Split summary parser
both have unit test coverage (`test/balances.test.js`,
`test/parseSummary.test.js`) since they're the parts most likely to have a
subtle bug hiding in an edge case.

## Status

All planned phases are in: backend + data model, the balance engine,
the frontend, the Costco Split bridge, and this polish pass (currency
selection, data export, installability, Docker packaging). Not a
guarantee it's bug-free - just that nothing here is a stub.
