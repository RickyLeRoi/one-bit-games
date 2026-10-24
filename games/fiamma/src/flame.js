// games/fiamma/src/flame.js
'use strict';
// The flame master: flight, heat, the reserve of closed places, the charged blast, evaporation and carrying a survivor.
// Heat 0..1 sets how fast and how strongly the flame acts; the four looks of the flame are only a picture of it.

const NO_INPUT = Object.freeze({ hx: 0, up: 0, down: 0, heatUp: 0, heatDown: 0, charge: 0, grab: false });

function newFlame() {
  const config = CONFIG.flame;
  return {
    x: CONFIG.world.startX - config.w / 2, y: game.L.groundY - 50, w: config.w, h: config.h, vx: 0, vy: 0, face: 1,
    heat: config.startHeat, reserve: 1, empty: false, charge: 0, charging: false, notHotEnough: false,
    out: 0, carrying: null, evaporating: false,
  };
}

const flameCenterX = () => game.flame.x + game.flame.w / 2;
const flameCenterY = () => game.flame.y + game.flame.h / 2;
const heatStage = heat => CONFIG.flame.stages.filter(threshold => heat >= threshold).length;

function closedAt(x, y) {
  const level = game.L;
  if (level.closed) return true;
  return level.pockets.some(pocket => x >= pocket.x && x < pocket.x + pocket.w && y >= pocket.y && y < pocket.y + pocket.h);
}

function updateReserve(flame, closed) {
  const config = CONFIG.reserve;
  if (!closed) flame.reserve = Math.min(1, flame.reserve + config.rechargeOpen);
  else if (flame.heat <= config.coldHeat) flame.reserve = Math.min(1, flame.reserve + config.rechargeCold);
  else flame.reserve = Math.max(0, flame.reserve - config.drainBase - config.drainHeat * flame.heat * flame.heat);
  if (closed && flame.charging) flame.reserve = Math.max(0, flame.reserve - CONFIG.charge.cost);
  if (flame.reserve <= 0 && !flame.empty) {
    flame.empty = true;
    showMessage("ARIA FINITA: LA FIAMMA SI ABBASSA. ESCI ALL'APERTO", 150);
    Sfx.play('empty');
  }
  if (flame.empty) flame.heat = Math.min(flame.heat, config.emptyHeat);
  if (flame.empty && flame.reserve > config.resume) flame.empty = false;
}

// Holding charge stores energy (the flame moves slowly); letting go releases it as a blast in front of the flame.
function updateCharge(flame, input) {
  const config = CONFIG.charge;
  const hotEnough = flame.heat >= config.minHeat && !flame.empty;
  if (input.charge > 0 && hotEnough) {
    flame.charging = true;
    flame.charge = Math.min(1, flame.charge + config.rate);
    if (game.frame % 24 === 0) Sfx.play('charge');
    return;
  }
  if (input.charge > 0 && !flame.notHotEnough) { flame.notHotEnough = true; showMessage('SERVE PIU\' CALORE PER CARICARE', 90); }
  if (input.charge === 0) flame.notHotEnough = false;
  if (flame.charging && flame.charge >= config.minCharge) {
    explode(flameCenterX() + flame.face * 10, flameCenterY(), config.radiusMin + flame.charge * (config.radiusMax - config.radiusMin));
    game.used.blast = true;
  }
  flame.charging = false;
  flame.charge = 0;
}

function moveFlame(flame, input) {
  const config = CONFIG.flame, level = game.L;
  const speedLimit = config.slowSpeed + (config.fastSpeed - config.slowSpeed) * flame.heat;
  const target = speedLimit * (flame.carrying ? config.carrySpeed : 1) * (flame.charging ? CONFIG.charge.slow : 1);
  const cannotLift = (flame.carrying && flame.heat < config.carryMinHeat) || flame.empty;
  let desiredY = input.up || input.down ? (input.down - input.up) * target : config.hover;
  if (cannotLift) desiredY = Math.max(desiredY, config.sinkSpeed);
  flame.vx += (input.hx * target - flame.vx) * config.response;
  flame.vy += (desiredY - flame.vy) * config.response;
  if (!closedAt(flameCenterX(), flameCenterY())) flame.vx += Weather.wind(level.wind, game.time) * 0.02;
  if (input.hx) flame.face = Math.sign(input.hx);
  const hit = Terrain.moveRect(level.terrain, flame, flame.vx, flame.vy, 0);
  if (hit.hitX) flame.vx = 0;
  if (hit.hitY) flame.vy = 0;
  if (flame.y < 0) { flame.y = 0; if (flame.vy < 0) flame.vy = 0; }
}

// Touching the surface of the flood puts the flame out for a moment: it floats back up.
function checkWater(flame) {
  const config = CONFIG.flame;
  if (flame.out > 0) { flame.out--; flame.vy -= config.outRise; return; }
  for (const flood of game.L.floods) {
    const centerX = flameCenterX();
    if (centerX < flood.x || centerX > flood.x + flood.w || flame.y + flame.h * 0.75 < flood.level) continue;
    flame.out = config.outTime;
    flame.charging = false; flame.charge = 0;
    showMessage('FIAMMA SPENTA: STAI ALLA LARGA DALL\'ACQUA', 90);
    Sfx.play('out');
    for (let i = 0; i < 6; i++) addParticle({ t: 'smoke', x: centerX + randomRange(-4, 4), y: flood.level - 2, r: 2, life: 60 });
    return;
  }
}

// A flame just above a flood lowers its surface, faster the hotter it is.
function evaporate(flame) {
  const config = CONFIG.flood;
  flame.evaporating = false;
  if (flame.out > 0) return;
  const centerX = flameCenterX(), centerY = flameCenterY();
  for (const flood of game.L.floods) {
    if (centerX < flood.x || centerX > flood.x + flood.w || centerY > flood.level || flood.level - centerY > config.reach || flood.level >= flood.bottom) continue;
    flood.level = Math.min(flood.bottom, flood.level + config.evaporate + flame.heat * config.evaporateHeat);
    flame.evaporating = true;
    game.used.evaporate = true;
    if (game.frame % 5 === 0) addParticle({ t: 'smoke', x: centerX + randomRange(-6, 6), y: flood.level - 2, r: 2, life: 50, vx: randomRange(-0.1, 0.1) });
    if (game.frame % 30 === 0) Sfx.play('steam');
  }
}

function toggleCarry(flame) {
  const level = game.L, config = CONFIG.survivor;
  if (flame.carrying) {
    const survivor = flame.carrying;
    survivor.state = 'waiting';
    survivor.x = flameCenterX() - survivor.w / 2;
    survivor.y = Terrain.surfaceY(level.terrain, flameCenterX(), flameCenterY()) - survivor.h;
    flame.carrying = null;
    Sfx.play('drop');
    return;
  }
  let nearest = null, nearestDistance = config.grabRadius;
  for (const survivor of level.survivors) {
    if (survivor.state !== 'waiting') continue;
    const distance = Math.hypot(survivor.x + survivor.w / 2 - flameCenterX(), survivor.y + survivor.h / 2 - flameCenterY());
    if (distance <= nearestDistance) { nearest = survivor; nearestDistance = distance; }
  }
  if (!nearest) return;
  nearest.state = 'carried';
  flame.carrying = nearest;
  Sfx.play('grab');
}

// At the truck everybody carried is saved.
function deliverAtTruck(flame) {
  const rescue = CONFIG.rescue, level = game.L;
  if (!flame.carrying || flameCenterX() < rescue.x || flameCenterX() > rescue.x + rescue.width || flameCenterY() < level.groundY - 70) return;
  flame.carrying.state = 'saved';
  flame.carrying = null;
  level.saved++;
  game.score += CONFIG.score.saved;
  showMessage('SALVATO!', 80);
  Sfx.play('saved');
}

function updateFlame(input) {
  const flame = game.flame, config = CONFIG.flame;
  if (input.hx || input.up || input.down) game.used.move = true;
  if (flame.out > 0) {
    checkWater(flame);
    moveFlame(flame, NO_INPUT);
    flame.evaporating = false;
    return;
  }
  const heatInput = input.heatUp - input.heatDown;
  if (heatInput) { flame.heat = clamp(flame.heat + heatInput * config.heatRate, config.minHeat, 1); game.used.heat = true; }
  updateReserve(flame, closedAt(flameCenterX(), flameCenterY()));
  updateCharge(flame, input);
  moveFlame(flame, input);
  if (input.grab) toggleCarry(flame);
  checkWater(flame);
  evaporate(flame);
  deliverAtTruck(flame);
  const carried = flame.carrying;
  if (carried) { carried.x = flameCenterX() - carried.w / 2; carried.y = flameCenterY() + 3; }
}
