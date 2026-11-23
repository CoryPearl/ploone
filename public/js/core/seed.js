export const GENERATOR_VERSION = 9;
export const FLIGHT_VERSION = 4;
export const MAVERIK_VERSION = 8001;
export const isMaverikSeed = value => ['maverik', 'maverick'].includes(String(value ?? '').trim().toLowerCase());
export const generatorVersionFor = seed => isMaverikSeed(seed) ? MAVERIK_VERSION : GENERATOR_VERSION;

export function hashString(value) {
  let h = 2166136261;
  for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function random(seed) {
  let state = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function dailyChallenge(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return { date: day, seed: `ploon-${day}`, generatorVersion: GENERATOR_VERSION };
}

export function normalizeSeed(value) {
  const seed = String(value ?? '').trim().slice(0, 64);
  return isMaverikSeed(seed) ? 'Maverik' : seed || dailyChallenge().seed;
}
