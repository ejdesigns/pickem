# Refresh cadence & Odds API quota math

The Morning Line runs on The Odds API **free tier: 500 credits/month, $0**.
This doc proves the refresh schedule stays inside it. Policy lives in
`lib/refresh-policy.ts`; crons in `vercel.json`.

## Verified cost model (Sept 2026)

One `GET /v4/sports/{sport}/odds` request costs **(#regions) × (#markets)**.
We always request `markets=h2h,spreads,totals` (3):

| Refresh type | Regions | Cost |
|---|---|---|
| US-only | `us` | 1 × 3 = **3 credits** |
| Global | `us,uk,eu` | 3 × 3 = **9 credits** |

Fixture listings (`/sports`, `/events`) are free. Historical odds snapshots
cost 10× — we never request them. Scores come from free sources
(nflverse CSV, balldontlie), never from The Odds API.

## The schedule (Vercel Hobby allows 2 cron jobs)

| Cron | Schedule (UTC) | What it does |
|---|---|---|
| `/api/cron/score` | `0 12 * * *` (daily) | Ingest current + previous week per sport (free), snapshot model predictions (free), odds refresh per policy below |
| `/api/cron/refresh` | `0 8,18 * * *` (2× daily) | Re-ingest scores per sport (free), game-window odds boost per policy below |

## The policy (`lib/refresh-policy.ts`)

State per sport in `refresh_state` (migration `003_sport.sql`).

**Daily (`planDailyOddsRefresh`)**
- Sport with no games in the next 14 days → **skipped (0 credits)**.
  Offseason sports cost nothing.
- Otherwise: global refresh (`us,uk,eu`, 9 credits) if the last global
  refresh was ≥ 5 days ago; US-only (3 credits) on the other days.

**Game-window boost (`planBoostOddsRefresh`, 2× daily)**
- Only if a game tips within 8h OR started within the last 6h and isn't final.
- US-only (3 credits), at most **one boost per 10h per sport**.

Smart caching throughout: the policy checks the DB first and never calls
the API when there's nothing to refresh. Odds snapshots are only written
when a book's numbers actually change.

## Monthly quota math

**Worst case — October (NFL + NBA both active):**
- Daily: 2 sports × (25 days × 3 + ~6 global days × 9) ≈ **258 credits**
- Boosts: NFL ~13 game-days × 3 + NBA ~26 game-days × 3 ≈ **117 credits**
- **Total ≈ 375 credits → ~25% headroom under the 500 cap.**

**Single active sport:** ≈ 129 + ~78 ≈ **207 credits.**
**Both sports offseason:** 0 odds credits (ingest still runs; it's free).

If we ever approach the cap, the levers are: stretch the global refresh to
every 7 days, or drop boosts to game-days only — no code redesign needed.

## What "always updated" means on the free tier

- Scores: re-ingested 3× daily (08:00, 12:00, 18:00 UTC) from free sources,
  so finals land within hours. Not tick-by-tick live — that needs a paid feed.
- Odds: refreshed daily, plus a US-books boost around tip-off on game days;
  full global books about weekly.
- No paid data APIs without Ethan's explicit approval (standing rule).
