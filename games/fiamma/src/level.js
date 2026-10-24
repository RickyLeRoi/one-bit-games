// games/fiamma/src/level.js
'use strict';
const SCENARIOS = [
  { id: 'storm', name: 'TEMPESTA', hint: 'PIOGGIA, CAVI CADUTI E BACINI CHE SI RIEMPIONO', closed: false, wind: 0.5 },
  { id: 'wreck', name: 'NAUFRAGIO', hint: "SCAFO ALLAGATO: PARATIE DA FONDERE E POCA ARIA", closed: true, wind: 0 },
  { id: 'quake', name: 'TERREMOTO', hint: 'MACERIE E MURI DI CEMENTO: SERVE UN ESPLOSIVO', closed: true, wind: 0 },
];

function levelSpec(levelNumber) {
  const scenario = (levelNumber - 1) % SCENARIOS.length, loop = Math.floor((levelNumber - 1) / SCENARIOS.length);
  return { n: levelNumber, scenario, loop, seed: levelNumber * 3187 + 70001 };
}
function dailySpec(date) {
  const dateHash = hashString('fiamma-' + date);
  return { n: 0, daily: date, scenario: dateHash % SCENARIOS.length, loop: 1, seed: dateHash };
}
const tutorialSpec = () => ({ n: 0, tutorial: true, scenario: 0, loop: 0, seed: 777 });

const MATERIAL = CONFIG.material;
const CHAMBER = { width: 36, inner: 30, height: 26, wall: 3 };
const BASIN = { width: 100, ledgeWidth: 20, dikeAbove: 40 };
const SEGMENT_HEIGHT = 26;

// What can block the way, from the easiest to the one that only a blast opens; the pool grows with the loop.
function materialPool(scenarioId, loop) {
  if (scenarioId === 'storm') return loop === 0 ? ['wood', 'cable'] : loop === 1 ? ['wood', 'cable', 'beam'] : ['wood', 'cable', 'beam', 'concrete'];
  if (scenarioId === 'wreck') return loop === 0 ? ['wood', 'beam'] : ['wood', 'beam', 'cable', 'concrete'];
  return loop === 0 ? ['wood', 'beam', 'concrete'] : ['wood', 'beam', 'concrete', 'cable'];
}

function isBasin(scenarioId, loop, index) {
  if (scenarioId === 'quake') return loop >= 1 && index % 3 === 2;
  return index % 2 === 1;
}

function addObject(level, kind, x, y, width, height) {
  Terrain.fillRect(level.terrain, x, y, width, height, MATERIAL[kind]);
  const object = { kind, x, y, w: width, h: height, progress: 0, alive: true, hot: false };
  level.objects.push(object);
  return object;
}

// Two drums on the floor in front of a concrete wall: lit at full heat they blow it open.
function addDrums(level, wallX, floorY) {
  for (const offset of [-14, -22]) addObject(level, 'barrel', wallX + offset, floorY - 8, 6, 8);
}

// A chamber: roof and back wall of rock, one breakable wall on the side `front`, a survivor at the back.
function buildChamber(level, centerX, floorY, front, kind, lift) {
  const { terrain } = level, left = centerX - CHAMBER.width / 2, top = floorY - CHAMBER.height;
  Terrain.fillRect(terrain, left, top - CHAMBER.wall, CHAMBER.width, CHAMBER.wall, MATERIAL.rock);
  const backX = front < 0 ? left + CHAMBER.width - CHAMBER.wall : left, frontX = front < 0 ? left : left + CHAMBER.width - CHAMBER.wall;
  Terrain.fillRect(terrain, backX, top, CHAMBER.wall, CHAMBER.height, MATERIAL.rock);
  if (lift > 0) {
    Terrain.fillRect(terrain, left, floorY, CHAMBER.width, CHAMBER.wall, MATERIAL.rock);
    Terrain.fillRect(terrain, centerX - 3, floorY + CHAMBER.wall, 6, level.groundY - floorY - CHAMBER.wall, MATERIAL.rock);
  }
  const wall = addObject(level, kind, frontX, top, CHAMBER.wall, CHAMBER.height);
  wall.front = front;
  if (kind === 'concrete') addDrums(level, front < 0 ? frontX : frontX + CHAMBER.wall + 28, floorY);
  level.pockets.push({ x: left, y: top, w: CHAMBER.width, h: CHAMBER.height });
  const survivorX = front < 0 ? left + CHAMBER.width - CHAMBER.wall - 12 : left + CHAMBER.wall + 6;
  return { x: survivorX, y: floorY - CONFIG.survivor.h, flood: -1 };
}

// A flooded basin between two low dikes: the survivor stands on a ledge that the rising water is about to cover.
function buildBasin(level, centerX, lift, rise) {
  const { terrain } = level, ledgeY = level.groundY - lift, left = centerX - BASIN.width / 2, dikeTop = ledgeY - BASIN.dikeAbove;
  Terrain.fillRect(terrain, centerX - BASIN.ledgeWidth / 2, ledgeY, BASIN.ledgeWidth, 3, MATERIAL.rock);
  Terrain.fillRect(terrain, centerX - 2, ledgeY + 3, 4, level.groundY - ledgeY - 3, MATERIAL.rock);
  Terrain.fillRect(terrain, left, dikeTop, 3, level.groundY - dikeTop, MATERIAL.rock);
  Terrain.fillRect(terrain, left + BASIN.width - 3, dikeTop, 3, level.groundY - dikeTop, MATERIAL.rock);
  const flood = CONFIG.flood;
  level.floods.push({ x: left + 3, w: BASIN.width - 6, top: dikeTop, bottom: level.groundY, level: ledgeY - flood.depthStart, rise, cap: ledgeY - flood.depthCap });
  return { x: centerX - CONFIG.survivor.w / 2, y: ledgeY - CONFIG.survivor.h, flood: level.floods.length - 1 };
}

// A column of breakable segments from the ceiling to the floor: burning one or two opens a gap.
function buildBarrier(level, x, kind) {
  for (let y = CONFIG.world.ceiling; y < level.groundY; y += SEGMENT_HEIGHT) {
    const height = Math.min(SEGMENT_HEIGHT, level.groundY - y);
    addObject(level, kind, x, y, 4, height).barrier = true;
  }
  if (kind === 'concrete') addDrums(level, x, level.groundY);
}

function buildTutorial(level) {
  const { groundY } = level, survivors = [];
  addObject(level, 'cable', 210, CONFIG.world.ceiling, 4, groundY - CONFIG.world.ceiling).barrier = true;
  survivors.push(buildChamber(level, 330, groundY, -1, 'wood', 0));
  const wall = addObject(level, 'concrete', 430, CONFIG.world.ceiling, 4, groundY - CONFIG.world.ceiling);
  wall.barrier = true;
  addDrums(level, 430, groundY);
  survivors.push(buildBasin(level, 540, 20, 0.004));
  return survivors;
}

function buildScenario(level, random, scenario, spec) {
  const { groundY } = level, loop = spec.loop, pool = materialPool(scenario.id, loop), count = Math.min(CONFIG.max, CONFIG.base + loop * CONFIG.perLoop);
  const barrierCount = scenario.closed ? Math.min(1 + loop, 3) : 0, sections = barrierCount + 1;
  const first = CONFIG.world.startX + 80, last = level.width - 30, sectionWidth = (last - first) / sections;
  const barrierX = k => Math.round(first + sectionWidth * (k + 1));
  for (let k = 0; k < barrierCount; k++) buildBarrier(level, barrierX(k), pool[(spec.n + k + 1) % pool.length]);
  const survivors = [];
  const entriesIn = section => Array.from({ length: count }, (_, i) => i).filter(i => Math.min(sections - 1, Math.floor(i * sections / count)) === section);
  for (let section = 0; section < sections; section++) {
    const entries = entriesIn(section);
    const sectionLeft = first + sectionWidth * section + (section ? 24 : 0), sectionRight = first + sectionWidth * (section + 1) - (section < barrierCount ? 24 : 0);
    const slot = (sectionRight - sectionLeft) / Math.max(1, entries.length);
    entries.forEach((index, j) => {
      const centerX = Math.round(sectionLeft + slot * (j + 0.5) + (random() - 0.5) * 12);
      if (isBasin(scenario.id, loop, index)) {
        const lift = [20, 36, 52][Math.floor(random() * 3)];
        survivors.push(buildBasin(level, centerX, lift, (scenario.id === 'storm' ? 0.004 : 0.006) * (1 + loop * 0.2)));
        return;
      }
      const kind = pool[(spec.n + index) % pool.length];
      const lift = kind === 'concrete' ? 0 : [0, 28, 56][Math.floor(random() * 3)];
      const front = spec.loop > 0 && random() < 0.3 ? 1 : -1;
      survivors.push(buildChamber(level, centerX, groundY - lift, front, kind, lift));
    });
  }
  return survivors;
}

function genLevel(spec) {
  const random = mulberry32(spec.seed), scenario = SCENARIOS[spec.scenario], tutorial = !!spec.tutorial, world = CONFIG.world;
  const width = tutorial ? world.tutorialWidth : world.width, height = world.height, groundY = height - world.ground;
  const level = {
    spec, n: spec.n, sc: scenario, tutorial, loop: spec.loop, width, height, groundY,
    closed: scenario.closed && !tutorial, ceiling: scenario.closed || tutorial, rain: scenario.id === 'storm' && !tutorial, wind: tutorial ? 0 : scenario.wind,
    terrain: Terrain.make(width, height), objects: [], floods: [], pockets: [], survivors: [],
    saved: 0, lost: 0, total: 0, maxBurn: 0,
  };
  Terrain.fillRect(level.terrain, 0, groundY, width, world.ground, MATERIAL.rock);
  if (level.ceiling) Terrain.fillRect(level.terrain, 0, 0, width, world.ceiling, MATERIAL.rock);
  const placed = tutorial ? buildTutorial(level) : buildScenario(level, random, scenario, spec);
  const lifeFor = () => (tutorial ? Infinity : Math.round(CONFIG.survivor.time * (0.85 + random() * 0.3) * Math.pow(0.95, spec.loop)));
  level.survivors = placed.map(spot => {
    const time = lifeFor();
    return { x: spot.x, y: spot.y, w: CONFIG.survivor.w, h: CONFIG.survivor.h, state: 'waiting', burn: 0, time, maxTime: time, flood: spot.flood, submerged: false };
  });
  level.total = level.survivors.length;
  return level;
}
