import { RNG, hash2, clamp, TAU } from './util.js';

export const TILE = 16;
export const MAP_W = 128;
export const MAP_H = 96;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const T = {
  GRASS: 0,
  GRASS_DARK: 1,
  DIRT: 2,
  ROAD: 3,
  WOOD: 4,
  TILEFLOOR: 5,
  CONCRETE: 6,
  STONE: 7,
  WATER: 8,
  WALL: 9,
};

const FLOOR_TILE = {
  wood: T.WOOD,
  tile: T.TILEFLOOR,
  concrete: T.CONCRETE,
  stone: T.STONE,
};

const ROAD_ROWS = [44, 45, 46, 47, 85, 86, 87, 88];
const ROAD_COLS = [61, 62, 63, 64];

export function generateWorld(seed = 90210) {
  const rng = new RNG(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      tiles[y * MAP_W + x] = hash2(x, y, seed) < 0.42 ? T.GRASS_DARK : T.GRASS;
    }
  }

  const colliders = [];
  const buildings = [];
  const containers = [];
  const hearts = [];
  const rescues = [];
  const barrels = [];
  const labels = [];
  const cars = [];
  const poles = [];
  const trees = [];
  const rocks = [];

  const world = {
    seed,
    tiles,
    colliders,
    buildings,
    containers,
    hearts,
    rescues,
    barrels,
    labels,
    cars,
    poles,
    trees,
    rocks,
    base: { x: 512, y: 1064, radius: 132 },
    walkableCache: null,
  };

  const idx = (x, y) => y * MAP_W + x;
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? T.WALL : tiles[idx(x, y)]);
  const setTile = (x, y, v) => {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    tiles[idx(x, y)] = v;
  };
  const isBlockedTile = (x, y) => {
    const t = tileAt(x, y);
    return t === T.WALL || t === T.WATER;
  };

  world.tileAt = tileAt;
  world.isBlockedTile = isBlockedTile;

  for (let y = 6; y < 16; y++) {
    for (let x = 7; x < 21; x++) {
      const lens = Math.abs(x - 14) / 8 + Math.abs(y - 10.5) / 5;
      if (lens < 1.05) setTile(x, y, T.WATER);
      else if (lens < 1.3) setTile(x, y, T.DIRT);
    }
  }

  for (const row of ROAD_ROWS) {
    for (let x = 0; x < MAP_W; x++) setTile(x, row, T.ROAD);
  }
  for (const col of ROAD_COLS) {
    for (let y = 0; y < MAP_H; y++) setTile(col, y, T.ROAD);
  }

  function addWallRect(tx, ty) {
    colliders.push({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE, kind: 'wall' });
  }

  function addBuilding(def) {
    const x = def.x * TILE;
    const y = def.y * TILE;
    const w = def.w * TILE;
    const h = def.h * TILE;
    const floorTile = FLOOR_TILE[def.floor] ?? T.WOOD;
    const b = {
      ...def,
      px: x,
      py: y,
      pw: w,
      ph: h,
      inside: false,
      heartSpot: null,
      door: null,
    };

    for (let ty = def.y; ty < def.y + def.h; ty++) {
      for (let tx = def.x; tx < def.x + def.w; tx++) {
        setTile(tx, ty, floorTile);
      }
    }

    const doorSide = def.door || 'south';
    const midX = def.x + Math.floor(def.w / 2);
    const midY = def.y + Math.floor(def.h / 2);
    const doorTiles = new Set();

    const addDoor = (side) => {
      if (side === 'south' || side === 'north') {
        const ty = side === 'south' ? def.y + def.h - 1 : def.y;
        for (let d = -1; d <= 0; d++) {
          doorTiles.add(`${clamp(midX + d, def.x + 1, def.x + def.w - 2)},${ty}`);
        }
        b.door = {
          x: (midX + 1) * TILE,
          y: (side === 'south' ? y + h : y) + (side === 'south' ? 4 : -4),
          side,
        };
      } else {
        const tx = side === 'east' ? def.x + def.w - 1 : def.x;
        for (let d = -1; d <= 0; d++) {
          doorTiles.add(`${tx},${clamp(midY + d, def.y + 1, def.y + def.h - 2)}`);
        }
        b.door = {
          x: (side === 'east' ? x + w : x) + (side === 'east' ? 4 : -4),
          y: (midY + 1) * TILE,
          side,
        };
      }
    };

    addDoor(doorSide);
    if (def.door2) addDoor(def.door2);

    for (let tx = def.x; tx < def.x + def.w; tx++) {
      for (const ty of [def.y, def.y + def.h - 1]) {
        if (doorTiles.has(`${tx},${ty}`)) continue;
        setTile(tx, ty, T.WALL);
        addWallRect(tx, ty);
      }
    }
    for (let ty = def.y + 1; ty < def.y + def.h - 1; ty++) {
      for (const tx of [def.x, def.x + def.w - 1]) {
        if (doorTiles.has(`${tx},${ty}`)) continue;
        setTile(tx, ty, T.WALL);
        addWallRect(tx, ty);
      }
    }

    if (def.w >= 14) {
      const px = def.x + Math.floor(def.w / 2);
      for (let ty = def.y + 1; ty < def.y + def.h - 1; ty++) {
        const rel = ty - def.y;
        const gap = Math.abs(rel - Math.floor(def.h / 2)) < 1 || Math.abs(rel - Math.ceil(def.h / 2)) < 1;
        if (gap) continue;
        if (doorTiles.has(`${px},${ty}`)) continue;
        setTile(px, ty, T.WALL);
        addWallRect(px, ty);
      }
    }

    for (const key of doorTiles) {
      const [tx, ty] = key.split(',').map(Number);
      setTile(tx, ty, floorTile);
    }

    buildings.push(b);
    return b;
  }

  const defs = [
    { id: 'basehouse', name: 'Ranger Station', x: 26, y: 54, w: 12, h: 9, floor: 'wood', door: 'south', type: 'base' },
    { id: 'market', name: "Miller's Market", x: 70, y: 18, w: 20, h: 13, floor: 'tile', door: 'south', door2: 'east', type: 'food' },
    { id: 'hardware', name: 'Bounty Hardware', x: 30, y: 16, w: 16, h: 12, floor: 'concrete', door: 'south', type: 'mats', heart: true },
    { id: 'clinic', name: 'Green Clinic', x: 96, y: 50, w: 14, h: 12, floor: 'tile', door: 'south', type: 'meds' },
    { id: 'cabins', name: 'Lakeside Cabins', x: 98, y: 14, w: 13, h: 10, floor: 'wood', door: 'west', type: 'food' },
    { id: 'church', name: 'Old Church', x: 47, y: 69, w: 14, h: 12, floor: 'stone', door: 'south', type: 'heart', heart: true },
    { id: 'farm', name: 'Sunset Farm', x: 74, y: 69, w: 18, h: 13, floor: 'wood', door: 'west', door2: 'east', type: 'heart', heart: true },
  ];

  for (const def of defs) addBuilding(def);

  const baseHouse = buildings.find((b) => b.id === 'basehouse');
  const base = world.base;
  base.x = baseHouse.px + baseHouse.pw / 2;
  base.y = baseHouse.py + baseHouse.ph + 58;

  function addLoot(x, y, type, label) {
    const c = {
      id: 'loot' + containers.length,
      x,
      y,
      type,
      label,
      looted: false,
      sway: rng.range(0, Math.PI * 2),
    };
    containers.push(c);
    colliders.push({ x: x - 6, y: y - 5, w: 12, h: 10, kind: 'loot' });
    return c;
  }

  function lootLabel(type) {
    return {
      food: 'FOOD CRATE',
      meds: 'MED BAG',
      ammo: 'AMMO BOX',
      mats: 'SUPPLY CASE',
    }[type];
  }

  function fillBuilding(b, counts) {
    const candidates = [];
    for (let ty = b.y + 2; ty < b.y + b.h - 2; ty += 2) {
      for (let tx = b.x + 2; tx < b.x + b.w - 2; tx += 2) {
        if (isBlockedTile(tx, ty)) continue;
        if (isBlockedTile(tx + 1, ty) || isBlockedTile(tx, ty + 1)) continue;
        candidates.push({ x: tx * TILE + 8, y: ty * TILE + 8 });
      }
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    let n = 0;
    for (const type of counts) {
      const spot = candidates[n++];
      if (!spot) break;
      addLoot(spot.x, spot.y, type, lootLabel(type));
    }
  }

  for (const b of buildings) {
    if (b.type === 'food') fillBuilding(b, ['food', 'food', 'food', 'meds', 'mats', 'ammo'].slice(0, b.id === 'cabins' ? 3 : 6));
    else if (b.type === 'mats') fillBuilding(b, ['mats', 'mats', 'ammo', 'mats', 'food']);
    else if (b.type === 'meds') fillBuilding(b, ['meds', 'meds', 'meds', 'food', 'ammo']);
    else if (b.id === 'church') fillBuilding(b, ['meds', 'mats', 'food']);
    else if (b.id === 'farm') fillBuilding(b, ['food', 'food', 'mats', 'mats']);
    else if (b.type === 'heart') fillBuilding(b, ['food', 'mats', 'ammo']);
    else if (b.type === 'base') fillBuilding(b, ['food', 'ammo']);
  }

  for (const b of buildings.filter((b) => b.heart)) {
    const hx = b.px + b.pw * (b.id === 'hardware' ? 0.72 : 0.58);
    const hy = b.py + b.ph * 0.56;
    const heart = {
      id: 'heart' + hearts.length,
      x: hx,
      y: hy,
      hp: 130,
      maxHp: 130,
      alive: true,
      pulse: rng.range(0, TAU),
      spawnTimer: 0,
      shake: 0,
    };
    hearts.push(heart);
    const heartCollider = { x: hx - 11, y: hy - 11, w: 22, h: 22, kind: 'heart' };
    heart.collider = heartCollider;
    colliders.push(heartCollider);
  }

  for (const heart of hearts) {
    for (let i = containers.length - 1; i >= 0; i--) {
      const c = containers[i];
      if (Math.hypot(c.x - heart.x, c.y - heart.y) > 34) continue;
      containers.splice(i, 1);
      const ci = colliders.findIndex((col) => Math.abs(col.x - (c.x - 6)) < 0.01 && Math.abs(col.y - (c.y - 5)) < 0.01 && col.kind === 'loot');
      if (ci >= 0) colliders.splice(ci, 1);
    }
  }

  function rescue(name, role, trait, color, x, y, look) {
    rescues.push({ id: 'rescue' + rescues.length, name, role, trait, color, x, y, recruited: false, look, bob: rng.range(0, 6.28) });
  }

  rescue('June Okafor', 'Nurse', '+1 meds each dawn', '#d9b28c', 111 * TILE, 64 * TILE, 'nurse');
  rescue('Ada Bell', 'Forager', '+2 food each dawn', '#c4a06a', 96 * TILE, 84 * TILE, 'forager');
  rescue('Rico Vale', 'Marksman', '+2 ammo each dawn', '#b9a58a', 49 * TILE, 20 * TILE, 'marksman');
  rescue('Sam Reyes', 'Scout', 'Faster on foot', '#a98f7b', 113 * TILE, 20 * TILE, 'scout');

  function addCar(tx, ty, color, facing) {
    const x = tx * TILE;
    const y = ty * TILE;
    const car = { x, y, w: facing === 'h' ? 38 : 22, h: facing === 'h' ? 22 : 38, color, facing };
    cars.push(car);
    colliders.push({ x: x + 2, y: y + 2, w: car.w - 4, h: car.h - 4, kind: 'car' });
    if (rng.chance(0.7)) {
      addLoot(x + (facing === 'h' ? car.w + 12 : 10), y + (facing === 'h' ? 10 : car.h + 12), rng.pick(['food', 'ammo', 'mats']), 'CAR TRUNK');
    }
  }

  addCar(8, 45, '#6d4a3a', 'h');
  addCar(40, 45, '#40524a', 'h');
  addCar(80, 86, '#5b5f72', 'h');
  addCar(61, 26, '#6d5c3a', 'v');
  addCar(62, 74, '#4a3b3b', 'v');

  const baseCampX = base.x;
  const baseCampY = base.y;
  addLoot(baseCampX - 42, baseCampY + 12, 'food', 'PACK');
  addLoot(baseCampX + 46, baseCampY + 6, 'ammo', 'PACK');

  for (const [x, y] of [
    [478, 1138],
    [542, 1118],
    [452, 1024],
    [570, 1038],
  ]) {
    barrels.push({ x, y, phase: rng.range(0, 6) });
  }
  barrels.push({ x: 1500, y: 860, phase: 1.2 });
  barrels.push({ x: 520, y: 420, phase: 2.2 });

  for (let i = 0; i < 150; i++) {
    const tx = rng.int(3, MAP_W - 4);
    const ty = rng.int(3, MAP_H - 4);
    const t = tileAt(tx, ty);
    if (t !== T.GRASS && t !== T.GRASS_DARK) continue;
    const px = tx * TILE + 8;
    const py = ty * TILE + 8;
    if (Math.hypot(px - base.x, py - base.y) < 190) continue;
    if (buildings.some((b) => px > b.px - 34 && px < b.px + b.pw + 34 && py > b.py - 34 && py < b.py + b.ph + 34)) continue;
    if (Math.hypot(px - 224, py - 168) < 140) continue;
    trees.push({
      x: px,
      y: py,
      r: rng.range(13, 20),
      tone: rng.chance(0.4) ? 1 : 0,
      lean: rng.range(-2, 2),
    });
    colliders.push({ x: px - 4, y: py - 2, w: 8, h: 10, kind: 'tree' });
  }

  for (let i = 0; i < 38; i++) {
    const tx = rng.int(2, MAP_W - 3);
    const ty = rng.int(2, MAP_H - 3);
    const t = tileAt(tx, ty);
    if (t !== T.GRASS && t !== T.GRASS_DARK) continue;
    const px = tx * TILE + 8;
    const py = ty * TILE + 8;
    if (Math.hypot(px - base.x, py - base.y) < 130) continue;
    rocks.push({ x: px, y: py, r: rng.range(4, 9), tone: rng.chance(0.5) ? 1 : 0 });
    colliders.push({ x: px - 5, y: py - 3, w: 10, h: 7, kind: 'rock' });
  }

  for (let i = 0; i < 12; i++) {
    const horizontal = i % 2 === 0;
    const x = horizontal ? rng.int(4, MAP_W - 4) * TILE : rng.pick(ROAD_COLS) * TILE - 12;
    const y = horizontal ? rng.pick(ROAD_ROWS) * TILE - 12 : rng.int(4, MAP_H - 4) * TILE;
    poles.push({ x, y, h: rng.range(26, 38) });
  }

  for (const b of buildings) {
    labels.push({ x: b.px + b.pw / 2, y: b.py - 10, text: b.name.toUpperCase(), building: b });
  }

  const spawns = [];
  for (let i = 0; i < 46; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const tx = rng.int(2, MAP_W - 3);
      const ty = rng.int(2, MAP_H - 3);
      if (isBlockedTile(tx, ty)) continue;
      const px = tx * TILE + 8;
      const py = ty * TILE + 8;
      if (Math.hypot(px - base.x, py - base.y) < 240) continue;
      spawns.push({ x: px, y: py });
      break;
    }
  }

  for (const heart of hearts) {
    for (let i = 0; i < 4; i++) {
      spawns.push({ x: heart.x + rng.range(-44, 44), y: heart.y + rng.range(-38, 38), guard: true });
    }
  }

  world.spawns = spawns;
  world.staticCanvas = bakeStatic(world, rng);
  world.worldToTile = (x, y) => ({ tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) });
  return world;
}

function bakeStatic(world, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const ctx = canvas.getContext('2d');
  const { tiles } = world;

  const grassLight = ['#35422c', '#3a472f', '#314027', '#37452d'];
  const grassDark = ['#2b3725', '#2e3a27', '#283321', '#303d29'];
  const roadCols = ['#35362f', '#32332d', '#383931', '#30312b'];
  const woodCols = ['#4c3c2b', '#51402e', '#473828'];
  const tileCols = ['#5b5a4c', '#575648', '#605f50'];
  const concreteCols = ['#555247', '#514e44', '#59564b'];
  const stoneCols = ['#57544a', '#5d5a50', '#514e45'];

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = tiles[ty * MAP_W + tx];
      const px = tx * TILE;
      const py = ty * TILE;
      const h = hash2(tx, ty, world.seed);
      let base;
      if (t === T.GRASS) base = grassLight[Math.floor(h * grassLight.length)];
      else if (t === T.GRASS_DARK) base = grassDark[Math.floor(h * grassDark.length)];
      else if (t === T.DIRT) base = h < 0.5 ? '#5c4c37' : '#554631';
      else if (t === T.ROAD) base = roadCols[Math.floor(h * roadCols.length)];
      else if (t === T.WOOD) base = woodCols[Math.floor(h * woodCols.length)];
      else if (t === T.TILEFLOOR) base = tileCols[Math.floor(h * tileCols.length)];
      else if (t === T.CONCRETE) base = concreteCols[Math.floor(h * concreteCols.length)];
      else if (t === T.STONE) base = stoneCols[Math.floor(h * stoneCols.length)];
      else if (t === T.WATER) base = h < 0.5 ? '#22383a' : '#203436';
      else base = '#26231d';

      ctx.fillStyle = base;
      ctx.fillRect(px, py, TILE, TILE);

      if (t === T.GRASS || t === T.GRASS_DARK) {
        const n = Math.floor(hash2(tx, ty, world.seed + 17) * 4) + 1;
        for (let i = 0; i < n; i++) {
          const gx = px + Math.floor(hash2(tx, ty + i * 3, world.seed + 31) * 14);
          const gy = py + Math.floor(hash2(tx + i, ty, world.seed + 47) * 14);
          ctx.fillStyle = i % 2 ? 'rgba(130,150,90,0.18)' : 'rgba(12,18,10,0.25)';
          ctx.fillRect(gx, gy, 2, 1);
        }
        if (h < 0.07) {
          ctx.fillStyle = '#707c46';
          ctx.fillRect(px + 5, py + 6, 1, 3);
          ctx.fillRect(px + 6, py + 5, 1, 1);
        }
      } else if (t === T.ROAD) {
        if (hash2(tx, ty, world.seed + 61) < 0.25) {
          ctx.fillStyle = 'rgba(10,10,9,0.35)';
          ctx.fillRect(px + 3, py + 4 + (h * 8) % 9, 6, 1);
        }
        if (hash2(tx, ty, world.seed + 71) < 0.2) {
          ctx.fillStyle = 'rgba(130,130,110,0.12)';
          ctx.fillRect(px + 2, py + 2, 2, 1);
        }
      } else if (t === T.WOOD) {
        ctx.fillStyle = 'rgba(30,22,14,0.35)';
        ctx.fillRect(px, py + 4, TILE, 1);
        ctx.fillRect(px, py + 10, TILE, 1);
        ctx.fillStyle = 'rgba(160,135,95,0.09)';
        ctx.fillRect(px + 2, py + 1, 8, 1);
      } else if (t === T.TILEFLOOR) {
        ctx.strokeStyle = 'rgba(25,28,22,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, 8, 8);
        ctx.strokeRect(px + 8.5, py + 8.5, 8, 8);
      } else if (t === T.STONE) {
        ctx.fillStyle = 'rgba(28,27,24,0.35)';
        ctx.fillRect(px, py + 7, TILE, 1);
        ctx.fillRect(px + ((tx * 7) % 12), py, 1, 7);
        ctx.fillRect(px + ((tx * 5 + 6) % 14), py + 8, 1, 8);
      } else if (t === T.WATER) {
        ctx.fillStyle = 'rgba(120,170,150,0.16)';
        ctx.fillRect(px + 2, py + 5, 7, 1);
        ctx.fillRect(px + 9, py + 11, 5, 1);
      } else if (t === T.WALL) {
        ctx.fillStyle = '#28231c';
        ctx.fillRect(px, py, TILE, TILE);
        const wallTop = ty === 0 || tiles[(ty - 1) * MAP_W + tx] !== T.WALL;
        if (wallTop) {
          ctx.fillStyle = '#544936';
          ctx.fillRect(px, py, TILE, 3);
          ctx.fillStyle = '#6b5c43';
          ctx.fillRect(px, py, TILE, 1);
        }
        ctx.fillStyle = 'rgba(10,8,6,0.5)';
        ctx.fillRect(px, py + TILE - 3, TILE, 3);
        if (hash2(tx, ty, world.seed + 91) < 0.22) {
          ctx.fillStyle = 'rgba(120,100,70,0.18)';
          ctx.fillRect(px + 4, py + 6, 3, 2);
        }
      }
    }
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(196,182,120,0.26)';
  ctx.lineWidth = 1;
  ctx.setLineDash([14, 18]);
  for (const row of [45.5, 86.5]) {
    const y = row * TILE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }
  for (const col of [62.5]) {
    const x = col * TILE;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(20,20,16,0.5)';
  ctx.lineWidth = 2;
  for (const row of [44, 85]) {
    ctx.beginPath();
    ctx.moveTo(0, row * TILE);
    ctx.lineTo(WORLD_W, row * TILE);
    ctx.stroke();
  }
  for (const col of [61, 65]) {
    ctx.beginPath();
    ctx.moveTo(col * TILE, 0);
    ctx.lineTo(col * TILE, WORLD_H);
    ctx.stroke();
  }
  ctx.restore();

  const bx = world.base.x;
  const by = world.base.y;
  for (let yy = -150; yy <= 150; yy += 4) {
    for (let xx = -150; xx <= 150; xx += 4) {
      const d = Math.hypot(xx, yy * 1.22);
      if (d > 142) continue;
      const h = hash2(Math.floor((bx + xx) / 4), Math.floor((by + yy) / 4), world.seed + 201);
      if (d > 104 && h < 0.34) continue;
      ctx.fillStyle = h < 0.5 ? 'rgba(88,72,51,0.42)' : 'rgba(76,61,43,0.42)';
      ctx.fillRect(bx + xx, by + yy, 4, 4);
    }
  }
  ctx.fillStyle = 'rgba(86,70,50,0.38)';
  ctx.fillRect(bx - 26, by - 60, 52, 60);

  for (const b of world.buildings) drawFurniture(ctx, b);

  for (const b of world.buildings) {
    const door = b.door;
    if (!door) continue;
    ctx.fillStyle = 'rgba(70,58,40,0.75)';
    if (door.side === 'south' || door.side === 'north') {
      ctx.fillRect(door.x - 16, door.y - 4, 32, 18);
    } else {
      ctx.fillRect(door.x - 4, door.y - 16, 18, 32);
    }
    ctx.fillStyle = 'rgba(30,24,16,0.55)';
    ctx.fillRect(door.x - 15, door.y - 2, 30, 4);
  }

  for (const car of world.cars) drawCar(ctx, car);

  for (const pole of world.poles) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(pole.x + 4, pole.y + 2, 4, 3);
    ctx.fillStyle = '#3b3025';
    ctx.fillRect(pole.x, pole.y - pole.h, 3, pole.h);
    ctx.fillStyle = '#4b3d2e';
    ctx.fillRect(pole.x - 5, pole.y - pole.h, 13, 2);
    ctx.fillStyle = '#2c241b';
    ctx.fillRect(pole.x - 5, pole.y - pole.h + 2, 1, 3);
    ctx.fillRect(pole.x + 7, pole.y - pole.h + 2, 1, 3);
  }

  for (const b of world.buildings) {
    if (b.id === 'basehouse') {
      ctx.fillStyle = 'rgba(45,55,32,0.55)';
      ctx.fillRect(b.px + 4, b.py + 4, b.pw - 8, 10);
      ctx.fillStyle = '#a9c46b';
      ctx.font = '700 6px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RANGER', b.px + b.pw / 2, b.py - 4);
    }
  }

  return canvas;
}

function drawRug(ctx, x, y, w, h, color = '#5b3f36', trim = '#8a6a4a') {
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = trim;
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
  ctx.fillRect(x + 2, y + 2, 1, h - 4);
  ctx.fillRect(x + w - 3, y + 2, 1, h - 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 7; i < w - 7; i += 9) ctx.fillRect(x + i, y + 6, 3, h - 12);
}

function drawBed(ctx, x, y, w = 30) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 2, y + 3, w, 14);
  ctx.fillStyle = '#3f3426';
  ctx.fillRect(x, y, w, 14);
  ctx.fillStyle = '#9a917d';
  ctx.fillRect(x + 2, y + 2, w - 4, 10);
  ctx.fillStyle = '#6f7b62';
  ctx.fillRect(x + 11, y + 2, w - 13, 10);
  ctx.fillStyle = '#d8d2c1';
  ctx.fillRect(x + 3, y + 3, 7, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 3, y + 3, 7, 2);
  ctx.fillStyle = '#2c241a';
  ctx.fillRect(x, y, 2, 14);
  ctx.fillRect(x + w - 2, y, 2, 14);
}

function drawShelf(ctx, x, y, w = 34) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 2, y + 3, w, 14);
  ctx.fillStyle = '#3a3024';
  ctx.fillRect(x, y, w, 14);
  ctx.fillStyle = '#4f4230';
  ctx.fillRect(x + 1, y + 1, w - 2, 3);
  ctx.fillRect(x + 1, y + 7, w - 2, 2);
  ctx.fillRect(x + 1, y + 11, w - 2, 2);
  const bits = ['#7d6a3a', '#8b8475', '#6c653d', '#6d5236', '#98a065'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = bits[i % bits.length];
    ctx.fillRect(x + 4 + i * 6, y + 4, 3, 3);
  }
}

function drawTable(ctx, x, y, w = 30, h = 14) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 2, y + 3, w, h);
  ctx.fillStyle = '#4a3a28';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#6a5336';
  ctx.fillRect(x + 1, y + 1, w - 2, 3);
  ctx.fillStyle = '#33291d';
  ctx.fillRect(x + 2, y + h - 2, 2, 3);
  ctx.fillRect(x + w - 4, y + h - 2, 2, 3);
}

function drawPew(ctx, x, y, w = 58) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + 2, y + 3, w, 9);
  ctx.fillStyle = '#4a3a28';
  ctx.fillRect(x, y, w, 9);
  ctx.fillStyle = '#6a5336';
  ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = '#33291d';
  ctx.fillRect(x + 2, y + 7, 2, 6);
  ctx.fillRect(x + w - 4, y + 7, 2, 6);
}

function drawHay(ctx, x, y, w = 20, h = 14) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + 2, y + 3, w, h);
  ctx.fillStyle = '#8a773f';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a8914f';
  ctx.fillRect(x + 1, y + 1, w - 2, 3);
  ctx.fillStyle = '#5f5229';
  ctx.fillRect(x + 3, y + 5, w - 6, 1);
  ctx.fillRect(x + 2, y + 9, w - 4, 1);
  ctx.fillStyle = '#4a3a28';
  ctx.fillRect(x + w / 2 - 1, y - 1, 2, h + 2);
}

function drawFurniture(ctx, b) {
  const ix = b.px + 20;
  const iy = b.py + 20;
  const iw = b.pw - 40;
  const ih = b.ph - 40;
  if (iw < 30 || ih < 30) return;

  if (b.id === 'market') {
    drawRug(ctx, ix + iw * 0.28, iy + ih * 0.52, 70, 34, '#4e3a34', '#7f5f47');
    drawShelf(ctx, ix + 8, iy, 44);
    drawShelf(ctx, ix + iw - 52, iy, 44);
    drawTable(ctx, ix + iw * 0.5 - 22, iy + ih - 24, 44, 12);
    ctx.fillStyle = '#7d6a3a';
    ctx.fillRect(ix + 6, iy + ih - 26, 16, 12);
    ctx.fillStyle = '#6aa04d';
    ctx.fillRect(ix + 8, iy + ih - 24, 4, 3);
    ctx.fillRect(ix + 13, iy + ih - 22, 4, 3);
  } else if (b.id === 'hardware') {
    drawTable(ctx, ix + iw * 0.5 - 34, iy, 68, 12);
    ctx.fillStyle = '#8f7b52';
    ctx.fillRect(ix + iw * 0.5 - 28, iy + 3, 14, 6);
    ctx.fillStyle = '#c1a45f';
    ctx.fillRect(ix + iw * 0.5 - 6, iy + 3, 6, 5);
    ctx.fillRect(ix + iw * 0.5 + 4, iy + 3, 6, 5);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#2e2b25';
      ctx.beginPath();
      ctx.ellipse(ix + 14 + i * 2, iy + ih - 16 - i * 5, 8, 3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#45413a';
      ctx.beginPath();
      ctx.ellipse(ix + 14 + i * 2, iy + ih - 18 - i * 5, 5, 2, 0, 0, TAU);
      ctx.fill();
    }
    drawRug(ctx, ix + iw - 70, iy + ih - 42, 52, 26, '#4a4038', '#6e5f4e');
  } else if (b.id === 'clinic') {
    drawRug(ctx, ix + 12, iy + ih - 42, iw - 24, 26, '#514c40', '#7d7460');
    drawBed(ctx, ix + 4, iy, 30);
    drawBed(ctx, ix + iw - 36, iy, 30);
    drawShelf(ctx, ix + iw * 0.5 - 17, iy, 34);
    drawTable(ctx, ix + 12, iy + 44, 28, 12);
    ctx.fillStyle = '#d9d3c2';
    ctx.fillRect(ix + 18, iy + 46, 3, 6);
    ctx.fillRect(ix + 16, iy + 48, 7, 2);
  } else if (b.id === 'cabins') {
    drawRug(ctx, ix + iw * 0.5 - 30, iy + ih * 0.55, 60, 30, '#5b3f36', '#8a6a4a');
    drawBed(ctx, ix + 4, iy, 28);
    drawBed(ctx, ix + iw - 34, iy + ih - 24, 30);
    ctx.fillStyle = '#3b3027';
    ctx.fillRect(ix + 2, iy + ih - 24, 26, 18);
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(ix + 6, iy + ih - 20, 18, 12);
    ctx.fillStyle = '#d07a45';
    ctx.fillRect(ix + 10, iy + ih - 16, 10, 6);
    ctx.fillStyle = '#f0b24a';
    ctx.fillRect(ix + 12, iy + ih - 14, 6, 4);
  } else if (b.id === 'church') {
    drawRug(ctx, ix + iw * 0.5 - 22, iy + ih - 36, 44, 26, '#5a2f34', '#8a5a4a');
    for (let row = 0; row < 4; row++) {
      const py = iy + 40 + row * 22;
      drawPew(ctx, ix + 4, py, 56);
      drawPew(ctx, ix + iw - 60, py, 56);
    }
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(ix + iw * 0.5 - 20, iy - 4, 40, 12);
    ctx.fillStyle = '#d8d2c1';
    ctx.fillRect(ix + iw * 0.5 - 1, iy - 8, 2, 16);
    ctx.fillRect(ix + iw * 0.5 - 6, iy - 3, 12, 2);
  } else if (b.id === 'farm') {
    drawRug(ctx, ix + iw * 0.5 - 34, iy + ih - 46, 68, 30, '#4a4034', '#74644c');
    drawHay(ctx, ix + 4, iy + 6, 22, 14);
    drawHay(ctx, ix + 30, iy + 2, 20, 12);
    drawHay(ctx, ix + iw - 30, iy + 6, 22, 14);
    drawHay(ctx, ix + 4, iy + ih - 44, 20, 12);
    drawTable(ctx, ix + iw * 0.5 - 26, iy + 26, 52, 14);
    ctx.fillStyle = '#cdb36d';
    ctx.fillRect(ix + iw * 0.5 - 18, iy + 28, 7, 4);
    ctx.fillStyle = '#6aa04d';
    ctx.fillRect(ix + iw * 0.5 - 4, iy + 28, 5, 4);
  } else if (b.id === 'basehouse') {
    drawRug(ctx, ix + iw * 0.5 - 32, iy + ih * 0.5 - 14, 64, 30, '#59413a', '#8a6a4a');
    drawBed(ctx, ix + 4, iy, 30);
    drawTable(ctx, ix + iw - 38, iy, 34, 13);
    drawShelf(ctx, ix + 2, iy + ih - 20, 34);
    ctx.fillStyle = '#3f3426';
    ctx.fillRect(ix + iw - 30, iy + ih - 26, 26, 20);
    ctx.fillStyle = '#59462e';
    ctx.fillRect(ix + iw - 30, iy + ih - 26, 26, 3);
  }
}

function drawCar(ctx, car) {
  const { x, y, w, h, color, facing } = car;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 3, y + 5, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(170,180,160,0.32)';
  if (facing === 'h') {
    ctx.fillRect(x + 8, y + 3, 8, h - 6);
    ctx.fillRect(x + w - 15, y + 3, 7, h - 6);
    ctx.fillStyle = 'rgba(20,22,20,0.55)';
    ctx.fillRect(x + 2, y + 4, 6, h - 8);
    ctx.fillRect(x + w - 8, y + 4, 6, h - 8);
    ctx.fillStyle = '#2a2a25';
    ctx.fillRect(x + 9, y - 1, 6, 2);
    ctx.fillRect(x + 9, y + h - 1, 6, 2);
    ctx.fillRect(x + w - 15, y - 1, 6, 2);
    ctx.fillRect(x + w - 15, y + h - 1, 6, 2);
  } else {
    ctx.fillRect(x + 3, y + 8, w - 6, 8);
    ctx.fillRect(x + 3, y + h - 15, w - 6, 7);
    ctx.fillStyle = 'rgba(20,22,20,0.55)';
    ctx.fillRect(x + 4, y + 2, w - 8, 6);
    ctx.fillRect(x + 4, y + h - 8, w - 8, 6);
    ctx.fillStyle = '#2a2a25';
    ctx.fillRect(x - 1, y + 9, 2, 6);
    ctx.fillRect(x + w - 1, y + 9, 2, 6);
    ctx.fillRect(x - 1, y + h - 15, 2, 6);
    ctx.fillRect(x + w - 1, y + h - 15, 2, 6);
  }
  ctx.fillStyle = 'rgba(90,40,25,0.45)';
  ctx.fillRect(x + 4, y + h - 4, 9, 2);
  ctx.restore();
}

export function collidesAt(world, x, y, r = 5) {
  for (const c of world.colliders) {
    if (x + r > c.x && x - r < c.x + c.w && y + r > c.y && y - r < c.y + c.h) return c;
  }
  return null;
}

export function moveCircle(world, e, dx, dy) {
  const r = e.r;
  if (dx) {
    e.x += dx;
    for (const c of world.colliders) {
      if (e.x + r > c.x && e.x - r < c.x + c.w && e.y + r > c.y && e.y - r < c.y + c.h) {
        if (dx > 0) e.x = c.x - r;
        else e.x = c.x + c.w + r;
      }
    }
  }
  if (dy) {
    e.y += dy;
    for (const c of world.colliders) {
      if (e.x + r > c.x && e.x - r < c.x + c.w && e.y + r > c.y && e.y - r < c.y + c.h) {
        if (dy > 0) e.y = c.y - r;
        else e.y = c.y + c.h + r;
      }
    }
  }
  e.x = clamp(e.x, r + 4, WORLD_W - r - 4);
  e.y = clamp(e.y, r + 4, WORLD_H - r - 4);
}

export function pointBlocked(world, x, y) {
  for (const c of world.colliders) {
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return true;
  }
  return false;
}

export function randomOpenPoint(world, rng, minDistFrom, minDist) {
  for (let i = 0; i < 80; i++) {
    const tx = rng.int(2, MAP_W - 3);
    const ty = rng.int(2, MAP_H - 3);
    if (world.isBlockedTile(tx, ty)) continue;
    const x = tx * TILE + 8;
    const y = ty * TILE + 8;
    if (collidesAt(world, x, y, 7)) continue;
    if (minDistFrom && Math.hypot(x - minDistFrom.x, y - minDistFrom.y) < minDist) continue;
    return { x, y };
  }
  return { x: 512, y: 1120 };
}
