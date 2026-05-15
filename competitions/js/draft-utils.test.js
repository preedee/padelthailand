/* Unit tests for draft-utils.js. Run with: node js/draft-utils.test.js */

require('./draft-utils.js');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  N_TEAMS, TOTAL_PICKS,
  roundForPick, teamForPick, buildDraftOrder,
  remainingSeconds, timerColorState, rostersFromPicks,
} = globalThis.DraftUtils;

const TEAMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

test('roundForPick — pick 1 in round 1', () => assert.equal(roundForPick(1), 1));
test('roundForPick — pick 8 in round 1', () => assert.equal(roundForPick(8), 1));
test('roundForPick — pick 9 in round 2', () => assert.equal(roundForPick(9), 2));
test('roundForPick — pick 16 in round 2', () => assert.equal(roundForPick(16), 2));
test('roundForPick — pick 64 in round 8', () => assert.equal(roundForPick(64), 8));

test('teamForPick — round 1 ascending', () => {
  assert.equal(teamForPick(1, TEAMS), 'A');
  assert.equal(teamForPick(2, TEAMS), 'B');
  assert.equal(teamForPick(8, TEAMS), 'H');
});

test('teamForPick — round 2 descending (snake)', () => {
  assert.equal(teamForPick(9, TEAMS), 'H');
  assert.equal(teamForPick(10, TEAMS), 'G');
  assert.equal(teamForPick(16, TEAMS), 'A');
});

test('teamForPick — round 3 ascending again', () => {
  assert.equal(teamForPick(17, TEAMS), 'A');
  assert.equal(teamForPick(24, TEAMS), 'H');
});

test('teamForPick — pick 64 lands on team A (round 8, snake = descending)', () => {
  // Round 8 (even), position 8 → teamIndex = 8 + 1 - 8 = 1 → 'A'
  assert.equal(teamForPick(64, TEAMS), 'A');
});

test('teamForPick — throws on bad team count', () => {
  assert.throws(() => teamForPick(1, ['A', 'B']), /expects 8 teams/);
});

test('teamForPick — throws on out-of-range pick number', () => {
  assert.throws(() => teamForPick(0, TEAMS), /1..64/);
  assert.throws(() => teamForPick(65, TEAMS), /1..64/);
});

test('buildDraftOrder — 64 elements', () => {
  const order = buildDraftOrder(TEAMS);
  assert.equal(order.length, TOTAL_PICKS);
});

test('buildDraftOrder — each team picks exactly 8 times', () => {
  const order = buildDraftOrder(TEAMS);
  for (const t of TEAMS) {
    const count = order.filter(x => x === t).length;
    assert.equal(count, 8, `team ${t} should pick 8 times`);
  }
});

test('buildDraftOrder — first and last picks match snake spec', () => {
  const order = buildDraftOrder(TEAMS);
  assert.equal(order[0], 'A');        // R1 pick 1
  assert.equal(order[7], 'H');        // R1 pick 8
  assert.equal(order[8], 'H');        // R2 pick 1 (snake)
  assert.equal(order[15], 'A');       // R2 pick 8
  assert.equal(order[63], 'A');       // R8 pick 8
});

test('remainingSeconds — positive', () => {
  assert.equal(remainingSeconds(1000000, 45, 1010000), 35);
});

test('remainingSeconds — negative when past 0:00', () => {
  assert.equal(remainingSeconds(1000000, 45, 1050000), -5);
});

test('timerColorState — green when full', () => {
  assert.equal(timerColorState(45, 45), 'green');
});

test('timerColorState — green just above 66%', () => {
  assert.equal(timerColorState(30.1, 45), 'green');
});

test('timerColorState — orange at exactly 66.6% (boundary)', () => {
  assert.equal(timerColorState(30, 45), 'orange');
});

test('timerColorState — orange around 50%', () => {
  assert.equal(timerColorState(22.5, 45), 'orange');
});

test('timerColorState — red at 33%', () => {
  assert.equal(timerColorState(15, 45), 'red');
});

test('timerColorState — red at zero', () => {
  assert.equal(timerColorState(0, 45), 'red');
});

test('timerColorState — red when negative (past 0:00)', () => {
  assert.equal(timerColorState(-5, 45), 'red');
});

test('rostersFromPicks — groups picks by team_id, excludes undone', () => {
  const picks = [
    { pick_number: 1, team_id: 'A', player_id: 'p1', is_undone: false },
    { pick_number: 2, team_id: 'B', player_id: 'p2', is_undone: false },
    { pick_number: 3, team_id: 'C', player_id: 'p3', is_undone: true  },  // undone — ignored
    { pick_number: 4, team_id: 'A', player_id: 'p4', is_undone: false },
  ];
  const rosters = rostersFromPicks(picks);
  assert.deepEqual(rosters, { A: ['p1', 'p4'], B: ['p2'] });
});
