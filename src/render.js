import { clamp, TAU, dist, hash2 } from './util.js';
import { VIEW_W, VIEW_H, nightAmount } from './config.js';
import { WORLD_W, WORLD_H, MAP_W, MAP_H, T } from './world.js';

function pixelBlob(ctx, cx, cy, r, color, seed) {
  const step = 3;
  ctx.fillStyle = color;
  for (let gy = -r; gy <= r; gy += step) {
    for (let gx = -r; gx <= r; gx += step) {
      if (gx * gx + gy * gy > r * r) continue;
      if (hash2(gx, gy, seed) < 0.18) continue;
      ctx.fillRect(Math.round(cx + gx), Math.round(cy + gy), step, step);
    }
  }
}

function drawShadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + 3, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function drawHuman(ctx, x, y, angle, opts) {
  const { jacket, skin, pants = '#2f2b22', kind = 'survivor', anim = 0, moving = false, night = false, hit = 0, aim = true } = opts;
  const facing = Math.cos(angle) >= 0 ? 1 : -1;
  const lookUp = Math.sin(angle) < -0.45;
  const step = moving ? Math.sin(anim) : 0;
  const bob = moving ? Math.abs(Math.sin(anim)) * 1.2 : Math.sin(anim * 0.25) * 0.4;
  const outline = kind === 'zombie' ? '#1b2118' : '#211c16';
  const bodyColor = hit > 0 ? '#e7d9c2' : jacket;
  const hair = kind === 'zombie' ? '#3f3c2c' : '#3b2a1e';

  drawShadow(ctx, x, y, 6, 3);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - bob));
  ctx.scale(facing, 1);

  const lx = Math.round(step * 1.6);

  // legs and boots
  ctx.fillStyle = outline;
  ctx.fillRect(-5 + lx, -8, 4, 8);
  ctx.fillRect(1 - lx, -8, 4, 8);
  ctx.fillStyle = pants;
  ctx.fillRect(-4 + lx, -7, 2, 5);
  ctx.fillRect(2 - lx, -7, 2, 5);
  ctx.fillStyle = '#191611';
  ctx.fillRect(-5 + lx, -2, 4, 2);
  ctx.fillRect(1 - lx, -2, 4, 2);

  // torso
  ctx.fillStyle = outline;
  ctx.fillRect(-5, -15, 10, 8);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-4, -14, 8, 6);
  ctx.fillStyle = kind === 'zombie' ? 'rgba(30,34,24,0.35)' : 'rgba(255,255,255,0.09)';
  ctx.fillRect(-4, -14, 8, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-4, -9, 8, 1);
  if (kind === 'survivor') {
    ctx.fillStyle = '#33291d';
    ctx.fillRect(-6, -14, 3, 6);
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(-6, -13, 2, 4);
  } else {
    ctx.fillStyle = '#5b2b2b';
    ctx.fillRect(-2, -12, 3, 2);
    ctx.fillRect(2, -10, 2, 1);
  }

  if (kind === 'zombie') {
    // outstretched reaching arms
    ctx.fillStyle = outline;
    ctx.fillRect(3, -14, 9, 3);
    ctx.fillRect(3, -10, 8, 3);
    ctx.fillStyle = skin;
    ctx.fillRect(4, -13, 8, 1);
    ctx.fillRect(4, -9, 7, 1);
    ctx.fillStyle = '#3d2a22';
    ctx.fillRect(11, -13, 2, 1);
    ctx.fillRect(10, -9, 2, 1);
  } else {
    // back arm and forward arm
    ctx.fillStyle = outline;
    ctx.fillRect(-5, -13, 3, 5);
    ctx.fillRect(3, -14, 5, 3);
    ctx.fillStyle = jacket;
    ctx.fillRect(-4, -12, 2, 3);
    ctx.fillRect(4, -13, 4, 2);
    ctx.fillStyle = skin;
    ctx.fillRect(7, -13, 2, 2);
    // pistol in forward hand
    ctx.fillStyle = '#24211d';
    ctx.fillRect(8, -13, 6, 2);
    ctx.fillStyle = '#67604b';
    ctx.fillRect(12, -13, 2, 1);
    ctx.fillStyle = '#8f8a74';
    ctx.fillRect(10, -12, 1, 1);
  }

  // head
  ctx.fillStyle = outline;
  ctx.fillRect(-4, -21, 8, 7);
  ctx.fillStyle = hit > 0 ? '#f0e6d2' : skin;
  ctx.fillRect(-3, -20, 6, 5);
  ctx.fillStyle = hair;
  ctx.fillRect(-3, -20, 6, 2);
  if (lookUp) {
    ctx.fillRect(-3, -20, 6, 4);
  } else {
    ctx.fillStyle = kind === 'zombie' ? (night ? '#d94c4c' : '#7a2f2a') : '#2b2118';
    ctx.fillRect(1, -18, 1, 1);
    if (kind === 'zombie') {
      ctx.fillStyle = '#5b2b2b';
      ctx.fillRect(0, -16, 3, 1);
    }
  }
  ctx.restore();

  // thin aim cue for the living
  if (kind === 'survivor' && aim) {
    const ax = x + Math.cos(angle) * 13;
    const ay = y - 12 - bob + Math.sin(angle) * 4;
    ctx.strokeStyle = 'rgba(240,236,217,0.16)';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(angle) * 10, ay + Math.sin(angle) * 7);
    ctx.stroke();
  }
}

function drawZombie(ctx, x, y, z, time) {
  const opts = {
    jacket: z.type === 'feral' ? '#6b3b36' : z.type === 'runner' ? '#55513f' : '#4a5040',
    skin: z.type === 'feral' ? '#9c8b6b' : '#7d8a63',
    pants: '#33352b',
    anim: z.anim,
    moving: true,
    kind: 'zombie',
    hit: z.hitFlash,
    night: time > 0 && nightAmount(((time / 240) * 24 + 8) % 24) > 0.3,
  };
  drawHuman(ctx, x, y, z.angle + Math.sin(z.anim * 2) * 0.05, opts);
  if (z.hp < z.maxHp) {
    const w = 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w / 2, y - 25, w, 2);
    ctx.fillStyle = '#b84949';
    ctx.fillRect(x - w / 2, y - 25, (w * clamp(z.hp / z.maxHp, 0, 1)) | 0, 2);
  }
  if (z.guard && z.type === 'feral') {
    ctx.fillStyle = 'rgba(217,76,76,0.18)';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, TAU);
    ctx.fill();
  }
}

function drawPlayer(ctx, game, x, y) {
  const p = game.player;
  const s = game.active;
  drawHuman(ctx, x, y, p.angle, {
    jacket: s.color,
    skin: s.skin,
    pants: '#2d2a22',
    anim: p.anim,
    moving: p.moving,
    kind: 'survivor',
    hit: 0,
    night: false,
  });
  if (p.invuln > 0) {
    ctx.strokeStyle = `rgba(169,196,107,${0.15 + Math.sin(game.time * 18) * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, TAU);
    ctx.stroke();
  }
  const bob = Math.sin(game.time * 4) * 1.3;
  ctx.fillStyle = '#a9c46b';
  ctx.beginPath();
  ctx.moveTo(x, y - 26 + bob);
  ctx.lineTo(x - 3, y - 30 + bob);
  ctx.lineTo(x + 3, y - 30 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(10,14,8,0.8)';
  ctx.fillRect(x - 1, y - 28 + bob, 2, 1);
}

function drawRescue(ctx, x, y, r, time) {
  const bob = Math.sin(time * 2 + r.bob) * 1.2;
  drawHuman(ctx, x, y, Math.PI * 0.5, {
    jacket: r.color,
    skin: r.skin || '#bd9068',
    pants: '#343027',
    anim: time * 0.8 + r.bob,
    moving: false,
    kind: 'survivor',
    aim: false,
  });
  const pulse = 0.55 + Math.sin(time * 4 + r.bob) * 0.3;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#8fc4b0';
  ctx.fillRect(x - 1, y - 28 + bob, 2, 6);
  ctx.fillRect(x - 1, y - 20 + bob, 2, 2);
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTree(ctx, x, y, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 4, t.r * 0.8, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3c3023';
  ctx.fillRect(x - 2, y - 7, 4, 11);
  ctx.fillStyle = '#54442e';
  ctx.fillRect(x - 1, y - 7, 1, 9);
  const baseY = y - t.r * 0.55;
  const color = t.tone ? '#3d5530' : '#445d34';
  const light = t.tone ? '#5a7440' : '#617b44';
  const dark = t.tone ? '#2b3d23' : '#304227';
  pixelBlob(ctx, x + t.lean, baseY, t.r, color, 0);
  pixelBlob(ctx, x + t.lean - t.r * 0.25, baseY - t.r * 0.2, t.r * 0.62, light, 1);
  ctx.globalAlpha = 0.5;
  pixelBlob(ctx, x + t.lean + t.r * 0.3, baseY + t.r * 0.28, t.r * 0.48, dark, 2);
  ctx.globalAlpha = 1;
}

function drawRock(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 3, r, r * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = r.tone ? '#5d5b50' : '#56544a';
  ctx.fillRect(x - r, y - r * 0.55, r * 2, r);
  ctx.fillStyle = r.tone ? '#767462' : '#6b695b';
  ctx.fillRect(x - r * 0.6, y - r * 0.7, r * 1.2, r * 0.45);
  ctx.fillStyle = '#3f3d35';
  ctx.fillRect(x - r * 0.8, y + r * 0.2, r * 1.6, r * 0.4);
}

function drawBarrel(ctx, x, y, b, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 7, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4e3b28';
  ctx.fillRect(x - 5, y - 8, 10, 12);
  ctx.fillStyle = '#6a4f33';
  ctx.fillRect(x - 5, y - 8, 10, 2);
  ctx.fillStyle = '#322519';
  ctx.fillRect(x - 5, y - 3, 10, 1);
  const f = Math.sin((time + b.phase) * 10) * 1.5;
  ctx.fillStyle = '#d8542a';
  ctx.fillRect(x - 3, y - 13 + f, 6, 6);
  ctx.fillStyle = '#f0b24a';
  ctx.fillRect(x - 1, y - 15 - f * 0.4, 2, 5);
}

function drawLoot(ctx, x, y, c, time) {
  const bob = c.looted ? 0 : Math.sin(time * 3 + c.sway) * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 4, 8, 3, 0, 0, TAU);
  ctx.fill();
  if (c.looted) {
    ctx.fillStyle = '#3a2e20';
    ctx.fillRect(x - 7, y - 4, 14, 8);
    ctx.fillStyle = '#4c3b28';
    ctx.fillRect(x - 8, y - 8, 7, 4);
    ctx.fillStyle = '#241b12';
    ctx.fillRect(x - 5, y - 2, 10, 4);
    return;
  }
  const colors = { food: '#7d6a3a', meds: '#8b8475', ammo: '#6c653d', mats: '#6d5236' };
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(x - 7, y - 5 + bob, 14, 9);
  ctx.fillStyle = colors[c.type] || '#6d5236';
  ctx.fillRect(x - 6, y - 5 + bob, 12, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x - 6, y - 5 + bob, 12, 1);
  ctx.fillStyle = '#3d2f20';
  ctx.fillRect(x - 2, y - 6 + bob, 4, 10);
  if (c.type === 'meds') {
    ctx.fillStyle = '#d9d3c2';
    ctx.fillRect(x - 1, y - 4 + bob, 2, 5);
    ctx.fillRect(x - 2.5, y - 2.5 + bob, 5, 2);
  } else if (c.type === 'ammo') {
    ctx.fillStyle = '#cdb36d';
    ctx.fillRect(x - 3, y - 3 + bob, 1, 4);
    ctx.fillRect(x, y - 3 + bob, 1, 4);
    ctx.fillRect(x + 3, y - 3 + bob, 1, 4);
  } else if (c.type === 'food') {
    ctx.fillStyle = '#cdb36d';
    ctx.fillRect(x - 3, y - 3 + bob, 6, 4);
    ctx.fillStyle = '#4c5a2c';
    ctx.fillRect(x - 2, y - 2 + bob, 4, 1);
  } else {
    ctx.fillStyle = '#cdb36d';
    ctx.fillRect(x - 3, y - 3 + bob, 6, 4);
    ctx.fillStyle = '#3d2f20';
    ctx.fillRect(x - 1, y - 3 + bob, 1, 4);
  }
  const glint = Math.sin(time * 4 + c.sway) * 0.5 + 0.5;
  ctx.globalAlpha = glint * 0.7;
  ctx.fillStyle = '#f2e2a4';
  ctx.fillRect(x + 2, y - 8 + bob, 1, 3);
  ctx.fillRect(x + 1, y - 7 + bob, 3, 1);
  ctx.globalAlpha = 1;
}

function drawHeart(ctx, x, y, h, time) {
  const pulse = 1 + Math.sin(h.pulse * 2.2) * 0.09;
  const shakeX = h.shake > 0 ? Math.sin(time * 40) * h.shake * 0.4 : 0;
  ctx.save();
  ctx.translate(x + shakeX, y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 16, 5, 0, 0, TAU);
  ctx.fill();

  const r = 16 * pulse;
  const g = ctx.createRadialGradient(0, -2, 2, 0, -2, r * 1.7);
  g.addColorStop(0, 'rgba(160,32,48,0.25)');
  g.addColorStop(1, 'rgba(160,32,48,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);

  ctx.fillStyle = '#3a1016';
  ctx.beginPath();
  ctx.ellipse(0, 0, r + 2, r * 0.92 + 2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#8a2433';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#b8394a';
  ctx.beginPath();
  ctx.ellipse(-2, -3, r * 0.68, r * 0.58, -0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d4666b';
  ctx.beginPath();
  ctx.ellipse(-5, -6, r * 0.3, r * 0.24, -0.3, 0, TAU);
  ctx.fill();

  // veins
  ctx.strokeStyle = 'rgba(58,16,22,0.85)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.sin(time + i) * 0.1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
    ctx.quadraticCurveTo(
      Math.cos(a + 0.4) * r * 0.7,
      Math.sin(a + 0.4) * r * 0.7,
      Math.cos(a) * r * 1.05,
      Math.sin(a) * r * 0.95,
    );
    ctx.stroke();
  }

  // tendrils
  ctx.strokeStyle = '#631722';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.sin(time * 0.8 + i) * 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.7);
    ctx.lineTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 6));
    ctx.stroke();
  }

  ctx.restore();

  if (h.hp < h.maxHp) {
    const w = 30;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - w / 2, y - 32, w, 3);
    ctx.fillStyle = '#c14b4b';
    ctx.fillRect(x - w / 2, y - 32, (w * clamp(h.hp / h.maxHp, 0, 1)) | 0, 3);
  }
}

function renderBaseDecor(game, ctx, tsx, tsy, sx, sy) {
  const base = game.world.base;
  if (base.x < sx - 240 || base.x > sx + VIEW_W + 240 || base.y < sy - 240 || base.y > sy + VIEW_H + 240) return;
  const x = tsx(base.x);
  const y = tsy(base.y);
  const t = game.menuTime + game.time;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 14, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2f2a21';
  ctx.fillRect(x - 10, y - 2, 20, 5);
  ctx.fillStyle = '#4a3a28';
  ctx.fillRect(x - 12, y + 2, 5, 4);
  ctx.fillRect(x + 7, y + 2, 5, 4);
  const flick = Math.sin(t * 9) * 2 + Math.sin(t * 23) * 1;
  ctx.fillStyle = '#d8542a';
  ctx.fillRect(x - 5, y - 12 + flick, 10, 12);
  ctx.fillStyle = '#e89d3d';
  ctx.fillRect(x - 3, y - 16 - flick, 6, 12);
  ctx.fillStyle = '#f4d06c';
  ctx.fillRect(x - 1, y - 13 + flick * 0.5, 2, 7);

  // default camp: log seats, bedrolls, tarp lean-to and radio table
  for (const seat of [
    { sx: x - 24, sy: y + 12 },
    { sx: x + 18, sy: y - 16 },
  ]) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(seat.sx, seat.sy + 3, 9, 3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(seat.sx - 9, seat.sy - 3, 18, 6);
    ctx.fillStyle = '#6a5336';
    ctx.fillRect(seat.sx - 9, seat.sy - 3, 18, 2);
    ctx.fillStyle = '#2f2518';
    ctx.fillRect(seat.sx + 6, seat.sy - 2, 3, 4);
  }

  for (let i = 0; i < 2; i++) {
    const bx = x - 130 + i * 21;
    const by = y + 36;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(bx, by + 7, 19, 3);
    ctx.fillStyle = '#3c4a38';
    ctx.fillRect(bx, by, 19, 8);
    ctx.fillStyle = '#55684d';
    ctx.fillRect(bx + 1, by + 1, 17, 3);
    ctx.fillStyle = '#c9c2a4';
    ctx.fillRect(bx + 2, by, 5, 3);
    ctx.fillStyle = '#33291d';
    ctx.fillRect(bx - 1, by - 1, 2, 10);
  }

  const sx2 = x + 76;
  const sy2 = y + 50;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(sx2, sy2 + 2, 26, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3b3227';
  ctx.fillRect(sx2 - 1, sy2 - 36, 2, 38);
  ctx.fillStyle = '#4f5c43';
  ctx.beginPath();
  ctx.moveTo(sx2 - 26, sy2);
  ctx.lineTo(sx2, sy2 - 36);
  ctx.lineTo(sx2 + 26, sy2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3c4635';
  ctx.beginPath();
  ctx.moveTo(sx2 - 26, sy2);
  ctx.lineTo(sx2, sy2 - 36);
  ctx.lineTo(sx2, sy2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(sx2 - 20, sy2 - 4);
  ctx.lineTo(sx2, sy2 - 32);
  ctx.lineTo(sx2 + 4, sy2 - 28);
  ctx.lineTo(sx2 - 14, sy2 - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#232a20';
  ctx.beginPath();
  ctx.moveTo(sx2 - 8, sy2);
  ctx.lineTo(sx2, sy2 - 22);
  ctx.lineTo(sx2 + 8, sy2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6c6350';
  ctx.fillRect(sx2 - 22, sy2 - 1, 44, 3);

  const rx = x + 44;
  const ry = y - 32;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(rx - 2, ry + 10, 24, 4);
  ctx.fillStyle = '#3f3426';
  ctx.fillRect(rx, ry + 2, 20, 10);
  ctx.fillStyle = '#59462e';
  ctx.fillRect(rx, ry + 2, 20, 3);
  ctx.fillStyle = '#23201a';
  ctx.fillRect(rx + 4, ry - 4, 3, 7);
  ctx.fillStyle = '#8a744d';
  ctx.fillRect(rx + 5, ry - 6, 1, 2);
  ctx.fillStyle = '#a9c46b';
  ctx.fillRect(rx + 12, ry - 1, 4, 4);

  if (game.upgrades.infirmary > 0) {
    const tx = x - 104;
    const ty = y - 42;
    ctx.fillStyle = '#3c4a39';
    ctx.fillRect(tx, ty, 46, 26);
    ctx.fillStyle = '#52614b';
    ctx.beginPath();
    ctx.moveTo(tx - 4, ty + 26);
    ctx.lineTo(tx + 23, ty - 8);
    ctx.lineTo(tx + 50, ty + 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2b3529';
    ctx.fillRect(tx + 17, ty + 8, 12, 18);
    ctx.fillStyle = '#b8c777';
    ctx.fillRect(tx + 21, ty + 11, 4, 8);
    ctx.fillRect(tx + 19, ty + 13, 8, 4);
  }
  if (game.upgrades.garden > 0) {
    const gx = x + 70;
    const gy = y - 24;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#3f3323';
      ctx.fillRect(gx + i * 18, gy, 15, 22);
      ctx.fillStyle = '#5d7436';
      ctx.fillRect(gx + i * 18 + 3, gy + 4, 9, 3);
      ctx.fillRect(gx + i * 18 + 3, gy + 11, 9, 3);
      ctx.fillStyle = '#86a04d';
      ctx.fillRect(gx + i * 18 + 5, gy + 2, 2, 3);
      ctx.fillRect(gx + i * 18 + 9, gy + 9, 2, 3);
    }
  }
  if (game.upgrades.workshop > 0) {
    ctx.fillStyle = '#4a4032';
    ctx.fillRect(x - 82, y + 30, 44, 18);
    ctx.fillStyle = '#2c2721';
    ctx.fillRect(x - 80, y + 33, 40, 12);
    ctx.fillStyle = '#8f7b52';
    ctx.fillRect(x - 74, y + 36, 12, 6);
    ctx.fillStyle = '#c1a45f';
    ctx.fillRect(x - 58, y + 36, 5, 5);
    ctx.fillRect(x - 50, y + 36, 5, 5);
  }
  if (game.upgrades.watchtower > 0) {
    const tx = x + 144;
    const ty = y + 6;
    ctx.fillStyle = '#3b3227';
    ctx.fillRect(tx - 14, ty - 58, 3, 62);
    ctx.fillRect(tx + 12, ty - 58, 3, 62);
    ctx.fillStyle = '#4b4031';
    ctx.fillRect(tx - 18, ty - 60, 38, 7);
    ctx.fillStyle = '#2b241c';
    ctx.fillRect(tx - 12, ty - 52, 24, 4);
    ctx.fillStyle = '#8a744d';
    for (let i = 0; i < 5; i++) ctx.fillRect(tx - 10 + i * 5, ty - 40 + i * 6, 20, 2);
    if (game.upgrades.watchtower > 1) {
      ctx.fillStyle = '#a9c46b';
      ctx.fillRect(tx - 1, ty - 66, 2, 8);
    }
  }
  if (game.upgrades.bunks > 0) {
    for (let i = 0; i < game.upgrades.bunks; i++) {
      ctx.fillStyle = '#4b4434';
      ctx.fillRect(x - 150 + i * 22, y + 18, 18, 9);
      ctx.fillStyle = '#6c6350';
      ctx.fillRect(x - 149 + i * 22, y + 16, 16, 4);
    }
  }

  ctx.fillStyle = '#5b452d';
  ctx.fillRect(x + 28, y + 10, 14, 10);
  ctx.fillStyle = '#75593a';
  ctx.fillRect(x + 28, y + 10, 14, 3);
  ctx.fillStyle = '#3d2f20';
  ctx.fillRect(x + 32, y + 14, 6, 2);

  ctx.fillStyle = '#403728';
  ctx.fillRect(x - 52, y - 4, 2, 10);
  ctx.fillRect(x + 50, y - 4, 2, 10);
  ctx.fillStyle = '#a9c46b';
  ctx.fillRect(x - 53, y - 6, 4, 3);
  ctx.fillRect(x + 49, y - 6, 4, 3);
}

function renderLighting(game, night, tsx, tsy) {
  const lc = game.lctx;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, VIEW_W, VIEW_H);
  lc.globalCompositeOperation = 'source-over';
  lc.fillStyle = `rgba(7,10,24,${0.78 * night})`;
  lc.fillRect(0, 0, VIEW_W, VIEW_H);

  lc.globalCompositeOperation = 'destination-out';
  const addLight = (x, y, radius, strength) => {
    const g = lc.createRadialGradient(x, y, radius * 0.15, x, y, radius);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = g;
    lc.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  const flick = 0.92 + Math.sin(game.time * 13) * 0.05 + Math.sin(game.time * 31) * 0.03;
  addLight(tsx(game.player.x), tsy(game.player.y), 118 * flick, 0.93);
  addLight(tsx(game.world.base.x), tsy(game.world.base.y), 128 * flick, 0.95);
  for (const b of game.world.barrels) {
    const bx = tsx(b.x);
    const by = tsy(b.y);
    if (bx < -80 || by < -80 || bx > VIEW_W + 80 || by > VIEW_H + 80) continue;
    addLight(bx, by, 72, 0.8);
  }
  for (const h of game.heartList) {
    if (!h.alive) continue;
    const hx = tsx(h.x);
    const hy = tsy(h.y);
    if (hx < -80 || hy < -80 || hx > VIEW_W + 80 || hy > VIEW_H + 80) continue;
    addLight(hx, hy, 64, 0.55);
  }
  lc.globalCompositeOperation = 'source-over';
  game.ctx.drawImage(game.lightCanvas, 0, 0);

  game.ctx.globalCompositeOperation = 'lighter';
  for (const h of game.heartList) {
    if (!h.alive) continue;
    const hx = tsx(h.x);
    const hy = tsy(h.y);
    if (hx < -60 || hy < -60 || hx > VIEW_W + 60 || hy > VIEW_H + 60) continue;
    const g = game.ctx.createRadialGradient(hx, hy, 2, hx, hy, 44);
    g.addColorStop(0, 'rgba(180,40,55,0.30)');
    g.addColorStop(1, 'rgba(180,40,55,0)');
    game.ctx.fillStyle = g;
    game.ctx.fillRect(hx - 44, hy - 44, 88, 88);
  }
  for (const b of game.world.barrels) {
    const bx = tsx(b.x);
    const by = tsy(b.y);
    if (bx < -40 || by < -40 || bx > VIEW_W + 40 || by > VIEW_H + 40) continue;
    const g = game.ctx.createRadialGradient(bx, by - 8, 1, bx, by - 8, 24);
    g.addColorStop(0, 'rgba(230,140,60,0.26)');
    g.addColorStop(1, 'rgba(230,140,60,0)');
    game.ctx.fillStyle = g;
    game.ctx.fillRect(bx - 24, by - 32, 48, 48);
  }
  const bx = tsx(game.world.base.x);
  const by = tsy(game.world.base.y);
  const bg = game.ctx.createRadialGradient(bx, by, 4, bx, by, 52);
  bg.addColorStop(0, 'rgba(240,150,70,0.22)');
  bg.addColorStop(1, 'rgba(240,150,70,0)');
  game.ctx.fillStyle = bg;
  game.ctx.fillRect(bx - 52, by - 52, 104, 104);
  game.ctx.globalCompositeOperation = 'source-over';
}

export function renderGame(game, dt) {
  const ctx = game.ctx;
  const menu = game.state === 'menu';
  const shake = game.shake > 0.05 && !menu && game.state === 'playing' ? game.shake : 0;
  const ox = shake ? (Math.random() * 2 - 1) * shake : 0;
  const oy = shake ? (Math.random() * 2 - 1) * shake : 0;
  const sx = Math.floor(clamp(game.cam.x + ox, 0, WORLD_W - VIEW_W));
  const sy = Math.floor(clamp(game.cam.y + oy, 0, WORLD_H - VIEW_H));
  const toScreenX = (x) => Math.round(x - sx);
  const toScreenY = (y) => Math.round(y - sy);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#11160e';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.drawImage(game.world.staticCanvas, sx, sy, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

  const base = game.world.base;
  ctx.save();
  ctx.strokeStyle = 'rgba(169,196,107,0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(toScreenX(base.x), toScreenY(base.y), base.radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  for (const d of game.decals) {
    if (d.x < sx - 10 || d.x > sx + VIEW_W + 10 || d.y < sy - 10 || d.y > sy + VIEW_H + 10) continue;
    ctx.fillStyle = `rgba(96,26,30,${d.a})`;
    ctx.beginPath();
    ctx.arc(toScreenX(d.x), toScreenY(d.y), d.r, 0, TAU);
    ctx.fill();
  }
  for (const c of game.corpses) {
    if (c.x < sx - 20 || c.x > sx + VIEW_W + 20 || c.y < sy - 20 || c.y > sy + VIEW_H + 20) continue;
    ctx.save();
    ctx.globalAlpha = clamp(c.t / 4, 0, 1);
    ctx.translate(toScreenX(c.x), toScreenY(c.y));
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(45,48,36,0.9)';
    ctx.fillRect(-6, -3, 12, 6);
    ctx.fillStyle = 'rgba(82,95,68,0.8)';
    ctx.fillRect(-2, -4, 6, 8);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  const items = [];
  const inView = (x, y) => x > sx - 48 && x < sx + VIEW_W + 48 && y > sy - 64 && y < sy + VIEW_H + 64;

  for (const t of game.world.trees) if (inView(t.x, t.y)) items.push({ y: t.y, kind: 'tree', o: t });
  for (const r of game.world.rocks) if (inView(r.x, r.y)) items.push({ y: r.y, kind: 'rock', o: r });
  for (const c of game.containers) if (inView(c.x, c.y)) items.push({ y: c.y, kind: 'loot', o: c });
  for (const h of game.heartList) if (h.alive && inView(h.x, h.y)) items.push({ y: h.y, kind: 'heart', o: h });
  for (const r of game.rescues) if (!r.recruited && inView(r.x, r.y)) items.push({ y: r.y, kind: 'rescue', o: r });
  for (const b of game.world.barrels) if (inView(b.x, b.y)) items.push({ y: b.y, kind: 'barrel', o: b });
  for (const z of game.zombies) if (inView(z.x, z.y)) items.push({ y: z.y, kind: 'zombie', o: z });
  items.push({ y: game.player.y, kind: 'player', o: game.player });
  items.sort((a, b) => a.y - b.y);

  renderBaseDecor(game, ctx, toScreenX, toScreenY, sx, sy);

  for (const it of items) {
    const x = toScreenX(it.o.x);
    const y = toScreenY(it.o.y);
    if (it.kind === 'tree') drawTree(ctx, x, y, it.o);
    else if (it.kind === 'rock') drawRock(ctx, x, y, it.o);
    else if (it.kind === 'loot') drawLoot(ctx, x, y, it.o, game.time);
    else if (it.kind === 'heart') drawHeart(ctx, x, y, it.o, game.time);
    else if (it.kind === 'rescue') drawRescue(ctx, x, y, it.o, game.time);
    else if (it.kind === 'barrel') drawBarrel(ctx, x, y, it.o, game.time);
    else if (it.kind === 'zombie') drawZombie(ctx, x, y, it.o, game.time);
    else if (it.kind === 'player') drawPlayer(ctx, game, x, y);
  }

  ctx.lineWidth = 1;
  for (const b of game.bullets) {
    ctx.strokeStyle = 'rgba(240,218,150,0.7)';
    ctx.beginPath();
    ctx.moveTo(toScreenX(b.px), toScreenY(b.py));
    ctx.lineTo(toScreenX(b.x), toScreenY(b.y));
    ctx.stroke();
    ctx.fillStyle = '#f0da96';
    ctx.fillRect(toScreenX(b.x), toScreenY(b.y), 1, 1);
  }

  for (const p of game.particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(toScreenX(p.x), toScreenY(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;

  for (const e of game.effects) {
    const k = e.t / e.life;
    if (e.kind === 'slash') {
      ctx.save();
      ctx.translate(toScreenX(e.x), toScreenY(e.y));
      ctx.rotate(e.angle);
      ctx.strokeStyle = `rgba(240,235,210,${0.85 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22, -0.9 + k * 0.7, 0.9 + k * 0.4);
      ctx.stroke();
      ctx.restore();
    } else if (e.kind === 'muzzle') {
      ctx.save();
      ctx.translate(toScreenX(e.x), toScreenY(e.y));
      ctx.rotate(e.angle);
      ctx.fillStyle = `rgba(255,220,130,${1 - k})`;
      ctx.fillRect(0, -2, 9, 4);
      ctx.fillStyle = `rgba(255,245,200,${1 - k})`;
      ctx.fillRect(0, -1, 4, 2);
      ctx.restore();
    } else if (e.kind === 'ring') {
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.arc(toScreenX(e.x), toScreenY(e.y), 6 + k * 26, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.textAlign = 'center';
  for (const f of game.floaters) {
    ctx.globalAlpha = 1 - f.t / f.life;
    ctx.font = '700 7px "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(f.text, toScreenX(f.x) + 1, toScreenY(f.y) + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, toScreenX(f.x), toScreenY(f.y));
    ctx.globalAlpha = 1;
  }

  if (game.state === 'playing') {
    const it = game.channel ? { kind: 'loot', obj: game.channel.obj } : game.getInteractable();
    if (it) {
      const o = it.obj;
      const k = 1 + Math.sin(game.time * 6) * 0.15;
      ctx.strokeStyle =
        it.kind === 'heart' ? 'rgba(224,113,62,0.9)' : it.kind === 'rescue' ? 'rgba(143,196,176,0.9)' : 'rgba(205,179,109,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(toScreenX(o.x), toScreenY(o.y), 14 * k, 0, TAU);
      ctx.stroke();
      if (game.channel && game.channel.obj === o) {
        const pct = clamp(game.channel.t / game.channel.dur, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(toScreenX(o.x) - 16, toScreenY(o.y) - 26, 32, 4);
        ctx.fillStyle = '#cdb36d';
        ctx.fillRect(toScreenX(o.x) - 16, toScreenY(o.y) - 26, 32 * pct, 4);
      }
    }
  }

  const night = menu ? 0.52 : nightAmount(game.hour);
  if (night > 0.015) renderLighting(game, night, toScreenX, toScreenY);

  for (const a of game.ambient) {
    const k = clamp(a.life / a.maxLife, 0, 1);
    if (a.kind === 'firefly') {
      const tw = 0.5 + Math.sin(game.time * 4 + a.phase) * 0.5;
      ctx.globalAlpha = k * tw * 0.9;
      ctx.fillStyle = '#d8d47a';
      ctx.fillRect(toScreenX(a.x), toScreenY(a.y), 1.5, 1.5);
      ctx.globalAlpha = k * tw * 0.15;
      ctx.fillRect(toScreenX(a.x) - 1, toScreenY(a.y) - 1, 3.5, 3.5);
    } else {
      ctx.globalAlpha = k * 0.28;
      ctx.fillStyle = '#c8c3a6';
      ctx.fillRect(toScreenX(a.x), toScreenY(a.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  for (const b of game.world.buildings) {
    const d = dist(game.player.x, game.player.y, b.px + b.pw / 2, b.py + b.ph / 2);
    if (d > 280) continue;
    const alpha = clamp(1 - (d - 150) / 130, 0.2, 1);
    ctx.globalAlpha = alpha * 0.85;
    ctx.font = '700 6px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(b.name.toUpperCase(), toScreenX(b.px + b.pw / 2) + 1, toScreenY(b.py - 9) + 1);
    ctx.fillStyle = b.type === 'base' ? '#a9c46b' : '#c9c2a4';
    ctx.fillText(b.name.toUpperCase(), toScreenX(b.px + b.pw / 2), toScreenY(b.py - 9));
    ctx.globalAlpha = 1;
  }

  if (game.state === 'playing' && game.mouse.inside) {
    const mx = game.mouse.sx;
    const my = game.mouse.sy;
    ctx.strokeStyle = 'rgba(240,236,217,0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx - 5, my);
    ctx.lineTo(mx - 2, my);
    ctx.moveTo(mx + 2, my);
    ctx.lineTo(mx + 5, my);
    ctx.moveTo(mx, my - 5);
    ctx.lineTo(mx, my - 2);
    ctx.moveTo(mx, my + 2);
    ctx.lineTo(mx, my + 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,236,217,0.55)';
    ctx.fillRect(mx - 0.5, my - 0.5, 1, 1);
  }

  if (menu) {
    ctx.fillStyle = 'rgba(5,7,4,0.36)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  } else if (game.state === 'base') {
    ctx.fillStyle = 'rgba(5,7,4,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  } else if (game.state === 'paused') {
    ctx.fillStyle = 'rgba(5,7,4,0.35)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

export function bakeMinimapBase(game) {
  if (!game.minimapBase) {
    game.minimapBase = document.createElement('canvas');
    game.minimapBase.width = MAP_W;
    game.minimapBase.height = MAP_H;
  }
  const c = game.minimapBase;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, MAP_W, MAP_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = game.world.tiles[y * MAP_W + x];
      let col = '#20281d';
      if (t === T.ROAD) col = '#3a3b34';
      else if (t === T.WATER) col = '#213b3d';
      else if (t === T.WALL) col = '#6a5c42';
      else if (t === T.WOOD || t === T.TILEFLOOR || t === T.CONCRETE || t === T.STONE) col = '#4d4637';
      else if (t === T.DIRT) col = '#3f3829';
      else if (t === T.GRASS_DARK) col = '#283221';
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (const b of game.world.buildings) {
    ctx.strokeStyle = 'rgba(200,185,140,0.28)';
    ctx.strokeRect(b.x, b.y, b.w - 1, b.h - 1);
  }
}

export function drawMinimap(game) {
  if (game.state === 'menu') return;
  const ctx = game.mctx;
  const w = game.minimap.width;
  const h = game.minimap.height;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  if (game.minimapBase) ctx.drawImage(game.minimapBase, 0, 0, w, h);
  const mx = w / WORLD_W;
  const my = h / WORLD_H;

  for (const heart of game.heartList) {
    if (!heart.alive) continue;
    const x = heart.x * mx;
    const y = heart.y * my;
    const pulse = 1.5 + Math.sin(game.time * 3 + heart.pulse) * 0.7;
    ctx.fillStyle = 'rgba(193,75,75,0.25)';
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = '#c14b4b';
    ctx.fillRect(x - pulse, y - pulse, pulse * 2, pulse * 2);
  }

  ctx.strokeStyle = '#a9c46b';
  ctx.lineWidth = 1;
  ctx.strokeRect(game.world.base.x * mx - 2, game.world.base.y * my - 2, 5, 5);
  ctx.fillStyle = 'rgba(169,196,107,0.35)';
  ctx.fillRect(game.world.base.x * mx - 1, game.world.base.y * my - 1, 2, 2);

  for (const c of game.containers) {
    if (c.looted) continue;
    if (dist(c.x, c.y, game.player.x, game.player.y) > 700) continue;
    ctx.fillStyle = '#cdb36d';
    ctx.fillRect(c.x * mx - 0.5, c.y * my - 0.5, 1.5, 1.5);
  }
  for (const r of game.rescues) {
    if (r.recruited) continue;
    ctx.fillStyle = '#8fc4b0';
    ctx.fillRect(r.x * mx - 1, r.y * my - 1, 2.5, 2.5);
  }
  for (const z of game.zombies) {
    if (dist(z.x, z.y, game.player.x, game.player.y) > 760) continue;
    ctx.fillStyle = z.horde ? '#e0713e' : 'rgba(200,80,80,0.7)';
    ctx.fillRect(z.x * mx - 0.5, z.y * my - 0.5, 1.5, 1.5);
  }

  const px = game.player.x * mx;
  const py = game.player.y * my;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(game.player.angle);
  ctx.fillStyle = '#f0ecd9';
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(-3, 2.6);
  ctx.lineTo(-3, -2.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(240,236,217,0.2)';
  ctx.strokeRect((game.cam.x * mx) | 0, (game.cam.y * my) | 0, Math.max(6, VIEW_W * mx), Math.max(4, VIEW_H * my));
}
