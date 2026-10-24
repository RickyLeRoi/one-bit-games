// games/fiamma/src/env.js
'use strict';
// Sparks, smoke and debris, the storm rain and the camera.

const addParticle = particle => Particles.add(game.parts, particle, CONFIG.maxParticles);

const PARTICLE_HOOKS = {
  solidAt: (x, y, width, height) => Terrain.hitsRect(game.L.terrain, x, y, width, height),
};

const windNow = () => Weather.wind(game.L.wind, game.time);

function updateEnv() {
  const level = game.L, flame = game.flame;
  if (flame.out === 0 && game.frame % 3 === 0) {
    addParticle({ t: 'px', x: flameCenterX() + randomRange(-2, 2), y: flameCenterY() - 5, vx: randomRange(-0.2, 0.2), vy: -0.4 - flame.heat * 0.6, g: 0, life: 14 + Math.floor(flame.heat * 20) });
  }
  if (level.rain) Weather.updateRain(game.rain, { wind: windNow(), camX: game.camX, width: CONFIG.W, height: CONFIG.H, waterY: () => Infinity, onHitWater() {}, fall: 5, fallSpread: 1, drift: 0.2 });
  Particles.update(game.parts, { wind: 0, gravity: 0.06, screenHeight: level.height, max: CONFIG.maxParticles, waterY: () => Infinity, solids: [], hooks: PARTICLE_HOOKS });
  game.shake = Camera.decayShake(game.shake);
}

function updateCamera() {
  const level = game.L;
  game.camX = Camera.follow(game.camX, flameCenterX() - CONFIG.W / 2 + game.flame.face * 24, level.width, CONFIG.W, 0.1);
  game.camY = Camera.follow(game.camY, flameCenterY() - CONFIG.H / 2, level.height, CONFIG.H, 0.1);
}
