#!/usr/bin/env node
// games/fiamma/test/run.js
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('./helpers');
const { playLevel, rockGrid, planGrid, findPath } = require('./autopilot');

const tests = [];
const test = (name, testBody) => tests.push({ name, fn: testBody });
function assert(condition, message) { if (!condition) throw new Error(message); }
const near = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;

// A running level (1, the storm, unless stated) without wind, so that movements are repeatable.
function setup(levelNumber = 1) {
  const harness = boot({ seededMath: 1, skipRender: true });
  const game = harness.play(harness.hook.levelSpec(levelNumber));
  game.L.wind = 0;
  return { harness, game, hook: harness.hook };
}
// Puts the flame at the centre (x, y), still.
function place(game, x, y) {
  const flame = game.flame;
  flame.x = x - flame.w / 2; flame.y = y - flame.h / 2; flame.vx = 0; flame.vy = 0;
}
// Runs `frames` frames with the keys held; with a position the flame is put back there before every frame.
function run(harness, game, frames, keys = [], position = null) {
  for (const code of keys) harness.keyDown(code);
  for (let i = 0; i < frames; i++) {
    if (position) place(game, position[0], position[1]);
    harness.tick();
  }
  for (const code of keys) harness.keyUp(code);
}
// A breakable object added by hand (also in the terrain mask, like the level generator does).
function addObject(hook, game, kind, x, y, width, height) {
  hook.Terrain.fillRect(game.L.terrain, x, y, width, height, hook.CONFIG.material[kind]);
  const object = { kind, x, y, w: width, h: height, progress: 0, alive: true, hot: false };
  game.L.objects.push(object);
  return object;
}
const survivorCenter = survivor => [survivor.x + survivor.w / 2, survivor.y + survivor.h / 2];

test('livelli 1-30 e addestramento: sopravvissuti raggiungibili aprendo gli ostacoli, fuori dalla roccia, numeri coerenti', () => {
  const { hook } = setup();
  const specs = [hook.tutorialSpec(), ...Array.from({ length: 30 }, (_, i) => hook.levelSpec(i + 1))];
  let checked = 0;
  for (const spec of specs) {
    hook.startLevel(spec, 0);
    const level = hook.game.L, label = spec.tutorial ? 'addestramento' : 'lv' + spec.n;
    const grid = planGrid(hook, rockGrid(hook));
    assert(level.total >= 1 && level.total <= hook.CONFIG.max, label + ': sopravvissuti ' + level.total);
    for (const survivor of level.survivors) {
      const [x, y] = survivorCenter(survivor), flood = survivor.flood >= 0 ? level.floods[survivor.flood] : null;
      const [goalX, goalY] = flood ? [flood.x + flood.w / 2, flood.level - 9] : [x, y];
      assert(findPath(grid, hook.flameCenterX(), hook.flameCenterY(), goalX, goalY), label + ': sopravvissuto irraggiungibile a ' + survivor.x + ',' + survivor.y);
      assert(!hook.Terrain.isSolid(level.terrain, x, y), label + ': sopravvissuto dentro la roccia');
      assert(survivor.time > 0, label + ': tempo ' + survivor.time);
      checked++;
    }
  }
  return checked + ' sopravvissuti controllati';
});

test('livelli: stesso seme, stesso mondo; giro e scenario scelgono i materiali (il cemento arriva con i giri)', () => {
  const { hook } = setup();
  const describe = spec => { hook.startLevel(spec, 0); return JSON.stringify(hook.game.L.objects.map(object => [object.kind, object.x, object.y])) + hook.game.L.survivors.map(survivor => survivor.x + ',' + survivor.y).join(';'); };
  assert(describe(hook.levelSpec(5)) === describe(hook.levelSpec(5)), 'il livello 5 cambia da una generazione all altra');
  assert(describe(hook.dailySpec('2026-10-13')) === describe(hook.dailySpec('2026-10-13')), 'la sfida del giorno cambia');
  assert(describe(hook.dailySpec('2026-10-13')) !== describe(hook.dailySpec('2026-10-14')), 'giorni diversi, stesso mondo');
  hook.startLevel(hook.levelSpec(1), 0);
  assert(!hook.game.L.objects.some(object => object.kind === 'concrete' || object.kind === 'beam'), 'travi o cemento gia al livello 1 (tempesta)');
  hook.startLevel(hook.levelSpec(3), 0);
  assert(hook.game.L.objects.some(object => object.kind === 'concrete'), 'niente cemento nel terremoto');
  assert(hook.game.L.objects.filter(object => object.kind === 'barrel').length >= 2, 'niente bidoni vicino al cemento');
  hook.startLevel(hook.levelSpec(2), 0);
  assert(hook.game.L.closed && hook.game.L.ceiling, 'il naufragio non e un luogo chiuso');
  assert(hook.game.L.objects.some(object => object.barrier), 'niente barriera nel naufragio');
  hook.startLevel(hook.levelSpec(1), 0);
  assert(!hook.game.L.closed && hook.game.L.rain, 'la tempesta e un luogo chiuso o senza pioggia');
});

test('volo: la fiamma galleggia piano, sale e scende con le frecce, la velocita massima cresce con il calore', () => {
  const { harness, game, hook } = setup();
  const flame = game.flame, config = hook.CONFIG.flame;
  place(game, 300, 100);
  run(harness, game, 30);
  assert(flame.y > 100 - 4 + 2 && flame.y < 100 - 4 + 8, 'il galleggiamento non e lento: y ' + flame.y.toFixed(1));
  place(game, 300, 120);
  run(harness, game, 40, ['ArrowUp']);
  assert(flame.y < 120 - 4 - 15, 'ArrowUp non fa salire: y ' + flame.y.toFixed(1));
  const topSpeed = heat => {
    place(game, 150, 80); flame.heat = heat; flame.reserve = 1;
    run(harness, game, 90, ['ArrowRight']);
    return flame.vx;
  };
  const slow = topSpeed(0.1), fast = topSpeed(1);
  assert(near(slow, config.slowSpeed + (config.fastSpeed - config.slowSpeed) * 0.1, 0.1), 'velocita a calore 0,1: ' + slow.toFixed(2));
  assert(near(fast, config.fastSpeed, 0.1), 'velocita a calore 1: ' + fast.toFixed(2));
  place(game, 300, 2); flame.vy = -2;
  run(harness, game, 20, ['ArrowUp']);
  assert(flame.y >= 0, 'esce dall alto del mondo: y ' + flame.y);
});

test('pareti e terreno: la fiamma non li attraversa, nemmeno quelli sottili', () => {
  const { harness, game, hook } = setup();
  hook.Terrain.fillRect(game.L.terrain, 400, 20, 2, 150, hook.CONFIG.material.rock);
  place(game, 360, 100); game.flame.heat = 1;
  run(harness, game, 90, ['ArrowRight']);
  assert(game.flame.x + game.flame.w <= 400.01, 'ha attraversato la parete sottile: ' + (game.flame.x + game.flame.w).toFixed(1));
  place(game, 300, 100);
  run(harness, game, 300, ['ArrowDown']);
  assert(game.flame.y + game.flame.h <= game.L.groundY + 0.01, 'e finita nel terreno: ' + (game.flame.y + game.flame.h).toFixed(1));
});

test('calore: X e Z lo alzano e lo abbassano entro i limiti; quattro stadi alle soglie', () => {
  const { harness, game, hook } = setup();
  const flame = game.flame, config = hook.CONFIG.flame;
  place(game, 300, 100); flame.heat = 0.4;
  run(harness, game, 10, ['KeyX']);
  assert(near(flame.heat, 0.4 + 10 * config.heatRate, 0.02), 'X: ' + flame.heat.toFixed(3));
  run(harness, game, 200, ['KeyX']);
  assert(flame.heat === 1, 'X oltre il massimo: ' + flame.heat);
  run(harness, game, 200, ['KeyZ']);
  assert(near(flame.heat, config.minHeat, 1e-9), 'Z sotto il minimo: ' + flame.heat);
  assert(game.used.heat, 'used.heat non registrato');
  const stages = [0.1, 0.24, 0.25, 0.49, 0.5, 0.74, 0.75, 1].map(hook.heatStage);
  assert(JSON.stringify(stages) === '[0,0,1,1,2,2,3,3]', 'stadi: ' + stages);
});

test('riserva: all aperto e infinita; nei luoghi chiusi si consuma con il calore, si ricarica a calore basso, a zero la fiamma si abbassa e non sale', () => {
  const open = setup(1), closed = setup(2);
  open.game.flame.reserve = 0.4; place(open.game, 300, 100);
  open.harness.tick(60);
  assert(open.game.flame.reserve === 1, 'all aperto non si ricarica: ' + open.game.flame.reserve);
  const { harness, game, hook } = closed, flame = game.flame, config = hook.CONFIG.reserve;
  assert(hook.closedAt(hook.flameCenterX(), hook.flameCenterY()), 'il naufragio non e chiuso');
  flame.heat = 0.8; flame.reserve = 1;
  run(harness, game, 100, [], [60, 100]);
  const expected = 100 * (config.drainBase + config.drainHeat * 0.64);
  assert(near(1 - flame.reserve, expected, 0.02), 'consumo a calore 0,8: ' + (1 - flame.reserve).toFixed(3) + ' atteso ' + expected.toFixed(3));
  flame.heat = 0.1; flame.reserve = 0.3;
  run(harness, game, 100, [], [60, 100]);
  assert(near(flame.reserve, 0.3 + 100 * config.rechargeCold, 0.01), 'ricarica a freddo: ' + flame.reserve.toFixed(3));
  flame.heat = 0.9; flame.reserve = 0.0005;
  run(harness, game, 20, [], [60, 100]);
  assert(flame.empty && flame.heat <= config.emptyHeat + 1e-9, 'a riserva vuota il calore non scende: ' + flame.heat);
  place(game, 60, 100);
  run(harness, game, 30, ['ArrowUp', 'KeyX']);
  assert(flame.empty && flame.heat <= config.emptyHeat + 1e-9 && flame.y > 100 - 4, 'a riserva vuota sale o si scalda: y ' + flame.y.toFixed(1) + ' calore ' + flame.heat.toFixed(2));
  run(harness, game, 100, [], [60, 100]);
  assert(!flame.empty && flame.reserve > config.resume, 'non riparte dopo la ricarica: ' + flame.reserve.toFixed(2));
});

test('camere: dentro una camera la riserva si consuma anche all aperto', () => {
  const { harness, game, hook } = setup(1);
  const pocket = game.L.pockets[0], flame = game.flame;
  const insideX = pocket.x + pocket.w / 2, insideY = pocket.y + pocket.h / 2;
  assert(hook.closedAt(insideX, insideY) && !hook.closedAt(insideX, pocket.y - 30), 'closedAt non riconosce la camera');
  flame.heat = 0.8; flame.reserve = 1;
  run(harness, game, 60, [], [insideX, insideY]);
  assert(flame.reserve < 1, 'nessun consumo in camera');
});

test('oggetti: ognuno vuole il suo calore e il suo tempo (legno, cavo, trave); il cemento non si scalda; lontano si raffredda', () => {
  const { harness, game, hook } = setup();
  const config = hook.CONFIG.objects, flame = game.flame;
  // Burns a new object next to the flame for the given frame counts and reports whether it was still there after each one.
  const burn = (kind, heat, ...frameCounts) => {
    const object = addObject(hook, game, kind, 306, 90, 3, 20);
    flame.heat = heat;
    const states = frameCounts.map(frames => { run(harness, game, frames, [], [300, 100]); return { alive: object.alive, progress: object.progress }; });
    if (object.alive) { object.alive = false; hook.Terrain.fillRect(game.L.terrain, 306, 90, 3, 20, 0); }
    return states;
  };
  const wood = burn('wood', 0.3, 50, 30);
  assert(wood[0].alive && !wood[1].alive, 'legno a calore 0,3: tempo previsto ' + (config.wood.frames / 0.3).toFixed(0) + ' frame, progresso ' + wood[0].progress.toFixed(2));
  assert(burn('cable', 0.2, 300)[0].alive, 'il cavo cede a calore 0,2 (minimo ' + config.cable.minHeat + ')');
  const cable = burn('cable', 0.5, 30, 40);
  assert(cable[0].alive && !cable[1].alive, 'cavo a calore 0,5: tempo previsto ' + (config.cable.frames / 0.5).toFixed(0) + ' frame');
  assert(burn('beam', 0.45, 400)[0].alive, 'la trave cede a calore 0,45');
  const beam = burn('beam', 0.6, 100, 40);
  assert(beam[0].alive && beam[0].progress > 0.7 && !beam[1].alive, 'la trave a calore 0,6 deve essere lenta: progresso ' + beam[0].progress.toFixed(2));
  assert(burn('concrete', 1, 400)[0].alive, 'il cemento si e scaldato');
  const half = addObject(hook, game, 'beam', 306, 90, 3, 20);
  flame.heat = 0.8;
  run(harness, game, 30, [], [300, 100]);
  const progress = half.progress;
  run(harness, game, 60, [], [300, 40]);
  assert(progress > 0 && half.progress < progress, 'lontano dalla fiamma non si raffredda: ' + progress.toFixed(3) + ' -> ' + half.progress.toFixed(3));
  half.alive = false; hook.Terrain.fillRect(game.L.terrain, 306, 90, 3, 20, 0);
  const farAway = addObject(hook, game, 'wood', 306, 90, 3, 20);
  flame.heat = 1;
  run(harness, game, 200, [], [300, 60]);
  assert(farAway.alive, 'brucia senza che la fiamma sia vicina');
});

test('carica: serve calore 0,5, rallenta; al rilascio il colpo rompe il cemento nel raggio, e il raggio cresce con la carica', () => {
  const { harness, game, hook } = setup();
  const flame = game.flame, config = hook.CONFIG.charge;
  place(game, 300, 100); flame.heat = 0.3; flame.face = 1;
  run(harness, game, 30, ['KeyC']);
  assert(flame.charge === 0 && !flame.charging, 'carica a calore basso: ' + flame.charge);
  flame.heat = 0.8; place(game, 300, 100);
  run(harness, game, 60, ['KeyC']);
  harness.tick();
  assert(near(flame.charge, 0, 0.001) && game.used.blast, 'al rilascio la carica non e stata usata: ' + flame.charge);
  const trial = (frames, distances) => {
    const walls = distances.map(distance => addObject(hook, game, 'concrete', 310 + distance, 60, 3, 80));
    flame.heat = 0.8; flame.face = 1; flame.reserve = 1;
    run(harness, game, frames, ['KeyC'], [300, 100]);
    harness.tick();
    return walls.map(wall => !wall.alive);
  };
  const small = trial(30, [8, 40]);
  assert(small[0] && !small[1], 'carica piccola: vicino ' + small[0] + ', lontano ' + small[1] + ' (raggio ' + (config.radiusMin + 0.18 * (config.radiusMax - config.radiusMin)).toFixed(0) + ')');
  const full = trial(200, [52, 70]);
  assert(full[0] && !full[1], 'carica piena: ' + full);
  place(game, 300, 100); flame.heat = 0.8; game.flame.charge = 0;
  const speedOf = keys => { place(game, 150, 80); run(harness, game, 60, keys); return flame.vx; };
  assert(speedOf(['ArrowRight', 'KeyC']) < speedOf(['ArrowRight']) * 0.7, 'caricando non rallenta');
});

test('carica: in un luogo chiuso costa riserva, all aperto no', () => {
  const closed = setup(2), open = setup(1);
  for (const { harness, game } of [closed, open]) { game.flame.heat = 0.6; game.flame.reserve = 1; run(harness, game, 80, ['KeyC'], [60, 100]); }
  const base = setup(2);
  base.game.flame.heat = 0.6; base.game.flame.reserve = 1; run(base.harness, base.game, 80, [], [60, 100]);
  assert(closed.game.flame.reserve < base.game.flame.reserve - 0.05, 'caricare non costa riserva al chiuso: ' + closed.game.flame.reserve.toFixed(3) + ' contro ' + base.game.flame.reserve.toFixed(3));
  assert(open.game.flame.reserve === 1, 'all aperto la carica consuma: ' + open.game.flame.reserve);
});

test('bidoni: a calore 0,75 scoppiano dopo il loro tempo, a meno no; la reazione a catena rompe il cemento e brucia chi e vicino', () => {
  const { harness, game, hook } = setup();
  const flame = game.flame;
  const cold = addObject(hook, game, 'barrel', 306, 92, 6, 8);
  flame.heat = 0.7;
  run(harness, game, 200, [], [300, 100]);
  assert(cold.alive, 'il bidone scoppia a calore 0,7');
  cold.alive = false; hook.Terrain.fillRect(game.L.terrain, 306, 92, 6, 8, 0);
  const first = addObject(hook, game, 'barrel', 306, 92, 6, 8);
  const second = addObject(hook, game, 'barrel', 324, 92, 6, 8);
  const wall = addObject(hook, game, 'concrete', 340, 60, 4, 80);
  const farWall = addObject(hook, game, 'concrete', 420, 60, 4, 80);
  const survivor = game.L.survivors[0]; survivor.x = 332; survivor.y = 92; survivor.state = 'waiting'; survivor.burn = 0;
  flame.heat = 0.9;
  run(harness, game, 60, [], [300, 100]);
  assert(!first.alive && game.pending.length + (second.alive ? 0 : 1) > 0, 'il bidone non scoppia a calore 0,9');
  run(harness, game, 60, [], [300, 40]);
  assert(!second.alive, 'niente reazione a catena sul secondo bidone');
  assert(!wall.alive && farWall.alive, 'cemento: vicino ' + !wall.alive + ', lontano ' + !farWall.alive);
  assert(survivor.burn > 0.1, 'il sopravvissuto vicino non si ustiona: ' + survivor.burn.toFixed(2));
});

test('esplosioni: bruciano i sopravvissuti entro il raggio, di piu al centro, e nessuno fuori', () => {
  const { game, hook } = setup();
  const [first, second, third] = game.L.survivors;
  const burnAt = (survivor, distance) => {
    survivor.state = 'waiting'; survivor.burn = 0; survivor.x = 300 + distance; survivor.y = 100;
    hook.explode(300, 104, 40);
    return survivor.burn;
  };
  const centre = burnAt(first, 0), edge = burnAt(second, 30), outside = burnAt(third, 60);
  assert(centre > edge && edge > 0 && outside === 0, 'ustioni centro ' + centre.toFixed(2) + ' bordo ' + edge.toFixed(2) + ' fuori ' + outside.toFixed(2));
});

test('acqua: la fiamma si spegne a contatto, resta spenta per un po e poi riparte; sopra il pelo lo abbassa, piu in fretta se e calda', () => {
  const { harness, game, hook } = setup();
  const flame = game.flame, flood = game.L.floods[0], centerX = flood.x + flood.w / 2;
  flame.heat = 0.5;
  place(game, centerX, flood.level + 6);
  harness.tick();
  assert(flame.out > 0 && flame.heat === 0.5, 'la fiamma non si spegne nell acqua: out ' + flame.out);
  const outFor = flame.out;
  harness.tick(outFor + 20);
  assert(flame.out === 0 || flame.out < outFor, 'la fiamma non riparte');
  const lowered = heat => {
    flood.level = flood.cap + 12; flame.heat = heat; flame.out = 0;
    const before = flood.level;
    for (let i = 0; i < 60; i++) { place(game, centerX, flood.level - 8); harness.tick(); }
    return flood.level - before;
  };
  const cool = lowered(0.2), hot = lowered(0.9);
  assert(cool > 3 && hot > cool * 2, 'evaporazione a calore 0,2: ' + cool.toFixed(1) + ' px, a 0,9: ' + hot.toFixed(1) + ' px');
  assert(game.used.evaporate, 'used.evaporate non registrato');
  flood.level = flood.cap + 12;
  const before = flood.level;
  run(harness, game, 120, [], [40, 40]);
  assert(flood.level < before && near(before - flood.level, flood.rise * 120, 0.2), 'l acqua non sale come previsto: ' + (before - flood.level).toFixed(2));
  assert(flood.level >= flood.cap, 'l acqua supera il tetto');
});

test('sopravvissuti: sott acqua perdono un frame al frame, all asciutto un quinto; a zero muoiono (annegato o sfinito)', () => {
  const { harness, game, hook } = setup();
  const basin = game.L.survivors.find(survivor => survivor.flood >= 0), dry = game.L.survivors.find(survivor => survivor.flood < 0);
  const flood = game.L.floods[basin.flood];
  flood.level = basin.y - 10; place(game, 40, 40);
  const basinTime = basin.time, dryTime = dry.time;
  harness.tick(60);
  assert(basin.submerged && near(basinTime - basin.time, 60, 0.5), 'sott acqua: ' + (basinTime - basin.time).toFixed(1));
  assert(!dry.submerged && near(dryTime - dry.time, 60 * hook.CONFIG.survivor.dryRate, 0.5), 'all asciutto: ' + (dryTime - dry.time).toFixed(1));
  flood.rise = 0; basin.time = 3;
  harness.tick(10);
  assert(basin.state === 'dead' && game.L.lost === 1 && /ANNEGATO/.test(game.msg), 'non muore annegato: ' + basin.state + ' ' + game.msg);
  dry.time = 2;
  harness.tick(20);
  assert(dry.state === 'dead' && /NON CE L'HA FATTA/.test(game.msg), 'non muore sfinito: ' + dry.state + ' ' + game.msg);
});

test('prendere: Spazio raccoglie solo entro il raggio, di nuovo lo posa a terra; carico, la fiamma e piu lenta e sotto 0,35 non sale', () => {
  const { harness, game, hook } = setup();
  const flame = game.flame, survivor = game.L.survivors[0], [x, y] = survivorCenter(survivor);
  place(game, x + 40, y - 30);
  harness.tap('Space');
  assert(!flame.carrying, 'raccoglie da lontano');
  place(game, x + 5, y - 3);
  harness.tap('Space');
  assert(flame.carrying === survivor && survivor.state === 'carried', 'non raccoglie da vicino');
  place(game, 150, 80); flame.heat = 0.5;
  run(harness, game, 90, ['ArrowRight']);
  assert(flame.vx < hook.CONFIG.flame.slowSpeed + (hook.CONFIG.flame.fastSpeed - hook.CONFIG.flame.slowSpeed) * 0.5 * 0.85, 'carico non rallenta: ' + flame.vx.toFixed(2));
  assert(near(survivor.x + survivor.w / 2, hook.flameCenterX(), 1), 'il sopravvissuto non segue la fiamma');
  place(game, 300, 100); flame.heat = 0.2;
  run(harness, game, 60, ['ArrowUp']);
  assert(flame.y > 100 - 4, 'a calore 0,2 con un sopravvissuto sale: y ' + flame.y.toFixed(1));
  place(game, 300, 100); flame.heat = 0.5;
  run(harness, game, 40, ['ArrowUp']);
  assert(flame.y < 100 - 4 - 10, 'a calore 0,5 con un sopravvissuto non sale: y ' + flame.y.toFixed(1));
  harness.tap('Space');
  assert(!flame.carrying && survivor.state === 'waiting' && hook.Terrain.isSolid(game.L.terrain, survivor.x + 2, survivor.y + survivor.h), 'non lo posa a terra: ' + survivor.state);
});

test('camion: consegnare un sopravvissuto lo salva, da punti e solo vicino al camion', () => {
  const { harness, game, hook } = setup();
  const flame = game.flame, survivor = game.L.survivors[0];
  survivor.state = 'carried'; flame.carrying = survivor;
  place(game, 200, game.L.groundY - 20);
  harness.tick(3);
  assert(flame.carrying === survivor && game.L.saved === 0, 'consegna lontano dal camion');
  place(game, hook.CONFIG.rescue.x + 20, game.L.groundY - 20);
  harness.tick(3);
  assert(survivor.state === 'saved' && game.L.saved === 1 && game.score === hook.CONFIG.score.saved && !flame.carrying, 'non salvato: ' + survivor.state + ' punti ' + game.score);
  assert(game.L.survivors.filter(other => other.state === 'waiting').length === 2, 'altri cambiati');
});

test('ustioni: oltre calore 0,6 vicino a un sopravvissuto lo ustiona (anche in braccio), il vapore a calore alto pure; muore a 1', () => {
  const { harness, game, hook } = setup();
  const flame = game.flame, config = hook.CONFIG.survivor, survivor = game.L.survivors[0], [x, y] = survivorCenter(survivor);
  flame.heat = 0.55;
  run(harness, game, 100, [], [x + 8, y - 8]);
  assert(survivor.burn === 0, 'si ustiona a calore 0,55: ' + survivor.burn);
  flame.heat = 0.9;
  run(harness, game, 100, [], [x + 8, y - 8]);
  assert(near(survivor.burn, 100 * (0.9 - config.burnHeat) * config.burnRate, 0.03), 'ustione a calore 0,9: ' + survivor.burn.toFixed(3));
  const other = game.L.survivors.find(candidate => candidate.flood >= 0), flood = game.L.floods[other.flood];
  other.burn = 0; flood.level = other.y - 2;
  run(harness, game, 80, [], [other.x + 3, flood.level - 8]);
  assert(flame.evaporating === true || other.burn > 0, 'niente vapore');
  assert(other.burn > 0, 'il vapore caldo non ustiona: ' + other.burn);
  survivor.burn = 0.999;
  run(harness, game, 20, [], [x + 8, y - 8]);
  assert(survivor.state === 'dead' && /USTIONATO/.test(game.msg), 'non muore ustionato: ' + survivor.state);
});

test('esiti: vince con piu della meta salvata, tre stelle solo con tutti salvati e senza forti ustioni, perde con troppi persi', () => {
  const finish = (levelNumber, outcome, maxBurn = 0) => {
    const { harness, game } = setup(levelNumber);
    game.L.survivors.forEach((survivor, i) => { survivor.state = outcome[i]; });
    game.L.saved = outcome.filter(state => state === 'saved').length;
    game.L.lost = outcome.filter(state => state === 'dead').length;
    game.L.maxBurn = maxBurn;
    harness.tick(120);
    return game;
  };
  const perfect = finish(1, ['saved', 'saved', 'saved']);
  assert(perfect.state === 'done' && perfect.result === 'win' && perfect.stars === 3 && perfect.score === 250, 'tutti salvati: ' + perfect.state + ' ' + perfect.stars + ' stelle, ' + perfect.score);
  const burned = finish(1, ['saved', 'saved', 'saved'], 0.6);
  assert(burned.stars === 2, 'ustioni forti: ' + burned.stars + ' stelle');
  const most = finish(4, ['saved', 'saved', 'saved', 'dead']);
  assert(most.result === 'win' && most.stars === 2, '3 su 4: ' + most.result + ' ' + most.stars);
  const half = finish(1, ['saved', 'dead', 'dead']);
  assert(half.state === 'over' && /TROPPI/.test(half.overReason), 'meta o meno: ' + half.state);
});

test('addestramento: i passi avanzano da soli con le azioni, in qualunque ordine, e si puo saltare', () => {
  const harness = boot({ seededMath: 1, skipRender: true });
  const game = harness.play(harness.hook.tutorialSpec());
  assert(game.tut && game.tut.step === 0, 'passo iniziale ' + (game.tut && game.tut.step));
  run(harness, game, 20, ['ArrowRight']);
  assert(game.tut.step >= 1, 'muoversi non avanza');
  run(harness, game, 5, ['KeyX']);
  assert(game.tut.step >= 2, 'cambiare calore non avanza');
  harness.keyDown('KeyN'); harness.tick(); harness.keyUp('KeyN');
  assert(!game.L.tutorial && game.L.n === 1, 'N non salta l addestramento: livello ' + game.L.n);
});

test('comandi: tastiera, gamepad (R1/L1/B, levetta) e pulsanti touch muovono, scaldano e caricano', () => {
  const gamepad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const harness = boot({ seededMath: 1, skipRender: true, gamepad });
  const game = harness.play(harness.hook.levelSpec(1));
  game.L.wind = 0;
  const flame = game.flame;
  place(game, 150, 80); flame.heat = 0.4;
  gamepad.buttons[5].pressed = true; harness.tick(10); gamepad.buttons[5].pressed = false;
  assert(flame.heat > 0.5, 'R1 non scalda: ' + flame.heat.toFixed(2));
  gamepad.buttons[4].pressed = true; harness.tick(10); gamepad.buttons[4].pressed = false;
  assert(flame.heat < 0.45, 'L1 non raffredda: ' + flame.heat.toFixed(2));
  flame.heat = 0.8; gamepad.buttons[1].pressed = true; harness.tick(20); gamepad.buttons[1].pressed = false;
  assert(game.used.blast || flame.charging, 'B non carica');
  harness.tick(3);
  place(game, 150, 80); gamepad.axes = [0.8, 0];
  harness.tick(40); gamepad.axes = [0, 0];
  assert(flame.x > 150, 'la levetta non muove: ' + flame.x.toFixed(1));
  const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const hold of ['heatUp:1', 'heatDown:1', 'charge:1']) assert(page.includes('data-hold="' + hold + '"'), 'manca il pulsante touch ' + hold);
  assert(page.includes('data-edge="grab"'), 'manca il pulsante PRENDI');
});

test('pilota automatico: addestramento e livello 1 vinti; il replay ricostruisce la stessa partita', () => {
  const tutorial = playLevel(boot({ seededMath: 1 }).hook.tutorialSpec());
  assert(tutorial.state === 'done' && tutorial.result === 'win', 'addestramento: ' + tutorial.state + ' ' + tutorial.reason);
  const result = playLevel(boot({ seededMath: 1 }).hook.levelSpec(1));
  assert(result.state === 'done' && result.result === 'win', 'livello 1: ' + result.state + ' ' + result.reason);
  const driver = result.driver, hash = driver.stateHash({ ignoreState: true });
  driver.hook.startReplay();
  for (let i = 0; i < 40000 && driver.game.state === 'replay'; i++) driver.tick();
  assert(driver.stateHash({ ignoreState: true }) === hash, 'il replay diverge');
  return result.saved + '/' + result.total + ' sopravvissuti, ' + result.stars + ' stelle';
});

test('build: bundle e pagina presenti, minificati, con manifest e icone', () => {
  const root = path.join(__dirname, '..', '..', '..', 'dist');
  const page = fs.readFileSync(path.join(root, 'fiamma.html'), 'utf8');
  assert(!page.includes('// =====') && page.split('\n').length <= 2, 'bundle non minificato');
  for (const file of ['index.html', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    assert(fs.existsSync(path.join(root, 'site', 'fiamma', file)), 'manca dist/site/fiamma/' + file);
  }
  return (page.length / 1024).toFixed(1) + ' KB';
});

(async () => {
  const filter = process.argv[2];
  let pass = 0, fail = 0;
  for (const entry of tests) {
    if (filter && !entry.name.includes(filter)) continue;
    const startTime = Date.now();
    try {
      const info = await entry.fn();
      pass++;
      console.log('  OK   ' + entry.name + (info ? '  [' + info + ']' : '') + '  (' + (Date.now() - startTime) + ' ms)');
    } catch (error) {
      fail++;
      console.log('  FAIL ' + entry.name + '\n       ' + (error.stack || error).toString().split('\n').slice(0, 4).join('\n       '));
    }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti');
  process.exit(fail ? 1 : 0);
})();
