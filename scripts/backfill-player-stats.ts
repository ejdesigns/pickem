/**
 * Backfill NBA player game stats from ESPN boxscores (free, no key).
 *
 * Usage:
 *   npx tsx scripts/backfill-player-stats.ts            # everything missing
 *   npx tsx scripts/backfill-player-stats.ts --batch 50 # one batch of 50 games
 *
 * Resume-safe: skips games already flagged player_stats_ingested.
 * Run AFTER the games backfill — it needs final NBA rows in public.games.
 */
import { createClient } from "@supabase/supabase-js";
import { ingestRecentPlayerStats } from "../lib/player-ingest";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const BATCH = Number(process.argv.includes("--batch") ? process.argv[process.argv.indexOf("--batch") + 1] : 200);

async function main() {
  const admin = createClient(url!, key!);
  let total = { checked: 0, ok: 0, failed: 0, players: 0 };
  for (;;) {
    const s = await ingestRecentPlayerStats(admin as any, { all: true, limit: BATCH });
    total.checked += s.checked;
    total.ok += s.ok;
    total.failed += s.failed;
    total.players += s.players;
    console.log(
      `[batch] checked=${s.checked} ok=${s.ok} failed=${s.failed} players=${s.players} | total ok=${total.ok}`
    );
    if (s.checked < BATCH) break; // nothing left
    await new Promise((r) => setTimeout(r, 5_000));
  }
  console.log("DONE", JSON.stringify(total));
}

main().catch((e) => {
  console.error("backfill-player-stats failed:", e);
  process.exit(1);
});
