// games/fiamma/src/main.js
'use strict';
// Determinism: each attempt reseeds the simulation RNG and records every frame input;
// a replay feeds the same inputs to the same seed and gets the identical game.

function stepSimulation(input, frozen) {
  game.frame++;
  game.time = game.frame / 60;
  if (!frozen) {
    updateFlame(input);
    updateObjects();
    updateFloods();
    updatePending();
    updateSurvivors();
  }
  updateEnv();
  updateCamera();
  if (!frozen) checkOutcome();
  if (game.L.tutorial) updateTutorial();
  if (game.msgT > 0) game.msgT--;
}

function newRun(spec, score) {
  game.spec = spec;
  game.L = genLevel(spec);
  game.parts = []; game.pending = [];
  game.score = score;
  game.levelStartScore = score;
  game.frame = 0; game.time = 0;
  game.endT = 0; game.msgT = 0; game.bonus = 0; game.stars = 0; game.result = ''; game.shake = 0;
  game.flame = newFlame();
  game.used = { move: false, heat: false, blast: false, evaporate: false };
  game.camX = clamp(flameCenterX() - CONFIG.W / 2, 0, game.L.width - CONFIG.W);
  game.camY = clamp(flameCenterY() - CONFIG.H / 2, 0, game.L.height - CONFIG.H);
  Rng.seed(spec.seed ^ 0x5bd1e995);
  game.rain = game.L.rain ? Weather.initRain(70, CONFIG.W, CONFIG.H) : [];
  game.tut = spec.tutorial ? { step: 0 } : null;
}

function skipTutorial() {
  game.tutDone = true;
  startLevel(levelSpec(1), 0);
}

// The level ends a moment after nobody is left to save: won with more than half of the survivors saved.
function checkEnd() {
  const level = game.L;
  if (waitingSurvivors().length || game.flame.carrying) { game.endT = 0; return; }
  if (++game.endT <= 60) return;
  game.state = 'done';
  const win = level.saved * 2 > level.total, scoreConfig = CONFIG.score;
  game.result = win ? 'win' : 'fail';
  game.stars = !win ? 0 : level.saved === level.total && level.maxBurn < scoreConfig.threeStarsBurn ? 3 : level.saved >= level.total * scoreConfig.twoStars ? 2 : 1;
  game.bonus = scoreConfig.starBonus[game.stars];
  game.score += game.bonus;
  Sfx.play(win ? 'win' : 'fail');
}

const urlParams = new URLSearchParams(location.search);
const startLevelNumber = Math.max(1, parseInt(urlParams.get('livello'), 10) || 1);
game.noTutorial = urlParams.has('livello');

const replayCodec = Replay.codec({ axes: ['hx', 'up', 'down', 'heatUp', 'heatDown', 'charge'], flags: ['grab'] });
const startLevel = (spec, score) => flow.startRun(spec, score);
const startReplay = () => flow.startReplay();

const flow = Flow.create({
  run: game,
  audio: Sfx,
  idleInput: NO_INPUT,
  codec: replayCodec,
  message: showMessage,
  newRun,
  step: stepSimulation,
  checkEnd,
  stepInput: (input, edges) => ({ hx: input.hx, up: input.up, down: input.down, heatUp: input.heatUp, heatDown: input.heatDown, charge: input.charge, grab: edges.has('grab') }),
  beforeState(edges) {
    if (!(game.L.tutorial && game.state !== 'title' && (edges.has('skip') || (edges.has('replay') && game.state !== 'done' && game.state !== 'over' && game.state !== 'replay')))) return false;
    skipTutorial();
    return true;
  },
  afterStep() {
    Input.syncUI(game.state, { tut: !!(game.L.tutorial && game.state !== 'title') }, {});
    Sfx.update({ heat: game.state === 'play' && game.flame.out === 0 ? game.flame.heat : 0 });
  },
  specs: {
    first: () => (!game.tutDone && startLevelNumber === 1 && !game.noTutorial ? tutorialSpec() : levelSpec(startLevelNumber)),
    daily: date => dailySpec(date),
    next(finished) {
      if (finished.spec.tutorial) { game.tutDone = true; return { spec: levelSpec(1), score: 0 }; }
      if (finished.spec.daily) return { spec: levelSpec(startLevelNumber), score: 0, title: true };
      return { spec: levelSpec(finished.spec.n + 1), score: finished.score };
    },
  },
  introFrames: 240,
  debug: { name: '__fiamma', expose: { game, CONFIG, Sfx } },
  testHook: {
    game, CONFIG, startLevel, levelSpec, dailySpec, tutorialSpec, startReplay, Rng, Terrain, SPRITES,
    flameCenterX, flameCenterY, waitingSurvivors, explode, heatStage, closedAt, rectDistance,
  },
});

startLevel(levelSpec(startLevelNumber), 0);
game.state = 'title';
Loop.start(flow.step, render);
