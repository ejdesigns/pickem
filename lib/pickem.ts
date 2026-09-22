/**
 * Shared pick'em domain helpers: invite codes, winner derivation, standings.
 */

export interface GameLike {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  kickoff: string;
  week: number;
}

export interface PickLike {
  game_id: string;
  user_id: string;
  picked_team: string;
}

/** Derive the winning team abbreviation from final scores. Null on ties / non-final. */
export function gameWinner(game: GameLike): string | null {
  if (game.status !== "final") return null;
  if (game.home_score === null || game.away_score === null) return null;
  if (game.home_score > game.away_score) return game.home_team;
  if (game.away_score > game.home_score) return game.away_team;
  return null; // tie: nobody gets the win in MVP scoring
}

/** Generate a 6-character invite code (unambiguous chars, no 0/O/1/I). */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export interface StandingRow {
  user_id: string;
  display_name: string;
  wins: number;
  losses: number;
  streak: number; // current win streak over graded (final) games, most recent first
}

/**
 * Compute standings from graded games + picks.
 * Ties and unpicked games don't count as wins or losses.
 */
export function computeStandings(
  members: { user_id: string; display_name: string }[],
  games: GameLike[],
  picks: PickLike[]
): StandingRow[] {
  const picksByUser = new Map<string, Map<string, string>>();
  for (const p of picks) {
    if (!picksByUser.has(p.user_id)) picksByUser.set(p.user_id, new Map());
    picksByUser.get(p.user_id)!.set(p.game_id, p.picked_team);
  }

  const graded = games
    .filter((g) => gameWinner(g) !== null)
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));

  return members
    .map((m) => {
      const mine = picksByUser.get(m.user_id) ?? new Map<string, string>();
      let wins = 0;
      let losses = 0;
      // Streak: walk graded games most-recent-first, count consecutive wins.
      let streak = 0;
      let streakAlive = true;
      for (let i = graded.length - 1; i >= 0; i--) {
        const g = graded[i];
        const picked = mine.get(g.id);
        if (picked === undefined) continue; // skipped game: doesn't break streak
        const won = picked === gameWinner(g);
        if (won) wins++;
        else losses++;
        if (streakAlive) {
          if (won) streak++;
          else streakAlive = false;
        }
      }
      return { user_id: m.user_id, display_name: m.display_name, wins, losses, streak };
    })
    .sort((a, b) => b.wins - a.wins || b.streak - a.streak || a.losses - b.losses);
}
