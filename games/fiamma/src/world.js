// games/fiamma/src/world.js
'use strict';
// What the flame acts on: breakable objects (they live in the terrain mask too), drums and blasts, rising floods and the survivors.

function rectDistance(object, x, y) {
  const deltaX = Math.max(object.x - x, 0, x - (object.x + object.w)), deltaY = Math.max(object.y - y, 0, y - (object.y + object.h));
  return Math.hypot(deltaX, deltaY);
}

function destroyObject(object) {
  object.alive = false;
  object.hot = false;
  Terrain.fillRect(game.L.terrain, object.x, object.y, object.w, object.h, 0);
  const pieces = Math.min(8, 2 + Math.floor(object.w * object.h / 14));
  for (let i = 0; i < pieces; i++) {
    addParticle({ t: 'chunk', x: object.x + randomRange(0, object.w), y: object.y + randomRange(0, object.h), w: 2, h: 2, vx: randomRange(-1, 1), vy: randomRange(-1.5, 0), life: 90 });
  }
  if (object.kind === 'barrel') {
    game.pending.push({ x: object.x + object.w / 2, y: object.y + object.h / 2, radius: CONFIG.objects.barrelRadius, t: CONFIG.objects.chainDelay });
    return;
  }
  Sfx.play(object.kind === 'wood' ? 'burn' : 'melt');
}

// A blast breaks everything breakable inside its radius (concrete included), sets drums off and burns the survivors around.
function explode(x, y, radius) {
  const level = game.L, config = CONFIG.blast;
  game.shake = Math.max(game.shake, config.shake);
  addParticle({ t: 'ring', x, y, r: 4, life: 14 });
  for (let i = 0; i < 6; i++) addParticle({ t: 'smoke', x: x + randomRange(-radius / 2, radius / 2), y: y + randomRange(-radius / 3, radius / 3), r: 3, life: 70, vx: randomRange(-0.2, 0.2) });
  Sfx.play('blast');
  for (const object of level.objects) {
    if (object.alive && rectDistance(object, x, y) <= radius) destroyObject(object);
  }
  const reach = radius * config.burnFactor;
  for (const survivor of level.survivors) {
    if (survivor.state !== 'waiting' && survivor.state !== 'carried') continue;
    const distance = Math.hypot(survivor.x + survivor.w / 2 - x, survivor.y + survivor.h / 2 - y);
    if (distance < reach) survivor.burn += (1 - distance / reach) * config.burn;
  }
}

function updatePending() {
  for (let i = game.pending.length - 1; i >= 0; i--) {
    const blast = game.pending[i];
    if (--blast.t > 0) continue;
    game.pending.splice(i, 1);
    explode(blast.x, blast.y, blast.radius);
  }
}

// Objects absorb heat while the flame is next to them and give way once they have taken enough; away from it they cool down.
function updateObjects() {
  const flame = game.flame, config = CONFIG.objects, centerX = flameCenterX(), centerY = flameCenterY();
  for (const object of game.L.objects) {
    if (!object.alive || object.kind === 'concrete') continue;
    const rule = config[object.kind];
    const isNear = flame.out === 0 && flame.heat >= rule.minHeat && Math.abs(centerX - object.x) < 80 && rectDistance(object, centerX, centerY) <= config.reach;
    object.hot = isNear;
    if (!isNear) { object.progress = Math.max(0, object.progress - config.cooling); continue; }
    object.progress += flame.heat / rule.frames;
    if (game.frame % 6 === 0) addParticle({ t: 'px', x: centerX + (object.x > centerX ? 4 : -4), y: centerY + randomRange(-3, 3), vx: randomRange(-0.3, 0.3), vy: randomRange(-0.8, -0.2), g: 0.02, life: 18 });
    if (object.progress >= 1) destroyObject(object);
  }
}

// Floods rise slowly up to their cap.
function updateFloods() {
  for (const flood of game.L.floods) flood.level = Math.max(flood.cap, flood.level - flood.rise);
}

function loseSurvivor(survivor, reason) {
  survivor.state = 'dead';
  game.L.lost++;
  if (game.flame.carrying === survivor) game.flame.carrying = null;
  addParticle({ t: 'ring', x: survivor.x + survivor.w / 2, y: survivor.y + survivor.h / 2, r: 2, life: 16 });
  showMessage(reason, 110);
  Sfx.play('lost');
}

function updateSurvivors() {
  const level = game.L, flame = game.flame, config = CONFIG.survivor;
  for (const survivor of level.survivors) {
    if (survivor.state !== 'waiting' && survivor.state !== 'carried') continue;
    const flood = survivor.flood >= 0 ? level.floods[survivor.flood] : null;
    survivor.submerged = survivor.state === 'waiting' && !!flood && flood.level <= survivor.y + 1;
    if (survivor.state === 'waiting') survivor.time -= survivor.submerged ? 1 : config.dryRate;
    const distance = Math.hypot(survivor.x + survivor.w / 2 - flameCenterX(), survivor.y + survivor.h / 2 - flameCenterY());
    const burnBefore = survivor.burn;
    if (flame.heat > config.burnHeat && distance <= config.burnNear) survivor.burn += (flame.heat - config.burnHeat) * config.burnRate;
    if (flame.evaporating && flame.heat > config.steamHeat && distance <= config.steamRadius) survivor.burn += (flame.heat - config.steamHeat) * config.steamRate;
    if (burnBefore < 0.5 && survivor.burn >= 0.5) { showMessage('TROPPO CALORE: USTIONI!', 100); Sfx.play('burn'); }
    level.maxBurn = Math.max(level.maxBurn, survivor.burn);
    if (survivor.burn >= 1) loseSurvivor(survivor, 'UN SOPRAVVISSUTO SI E\' USTIONATO');
    else if (survivor.time <= 0) loseSurvivor(survivor, survivor.submerged ? 'UN SOPRAVVISSUTO E\' ANNEGATO' : 'UN SOPRAVVISSUTO NON CE L\'HA FATTA');
  }
}

const waitingSurvivors = () => game.L.survivors.filter(survivor => survivor.state === 'waiting');

// Lost as soon as saving more than half of them is out of reach.
function checkOutcome() {
  const level = game.L, possible = level.saved + waitingSurvivors().length + (game.flame.carrying ? 1 : 0);
  if (level.tutorial ? possible === 0 : possible * 2 <= level.total) gameOver('TROPPI SOPRAVVISSUTI PERSI');
}
