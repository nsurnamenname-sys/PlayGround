export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('sod.muted') === '1';
    } catch {
      this.muted = false;
    }
    this.noise = null;
    this.ambient = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('sod.muted', this.muted ? '1' : '0');
    } catch {}
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 0.0001;
    out.gain.setTargetAtTime(0.16, t, 3);
    out.connect(this.master);

    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 46;
    const drone2 = this.ctx.createOscillator();
    drone2.type = 'triangle';
    drone2.frequency.value = 69.3;
    drone2.detune.value = -7;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 1.2;

    const dg = this.ctx.createGain();
    dg.gain.value = 0.32;
    drone.connect(lp);
    drone2.connect(lp);
    lp.connect(dg);
    dg.connect(out);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(dg.gain);

    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.035;
    wind.connect(bp);
    bp.connect(wg);
    wg.connect(out);

    const wLfo = this.ctx.createOscillator();
    wLfo.frequency.value = 0.045;
    const wLfoGain = this.ctx.createGain();
    wLfoGain.gain.value = 0.02;
    wLfo.connect(wLfoGain);
    wLfoGain.connect(wg.gain);

    drone.start(t);
    drone2.start(t);
    lfo.start(t);
    wind.start(t);
    wLfo.start(t);
    this.ambient = { out, drone, drone2, lfo, wind, wLfo };
  }

  setIntensity(v) {
    if (!this.ambient || !this.ctx) return;
    this.ambient.out.gain.setTargetAtTime(0.12 + v * 0.1, this.ctx.currentTime, 1.5);
  }

  env(node, t, attack, decay, peak = 0.2) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  tone(freq, dur, type = 'sine', peak = 0.12, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    this.env(o, t, 0.008, dur, peak);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur, freq, q, peak = 0.2, delay = 0) {
    if (!this.ctx || this.muted || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.35), t + dur);
    f.Q.value = q;
    src.connect(f);
    this.env(f, t, 0.004, dur, peak);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  shot() {
    this.burst(0.16, 1600, 0.8, 0.34);
    this.tone(120, 0.12, 'square', 0.1, 40);
  }

  melee() {
    this.burst(0.1, 900, 0.7, 0.14);
    this.tone(200, 0.08, 'triangle', 0.04, 120);
  }

  hit() {
    this.burst(0.09, 260, 1.2, 0.2);
    this.tone(80, 0.12, 'sine', 0.14, 45);
  }

  hurt() {
    this.tone(150, 0.25, 'sawtooth', 0.1, 60);
    this.burst(0.14, 400, 0.7, 0.12);
  }

  growl() {
    this.tone(65 + Math.random() * 20, 0.4, 'sawtooth', 0.022, 40);
  }

  loot() {
    this.tone(660, 0.09, 'triangle', 0.09);
    this.tone(990, 0.14, 'triangle', 0.07, null, 0.08);
  }

  heal() {
    this.tone(420, 0.16, 'sine', 0.07);
    this.tone(630, 0.2, 'sine', 0.06, null, 0.1);
  }

  ui() {
    this.tone(280, 0.05, 'square', 0.035, 200);
  }

  recruit() {
    this.tone(392, 0.16, 'triangle', 0.08);
    this.tone(494, 0.16, 'triangle', 0.07, null, 0.1);
    this.tone(659, 0.28, 'triangle', 0.08, null, 0.2);
  }

  heart() {
    this.tone(44, 0.6, 'sine', 0.18, 30);
    this.tone(66, 0.4, 'triangle', 0.04, 44);
  }

  purge() {
    this.burst(0.4, 500, 0.8, 0.2);
    this.tone(90, 0.4, 'sawtooth', 0.08, 30);
  }

  night() {
    this.tone(220, 1.6, 'sine', 0.05, 110);
    this.tone(164, 1.8, 'triangle', 0.035, 82, 0.2);
  }

  dawn() {
    this.tone(330, 0.9, 'sine', 0.06, 440);
    this.tone(440, 1.2, 'triangle', 0.05, 660, 0.2);
  }

  death() {
    this.tone(180, 1.4, 'sawtooth', 0.1, 55);
    this.burst(0.8, 200, 0.6, 0.12);
  }

  victory() {
    this.tone(392, 0.5, 'triangle', 0.08);
    this.tone(523, 0.5, 'triangle', 0.08, null, 0.2);
    this.tone(659, 1.4, 'triangle', 0.09, null, 0.4);
  }

  defeat() {
    this.tone(220, 1.5, 'sawtooth', 0.09, 66);
    this.tone(110, 2, 'sine', 0.1, 44, 0.2);
  }
}
