import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, pilotDisplayName, getRecord, saveRecord, recordKey, loadRaceHistory, saveRaceResult } from '../public/js/core/storage.js';
import { GENERATOR_VERSION, FLIGHT_VERSION } from '../public/js/core/seed.js';

function storage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), values = new Map();
  const local = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  return local;
}

test('a new pilot gets one persistent automatic name and can edit or clear their name', t => {
  const local = storage(t), first = loadSettings();
  assert.match(first.automaticName, /^Pilot [A-F0-9]{6}$/);
  assert.equal(pilotDisplayName(first), first.automaticName);
  assert.equal(loadSettings().automaticName, first.automaticName);
  first.pilotName = '  Cloud Pilot  ';
  assert.equal(saveSettings(first), true);
  assert.equal(pilotDisplayName(loadSettings()), 'Cloud Pilot');
  first.pilotName = ''; saveSettings(first);
  assert.equal(pilotDisplayName(loadSettings()), first.automaticName);
  local.setItem('ploon:settings:1', JSON.stringify({ pilotName: 'Existing pilot', units: 'metric', missiles: true }));
  const migrated = loadSettings();
  assert.equal(migrated.pilotName, 'Existing pilot'); assert.equal(migrated.units, 'metric'); assert.equal('missiles' in migrated, false);
  assert.equal(loadSettings().automaticName, migrated.automaticName);
});

test('localStorage keeps best times and complete ghost data with no IndexedDB dependency', async t => {
  const local = storage(t), samples = [[0, 0, 100, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 100, .5], [60, 0, 100, -6000, 0, 0, 0, 1, 1, 0, .5, -1, 1, 200, 1]];
  assert.equal(await saveRecord('today', 'f16', 60, [60], samples, 'Cloud Pilot'), true);
  const key = recordKey('today', 'f16'), saved = JSON.parse(local.getItem('ploon:record:1:' + key));
  assert.equal(saved.pilotName, 'Cloud Pilot'); assert.equal(saved.time, 60); assert.deepEqual(saved.samples, samples);
  assert.deepEqual(await getRecord('today', 'f16'), saved);
  assert.equal(await saveRecord('today', 'f16', 65, [65], [], 'Different pilot'), false);
  assert.equal((await getRecord('today', 'f16')).pilotName, 'Cloud Pilot');
  await Promise.all([saveRecord('today', 'f16', 55, [55], samples, 'Fast pilot'), saveRecord('today', 'f16', 58, [58], [], 'Slower pilot')]);
  assert.equal((await getRecord('today', 'f16')).time, 55);
  assert.equal((await getRecord('today', 'f16')).pilotName, 'Fast pilot');
  assert.equal(await getRecord('another', 'f16'), null); assert.equal(await getRecord('today', 'p51'), null);
  assert.equal(await saveRecord('today', 'f16', NaN, [], []), null);
});

test('race history retains finished and crashed attempts, controls, names, and version scope', t => {
  const local = storage(t), controls = [[0, 0, 0, 0, 1, 0], [240, 0, 0, 1, 0, 1]];
  const result = { seed: 'today', aircraft: 'f16', pilotName: 'First name', status: 'finished', time: 60, splits: [60], distance: 9000, crashReason: null, ticks: 7200, commands: controls };
  assert.equal(saveRaceResult(result), true);
  assert.equal(saveRaceResult({ ...result, pilotName: 'New name', status: 'crashed', time: 3, splits: [], crashReason: 'terrain' }), true);
  const history = JSON.parse(local.getItem('ploon:races:1'));
  assert.deepEqual(loadRaceHistory(), history); assert.equal(history.length, 2);
  assert.equal(history[0].pilotName, 'First name'); assert.equal(history[1].pilotName, 'New name');
  assert.equal(history[1].crashReason, 'terrain'); assert.notEqual(history[0].id, history[1].id);
  assert.equal(history[0].generatorVersion, GENERATOR_VERSION); assert.equal(history[0].flightVersion, FLIGHT_VERSION);
  assert.deepEqual(history[0].commands, controls); assert.ok(history[0].savedAt > 0);
});

test('unavailable or damaged storage never prevents playing and reports failed writes', async t => {
  const local = storage(t);
  local.setItem('ploon:settings:1', '{broken'); local.setItem('ploon:races:1', '{}');
  assert.ok(pilotDisplayName(loadSettings())); assert.deepEqual(loadRaceHistory(), []);
  local.setItem('ploon:record:1:' + recordKey('today', 'f16'), '{broken');
  assert.equal(await saveRecord('today', 'f16', 60, [60], [], 'Repaired'), true);
  local.setItem = () => { throw new Error('Storage is full'); };
  assert.equal(saveSettings(loadSettings()), false);
  assert.equal(saveRaceResult({ time: 60 }), false);
  assert.equal(await saveRecord('today', 'f16', 55, [55], [], 'Unsaved'), null);
  assert.equal((await getRecord('today', 'f16')).time, 60);
  local.getItem = () => { throw new Error('Storage disabled'); };
  assert.ok(pilotDisplayName(loadSettings())); assert.deepEqual(loadRaceHistory(), []);
});

test('existing IndexedDB bests migrate into localStorage and remain available after migration', async t => {
  const local = storage(t), previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const key = recordKey('legacy', 'p51'), legacy = { key, seed: 'legacy', aircraft: 'p51', time: 80, splits: [80], samples: [[0, 0, 100, 0, 0, 0, 0, 1]], savedAt: 1 };
  let reads = 0;
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() {
    const open = {};
    queueMicrotask(() => {
      open.result = { transaction() { return { objectStore() { return { get() {
        const request = {}; reads++;
        queueMicrotask(() => { request.result = legacy; request.onsuccess(); }); return request;
      } }; } }; } };
      open.onsuccess();
    });
    return open;
  } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'indexedDB', previous); else delete globalThis.indexedDB; });
  assert.deepEqual(await getRecord('legacy', 'p51'), legacy);
  assert.deepEqual(JSON.parse(local.getItem('ploon:record:1:' + key)), legacy);
  assert.deepEqual(await getRecord('legacy', 'p51'), legacy); assert.equal(reads, 1);
  assert.equal(await saveRecord('legacy', 'p51', 90, [90], []), false);
});

test('cockpit decorations and stickers persist separately for each aircraft across reloads', t => {
 const local=storage(t),settings=loadSettings();
 settings.customizations={f16:{stickers:{leftWing:'bolt'},hanging:'dice',color:'coral',dashboard:'duck',nameplate:'ACE'},p51:{hanging:'mini-plane',color:'mint',dashboard:'photo'}};
 assert.equal(saveSettings(settings),true);const loaded=loadSettings();
 assert.equal(loaded.customizations.f16.stickers.leftWing,'bolt');assert.equal(loaded.customizations.f16.hanging,'dice');assert.equal(loaded.customizations.f16.nameplate,'ACE');
 assert.equal(loaded.customizations.p51.hanging,'mini-plane');assert.equal(loaded.customizations.p51.stickers.leftWing,'none');
 assert.ok(JSON.parse(local.getItem('ploon:settings:1')).customizations.f16);
});

test('music gets a quiet default, keeps an existing mute, and saves independently from master volume',t=>{
 const local=storage(t);local.setItem('ploon:settings:1',JSON.stringify({volume:0}));
 let settings=loadSettings();assert.equal(settings.volume,0);assert.equal(settings.musicVolume,.15);
 settings.volume=.65;settings.musicVolume=0;assert.equal(saveSettings(settings),true);settings=loadSettings();assert.equal(settings.volume,.65);assert.equal(settings.musicVolume,0);
 local.setItem('ploon:settings:1',JSON.stringify({volume:30,musicVolume:'loud'}));settings=loadSettings();assert.equal(settings.volume,1);assert.equal(settings.musicVolume,.15);
});
