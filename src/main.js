import { Game } from './game.js';
import { AudioEngine } from './audio.js';

window.__sodErrors = [];
window.addEventListener('error', (event) => {
  window.__sodErrors.push(String(event.message || event.error || 'error'));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__sodErrors.push(String(event.reason || 'rejection'));
});

const audio = new AudioEngine();
const game = new Game(document.getElementById('game'), audio);

window.__sod = game;

document.addEventListener('pointerdown', () => audio.ensure(), { once: true });
