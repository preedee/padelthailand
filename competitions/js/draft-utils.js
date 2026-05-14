/* ============================================
   Draft Utilities — pure logic (no I/O, no DOM)
   Snake-order math, time helpers, color states.
   ============================================ */

(function (root) {
  const N_TEAMS = 8;
  const N_ROUNDS = 8;
  const TOTAL_PICKS = N_TEAMS * N_ROUNDS;  // 64

  // 1-indexed pick number → round (1..8).
  function roundForPick(pickNumber) {
    return Math.ceil(pickNumber / N_TEAMS);
  }

  // Snake order: odd rounds 1→8 by seed, even rounds 8→1.
  // Returns the team identifier for the given pick number.
  function teamForPick(pickNumber, teamsBySeed) {
    if (!Array.isArray(teamsBySeed) || teamsBySeed.length !== N_TEAMS) {
      throw new Error(`teamForPick expects ${N_TEAMS} teams, got ${teamsBySeed && teamsBySeed.length}`);
    }
    if (pickNumber < 1 || pickNumber > TOTAL_PICKS) {
      throw new Error(`pickNumber must be 1..${TOTAL_PICKS}, got ${pickNumber}`);
    }
    const round = roundForPick(pickNumber);
    const positionInRound = ((pickNumber - 1) % N_TEAMS) + 1;
    const teamIndex = (round % 2 === 1)
      ? positionInRound
      : N_TEAMS + 1 - positionInRound;
    return teamsBySeed[teamIndex - 1];
  }

  // Full 64-element draft order array.
  function buildDraftOrder(teamsBySeed) {
    const order = [];
    for (let p = 1; p <= TOTAL_PICKS; p++) {
      order.push(teamForPick(p, teamsBySeed));
    }
    return order;
  }

  // Remaining seconds for the active pick window. Can return negative
  // (intentional per spec edge case #2).
  function remainingSeconds(timerStartedAtMs, pickTimerSeconds, nowMs) {
    return pickTimerSeconds - (nowMs - timerStartedAtMs) / 1000;
  }

  // Proportional color thresholds per 02-behavior.md:
  //   green  > 66% remaining
  //   orange 33%–66%
  //   red    <= 33%
  function timerColorState(remainingS, pickTimerSeconds) {
    const frac = remainingS / pickTimerSeconds;
    if (frac > 2 / 3) return 'green';
    if (frac > 1 / 3) return 'orange';
    return 'red';
  }

  // Compute team rosters from the picks ledger: { team_id: [player_id, ...] }
  // Includes only non-undone picks. Caller adds captains separately
  // (they're not draft picks).
  function rostersFromPicks(picks) {
    const rosters = {};
    for (const p of picks) {
      if (p.is_undone) continue;
      if (!rosters[p.team_id]) rosters[p.team_id] = [];
      rosters[p.team_id].push(p.player_id);
    }
    return rosters;
  }

  root.DraftUtils = {
    N_TEAMS, N_ROUNDS, TOTAL_PICKS,
    roundForPick,
    teamForPick,
    buildDraftOrder,
    remainingSeconds,
    timerColorState,
    rostersFromPicks,
  };
})(typeof window !== 'undefined' ? window : globalThis);
