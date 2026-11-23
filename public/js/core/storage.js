import { generatorVersionFor, FLIGHT_VERSION, normalizeSeed } from './seed.js';
import { normalizeCustomizations } from './customization.js';
import { audioVolume } from './audio-model.js';
const SETTINGS_KEY = 'ploon:settings:1', RECORD_PREFIX = 'ploon:record:1:', HISTORY_KEY = 'ploon:races:1';
const identifier = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
export const defaultSettings = { volume: 0.3, musicVolume: 0.15, sensitivity: 1, invert: false, quality: 'high', ghost: true, instruments: true, pilotName: '', automaticName: '', units: 'imperial' };
const cleanName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 20) : '';
export const pilotDisplayName = settings => cleanName(settings.pilotName) || cleanName(settings.automaticName);
export function loadSettings() {
  let stored;
  try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { /* Use defaults when storage is unavailable. */ }
  const settings = { ...defaultSettings, ...(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}) };
  delete settings.missiles;
  settings.volume=audioVolume(settings.volume);settings.musicVolume=audioVolume(settings.musicVolume,.15);
  settings.customizations = normalizeCustomizations(settings.customizations);
  settings.pilotName = typeof settings.pilotName === 'string' ? settings.pilotName.slice(0, 20) : '';
  settings.automaticName = cleanName(settings.automaticName);
  if (!settings.automaticName) {
    settings.automaticName = `Pilot ${identifier().slice(0, 6).toUpperCase()}`;
    saveSettings(settings);
  }
  return settings;
}
export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
export const recordKey = (seed, aircraft) => `${generatorVersionFor(seed)}:${FLIGHT_VERSION}:${normalizeSeed(seed)}:${aircraft}`;
function localRecord(key) {
  try {
    const record = JSON.parse(localStorage.getItem(RECORD_PREFIX + key) || 'null');
    return record?.key === key && Number.isFinite(record.time) && record.time > 0 ? record : null;
  } catch { return null; }
}

// Read older IndexedDB bests only when they have not yet moved to localStorage.
let dbPromise;
async function legacyDatabase() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('ploon', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Legacy records are unavailable.'));
  });
  try { return await dbPromise; } catch (error) { dbPromise = null; throw error; }
}
export async function getRecord(seed, aircraft) {
  const key = recordKey(seed, aircraft);
  try { const record = localRecord(key); if (record) return record; } catch { /* Try the previous record store. */ }
  try {
    const db = await legacyDatabase();
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('records').objectStore('records').get(key);
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    });
    const latest = localRecord(key);
    if (latest && (!record || latest.time <= record.time)) return latest;
    if (record) {
      try { localStorage.setItem(RECORD_PREFIX + key, JSON.stringify(record)); } catch { /* Keep the older best usable. */ }
    }
    return record;
  } catch { return null; }
}
export async function saveRecord(seed, aircraft, time, splits, samples, pilotName = '') {
  if (!Number.isFinite(time) || time <= 0) return null;
  const key = recordKey(seed, aircraft), previous = await getRecord(seed, aircraft);
  try {
    // Re-read after the legacy lookup so simultaneous saves keep the fastest run.
    const latest = localRecord(key), best = latest && (!previous || latest.time < previous.time) ? latest : previous;
    if (best && time >= best.time) return false;
    localStorage.setItem(RECORD_PREFIX + key, JSON.stringify({ key, seed, aircraft, time, splits, samples, pilotName: cleanName(pilotName), savedAt: Date.now() }));
    return true;
  } catch { return null; }
}
export function loadRaceHistory() {
  try { const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(history) ? history : []; } catch { return []; }
}
export function saveRaceResult(result) {
  try {
    // Results retain the name used for that attempt, even after a later rename.
    const history = loadRaceHistory();
    history.push({ ...result, id: identifier(), generatorVersion: generatorVersionFor(result.seed), flightVersion: FLIGHT_VERSION, savedAt: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch { return false; }
}
