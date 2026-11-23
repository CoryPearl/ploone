import { AIRCRAFT } from './aircraft-data.js';
export const STICKERS = [
  { id: 'none', name: 'None' }, { id: 'club', name: 'Ploon club' }, { id: 'bolt', name: 'Lightning' },
  { id: 'sunset', name: 'Sunset' }, { id: 'star', name: 'Lucky star' }, { id: 'checker', name: 'Checker' }, { id: 'shark', name: 'Shark teeth' }
];
export const STICKER_SLOTS = { leftWing: 'Left wing', rightWing: 'Right wing', leftSide: 'Left side', rightSide: 'Right side' };
export const CHARM_COLORS = { cream: '#e8dcc1', coral: '#c95d49', mint: '#88b6a3', black: '#333b3b' };
export function normalizeCustomization(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const choose = (value, choices, fallback) => choices.includes(value) ? value : fallback;
  return {
    stickers: Object.fromEntries(Object.keys(STICKER_SLOTS).map(slot => [slot, choose(source.stickers?.[slot], STICKERS.map(item => item.id), 'none')])),
    hanging: choose(source.hanging, ['none', 'dice', 'mini-plane', 'freshener'], 'none'),
    color: choose(source.color, Object.keys(CHARM_COLORS), 'cream'),
    dashboard: choose(source.dashboard, ['none', 'photo', 'duck'], 'none'),
    nameplate: typeof source.nameplate === 'string' ? source.nameplate.replace(/[\u0000-\u001f]/g, '').slice(0, 16) : ''
  };
}
export function normalizeCustomizations(value) {
  return Object.fromEntries(AIRCRAFT.filter(plane => value && Object.hasOwn(value, plane.id)).map(plane => [plane.id, normalizeCustomization(value[plane.id])]));
}
export const customizationFor = (settings, aircraft) => normalizeCustomization(settings.customizations?.[typeof aircraft === 'string' ? aircraft : aircraft.id]);
