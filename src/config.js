export const VIEW_W = 640;
export const VIEW_H = 360;
export const DAY_LENGTH = 240;
export const START_HOUR = 8;
export const HEART_TOTAL = 3;

export const UPGRADES = [
  { id: 'garden', name: 'GARDEN', desc: '+2 food every dawn. The soil here is still good.', costs: [8, 18], max: 2 },
  { id: 'infirmary', name: 'INFIRMARY', desc: '+1 meds and mends the community at dawn.', costs: [10, 22], max: 2 },
  { id: 'workshop', name: 'WORKSHOP', desc: '+2 ammo every dawn. Brass and patience.', costs: [9, 20], max: 2 },
  { id: 'watchtower', name: 'WATCHTOWER', desc: '+30 home integrity. Raiders hit softer.', costs: [12, 26], max: 2 },
  { id: 'bunks', name: 'BUNKS', desc: '+1 survivor capacity. Somewhere to sleep.', costs: [8, 20], max: 2 },
];

export const SURVIVOR_DEFS = {
  mara: {
    name: 'Mara Voss',
    role: 'Leader',
    trait: 'Steady hands · +25% stamina regen',
    color: '#8f4f3f',
    skin: '#c99a78',
    look: 'mara',
    bonus: 'stamina',
  },
  cole: {
    name: 'Cole Rusk',
    role: 'Mechanic',
    trait: '+1 materials every dawn',
    color: '#4e5f62',
    skin: '#b98f6b',
    look: 'cole',
    bonus: 'mats',
  },
  june: {
    name: 'June Okafor',
    role: 'Nurse',
    trait: '+1 meds every dawn · stronger medkits',
    color: '#6c7a68',
    skin: '#8f6847',
    look: 'june',
    bonus: 'meds',
  },
  ada: {
    name: 'Ada Bell',
    role: 'Forager',
    trait: '+2 food every dawn',
    color: '#8a7a47',
    skin: '#bd9068',
    look: 'ada',
    bonus: 'food',
  },
  rico: {
    name: 'Rico Vale',
    role: 'Marksman',
    trait: '+2 ammo every dawn · +15% gun damage',
    color: '#5a5266',
    skin: '#c39a72',
    look: 'rico',
    bonus: 'ammo',
  },
  sam: {
    name: 'Sam Reyes',
    role: 'Scout',
    trait: 'Faster on foot · +8% move speed',
    color: '#6a5a4a',
    skin: '#a97f5c',
    look: 'sam',
    bonus: 'speed',
  },
};

export const LOOT_FLAVOR = [
  "A child's drawing is pinned inside the crate. Someone meant to come back.",
  'The radio crackles: "...anyone on this frequency..." Then silence.',
  'You find a half-finished crossword. The last word is "home".',
  'Fingerprints in the dust. Small ones.',
  'A note: "Don\'t go past the church. It breathes."',
  'Canned peaches. The label says EXPIRED 2019. They will do.',
  'A photo of four people at a lake. Two faces are scratched out.',
  'Ammunition wrapped in a dish towel. Careful hands packed this.',
  'A wall calendar, still turned to March. Every day after is crossed out.',
];

export function nightAmount(hour) {
  if (hour >= 18 && hour < 20.5) return ((hour - 18) / 2.5) * 0.4;
  if (hour >= 20.5 || hour < 5) return 0.72;
  if (hour >= 5 && hour < 7) return 0.72 * (1 - (hour - 5) / 2);
  return 0;
}

export function phaseName(hour) {
  if (hour >= 5 && hour < 7) return 'DAWN';
  if (hour >= 7 && hour < 18) return 'DAYLIGHT';
  if (hour >= 18 && hour < 20.5) return 'DUSK';
  return 'NIGHT';
}

export function fmtClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
