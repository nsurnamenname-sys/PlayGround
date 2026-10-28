import { clamp, lerp, dist, TAU, angleDiff, RNG } from './util.js';
import {
  generateWorld,
  moveCircle,
  pointBlocked,
  randomOpenPoint,
  WORLD_W,
  WORLD_H,
} from './world.js';
import {
  VIEW_W,
  VIEW_H,
  DAY_LENGTH,
  START_HOUR,
  HEART_TOTAL,
  UPGRADES,
  SURVIVOR_DEFS,
  LOOT_FLAVOR,
  nightAmount,
  phaseName,
  fmtClock,
  initials,
} from './config.js';
import { renderGame, bakeMinimapBase, drawMinimap } from './render.js';

export class Game {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.audio = audio;
    this.el = this.grabEls();
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.mctx.imageSmoothingEnabled = false;

    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = VIEW_W;
    this.lightCanvas.height = VIEW_H;
    this.lctx = this.lightCanvas.getContext('2d');

    this.keys = {};
    this.mouse = { sx: VIEW_W / 2, sy: VIEW_H / 2, l: false, r: false, inside: false };
    this.state = 'menu';
    this.menuTime = 0;
    this.channel = null;
    this.lastPrompt = '';
    this.hudT = 0;
    this.purgeCd = 0;
    this.shake = 0;
    this.flashTimer = null;
    this.ammoHintCd = 0;
    this.stamHintCd = 0;
    this.audioT = 0;

    this.rng = new RNG((Math.random() * 1e9) | 0);
    this.resetRun();
    this.bind();
    this.state = 'menu';
    this.el.startScreen.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.canvas.classList.add('menu-cursor');
    this.refreshBestText();
    this.updateHud(true);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  grabEls() {
    const $ = (id) => document.getElementById(id);
    return {
      hud: $('hud'),
      startScreen: $('startScreen'),
      startBtn: $('startBtn'),
      bestText: $('bestText'),
      pauseScreen: $('pauseScreen'),
      resumeBtn: $('resumeBtn'),
      pauseRestartBtn: $('pauseRestartBtn'),
      pauseMuteBtn: $('pauseMuteBtn'),
      baseScreen: $('baseScreen'),
      baseContent: $('baseContent'),
      closeBase: $('closeBase'),
      baseLocText: $('baseLocText'),
      endScreen: $('endScreen'),
      endKicker: $('endKicker'),
      endTitle: $('endTitle'),
      endBlurb: $('endBlurb'),
      endStats: $('endStats'),
      restartBtn: $('restartBtn'),
      survivorName: $('survivorName'),
      survivorRole: $('survivorRole'),
      portrait: $('portrait'),
      hpFill: $('hpFill'),
      hpText: $('hpText'),
      stamFill: $('stamFill'),
      equipText: $('equipText'),
      medsText: $('medsText'),
      resFood: $('resFood'),
      resMeds: $('resMeds'),
      resAmmo: $('resAmmo'),
      resMats: $('resMats'),
      popText: $('popText'),
      moraleText: $('moraleText'),
      muteBtn: $('muteBtn'),
      dayText: $('dayText'),
      timeText: $('timeText'),
      phaseText: $('phaseText'),
      objectiveText: $('objectiveText'),
      objectiveCount: $('objectiveCount'),
      feed: $('feed'),
      prompt: $('prompt'),
      promptText: $('promptText'),
      minimapWrap: $('minimapWrap'),
      baseIntegrity: $('baseIntegrity'),
      baseHpFill: $('baseHpFill'),
      baseHpText: $('baseHpText'),
      damageFlash: $('damageFlash'),
    };
  }

  bind() {
    this.el.startBtn.addEventListener('click', () => this.beginRun());
    this.el.restartBtn.addEventListener('click', () => this.restartRun());
    this.el.resumeBtn.addEventListener('click', () => this.resume());
    this.el.pauseRestartBtn.addEventListener('click', () => this.restartRun());
    this.el.pauseMuteBtn.addEventListener('click', () => this.toggleMute());
    this.el.muteBtn.addEventListener('click', () => this.toggleMute());
    this.el.closeBase.addEventListener('click', () => this.closeBase());
    this.el.baseContent.addEventListener('click', (e) => this.onBaseClick(e));

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouse.l = false;
      this.mouse.r = false;
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.mouse.sx = clamp(((e.clientX - r.left) / r.width) * VIEW_W, 0, VIEW_W);
      this.mouse.sy = clamp(((e.clientY - r.top) / r.height) * VIEW_H, 0, VIEW_H);
      this.mouse.inside = true;
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.inside = false;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      this.audio.ensure();
      if (e.button === 0) {
        this.mouse.l = true;
        this.tryMelee();
      } else if (e.button === 2) {
        this.mouse.r = true;
        this.tryShoot();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    });
  }

  // --------------------------------------------------------------- run setup

  resetRun() {
    this.world = generateWorld((Math.random() * 1e9) | 0);
    this.runSeed = this.world.seed;
    this.time = 0;
    this.day = 1;
    this.hour = START_HOUR;
    this.lastDawnDay = 1;
    this.hordeDay = 0;
    this.nightWarnDay = 0;
    this.resources = { food: 10, meds: 4, ammo: 16, mats: 14 };
    this.morale = 62;
    this.upgrades = { garden: 0, infirmary: 0, workshop: 0, watchtower: 0, bunks: 0 };
    this.baseMaxHp = 100;
    this.baseHp = 100;
    this.baseBroken = false;
    this.raidActive = false;
    this.raidWarned = false;
    this.raidStealT = 0;
    this.spawnAcc = 0;

    this.roster = [this.makeSurvivor(SURVIVOR_DEFS.mara, 'mara'), this.makeSurvivor(SURVIVOR_DEFS.cole, 'cole')];
    this.activeIndex = 0;

    const s = this.roster[0];
    this.player = {
      x: this.world.base.x,
      y: this.world.base.y + 44,
      r: 5,
      hp: s.hp,
      maxHp: 100,
      stamina: 100,
      maxStamina: 100,
      angle: -Math.PI / 2,
      anim: 0,
      meleeCd: 0,
      gunCd: 0,
      dodgeCd: 0,
      dodgeTime: 0,
      dodgeVx: 0,
      dodgeVy: 0,
      invuln: 0,
      footT: 0,
      moving: false,
      insideBase: true,
    };

    this.zombies = [];
    this.bullets = [];
    this.particles = [];
    this.floaters = [];
    this.effects = [];
    this.decals = [];
    this.corpses = [];
    this.ambient = [];
    this.heartList = this.world.hearts.map((h) => ({
      ...h,
      hp: h.maxHp,
      alive: true,
      pulse: Math.random() * TAU,
      spawnTimer: 0,
      shake: 0,
    }));
    this.containers = this.world.containers.map((c) => ({ ...c, looted: false }));
    this.rescues = this.world.rescues.map((r) => ({ ...r, recruited: false }));
    this.scheduled = [];
    this.stats = { kills: 0, looted: 0, hearts: 0, deaths: 0, recruited: 0 };
    this.loreSeen = new Set();
    this.channel = null;
    this.purgeCd = 0;
    this.shake = 0;
    this.timeAlive = 0;
    this.lastPrompt = '';

    this.cam = {
      x: clamp(this.world.base.x - VIEW_W / 2, 0, WORLD_W - VIEW_W),
      y: clamp(this.world.base.y - VIEW_H / 2, 0, WORLD_H - VIEW_H),
    };
    this.rx = Math.floor(this.cam.x);
    this.ry = Math.floor(this.cam.y);

    this.spawnInitialZombies();
    bakeMinimapBase(this);
    this.el.feed.innerHTML = '';
    this.el.endScreen.classList.add('hidden');
    this.el.baseScreen.classList.add('hidden');
    this.el.pauseScreen.classList.add('hidden');
  }

  makeSurvivor(def, id) {
    return {
      id,
      name: def.name,
      role: def.role,
      trait: def.trait,
      color: def.color,
      skin: def.skin,
      look: def.look,
      bonus: def.bonus || '',
      hp: 100,
      alive: true,
      departed: false,
    };
  }

  spawnInitialZombies() {
    const rng = this.rng;
    for (const p of this.world.spawns) {
      if (this.zombies.length >= 58) break;
      if (Math.hypot(p.x - this.world.base.x, p.y - this.world.base.y) < 210 && !p.guard) continue;
      const r = rng.next();
      const type = r > 0.94 ? 'feral' : r > 0.72 ? 'runner' : 'walker';
      this.spawnZombie(p.x, p.y, type, !!p.guard);
    }
  }

  spawnZombie(x, y, type = 'walker', guard = false) {
    const stats = {
      walker: { hp: 45, speed: 33, dmg: 8 },
      runner: { hp: 62, speed: 50, dmg: 7 },
      feral: { hp: 100, speed: 72, dmg: 14 },
    }[type];
    const z = {
      x,
      y,
      spawnX: x,
      spawnY: y,
      r: 5,
      type,
      hp: stats.hp,
      maxHp: stats.hp,
      baseSpeed: stats.speed,
      dmg: stats.dmg,
      angle: this.rng.range(0, TAU),
      state: 'idle',
      anim: this.rng.range(0, 10),
      wanderT: 0,
      wanderA: this.rng.range(0, TAU),
      attackCd: this.rng.range(0.2, 1),
      alertT: 0,
      stagger: 0,
      hitFlash: 0,
      avoidT: 0,
      avoidDir: 1,
      lastMoveX: x,
      lastMoveY: y,
      stuckT: 0,
      guard,
      horde: false,
      raid: false,
      dead: false,
    };
    this.zombies.push(z);
    return z;
  }

  get active() {
    return this.roster[this.activeIndex];
  }

  get populationCap() {
    return 3 + this.upgrades.bunks;
  }

  // ---------------------------------------------------------------- lifecycle

  beginRun() {
    if (this.state === 'playing') return;
    if (this.state === 'end') this.resetRun();
    this.state = 'playing';
    this.audio.ensure();
    this.audio.ui();
    this.el.startScreen.classList.add('hidden');
    this.el.endScreen.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.pauseScreen.classList.add('hidden');
    this.el.baseScreen.classList.add('hidden');
    this.canvas.classList.remove('menu-cursor');
    this.keys = {};
    this.cam.x = clamp(this.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    this.cam.y = clamp(this.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
    this.time = 0;
    this.hour = START_HOUR;
    this.scheduled = [
      { at: 0.8, text: 'The Ranger Station is barely holding. Two survivors left.', kind: '' },
      { at: 4.5, text: 'Scavenge with E. Melee is quiet — gunfire draws the dead.', kind: '' },
      { at: 10, text: 'Three plague hearts fester in town. They are marked on the minimap.', kind: 'warn' },
    ];
    this.notify('Day 1 — the town is quiet. It will not stay that way.', '');
    this.refreshBestText();
    this.updateHud(true);
  }

  restartRun() {
    this.resetRun();
    this.state = 'menu';
    this.beginRun();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.keys = {};
    this.mouse.l = false;
    this.mouse.r = false;
    this.channel = null;
    this.el.pauseScreen.classList.remove('hidden');
    this.canvas.classList.add('menu-cursor');
    this.audio.ui();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.el.pauseScreen.classList.add('hidden');
    this.canvas.classList.remove('menu-cursor');
    this.audio.ensure();
    this.audio.ui();
  }

  openBase() {
    if (this.state !== 'playing') return;
    this.state = 'base';
    this.keys = {};
    this.mouse.l = false;
    this.mouse.r = false;
    this.channel = null;
    this.el.baseScreen.classList.remove('hidden');
    this.canvas.classList.add('menu-cursor');
    this.renderBasePanel();
    this.audio.ui();
  }

  closeBase() {
    if (this.state !== 'base') return;
    this.state = 'playing';
    this.el.baseScreen.classList.add('hidden');
    this.canvas.classList.remove('menu-cursor');
    this.audio.ui();
  }

  toggleMute() {
    this.audio.ensure();
    const muted = this.audio.toggleMute();
    this.el.muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    this.el.pauseMuteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    this.audio.ui();
  }

  // ------------------------------------------------------------------- input

  onKeyDown(e) {
    const k = e.code;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();

    if (this.state === 'menu') {
      if (k === 'Enter' || k === 'Space') this.beginRun();
      return;
    }
    if (this.state === 'end') {
      if (k === 'Enter') this.restartRun();
      return;
    }
    if (this.state === 'paused') {
      if (k === 'Escape') this.resume();
      if (k === 'KeyM') this.toggleMute();
      return;
    }
    if (this.state === 'base') {
      if (k === 'Escape' || k === 'Tab') this.closeBase();
      if (k === 'KeyM') this.toggleMute();
      return;
    }

    if (k === 'Escape') {
      this.pause();
      return;
    }
    if (k === 'Tab') {
      this.openBase();
      return;
    }
    if (k === 'KeyM') {
      this.toggleMute();
      return;
    }

    this.keys[k] = true;
    this.audio.ensure();

    if (k === 'KeyH') this.heal();
    else if (k === 'KeyE') this.tryInteract();
    else if (k === 'Space') this.dodge();
  }

  onBaseClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'upgrade') this.buyUpgrade(btn.dataset.id);
    else if (action === 'switch') this.switchSurvivor(Number(btn.dataset.index));
    else if (action === 'close') this.closeBase();
  }

  // --------------------------------------------------------------- core loop

  loop(ts) {
    const dt = Math.min((ts - this.last) / 1000, 0.05);
    this.last = ts;
    if (this.state === 'playing') {
      this.update(dt);
    } else if (this.state === 'menu') {
      this.menuTime += dt;
      this.player.anim = this.menuTime * 2;
      this.updateAmbient(dt);
      this.updateParticles(dt);
      this.updateCamera(dt, true);
    } else {
      this.updateAmbient(dt * 0.35);
    }
    renderGame(this, dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.timeAlive += dt;
    this.time += dt;
    this.updateClock();
    this.updateScheduled();
    this.updatePlayer(dt);
    this.updateInteraction(dt);
    this.updateZombies(dt);
    this.updateBullets(dt);
    this.updateHearts(dt);
    this.updateParticles(dt);
    this.updateBase(dt);
    this.updateSpawns(dt);
    this.updateAmbient(dt);
    this.updateCamera(dt, false);
    this.updateHud(false);
  }

  updateClock() {
    const totalH = START_HOUR + (this.time / DAY_LENGTH) * 24;
    this.hour = totalH % 24;
    const day = 1 + Math.floor((totalH - 6) / 24);
    if (day > this.day) {
      this.day = day;
      this.processDawn();
    }

    if (this.hour >= 20.5 && this.nightWarnDay !== this.day) {
      this.nightWarnDay = this.day;
      this.notify('Night falls. The dead move faster in the dark.', 'warn');
      this.audio.night();
    }
    if (this.hour >= 21 && this.hordeDay !== this.day) {
      this.hordeDay = this.day;
      this.spawnHorde();
    }
    if (this.hour >= 5 && this.hour < 7 && this.lastDawnDay < this.day) {
      this.lastDawnDay = this.day;
    }
  }

  updateScheduled() {
    if (!this.scheduled.length) return;
    const due = this.scheduled.filter((s) => s.at <= this.time);
    if (!due.length) return;
    this.scheduled = this.scheduled.filter((s) => s.at > this.time);
    for (const s of due) this.notify(s.text, s.kind);
  }

  updateCamera(dt, menu) {
    if (menu) {
      const tx = clamp(this.world.base.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
      const ty = clamp(this.world.base.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
      this.cam.x = tx;
      this.cam.y = ty;
      this.rx = Math.round(tx);
      this.ry = Math.round(ty);
      return;
    }
    const lookX = (this.mouse.sx - VIEW_W / 2) * 0.14;
    const lookY = (this.mouse.sy - VIEW_H / 2) * 0.14;
    let tx = this.player.x - VIEW_W / 2 + lookX;
    let ty = this.player.y - VIEW_H / 2 + lookY;
    tx = clamp(tx, 0, WORLD_W - VIEW_W);
    ty = clamp(ty, 0, WORLD_H - VIEW_H);
    const k = 1 - Math.pow(0.0008, dt);
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    this.shake = Math.max(0, this.shake - dt * 22);
    this.rx = Math.floor(this.cam.x);
    this.ry = Math.floor(this.cam.y);
  }

  updatePlayer(dt) {
    const p = this.player;
    const surv = this.active;

    p.meleeCd = Math.max(0, p.meleeCd - dt);
    p.gunCd = Math.max(0, p.gunCd - dt);
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    this.purgeCd = Math.max(0, this.purgeCd - dt);
    this.ammoHintCd = Math.max(0, this.ammoHintCd - dt);
    this.stamHintCd = Math.max(0, this.stamHintCd - dt);

    const mw = { x: this.mouse.sx + this.cam.x, y: this.mouse.sy + this.cam.y };
    if (this.mouse.inside) p.angle = Math.atan2(mw.y - p.y, mw.x - p.x);

    let mx = 0;
    let my = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) my -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) my += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) mx -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) mx += 1;
    const hasMove = mx !== 0 || my !== 0;
    if (hasMove) {
      const l = Math.hypot(mx, my);
      mx /= l;
      my /= l;
    }

    const moraleMod = this.morale < 30 ? 0.85 : this.morale > 75 ? 1.05 : 1;
    const speedMod = (surv.bonus === 'speed' ? 1.08 : 1) * moraleMod;
    const sprinting =
      (this.keys.ShiftLeft || this.keys.ShiftRight) && hasMove && p.stamina > 1 && p.dodgeTime <= 0;
    const moveSpeed = 78 * speedMod * (sprinting ? 1.62 : 1);

    if (sprinting) {
      p.stamina = Math.max(0, p.stamina - 16 * dt);
    } else if (p.dodgeTime <= 0) {
      const regenMod = (surv.bonus === 'stamina' ? 1.25 : 1) * moraleMod * (p.insideBase ? 1.5 : 1);
      p.stamina = Math.min(p.maxStamina, p.stamina + 16 * regenMod * dt);
    }

    let dx = mx * moveSpeed * dt;
    let dy = my * moveSpeed * dt;

    if (p.dodgeTime > 0) {
      p.dodgeTime -= dt;
      dx = p.dodgeVx * dt;
      dy = p.dodgeVy * dt;
      if (Math.random() < 0.5) {
        this.addParticle(p.x, p.y + 4, -dx * 0.1, -dy * 0.1, 0.3, 'rgba(190,180,150,0.35)', 2);
      }
    }

    p.moving = hasMove || p.dodgeTime > 0;
    if (p.moving) p.anim += dt * (sprinting ? 14 : 9);

    moveCircle(this.world, p, dx, dy);

    if (p.moving && p.dodgeTime <= 0) {
      p.footT -= dt;
      if (p.footT <= 0) {
        p.footT = sprinting ? 0.16 : 0.28;
        this.addParticle(
          p.x + this.rng.range(-2, 2),
          p.y + 4,
          this.rng.range(-3, 3),
          this.rng.range(-4, 0),
          0.4,
          'rgba(140,130,100,0.18)',
          1,
        );
      }
    }

    const baseDist = dist(p.x, p.y, this.world.base.x, this.world.base.y);
    p.insideBase = baseDist < this.world.base.radius;
    if (p.insideBase) {
      p.hp = Math.min(p.maxHp, p.hp + 1.6 * dt);
      p.stamina = Math.min(p.maxStamina, p.stamina + 8 * dt);
    }

    this.audioT -= dt;
    if (this.audioT <= 0) {
      this.audioT = 2;
      const night = this.hour >= 20.5 || this.hour < 5;
      const hearts = this.heartList.filter((h) => h.alive).length;
      this.audio.setIntensity(clamp((night ? 0.7 : 0.15) + hearts * 0.08 + this.zombies.length / 220, 0, 1));
    }

    if (this.mouse.l) this.tryMelee();
    if (this.mouse.r) this.tryShoot();

    surv.hp = p.hp;
    if (p.hp <= 0) this.killActive();
  }

  updateInteraction(dt) {
    if (this.channel) {
      const it = this.getInteractable();
      const valid = this.keys.KeyE && it && it.kind === 'loot' && it.obj === this.channel.obj;
      const far = dist(this.player.x, this.player.y, this.channel.obj.x, this.channel.obj.y) > 40;
      if (!valid || far) {
        this.channel = null;
      } else {
        this.channel.t += dt;
        if (this.channel.t >= this.channel.dur) {
          const c = this.channel.obj;
          this.channel = null;
          this.lootContainer(c);
        }
      }
    }

    const it = this.channel ? null : this.getInteractable();
    let text = '';
    if (this.channel) {
      const pct = Math.floor((this.channel.t / this.channel.dur) * 100);
      text = `LOOTING ${this.channel.obj.label} · ${pct}%`;
    } else if (it) {
      if (it.kind === 'loot') text = `LOOT ${it.obj.label}`;
      else if (it.kind === 'heart') text = `PURGE PLAGUE HEART · ${Math.max(0, Math.ceil(it.obj.hp))} HP`;
      else if (it.kind === 'rescue') {
        const full = this.roster.filter((s) => s.alive).length >= this.populationCap;
        text = full
          ? `RECRUIT ${it.obj.name.toUpperCase()} — SHELTER FULL`
          : `RECRUIT ${it.obj.name.toUpperCase()} · ${it.obj.role}`;
      }
    }
    if (text !== this.lastPrompt) {
      this.lastPrompt = text;
      this.el.promptText.textContent = text;
      this.el.prompt.classList.toggle('hidden', !text);
    }
  }

  getInteractable() {
    const p = this.player;
    let best = null;
    let bestD = 1e9;
    for (const c of this.containers) {
      if (c.looted) continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < 34 && d < bestD) {
        bestD = d;
        best = { kind: 'loot', obj: c };
      }
    }
    for (const h of this.heartList) {
      if (!h.alive) continue;
      const d = dist(p.x, p.y, h.x, h.y);
      if (d < 46 && d < bestD) {
        bestD = d;
        best = { kind: 'heart', obj: h };
      }
    }
    for (const r of this.rescues) {
      if (r.recruited) continue;
      const d = dist(p.x, p.y, r.x, r.y);
      if (d < 38 && d < bestD) {
        bestD = d;
        best = { kind: 'rescue', obj: r };
      }
    }
    return best;
  }

  tryInteract() {
    if (this.state !== 'playing') return;
    const it = this.getInteractable();
    if (!it) return;
    if (it.kind === 'loot') {
      if (!this.channel) {
        this.channel = { obj: it.obj, t: 0, dur: 0.9 };
        this.audio.ui();
      }
    } else if (it.kind === 'heart') {
      if (this.purgeCd > 0) return;
      this.purgeCd = 0.75;
      this.damageHeart(it.obj, 34, true);
    } else if (it.kind === 'rescue') {
      this.recruit(it.obj);
    }
  }

  tryMelee() {
    const p = this.player;
    if (p.meleeCd > 0) return;
    if (p.stamina < 10) {
      if (this.stamHintCd <= 0) {
        this.notify('Too winded. Catch your breath.', 'warn');
        this.stamHintCd = 2.5;
      }
      return;
    }
    p.meleeCd = 0.34;
    p.stamina -= 9;
    const range = 36;
    const arc = 1.15;
    const surv = this.active;
    const dmg = surv.bonus === 'mats' ? 38 : 34;
    this.effects.push({ kind: 'slash', x: p.x, y: p.y, angle: p.angle, t: 0, life: 0.16 });
    this.audio.melee();
    this.shake = Math.max(this.shake, 0.8);

    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = dist(p.x, p.y, z.x, z.y);
      if (d > range + z.r) continue;
      if (Math.abs(angleDiff(Math.atan2(z.y - p.y, z.x - p.x), p.angle)) > arc) continue;
      this.damageZombie(z, dmg, p.angle);
    }
    for (const h of this.heartList) {
      if (!h.alive) continue;
      const d = dist(p.x, p.y, h.x, h.y);
      if (d > 48) continue;
      if (Math.abs(angleDiff(Math.atan2(h.y - p.y, h.x - p.x), p.angle)) > arc) continue;
      this.damageHeart(h, dmg, false);
    }
    this.alertZombies(p.x, p.y, 66, 2.5);
  }

  tryShoot() {
    const p = this.player;
    if (p.gunCd > 0) return;
    if (this.resources.ammo <= 0) {
      if (this.ammoHintCd <= 0) {
        this.notify('Out of ammo. Scavenge the town — or swing the machete.', 'warn');
        this.ammoHintCd = 3;
      }
      return;
    }
    this.resources.ammo -= 1;
    p.gunCd = 0.3;
    const surv = this.active;
    const dmg = surv.bonus === 'ammo' ? 53 : 46;
    const spread = this.rng.range(-1, 1) * 0.025;
    const a = p.angle + spread;
    const sx = p.x + Math.cos(a) * 12;
    const sy = p.y + Math.sin(a) * 12;
    this.bullets.push({
      x: sx,
      y: sy,
      px: sx,
      py: sy,
      vx: Math.cos(a) * 540,
      vy: Math.sin(a) * 540,
      life: 0.7,
      dmg,
      dead: false,
    });
    this.effects.push({ kind: 'muzzle', x: sx, y: sy, angle: a, t: 0, life: 0.08 });
    this.shake = Math.max(this.shake, 1.8);
    this.audio.shot();
    this.alertZombies(p.x, p.y, 330, 7);
    this.updateHud(true);
  }

  dodge() {
    const p = this.player;
    if (p.dodgeCd > 0 || p.stamina < 22 || this.state !== 'playing') return;
    let mx = 0;
    let my = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) my -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) my += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) mx -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) mx += 1;
    const a = mx || my ? Math.atan2(my, mx) : p.angle;
    p.stamina -= 22;
    p.dodgeCd = 0.8;
    p.dodgeTime = 0.2;
    p.invuln = 0.32;
    p.dodgeVx = Math.cos(a) * 330;
    p.dodgeVy = Math.sin(a) * 330;
    this.audio.melee();
    this.addParticle(p.x, p.y + 4, 0, 0, 0.35, 'rgba(180,170,140,0.5)', 3);
  }

  heal() {
    const p = this.player;
    if (this.resources.meds <= 0) {
      this.notify('No meds left. Loot clinics and houses.', 'warn');
      return;
    }
    if (p.hp >= p.maxHp) {
      this.notify('You are already in one piece.', '');
      return;
    }
    const amount = this.active.bonus === 'meds' ? 55 : 42;
    this.resources.meds -= 1;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    this.addFloater(p.x, p.y - 18, `+${amount}`, '#a9c46b');
    this.effects.push({ kind: 'ring', x: p.x, y: p.y, t: 0, life: 0.5, color: '#a9c46b' });
    this.audio.heal();
    this.updateHud(true);
  }

  // ----------------------------------------------------------------- combat

  damageZombie(z, dmg, angle) {
    z.hp -= dmg;
    z.hitFlash = 0.12;
    z.stagger = Math.min(0.35, z.stagger + 0.18);
    z.alertT = 8;
    z.state = 'chase';
    if (angle !== undefined) {
      moveCircle(this.world, z, Math.cos(angle) * 8, Math.sin(angle) * 8);
    }
    this.addBlood(z.x, z.y, angle || 0);
    this.addFloater(z.x, z.y - 12, `${Math.round(dmg)}`, '#e6a3a0');
    this.audio.hit();
    if (z.hp <= 0) this.killZombie(z);
  }

  killZombie(z) {
    z.dead = true;
    this.stats.kills++;
    this.corpses.push({ x: z.x, y: z.y, angle: z.angle + this.rng.range(-0.6, 0.6), type: z.type, t: 14 });
    for (let i = 0; i < 5; i++) {
      this.addBlood(z.x + this.rng.range(-5, 5), z.y + this.rng.range(-5, 5), this.rng.range(0, TAU));
    }
    this.addParticle(z.x, z.y - 4, this.rng.range(-20, 20), this.rng.range(-30, -6), 0.5, '#6d1d1d', 2);
    if (this.rng.chance(0.14)) {
      this.resources.ammo = Math.min(99, this.resources.ammo + 1);
      this.addFloater(z.x, z.y - 12, '+1 AMMO', '#cdb36d');
    }
    this.zombies = this.zombies.filter((zz) => zz !== z);
  }

  damageHeart(h, dmg, purge) {
    if (!h.alive) return;
    h.hp -= dmg;
    h.shake = 5;
    this.shake = Math.max(this.shake, 3);
    this.addFloater(h.x, h.y - 22, `${Math.round(dmg)}`, '#e6a3a0');
    for (let i = 0; i < 6; i++) {
      this.addParticle(
        h.x + this.rng.range(-10, 10),
        h.y + this.rng.range(-10, 10),
        this.rng.range(-25, 25),
        this.rng.range(-35, -5),
        0.5,
        '#8f2b36',
        2,
      );
    }
    this.audio.heart();
    if (purge) this.audio.purge();
    const near = this.zombies.filter((z) => dist(z.x, z.y, h.x, h.y) < 220).length;
    if (near < 9 && (purge || this.rng.chance(0.4))) {
      const a = this.rng.range(0, TAU);
      const z = this.spawnZombie(
        h.x + Math.cos(a) * 34,
        h.y + Math.sin(a) * 34,
        this.rng.chance(0.25) ? 'runner' : 'walker',
        false,
      );
      z.alertT = 6;
    }
    if (h.hp <= 0) this.destroyHeart(h);
  }

  destroyHeart(h) {
    h.alive = false;
    this.stats.hearts++;
    this.world.colliders = this.world.colliders.filter((c) => c !== h.collider);
    this.resources.mats = Math.min(99, this.resources.mats + 10);
    this.resources.meds = Math.min(99, this.resources.meds + 4);
    this.morale = clamp(this.morale + 10, 0, 100);
    this.shake = 9;
    this.addFloater(h.x, h.y - 26, 'PLAGUE HEART DESTROYED', '#a9c46b');
    for (let i = 0; i < 34; i++) {
      this.addParticle(
        h.x + this.rng.range(-8, 8),
        h.y + this.rng.range(-8, 8),
        this.rng.range(-70, 70),
        this.rng.range(-90, 20),
        this.rng.range(0.4, 1),
        this.rng.chance(0.5) ? '#b8394a' : '#e0713e',
        this.rng.range(1, 3),
      );
    }
    this.addBlood(h.x, h.y, 0, 16);
    this.audio.purge();
    this.notify(`Plague heart destroyed. ${HEART_TOTAL - this.stats.hearts} remain.`, 'good');
    this.alertZombies(h.x, h.y, 420, 9);
    this.updateHud(true);
    if (this.stats.hearts >= HEART_TOTAL) this.endGame(true);
  }

  killActive() {
    const s = this.active;
    if (!s.alive) return;
    s.alive = false;
    s.hp = 0;
    this.stats.deaths++;
    this.notify(`${s.name} is dead. The dead do not wait.`, 'bad');
    this.addBlood(this.player.x, this.player.y, 0, 14);
    this.shake = 9;
    this.flashDamage();
    this.audio.death();
    const nextIndex = this.roster.findIndex((r) => r.alive);
    if (nextIndex >= 0) {
      this.activeIndex = nextIndex;
      const next = this.roster[nextIndex];
      this.player.hp = Math.max(45, next.hp);
      this.player.stamina = 100;
      this.player.x = this.world.base.x;
      this.player.y = this.world.base.y + 44;
      this.player.invuln = 2.8;
      this.player.dodgeTime = 0;
      this.player.dodgeCd = 0;
      this.channel = null;
      this.cam.x = clamp(this.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
      this.cam.y = clamp(this.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
      next.hp = this.player.hp;
      this.notify(`You are now ${next.name}. Get home. Stay alive.`, 'warn');
      this.updateHud(true);
    } else {
      this.endGame(false);
    }
  }

  // ------------------------------------------------------------------- loot

  lootContainer(c) {
    if (c.looted) return;
    c.looted = true;
    const rng = this.rng;
    const gains = {};
    const add = (type, n) => {
      gains[type] = (gains[type] || 0) + n;
      this.resources[type] = Math.min(99, this.resources[type] + n);
    };
    if (c.type === 'food') {
      add('food', rng.int(3, 6));
      if (rng.chance(0.3)) add('meds', 1);
    } else if (c.type === 'meds') {
      add('meds', rng.int(1, 3));
      if (rng.chance(0.3)) add('food', 1);
    } else if (c.type === 'ammo') {
      add('ammo', rng.int(3, 7));
      if (rng.chance(0.3)) add('mats', 1);
    } else {
      add('mats', rng.int(3, 6));
      if (rng.chance(0.25)) add('ammo', 1);
    }
    this.stats.looted++;
    const parts = Object.entries(gains).map(([k, v]) => `+${v} ${k.toUpperCase()}`);
    this.notify(`${c.label}: ${parts.join(' · ')}`, 'good');
    this.addFloater(this.player.x, this.player.y - 20, parts.join(' '), '#a9c46b');
    this.effects.push({ kind: 'ring', x: c.x, y: c.y, t: 0, life: 0.55, color: '#cdb36d' });
    this.audio.loot();
    this.alertZombies(c.x, c.y, 90, 3);
    if (rng.chance(0.28) && this.loreSeen.size < 6) {
      const note = LOOT_FLAVOR[rng.int(0, LOOT_FLAVOR.length - 1)];
      if (!this.loreSeen.has(note)) {
        this.loreSeen.add(note);
        this.notify(note, '');
      }
    }
    this.updateHud(true);
  }

  recruit(r) {
    if (r.recruited) return;
    const alive = this.roster.filter((s) => s.alive).length;
    if (alive >= this.populationCap) {
      this.notify(`No room for ${r.name}. Build Bunks at base (Tab).`, 'warn');
      return;
    }
    r.recruited = true;
    const def = {
      name: r.name,
      role: r.role,
      trait: r.trait,
      color: r.color,
      skin: r.skin || '#bd9068',
      look: r.look,
      bonus: { Nurse: 'meds', Forager: 'food', Marksman: 'ammo', Scout: 'speed' }[r.role] || '',
    };
    const s = this.makeSurvivor(def, r.id);
    this.roster.push(s);
    this.stats.recruited++;
    this.morale = clamp(this.morale + 6, 0, 100);
    this.notify(`${r.name} joined the community. ${s.trait}`, 'good');
    this.addFloater(r.x, r.y - 22, 'RECRUITED', '#a9c46b');
    this.effects.push({ kind: 'ring', x: r.x, y: r.y, t: 0, life: 0.7, color: '#a9c46b' });
    this.audio.recruit();
    this.updateHud(true);
  }

  // ---------------------------------------------------------------- zombies

  alertZombies(x, y, radius, seconds) {
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (dist(z.x, z.y, x, y) < radius) {
        z.alertT = Math.max(z.alertT, seconds);
        z.state = 'chase';
      }
    }
  }

  updateZombies(dt) {
    const p = this.player;
    const night = this.hour >= 20.5 || this.hour < 5;
    const base = this.world.base;
    const inBase = p.insideBase;
    const detect = (night ? 118 : 82) + (this.morale < 30 ? 10 : 0);
    const nearby = [];
    const maxCount = this.zombies.length;

    for (let i = 0; i < maxCount; i++) {
      const z = this.zombies[i];
      if (!z) continue;
      z.anim += dt * (z.type === 'feral' ? 13 : 6);
      z.hitFlash = Math.max(0, z.hitFlash - dt);
      z.stagger = Math.max(0, z.stagger - dt);
      z.attackCd = Math.max(0, z.attackCd - dt);
      z.avoidT = Math.max(0, z.avoidT - dt);
      z.alertT = Math.max(0, z.alertT - dt);

      const pd = dist(z.x, z.y, p.x, p.y);
      let tx = z.x;
      let ty = z.y;
      let speed = z.baseSpeed * (night ? 1.08 : 1);
      let chasing = false;

      if (z.horde) {
        tx = base.x;
        ty = base.y;
        chasing = true;
        if (dist(z.x, z.y, base.x, base.y) < 34) {
          z.raid = true;
          z.state = 'raid';
          if (pd < 15 && z.attackCd <= 0) {
            z.attackCd = 1.1;
            this.damagePlayer(z.dmg, z);
          }
          continue;
        }
      } else if (z.alertT > 0 || (pd < detect && !(inBase && dist(z.x, z.y, base.x, base.y) < base.radius + 26))) {
        tx = p.x;
        ty = p.y;
        chasing = true;
      } else {
        z.wanderT -= dt;
        if (z.wanderT <= 0) {
          z.wanderT = this.rng.range(1.5, 4);
          z.wanderA = this.rng.range(0, TAU);
        }
        tx = z.x + Math.cos(z.wanderA) * 30;
        ty = z.y + Math.sin(z.wanderA) * 30;
        speed *= 0.24;
      }

      if (!chasing && !z.horde && inBase && dist(z.x, z.y, base.x, base.y) < base.radius + 30) {
        tx = z.x + (z.x - base.x);
        ty = z.y + (z.y - base.y);
        speed = 22;
      }

      let a = Math.atan2(ty - z.y, tx - z.x);
      if (z.avoidT > 0) a += z.avoidDir * 1.15;
      z.angle = a;

      let sx = 0;
      let sy = 0;
      for (let j = 0; j < nearby.length; j++) {
        const o = nearby[j];
        const ddx = z.x - o.x;
        const ddy = z.y - o.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > 0.01 && d2 < 196) {
          sx += (ddx / Math.sqrt(d2)) * (14 - Math.sqrt(d2));
          sy += (ddy / Math.sqrt(d2)) * (14 - Math.sqrt(d2));
        }
      }
      nearby.push(z);

      const st = z.stagger > 0 ? 0.25 : 1;
      moveCircle(this.world, z, (Math.cos(a) * speed * st + sx * 2) * dt, (Math.sin(a) * speed * st + sy * 2) * dt);

      z.stuckT += dt;
      if (z.stuckT > 0.9) {
        const moved = Math.hypot(z.x - z.lastMoveX, z.y - z.lastMoveY);
        if (moved < 3 && chasing) {
          z.avoidT = 0.9;
          z.avoidDir = this.rng.chance(0.5) ? 1 : -1;
        }
        z.stuckT = 0;
        z.lastMoveX = z.x;
        z.lastMoveY = z.y;
      }

      if (chasing && !z.horde && pd < 13 + z.r && z.attackCd <= 0 && z.stagger <= 0) {
        z.attackCd = z.type === 'feral' ? 0.8 : 1.1;
        this.damagePlayer(z.dmg, z);
      }

      if (z.horde && pd < 14 && z.attackCd <= 0) {
        z.attackCd = 1.1;
        this.damagePlayer(z.dmg, z);
      }

      if (!z.horde && !chasing && dist(z.x, z.y, z.spawnX, z.spawnY) > 620) {
        z.wanderA = Math.atan2(z.spawnY - z.y, z.spawnX - z.x);
      }

      if (!z.horde && dist(z.x, z.y, p.x, p.y) > 1250) {
        z.dead = true;
      }
    }
    this.zombies = this.zombies.filter((z) => !z.dead);
  }

  damagePlayer(amount, source) {
    const p = this.player;
    if (p.invuln > 0 || p.dodgeTime > 0 || this.state !== 'playing') return;
    p.hp -= amount;
    p.invuln = 0.55;
    this.shake = Math.max(this.shake, 3.4);
    this.flashDamage();
    this.audio.hurt();
    this.addFloater(p.x, p.y - 18, `-${amount}`, '#e6a3a0');
    for (let i = 0; i < 4; i++) this.addBlood(p.x, p.y, this.rng.range(0, TAU));
    if (source && source.x !== undefined) {
      const a = Math.atan2(p.y - source.y, p.x - source.x);
      this.addParticle(p.x, p.y, Math.cos(a) * 30, Math.sin(a) * 30, 0.3, '#a33a3a', 2);
    }
    this.active.hp = p.hp;
    this.updateHud(true);
  }

  flashDamage() {
    this.el.damageFlash.classList.add('on');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.el.damageFlash.classList.remove('on'), 110);
  }

  updateHearts(dt) {
    const p = this.player;
    for (const h of this.heartList) {
      if (!h.alive) continue;
      h.pulse += dt * (1.4 + (h.hp < h.maxHp ? 1.4 : 0));
      h.shake = Math.max(0, h.shake - dt * 8);
      if (dist(p.x, p.y, h.x, h.y) < 300) {
        h.spawnTimer -= dt;
        if (h.spawnTimer <= 0) {
          const near = this.zombies.filter((z) => dist(z.x, z.y, h.x, h.y) < 150).length;
          h.spawnTimer = 8;
          if (near < 7) {
            const a = this.rng.range(0, TAU);
            this.spawnZombie(
              h.x + Math.cos(a) * 40,
              h.y + Math.sin(a) * 40,
              this.rng.chance(0.22) ? 'runner' : 'walker',
              true,
            );
          }
        }
      }
    }
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD_W || b.y > WORLD_H) {
        b.dead = true;
        continue;
      }

      let hit = false;
      for (const h of this.heartList) {
        if (!h.alive) continue;
        if (dist(b.x, b.y, h.x, h.y) < 18) {
          this.damageHeart(h, b.dmg, false);
          hit = true;
          break;
        }
      }
      if (hit) {
        b.dead = true;
        continue;
      }

      for (const z of this.zombies) {
        if (z.dead) continue;
        if (dist(b.x, b.y, z.x, z.y) < z.r + 3) {
          this.damageZombie(z, b.dmg, Math.atan2(b.vy, b.vx));
          hit = true;
          break;
        }
      }
      if (hit) {
        b.dead = true;
        continue;
      }

      if (pointBlocked(this.world, b.x, b.y)) {
        b.dead = true;
        this.addParticle(b.x, b.y, -b.vx * 0.04, -b.vy * 0.04, 0.2, '#c9c3a8', 1);
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  updateSpawns(dt) {
    const night = this.hour >= 20.5 || this.hour < 5;
    const heartsAlive = this.heartList.filter((h) => h.alive).length;
    const cap = 42 + (night ? 16 : 0) + heartsAlive * 4;
    this.spawnAcc += dt;
    const interval = night ? 1.5 : 3.1;
    if (this.spawnAcc < interval || this.zombies.length >= cap) return;
    this.spawnAcc = 0;
    const pt = randomOpenPoint(this.world, this.rng, this.player, night ? 330 : 390);
    if (dist(pt.x, pt.y, this.world.base.x, this.world.base.y) < 230) return;
    const r = this.rng.next();
    const type = r > 0.9 && night ? 'feral' : r > 0.7 ? 'runner' : 'walker';
    this.spawnZombie(pt.x, pt.y, type, false);
  }

  spawnHorde() {
    const base = this.world.base;
    const count = 9 + this.day * 2 + this.upgrades.watchtower * 2;
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, TAU);
      const d = 210 + this.rng.range(0, 90);
      const x = clamp(base.x + Math.cos(a) * d, 30, WORLD_W - 30);
      const y = clamp(base.y + Math.sin(a) * d, 30, WORLD_H - 30);
      const z = this.spawnZombie(x, y, this.rng.chance(0.22) ? 'runner' : 'walker', false);
      z.horde = true;
      z.alertT = 9999;
      z.state = 'chase';
    }
    this.notify('A horde is converging on Ranger Station. Get home.', 'bad');
    this.audio.night();
    this.shake = Math.max(this.shake, 4);
  }

  updateBase(dt) {
    const raiders = this.zombies.filter((z) => z.horde && z.raid);
    if (raiders.length > 0) {
      if (!this.raidWarned) {
        this.raidWarned = true;
        this.notify('The horde is hitting the base. Defend it.', 'bad');
      }
      this.raidActive = true;
      const attackers = Math.min(raiders.length, 5);
      const reduction = 1 - this.upgrades.watchtower * 0.18;
      this.baseHp -= attackers * 1.35 * reduction * dt;
      this.raidStealT += dt;
      if (this.raidStealT > 5) {
        this.raidStealT = 0;
        if (this.resources.food > 0) this.resources.food -= 1;
        if (this.resources.mats > 0) this.resources.mats -= 1;
        this.notify('The horde is looting the base.', 'bad');
      }
      if (this.baseHp <= 0 && !this.baseBroken) {
        this.baseBroken = true;
        this.baseHp = this.baseMaxHp;
        this.resources.food = Math.floor(this.resources.food * 0.6);
        this.resources.meds = Math.floor(this.resources.meds * 0.7);
        this.resources.ammo = Math.floor(this.resources.ammo * 0.7);
        this.resources.mats = Math.floor(this.resources.mats * 0.6);
        this.morale = clamp(this.morale - 18, 0, 100);
        this.notify('The base was overrun. Supplies lost, but the walls held.', 'bad');
        for (const z of raiders) {
          z.horde = false;
          z.raid = false;
          z.alertT = 0;
          z.state = 'idle';
          z.x += this.rng.range(-20, 20);
          z.y += this.rng.range(-20, 20);
        }
        this.shake = 8;
      }
    } else {
      this.raidActive = false;
      this.raidWarned = false;
      this.raidStealT = 0;
      if (this.baseHp < this.baseMaxHp) this.baseHp = Math.min(this.baseMaxHp, this.baseHp + 0.35 * dt);
    }
  }

  // -------------------------------------------------------------------- dawn

  processDawn() {
    const alive = this.roster.filter((s) => s.alive);
    const gains = { food: 0, meds: 0, ammo: 0, mats: 0 };
    for (const s of alive) {
      if (s.bonus === 'food') gains.food += 2;
      else if (s.bonus === 'meds') gains.meds += 1;
      else if (s.bonus === 'ammo') gains.ammo += 2;
      else if (s.bonus === 'mats') gains.mats += 1;
    }
    gains.food += this.upgrades.garden * 2;
    gains.meds += this.upgrades.infirmary;
    gains.ammo += this.upgrades.workshop * 2;
    if (this.morale > 70) {
      gains.food += 1;
      gains.mats += 1;
    }
    if (this.morale < 35) {
      gains.food = Math.floor(gains.food * 0.5);
      gains.mats = Math.floor(gains.mats * 0.5);
    }
    for (const k of Object.keys(gains)) {
      this.resources[k] = Math.min(99, this.resources[k] + gains[k]);
    }

    const need = alive.length;
    this.resources.food -= need;
    if (this.resources.food < 0) {
      this.resources.food = 0;
      this.morale = clamp(this.morale - 14, 0, 100);
      for (const s of alive) s.hp = Math.max(12, s.hp - 14);
      this.player.hp = Math.max(12, this.player.hp - 14);
      this.notify('The pantry is empty. The community is starving.', 'bad');
    } else {
      this.morale = clamp(this.morale + 3, 0, 100);
    }

    const heal = 10 + this.upgrades.infirmary * 10;
    for (const s of alive) {
      if (s !== this.active) s.hp = Math.min(100, s.hp + heal);
    }
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
    this.active.hp = this.player.hp;

    if (this.morale < 22 && alive.length > 1 && this.rng.chance(0.3)) {
      const candidates = alive.filter((s) => s !== this.active);
      if (candidates.length) {
        const quitter = candidates[this.rng.int(0, candidates.length - 1)];
        quitter.alive = false;
        quitter.departed = true;
        this.notify(`${quitter.name} left the community in the night.`, 'bad');
      }
    }

    this.baseMaxHp = 100 + this.upgrades.watchtower * 30;
    this.baseHp = this.baseMaxHp;
    this.baseBroken = false;

    const parts = [];
    for (const [k, v] of Object.entries(gains)) if (v) parts.push(`${v} ${k.toUpperCase()}`);
    this.notify(
      `Dawn. Consumed ${need} food${parts.length ? ` · produced ${parts.join(', ')}` : ''}.`,
      'good',
    );
    this.audio.dawn();
    this.updateHud(true);
    this.refreshBaseIfOpen();
  }

  // ---------------------------------------------------------------- upgrades

  buyUpgrade(id) {
    const up = UPGRADES.find((u) => u.id === id);
    if (!up) return;
    const level = this.upgrades[id];
    if (level >= up.max) return;
    const cost = up.costs[level];
    if (this.resources.mats < cost) {
      this.notify('Not enough materials.', 'warn');
      this.audio.ui();
      return;
    }
    this.resources.mats -= cost;
    this.upgrades[id]++;
    this.baseMaxHp = 100 + this.upgrades.watchtower * 30;
    if (id === 'watchtower') this.baseHp = Math.min(this.baseMaxHp, this.baseHp + 30);
    this.audio.recruit();
    this.notify(`${up.name} upgraded to level ${this.upgrades[id]}.`, 'good');
    this.renderBasePanel();
    this.updateHud(true);
  }

  switchSurvivor(index) {
    const s = this.roster[index];
    if (!s || !s.alive || index === this.activeIndex) return;
    if (dist(this.player.x, this.player.y, this.world.base.x, this.world.base.y) > this.world.base.radius + 14) {
      this.notify('Return to Ranger Station to take control of another survivor.', 'warn');
      return;
    }
    this.active.hp = this.player.hp;
    this.activeIndex = index;
    this.player.hp = Math.max(30, s.hp);
    this.player.stamina = 100;
    this.player.x = this.world.base.x;
    this.player.y = this.world.base.y + 44;
    this.player.invuln = 1.5;
    s.hp = this.player.hp;
    this.audio.recruit();
    this.notify(`You are now ${s.name}. ${s.trait}`, 'good');
    this.closeBase();
    this.updateHud(true);
  }

  // ----------------------------------------------------------------- helpers

  addParticle(x, y, vx, vy, life, color, size = 1) {
    if (this.particles.length > 420) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }

  addFloater(x, y, text, color) {
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({ x, y, text, color, t: 0, life: 0.95 });
  }

  addBlood(x, y, angle, r = 3) {
    if (this.decals.length > 150) this.decals.shift();
    const count = r > 8 ? 6 : 2;
    for (let i = 0; i < count; i++) {
      this.decals.push({
        x: x + this.rng.range(-r, r),
        y: y + this.rng.range(-r, r),
        r: this.rng.range(1.4, 3.2),
        a: this.rng.range(0.25, 0.55),
        angle,
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.t += dt;
      f.y -= 16 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
    for (const c of this.corpses) c.t -= dt;
    this.corpses = this.corpses.filter((c) => c.t > 0);
  }

  updateAmbient(dt) {
    const menu = this.state === 'menu';
    const night = menu ? 0.5 : nightAmount(this.hour);
    this.ambT = (this.ambT || 0) - dt;
    if (this.ambT <= 0) {
      this.ambT = night > 0.3 ? 0.16 : 0.5;
      const bx = this.cam.x;
      const by = this.cam.y;
      if (night > 0.25) {
        this.ambient.push({
          x: this.rng.range(bx - 20, bx + VIEW_W + 20),
          y: this.rng.range(by - 20, by + VIEW_H + 20),
          vx: this.rng.range(-4, 4),
          vy: this.rng.range(-6, -1),
          life: this.rng.range(2, 5),
          maxLife: 5,
          kind: 'firefly',
          phase: this.rng.range(0, TAU),
        });
      } else if (this.rng.chance(0.5)) {
        this.ambient.push({
          x: this.rng.range(bx - 20, bx + VIEW_W + 20),
          y: this.rng.range(by - 20, by + VIEW_H + 20),
          vx: this.rng.range(3, 12),
          vy: this.rng.range(-2, 2),
          life: this.rng.range(1.5, 3.5),
          maxLife: 3.5,
          kind: 'dust',
          phase: 0,
        });
      }
    }
    for (const a of this.ambient) {
      a.life -= dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
    }
    this.ambient = this.ambient.filter((a) => a.life > 0);
    if (this.ambient.length > 90) this.ambient.splice(0, this.ambient.length - 90);

    if (this.state === 'playing' && this.rng.chance(dt * 0.4)) {
      const zs = this.zombies.filter((z) => dist(z.x, z.y, this.player.x, this.player.y) < 260);
      if (zs.length) this.audio.growl();
    }
  }

  // -------------------------------------------------------------------- HUD

  updateHud(force) {
    if (this.state === 'menu') return;
    this.hudT -= 0.016;
    if (!force && this.hudT > 0) return;
    this.hudT = 0.1;
    const p = this.player;
    const s = this.active;
    this.el.survivorName.textContent = s.name.toUpperCase();
    this.el.survivorRole.textContent = s.role.toUpperCase();
    this.el.portrait.textContent = initials(s.name);
    this.el.hpFill.style.width = `${clamp((p.hp / p.maxHp) * 100, 0, 100)}%`;
    this.el.hpText.textContent = `${Math.max(0, Math.round(p.hp))}`;
    this.el.stamFill.style.width = `${clamp((p.stamina / p.maxStamina) * 100, 0, 100)}%`;
    this.el.equipText.textContent = 'MACHETE / PISTOL';
    this.el.medsText.textContent = `H MEDKIT · ${this.resources.meds}`;
    this.el.resFood.textContent = this.resources.food;
    this.el.resMeds.textContent = this.resources.meds;
    this.el.resAmmo.textContent = this.resources.ammo;
    this.el.resMats.textContent = this.resources.mats;
    const alive = this.roster.filter((r) => r.alive).length;
    this.el.popText.textContent = `${alive} / ${this.populationCap} SURVIVORS`;
    const moraleWord = this.morale > 70 ? 'HOPEFUL' : this.morale > 35 ? 'STRAINED' : 'BLEAK';
    this.el.moraleText.textContent = `MORALE ${Math.round(this.morale)} · ${moraleWord}`;
    this.el.dayText.textContent = `DAY ${this.day}`;
    this.el.timeText.textContent = fmtClock(this.hour);
    const phase = phaseName(this.hour);
    this.el.phaseText.textContent = phase;
    this.el.phaseText.classList.toggle('night', phase === 'NIGHT' || phase === 'DUSK');
    this.el.objectiveCount.textContent = `${this.stats.hearts} / ${HEART_TOTAL}`;
    if (this.stats.hearts >= HEART_TOTAL) this.el.objectiveText.textContent = 'THE TOWN IS FREE';
    else if (this.stats.hearts === 0 && this.stats.looted === 0)
      this.el.objectiveText.textContent = 'SCAVENGE · DESTROY THE PLAGUE HEARTS';
    else this.el.objectiveText.textContent = 'DESTROY THE PLAGUE HEARTS';
    const showBase = this.baseHp < this.baseMaxHp - 0.5 || this.raidActive;
    this.el.baseIntegrity.classList.toggle('hidden', !showBase);
    if (showBase) {
      this.el.baseHpFill.style.width = `${clamp((this.baseHp / this.baseMaxHp) * 100, 0, 100)}%`;
      this.el.baseHpText.textContent = Math.max(0, Math.round(this.baseHp));
    }
    drawMinimap(this);
  }

  notify(text, kind = '') {
    const div = document.createElement('div');
    div.className = `feed-item ${kind}`;
    div.textContent = text;
    this.el.feed.appendChild(div);
    while (this.el.feed.children.length > 5) this.el.feed.removeChild(this.el.feed.firstChild);
    const remove = () => {
      div.classList.add('out');
      setTimeout(() => div.remove(), 650);
    };
    const timer = setTimeout(remove, kind === 'bad' ? 6500 : 5200);
    div.addEventListener('click', () => {
      clearTimeout(timer);
      remove();
    });
  }

  refreshBestText() {
    let best = null;
    try {
      best = JSON.parse(localStorage.getItem('sod.best') || 'null');
    } catch {}
    if (!best) {
      this.el.bestText.textContent = 'NO RUNS RECORDED';
      return;
    }
    this.el.bestText.textContent = `BEST RUN · DAY ${best.days} · ${best.kills} KILLS · ${best.hearts}/${HEART_TOTAL} HEARTS`;
  }

  saveBest(victory) {
    const entry = {
      days: this.day,
      kills: this.stats.kills,
      hearts: this.stats.hearts,
      victory,
      score: this.stats.hearts * 1000 + this.stats.kills * 10 + this.day * 20 + (victory ? 5000 : 0),
    };
    let prev = null;
    try {
      prev = JSON.parse(localStorage.getItem('sod.best') || 'null');
    } catch {}
    if (!prev || entry.score > (prev.score || 0)) {
      try {
        localStorage.setItem('sod.best', JSON.stringify(entry));
      } catch {}
    }
    this.refreshBestText();
  }

  endGame(victory) {
    if (this.state === 'end') return;
    this.state = 'end';
    this.keys = {};
    this.mouse.l = false;
    this.mouse.r = false;
    this.channel = null;
    this.el.hud.classList.add('hidden');
    this.el.pauseScreen.classList.add('hidden');
    this.el.baseScreen.classList.add('hidden');
    this.el.endScreen.classList.remove('hidden');
    this.canvas.classList.add('menu-cursor');
    const alive = this.roster.filter((s) => s.alive);
    const s = this.active;
    this.el.endKicker.textContent = victory
      ? `DAY ${this.day} · DAWN BREAKS`
      : `DAY ${this.day} · THE TOWN KEEPS ITS DEAD`;
    this.el.endTitle.textContent = victory ? 'THE PLAGUE IS BROKEN' : 'THE COMMUNITY HAS FALLEN';
    this.el.endTitle.classList.toggle('defeat', !victory);
    this.el.endBlurb.textContent = victory
      ? `${s.name} watched the last plague heart collapse. The dead are still out there, but tonight the lights stay on at Ranger Station.`
      : `${s.name} fell, and no one was left to hold the door. The town is quiet again. Somewhere, a radio crackles with no answer.`;
    const rows = [
      [this.day, 'DAYS'],
      [this.stats.kills, 'KILLS'],
      [this.stats.looted, 'LOOTED'],
      [`${this.stats.hearts}/${HEART_TOTAL}`, 'HEARTS'],
      [alive.length, 'SURVIVORS'],
      [this.stats.deaths, 'DEATHS'],
    ];
    this.el.endStats.innerHTML = rows.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    this.saveBest(victory);
    if (victory) this.audio.victory();
    else this.audio.defeat();
  }

  // ----------------------------------------------------------------- base UI

  renderBasePanel() {
    const here = dist(this.player.x, this.player.y, this.world.base.x, this.world.base.y) <= this.world.base.radius + 14;
    this.el.baseLocText.textContent = here ? 'AT RANGER STATION' : 'IN THE FIELD';
    this.el.baseLocText.classList.toggle('here', here);
    this.el.baseLocText.classList.toggle('dead', !here);
    const alive = this.roster.filter((s) => s.alive).length;
    const rosterHtml = this.roster
      .map((s, i) => {
        const activeCls = i === this.activeIndex;
        const deadCls = !s.alive ? 'dead' : '';
        let btn;
        if (!s.alive) btn = '<button class="take-btn" disabled>—</button>';
        else if (activeCls) btn = '<button class="take-btn" disabled>ACTIVE</button>';
        else if (!here) btn = `<button class="take-btn" data-action="switch" data-index="${i}" disabled>AT BASE</button>`;
        else btn = `<button class="take-btn" data-action="switch" data-index="${i}">TAKE CONTROL</button>`;
        const status = !s.alive ? (s.departed ? 'LEFT' : 'FALLEN') : activeCls ? 'ACTIVE' : 'STATIONED';
        return `<div class="survivor-row-card ${activeCls ? 'active' : ''} ${deadCls}">
          <div class="avatar">${initials(s.name)}</div>
          <div class="s-info">
            <div class="s-name"><b>${s.name.toUpperCase()}</b><span class="s-role">${s.role.toUpperCase()}</span></div>
            <div class="s-trait">${s.trait}</div>
            <div class="s-bar"><i style="width:${s.alive ? clamp(s.hp, 0, 100) : 0}%"></i></div>
            <div class="s-hp">${status} · ${s.alive ? Math.round(s.hp) : 0} HP</div>
          </div>
          ${btn}
        </div>`;
      })
      .join('');

    const upHtml = UPGRADES.map((u) => {
      const lv = this.upgrades[u.id];
      const maxed = lv >= u.max;
      const cost = maxed ? null : u.costs[lv];
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="upgrade-card ${maxed ? 'maxed' : ''}">
        <div class="u-top"><span class="u-name">${u.name}</span><span class="pips">${pips}</span></div>
        <span class="u-cost">${maxed ? 'MAXED' : `${cost} MATS`}</span>
        <div class="u-desc">${u.desc}</div>
        <button class="u-btn" data-action="upgrade" data-id="${u.id}" ${maxed || this.resources.mats < cost ? 'disabled' : ''}>${maxed ? 'BUILT' : lv > 0 ? 'UPGRADE' : 'BUILD'}</button>
      </div>`;
    }).join('');

    this.el.baseContent.innerHTML = `
      <div class="base-stock">
        <span>FOOD <b>${this.resources.food}</b></span>
        <span>MEDS <b>${this.resources.meds}</b></span>
        <span>AMMO <b>${this.resources.ammo}</b></span>
        <span>MATS <b>${this.resources.mats}</b></span>
        <span>MORALE <b>${Math.round(this.morale)}</b></span>
        <span>HOME <b>${Math.round(this.baseHp)}/${this.baseMaxHp}</b></span>
      </div>
      <div class="base-column">
        <h3>SURVIVORS <b>${alive} / ${this.populationCap}</b></h3>
        <div class="roster">${rosterHtml}</div>
        <div class="base-tip">Traits work while survivors are stationed. Food is eaten at dawn; meds are used with H in the field.${here ? '' : ' Return to the station to switch survivors.'}</div>
      </div>
      <div class="base-column">
        <h3>FORTIFICATIONS <b>${this.resources.mats} MATS</b></h3>
        <div class="upgrades">${upHtml}</div>
        <div class="base-tip">Build a Garden for food, an Infirmary for meds, a Workshop for ammo, a Watchtower for defense, and Bunks to grow the community.</div>
      </div>
    `;
  }

  refreshBaseIfOpen() {
    if (this.state === 'base') this.renderBasePanel();
  }

  // ------------------------------------------------------------------ debug

  __debugState() {
    return {
      state: this.state,
      day: this.day,
      hour: Number(this.hour.toFixed(2)),
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y), hp: Math.round(this.player.hp) },
      zombies: this.zombies.length,
      hearts: this.heartList.filter((h) => h.alive).length,
      stats: { ...this.stats },
      resources: { ...this.resources },
      roster: this.roster.map((s) => ({ name: s.name, role: s.role, alive: s.alive, hp: Math.round(s.hp) })),
      upgrades: { ...this.upgrades },
      baseHp: Math.round(this.baseHp),
      lootRemaining: this.containers.filter((c) => !c.looted).length,
      rescues: this.rescues.filter((r) => !r.recruited).map((r) => r.name),
      errors: window.__sodErrors || [],
    };
  }

  __debugStart() {
    if (this.state === 'menu') this.beginRun();
  }

  __debugTeleport(x, y) {
    this.player.x = clamp(x, 20, WORLD_W - 20);
    this.player.y = clamp(y, 20, WORLD_H - 20);
    this.cam.x = clamp(this.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    this.cam.y = clamp(this.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
    this.updateHud(true);
    return this.__debugState();
  }

  __debugSetHour(h) {
    const delta = ((h - START_HOUR + 24) % 24) / 24 * DAY_LENGTH;
    this.time = delta;
    this.hour = h;
    this.updateHud(true);
    return this.__debugState();
  }

  __debugGive() {
    this.resources.food = 60;
    this.resources.meds = 20;
    this.resources.ammo = 60;
    this.resources.mats = 60;
    this.updateHud(true);
    return this.__debugState();
  }

  __debugOpenBase() {
    this.openBase();
    return this.__debugState();
  }

  __debugClear() {
    this.zombies = [];
    return this.__debugState();
  }

  __debugHeartPositions() {
    return this.heartList.map((h) => ({ x: Math.round(h.x), y: Math.round(h.y), alive: h.alive }));
  }
}
