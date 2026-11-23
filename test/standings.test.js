import test from 'node:test';
import assert from 'node:assert/strict';
import { bestStanding } from '../public/js/core/standings.js';

test('a verified best displays its exact rank including positions outside the top 10', () => {
  assert.deepEqual(bestStanding({ time: 60 }, { time: 60, rank: 3 }), { time: 60, rank: 3, label: '#3' });
  assert.deepEqual(bestStanding({ time: 72 }, { time: 72, rank: 13 }), { time: 72, rank: 13, label: '#13' });
});

test('a faster unsubmitted local best never inherits the rank of a slower shared time', () => {
  assert.deepEqual(bestStanding({ time: 55 }, { time: 60, rank: 3 }), { time: 55, rank: null, label: 'Unranked' });
  assert.deepEqual(bestStanding({ time: 55 }, null), { time: 55, rank: null, label: 'Unranked' });
});

test('shared bests remain visible if local storage is empty or has a slower record', () => {
  assert.deepEqual(bestStanding(null, { time: 60, rank: 3 }), { time: 60, rank: 3, label: '#3' });
  assert.deepEqual(bestStanding({ time: 65 }, { time: 60, rank: 3 }), { time: 60, rank: 3, label: '#3' });
  assert.deepEqual(bestStanding(null, null), { time: null, rank: null, label: 'Unranked' });
});

test('pending and unavailable ranks keep local bests visible without showing an outdated rank', () => {
  assert.deepEqual(bestStanding({ time: 60 }, null, 'loading'), { time: 60, rank: null, label: '…' });
  assert.deepEqual(bestStanding({ time: 60 }, { time: 60, rank: 1 }, 'error'), { time: 60, rank: null, label: 'Rank unavailable' });
  assert.deepEqual(bestStanding({ time: NaN }, { time: 0, rank: 0 }), { time: null, rank: null, label: 'Unranked' });
});
