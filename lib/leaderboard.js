import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { recordKey } from '../public/js/core/storage.js';

export function createLeaderboard(file) {
  let boards, pending = Promise.resolve();
  const load = () => boards ||= readFile(file, 'utf8').then(text => new Map(JSON.parse(text)), error => {
    if (error.code === 'ENOENT') return new Map(); throw error;
  });
  const standings = async (seed, aircraft, pilotId) => {
    await pending;
    const entries = (await load()).get(recordKey(seed, aircraft))?.entries || [];
    const ownIndex = pilotId ? entries.findIndex(entry => entry.pilotId === pilotId) : -1;
    return {
      entries: entries.slice(0, 10).map(({ name, time, pilotId: owner }, index) => ({ rank: index + 1, name, time, isYou: owner === pilotId })),
      personal: ownIndex < 0 ? null : { rank: ownIndex + 1, name: entries[ownIndex].name, time: entries[ownIndex].time },
      totalPilots: entries.length
    };
  };
  return {
    standings,
    async list(seed, aircraft, pilotId) { return (await standings(seed, aircraft, pilotId)).entries; },
    submit({ seed, aircraft, time, name, pilotId }) {
      const task = pending.then(async () => {
        const current = await load(), key = recordKey(seed, aircraft);
        const entries = [...(current.get(key)?.entries || [])];
        const best = entries.find(entry => entry.pilotId === pilotId);
        if (best && best.time <= time) return { rank: entries.indexOf(best) + 1, improved: false, bestTime: best.time };
        const next = entries.filter(entry => entry.pilotId !== pilotId);
        next.push({ pilotId, name, time, updatedAt: Date.now() });
        next.sort((a, b) => a.time - b.time || a.updatedAt - b.updatedAt || a.pilotId.localeCompare(b.pilotId));
        const rank = next.findIndex(entry => entry.pilotId === pilotId) + 1;
        const updated = new Map(current);
        updated.delete(key); updated.set(key, { entries: next });
        while (updated.size > 512) updated.delete(updated.keys().next().value);
        await mkdir(path.dirname(file), { recursive: true });
        const temporary = `${file}.${randomUUID()}.tmp`;
        try { await writeFile(temporary, JSON.stringify([...updated]), { mode: 0o600 }); await rename(temporary, file); }
        catch (error) { await unlink(temporary).catch(() => {}); throw error; }
        boards = Promise.resolve(updated);
        return { rank, improved: true, bestTime: time };
      });
      pending = task.catch(() => {});
      return task;
    }
  };
}

let verifying = 0;
export function verifyInWorker(run) {
  if (verifying >= 2) return Promise.reject(Object.assign(new Error('The leaderboard is busy. Try again shortly.'), { status: 429 }));
  verifying++;
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL('./verify-race-worker.js', import.meta.url)); }
    catch (error) { verifying--; reject(error); return; }
    const timeout = setTimeout(() => finish(new Error('Race verification took too long.')), 10000);
    let settled = false;
    function finish(error, result) {
      if (settled) return; settled = true;
      clearTimeout(timeout); verifying--; worker.terminate();
      if (error) reject(error); else resolve(result);
    }
    worker.once('message', ({ result, error }) => finish(error ? Object.assign(new Error(error), { status: 400 }) : null, result));
    worker.once('error', error => finish(error));
    worker.once('exit', () => { if (!settled) finish(new Error('Race verification stopped.')); });
    worker.postMessage(run);
  });
}
