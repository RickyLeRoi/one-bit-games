// games/fiamma/src/render.js
'use strict';
// Drawing only: nothing here may change the simulation state.
const { canvasContext, SCREEN_WIDTH, SCREEN_HEIGHT, DARK, DUSK, makePattern, blackRect, drawCircle, outlineRect, text, textBox, drawPanel, drawSprite } = Gfx;
const hint = UI.hint;
const bar = UI.bar;
const MATERIAL_PATTERNS = {
  [CONFIG.material.rock]: DUSK,
  [CONFIG.material.concrete]: makePattern(['##..', '##..', '..##', '..##']),
  [CONFIG.material.beam]: makePattern(['########', '........', '########', '........']),
  [CONFIG.material.wood]: makePattern(['#...', '.#..', '..#.', '...#']),
  [CONFIG.material.cable]: makePattern(['#.', '#.']),
  [CONFIG.material.barrel]: makePattern(['#']),
};
const STAGE_NAMES = ['ROSSA', 'VERDE', 'BLU', 'BIANCA'];
const DARKNESS_BASE = { storm: 40, wreck: 22, quake: 30 };

// Shake and flicker from the frame number, not Math.random: the same frame looks the same however many times it is drawn (browser golden).
const renderNoise = frame => ((Math.imul(frame ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296) - 0.5;

const cameraLeft = () => round(game.camX);
const cameraTop = () => round(game.camY);
function toWorld() {
  const shakeX = game.shake ? round(renderNoise(game.frame) * game.shake * 2) : 0, shakeY = game.shake ? round(renderNoise(game.frame + 7) * game.shake * 2) : 0;
  canvasContext.setTransform(1, 0, 0, 1, -cameraLeft() + shakeX, -cameraTop() + shakeY);
}
const toScreen = () => canvasContext.setTransform(1, 0, 0, 1, 0, 0);

// Off-screen things are not drawn at all: every pixel of a sprite or circle is a fillRect call.
const isVisible = (x, y, width, height) => x + width >= cameraLeft() - 4 && x <= cameraLeft() + SCREEN_WIDTH + 4 && y + height >= cameraTop() - 4 && y <= cameraTop() + SCREEN_HEIGHT + 4;

// A circle made of a few dots (explosion rings, smoke, blast preview): far fewer calls than a pixel-exact outline.
function dotCircle(centerX, centerY, radius) {
  const dots = clamp(round(radius * 1.5), 6, 36);
  for (let i = 0; i < dots; i++) {
    const angle = i / dots * Math.PI * 2;
    canvasContext.fillRect(round(centerX + Math.cos(angle) * radius), round(centerY + Math.sin(angle) * radius), 1, 1);
  }
}

// Water first, so terrain and sprites sit on top of it: dotted body, wavy surface line.
function drawFloods() {
  const frame = game.frame;
  for (const flood of game.L.floods) {
    if (!isVisible(flood.x, flood.top, flood.w, flood.bottom - flood.top)) continue;
    const surface = round(flood.level), firstX = Math.max(flood.x, cameraLeft() - 4), lastX = Math.min(flood.x + flood.w, cameraLeft() + SCREEN_WIDTH + 4);
    canvasContext.fillStyle = '#fff';
    canvasContext.fillRect(flood.x, surface + 1, flood.w, flood.bottom - surface - 1);
    canvasContext.fillStyle = DARK;
    canvasContext.fillRect(flood.x, surface + 1, flood.w, flood.bottom - surface - 1);
    canvasContext.fillStyle = '#fff';
    for (let x = firstX; x < lastX; x++) canvasContext.fillRect(x, surface + round(Math.sin((x + frame * 0.6) * 0.35)), 1, 1);
  }
}

// The rescue truck: a box with a cross on the left, the cab on the right, two wheels.
function drawTruck() {
  const rescue = CONFIG.rescue, floor = game.L.groundY, left = rescue.x;
  outlineRect(left, floor - 19, 28, 14);
  canvasContext.fillRect(left + 12, floor - 16, 4, 8);
  canvasContext.fillRect(left + 10, floor - 14, 8, 4);
  outlineRect(left + 28, floor - 13, 12, 8);
  outlineRect(left + 33, floor - 12, 5, 4);
  drawCircle(left + 7, floor - 3, 3);
  drawCircle(left + 33, floor - 3, 3);
}

function drawObjects() {
  const frame = game.frame;
  for (const object of game.L.objects) {
    if (!object.alive || !isVisible(object.x, object.y, object.w, object.h)) continue;
    if (object.kind === 'barrel') drawSprite(SPRITES.barrel, object.x, object.y);
    if (object.hot && (frame >> 1) & 1) outlineRect(object.x - 1, object.y - 1, object.w + 2, object.h + 2);
  }
}

function drawSurvivors() {
  const frame = game.frame;
  for (const survivor of game.L.survivors) {
    if ((survivor.state !== 'waiting' && survivor.state !== 'carried') || !isVisible(survivor.x, survivor.y - 8, survivor.w, survivor.h + 8)) continue;
    drawSprite(survivor.state === 'waiting' && (frame >> 4) & 1 ? SPRITES.survivorWave : SPRITES.survivor, round(survivor.x), round(survivor.y));
    if (survivor.submerged && (frame >> 3) & 1) dotCircle(survivor.x + 3, survivor.y - 4, 2);
    if (survivor.burn > 0.3 && (frame >> 2) & 1) canvasContext.fillRect(round(survivor.x) + 2, round(survivor.y) - 2, 2, 1);
  }
}

function drawParticles() {
  for (const particle of game.parts) {
    if (!isVisible(particle.x - (particle.r || 0), particle.y - (particle.r || 0), (particle.r || 0) * 2 + 2, (particle.r || 0) * 2 + 2)) continue;
    if (particle.t === 'px') canvasContext.fillRect(round(particle.x), round(particle.y), 1, 1);
    else if (particle.t === 'chunk') canvasContext.fillRect(round(particle.x), round(particle.y), particle.w, particle.h);
    else if (particle.t === 'smoke') canvasContext.fillRect(round(particle.x) - 1, round(particle.y) - 1, 2 + (particle.r > 4 ? 1 : 0), 2 + (particle.r > 4 ? 1 : 0));
    else if (particle.t === 'ring') dotCircle(particle.x, particle.y, particle.r);
  }
}

function blastPreviewRadius() {
  const config = CONFIG.charge;
  return config.radiusMin + game.flame.charge * (config.radiusMax - config.radiusMin);
}

function drawFlame() {
  const flame = game.flame, frame = game.frame;
  if (flame.charging) dotCircle(flameCenterX() + flame.face * 10, flameCenterY(), blastPreviewRadius());
  if (flame.out > 0 && !((frame >> 2) & 1)) return;
  const stage = flame.out > 0 ? 0 : heatStage(flame.heat);
  drawSprite(SPRITES.flame[stage][(frame >> 2) & 1], round(flameCenterX()) - 4, round(flameCenterY()) - 9);
}

function drawRain() {
  if (!game.L.rain) return;
  for (const drop of game.rain) canvasContext.fillRect(round(drop.x), round(drop.y), 1, 3);
}

// Everything outside the light is dark: the flame lights more the hotter it is, survivors and hot objects glow a little.
function drawDark() {
  const level = game.L, flame = game.flame, offsetX = cameraLeft(), offsetY = cameraTop();
  const radius = (DARKNESS_BASE[level.sc.id] + 70 * flame.heat) * (1 + renderNoise(game.frame >> 1) * 0.06);
  const circles = [flameCenterX() - offsetX, flameCenterY() - offsetY, radius];
  circles.push(CONFIG.rescue.x + CONFIG.rescue.width / 2 - offsetX, level.groundY - 8 - offsetY, 34);
  for (const survivor of level.survivors) if (survivor.state === 'waiting') circles.push(survivor.x + 3 - offsetX, survivor.y + 4 - offsetY, 10);
  for (const object of level.objects) if (object.alive && object.hot) circles.push(object.x + object.w / 2 - offsetX, object.y + object.h / 2 - offsetY, 14);
  Lighting.darkness({ circles, cones: [], pattern: DARK });
}

// Arrows on the screen edge towards the survivors (and the truck while carrying one) that are out of sight.
function drawArrows() {
  const targets = game.L.survivors.filter(survivor => survivor.state === 'waiting').map(survivor => [survivor.x + 3, survivor.y + 4]);
  if (game.flame.carrying) targets.push([CONFIG.rescue.x + CONFIG.rescue.width / 2, game.L.groundY - 10]);
  for (const [worldX, worldY] of targets) {
    const x = worldX - game.camX, y = worldY - game.camY;
    if (x >= 0 && x < SCREEN_WIDTH && y >= 12 && y < SCREEN_HEIGHT - 12) continue;
    const arrowX = clamp(round(x), 6, SCREEN_WIDTH - 10), arrowY = clamp(round(y), 16, SCREEN_HEIGHT - 20);
    text(y >= SCREEN_HEIGHT - 12 ? '▼' : y < 12 ? '▲' : x < 0 ? '<' : '>', arrowX, arrowY);
  }
}

function drawHeatBar(x, y) {
  const flame = game.flame, width = 36;
  if (flame.out > 0 && (game.frame >> 2) & 1) return;
  bar(x, y - 1, width, flame.heat);
  canvasContext.fillStyle = '#000';
  for (const threshold of CONFIG.flame.stages) canvasContext.fillRect(x + 1 + round((width - 2) * threshold), y, 1, 5);
  canvasContext.fillStyle = '#fff';
}

function drawHUD() {
  const level = game.L, flame = game.flame, frame = game.frame;
  blackRect(0, 0, SCREEN_WIDTH, 11); blackRect(0, SCREEN_HEIGHT - 11, SCREEN_WIDTH, 11);
  for (let x = 0; x < SCREEN_WIDTH; x += 2) { canvasContext.fillRect(x, 10, 1, 1); canvasContext.fillRect(x, SCREEN_HEIGHT - 11, 1, 1); }
  const label = level.tutorial ? 'ADDESTRAMENTO' : level.spec.daily ? 'SFIDA ' + level.spec.daily.slice(5).split('-').reverse().join('/') + ' ' + level.sc.name : 'LV' + level.n + ' ' + level.sc.name;
  text(label, 3, 3);
  text('SALVATI ' + level.saved + '/' + level.total + '  PERSI ' + level.lost + '  PUNTI ' + game.score, SCREEN_WIDTH - 3, 3, 1, 'r');
  const y = SCREEN_HEIGHT - 8;
  text('CALORE', 3, y);
  drawHeatBar(28, y);
  text(STAGE_NAMES[heatStage(flame.heat)], 68, y);
  text('ARIA', 94, y);
  if (!closedAt(flameCenterX(), flameCenterY())) text('--', 112, y);
  else if (flame.reserve > 0.2 || (frame >> 3) & 1) bar(110, y - 1, 28, flame.reserve);
  if (flame.charging) { text('CARICA', 144, y); bar(166, y - 1, 24, flame.charge); }
  else if (flame.carrying) { text('USTIONI', 144, y); bar(170, y - 1, 24, flame.carrying.burn); }
  const waiting = waitingSurvivors();
  waiting.forEach((survivor, i) => {
    const x = SCREEN_WIDTH - 3 - (waiting.length - i) * 20;
    if (survivor.time === Infinity) text('--', x + 4, y);
    else if (survivor.time > 400 || (frame >> 3) & 1) bar(x, y - 1, 17, survivor.time / survivor.maxTime);
  });
  if (game.msgT > 0 && !(game.msgT < 30 && (frame >> 2) & 1)) textBox(game.msg, SCREEN_WIDTH / 2, 14, 'c');
  if (level.tutorial && game.tut && game.state !== 'done') {
    const step = TUTORIAL[game.tut.step];
    if (step) textBox(tutorialText(step), SCREEN_WIDTH / 2, 26, 'c');
    if (game.state === 'play') text(hint('N: SALTA', 'SALTA: ESCI', 'Y: SALTA'), 3, 14);
  }
  if (game.state === 'replay' && (frame >> 4) & 1) textBox('REPLAY  -  ' + hint('INVIO', 'TOCCA', 'A') + ' PER SALTARE', SCREEN_WIDTH / 2, 38, 'c');
}

function drawOverlay() {
  const level = game.L, blink = (game.frame >> 5) & 1, state = game.state;
  if (state === 'title') {
    drawPanel(26, 12, SCREEN_WIDTH - 52, SCREEN_HEIGHT - 24);
    text('FIAMMA', SCREEN_WIDTH / 2, 22, 3, 'c');
    text('DOMA IL FUOCO E PORTA IN SALVO I SOPRAVVISSUTI', SCREEN_WIDTH / 2, 42, 1, 'c');
    const controls = hint(
      ['FRECCE : VOLA    X / Z : PIU\' / MENO CALORE', 'C : CARICA (RILASCIA PER ESPLODERE)    SPAZIO : PRENDI', 'P PAUSA  R RICOMINCIA  M AUDIO  V REPLAY'],
      ['LEVETTA : VOLA    + / - CALDO : CALORE', 'CARICA : TIENI E RILASCIA    PRENDI', 'II : PAUSA     AUDIO : SUONO SI/NO'],
      ['LEVETTA : VOLA    R1 / L1 : PIU\' / MENO CALORE', 'B : CARICA (RILASCIA)    A : PRENDI', 'START PAUSA  BACK RICOMINCIA  Y REPLAY']);
    const rules = [
      "PIU' CALORE: PIU' LUCE E FORZA, MA ANCHE USTIONI",
      'LEGNO, CAVI E TRAVI VOGLIONO CALORE DIVERSO',
      'IL CEMENTO SI ROMPE SOLO CON LA CARICA O I BIDONI',
      "L'ACQUA SPEGNE LA FIAMMA: SOPRA LA FA EVAPORARE",
    ];
    controls.concat([''], rules).forEach((line, i) => text(line, SCREEN_WIDTH / 2, 56 + i * 9, 1, 'c'));
    if (blink) text(hint('INVIO: GIOCA     G: SFIDA DEL GIORNO', 'TOCCA PER GIOCARE', 'A: GIOCA     Y: SFIDA DEL GIORNO'), SCREEN_WIDTH / 2, SCREEN_HEIGHT - 28, 1, 'c');
  } else if (state === 'intro') {
    const notes = ['SOPRAVVISSUTI DA SALVARE: ' + level.total];
    if (level.closed) notes.push('LUOGO CHIUSO: LA FIAMMA CONSUMA ARIA');
    if (level.floods.length) notes.push("L'ACQUA SALE: NON LASCIARLI SOTTO");
    const promptY = 100 + notes.length * 9 + 6;
    drawPanel(44, 46, SCREEN_WIDTH - 88, promptY - 46 + 16);
    text(level.tutorial ? 'IMPARA A USARE LA FIAMMA' : level.spec.daily ? 'SFIDA DEL GIORNO ' + level.spec.daily : 'LIVELLO ' + level.n, SCREEN_WIDTH / 2, 56, 1, 'c');
    text(level.tutorial ? 'ADDESTRAMENTO' : level.sc.name, SCREEN_WIDTH / 2, 68, 2, 'c');
    text(level.tutorial ? hint("N: SALTA L'ADDESTRAMENTO", "SALTA: ESCI DALL'ADDESTRAMENTO", "Y: SALTA L'ADDESTRAMENTO") : level.sc.hint, SCREEN_WIDTH / 2, 88, 1, 'c');
    UI.lines(notes, SCREEN_WIDTH / 2, 100, 9);
    if (blink) text(hint('INVIO PER INIZIARE', 'TOCCA PER INIZIARE', 'A PER INIZIARE'), SCREEN_WIDTH / 2, promptY, 1, 'c');
  } else if (state === 'pause') {
    drawPanel(SCREEN_WIDTH / 2 - 60, SCREEN_HEIGHT / 2 - 18, 120, 36);
    text(STRINGS.pause, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 10, 2, 'c');
    text(hint(STRINGS.resumeKeyboard, STRINGS.resumeTouch, STRINGS.resumePad), SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 6, 1, 'c');
  } else if (state === 'over' && game.overT <= 0) {
    drawPanel(38, 58, SCREEN_WIDTH - 76, 90);
    text('GAME OVER', SCREEN_WIDTH / 2, 68, 3, 'c');
    text(game.overReason, SCREEN_WIDTH / 2, 94, 1, 'c');
    text('SALVATI ' + level.saved + '/' + level.total + '   PUNTI ' + game.score, SCREEN_WIDTH / 2, 108, 1, 'c');
    if (blink) text(hint('INVIO: RIPROVA     V: REPLAY', 'TOCCA: RIPROVA', 'A: RIPROVA     Y: REPLAY'), SCREEN_WIDTH / 2, 128, 1, 'c');
  } else if (state === 'done') {
    const win = game.result === 'win';
    drawPanel(40, 40, SCREEN_WIDTH - 80, 124);
    text(win ? 'MISSIONE COMPIUTA' : 'MISSIONE FALLITA', SCREEN_WIDTH / 2, 50, 2, 'c');
    UI.stars({ on: SPRITES.starOn, off: SPRITES.starOff }, game.stars, 66);
    text('SALVATI: ' + level.saved + '/' + level.total + '   PERSI: ' + level.lost, SCREEN_WIDTH / 2, 92, 1, 'c');
    if (win && game.bonus) text('BONUS STELLE: +' + game.bonus, SCREEN_WIDTH / 2, 103, 1, 'c');
    if (!win) text("SERVE SALVARE PIU' DELLA META' DEI SOPRAVVISSUTI", SCREEN_WIDTH / 2, 103, 1, 'c');
    text('PUNTI: ' + game.score, SCREEN_WIDTH / 2, 114, 1, 'c');
    text("1 STELLA: PIU' DELLA META'  2: 75%  3: TUTTI, SENZA USTIONI", SCREEN_WIDTH / 2, 128, 1, 'c');
    const next = !win ? 'RIPROVA' : level.spec.daily ? 'MENU' : 'PROSSIMO LIVELLO';
    if (blink) text(hint('INVIO: ' + next + '   V: REPLAY', 'TOCCA: ' + next, 'A: ' + next + '   Y: REPLAY'), SCREEN_WIDTH / 2, 148, 1, 'c');
  }
  if (Input.device === 'touch' && window.innerHeight > window.innerWidth && (game.frame >> 5) & 1) {
    textBox(STRINGS.rotatePhone, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 30, 'c');
  }
}

function render() {
  const level = game.L;
  toScreen();
  canvasContext.globalCompositeOperation = 'source-over';
  canvasContext.fillStyle = '#000'; canvasContext.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT); canvasContext.fillStyle = '#fff';
  toWorld();
  drawFloods();
  Terrain.draw(level.terrain, cameraLeft() - 4, cameraTop() - 4, SCREEN_WIDTH + 8, SCREEN_HEIGHT + 8, MATERIAL_PATTERNS);
  drawTruck();
  drawObjects();
  drawSurvivors();
  drawParticles();
  drawFlame();
  toScreen();
  drawRain();
  if (!level.tutorial) drawDark();
  drawArrows();
  if (game.state !== 'title') drawHUD();
  drawOverlay();
  Theme.finishFrame(false);
}
