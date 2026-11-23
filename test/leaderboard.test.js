import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../server.js';
import { createLeaderboard } from '../lib/leaderboard.js';
import { verifyRace } from '../lib/verify-race.js';
import { recordedRace } from '../test-support/race-recording.js';
import { createRecording, recordControls } from '../public/js/core/recording.js';

const run = recordedRace();
const temporary = async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ploon-ranking-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'scores.json');
};

test('recorded controls reproduce a complete obstacle race and compute its time', () => {
  assert.ok(run.commands.length < run.ticks);
  const result = verifyRace({ ...run, time: 1 });
  assert.equal(result.time, run.time);
  assert.throws(() => verifyRace({ ...run, ticks: run.ticks - 1, commands: run.commands.filter(command => command[0] < run.ticks - 1) }), /finish ring/);
  assert.throws(() => verifyRace({ ...run, ticks: run.ticks + 1 }), /past the finish/);
  assert.throws(() => verifyRace({ ...run, generatorVersion: 4 }), /Reload/);
  assert.throws(() => verifyRace({ ...run, flightVersion: 3 }), /Reload/);
  assert.throws(() => verifyRace({ ...run, aircraft: 'made-up' }), /valid course/);
  assert.throws(() => verifyRace({ ...run, commands: [[0, 9, 0, 0, 0, 0]] }), /Invalid flight controls/);
  assert.throws(() => verifyRace({ ...run, commands: [[1, 0, 0, 0, 0, 0]] }), /start at takeoff/);
  assert.throws(() => verifyRace({ ...run, commands: [[0, -1, 0, 0, 0, 0]] }), /collision/);
});

test('recording stores control changes on exact simulation ticks', () => {
  const recording = createRecording(), input = { pitch: 0, roll: 0, yaw: 0, throttle: 0, drift: false };
  recordControls(recording, input); recordControls(recording, input);
  recordControls(recording, { ...input, drift: true });
  assert.equal(recording.ticks, 3);
  assert.deepEqual(recording.commands, [[0, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 1]]);
});

test('top 10 persists, sorts fairly, isolates courses/planes, and keeps one best per pilot', async t => {
  const file = await temporary(t), board = createLeaderboard(file);
  const scope = { seed: run.seed, aircraft: run.aircraft };
  await Promise.all(Array.from({ length: 13 }, (_, i) => board.submit({ ...scope, pilotId: `pilot-${i}`, name: `Pilot ${i}`, time: 100 - i })));
  let rows = await board.list(scope.seed, scope.aircraft, 'pilot-12');
  assert.equal(rows.length, 10); assert.equal(rows[0].time, 88); assert.equal(rows.at(-1).time, 97); assert.equal(rows[0].isYou, true);
  assert.equal('pilotId' in rows[0], false);
  assert.deepEqual(await board.list(scope.seed, 'p51'), []);
  assert.deepEqual(await board.list('different-map', scope.aircraft), []);
  assert.deepEqual(await board.submit({ ...scope, pilotId: 'pilot-12', name: 'Slower', time: 99 }), { rank: 1, improved: false, bestTime: 88 });
  await board.submit({ ...scope, pilotId: 'pilot-12', name: 'Faster', time: 87 });
  rows = await createLeaderboard(file).list(scope.seed, scope.aircraft, 'pilot-12');
  assert.equal(rows[0].name, 'Faster'); assert.equal(rows[0].time, 87); assert.equal(rows.length, 10);
});

test('leaderboard HTTP API verifies real races, rejects forged times, and identifies anonymous pilots privately', async t => {
  const file = await temporary(t), server = createServer({ leaderboardFile: file });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, query = new URLSearchParams({ seed: run.seed, aircraft: run.aircraft });
  const initial = await fetch(`${base}/api/leaderboard?${query}`);
  assert.deepEqual((await initial.json()).entries, []);
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  assert.match(initial.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const post = body => fetch(`${base}/api/leaderboard`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
  const submitted = await post({ ...run, name: '<b>Test Pilot</b>', time: 1 });
  assert.equal(submitted.status, 200); const score = await submitted.json();
  assert.equal(score.time, run.time); assert.equal(score.rank, 1); assert.equal(score.bestTime, run.time);
  const standings = await (await fetch(`${base}/api/leaderboard?${query}`, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(standings.personal, { rank: 1, name: '<b>Test Pilot</b>', time: run.time }); assert.equal(standings.totalPilots, 1);
  const own = (await (await fetch(`${base}/api/leaderboard?${query}`, { headers: { Cookie: cookie } })).json()).entries;
  assert.equal(own[0].isYou, true); assert.equal(own[0].name, '<b>Test Pilot</b>'); assert.equal('pilotId' in own[0], false);
  const publicRows = (await (await fetch(`${base}/api/leaderboard?${query}`)).json()).entries;
  assert.equal(publicRows[0].isYou, false);
  assert.equal((await (await fetch(`${base}/api/leaderboard?${query}`)).json()).personal, null);
  assert.equal((await post({ ...run, ticks: 2 })).status, 400);
  assert.equal((await post({ ...run, flightVersion: -1 })).status, 400);
  assert.equal((await post({ ...run, name: 'a'.repeat(21) })).status, 400);
  assert.equal((await fetch(`${base}/api/leaderboard?aircraft=invalid`)).status, 400);
  assert.equal((await fetch(`${base}/api/leaderboard`, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(`${base}/api/leaderboard`, { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(`${base}/api/leaderboard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
  assert.equal((await fetch(`${base}/api/leaderboard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'a'.repeat(513 * 1024) }) })).status, 413);
  assert.equal((await fetch(`${base}/data/leaderboards.json`)).status, 404);
  assert.equal((await fetch(`${base}/api/leaderboard`, { method: 'HEAD' })).status, 200);
  const persisted = await createLeaderboard(file).list(run.seed, run.aircraft);
  assert.equal(persisted[0].time, run.time);
});

test('personal ranks beyond the top 10 persist and update independently for every plane', async t => {
  const file = await temporary(t), board = createLeaderboard(file), scope = { seed: 'ranked-course', aircraft: 'f16' };
  for (let i = 0; i < 13; i++) await board.submit({ ...scope, pilotId: `pilot-${i}`, name: `Pilot ${i}`, time: 60 + i });
  let data = await board.standings(scope.seed, scope.aircraft, 'pilot-12');
  assert.equal(data.entries.length, 10); assert.equal(data.totalPilots, 13);
  assert.deepEqual(data.personal, { rank: 13, name: 'Pilot 12', time: 72 });
  assert.equal(data.entries.some(entry => entry.isYou), false); assert.equal('pilotId' in data.personal, false);
  const reopened = createLeaderboard(file);
  assert.deepEqual((await reopened.standings(scope.seed, scope.aircraft, 'pilot-12')).personal, data.personal);
  assert.deepEqual(await board.submit({ ...scope, pilotId: 'pilot-12', name: 'Slower', time: 80 }), { rank: 13, improved: false, bestTime: 72 });
  assert.deepEqual(await board.submit({ ...scope, pilotId: 'pilot-12', name: 'Faster', time: 59 }), { rank: 1, improved: true, bestTime: 59 });
  data = await board.standings(scope.seed, scope.aircraft, 'pilot-9');
  assert.equal(data.personal.rank, 11); assert.equal(data.entries.some(entry => entry.isYou), false);
  await board.submit({ ...scope, aircraft: 'p51', pilotId: 'pilot-9', name: 'Pilot 9', time: 150 });
  assert.equal((await board.standings(scope.seed, 'p51', 'pilot-9')).personal.rank, 1);
  assert.equal((await board.standings(scope.seed, 'f16', 'pilot-9')).personal.rank, 11);
  assert.equal((await board.standings('another-course', 'f16', 'pilot-9')).personal, null);
  assert.equal((await board.standings(scope.seed, 'f16', 'anonymous')).personal, null);
});
