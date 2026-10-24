// games/fiamma/test/autopilot.js
'use strict';
// Scripted pilot shared by levels.js (solvability) and the golden scenarios. It reads the state (it is a test, not a player): cheapest path
// on a grid of 4 px cells (breakable objects cost extra, rock, drums and the water of the floods are walls), then a controller on the keys.
// On the way it burns what blocks the path with the heat that thing needs, blasts concrete from a distance, hovers above a flood to
// evaporate it down to the survivor, and keeps the heat low while carrying and in a closed place when the reserve runs out.
const { boot } = require('./helpers');

const CELL = 4, MARGIN = 1, LOOKAHEAD = 1;
const BREAK_COST = { wood: 8, cable: 12, beam: 30, concrete: 50 };
const BREAK_HEAT = { wood: 0.3, cable: 0.45, beam: 0.65 };
const FLY_HEAT = 0.55, CARRY_HEAT = 0.45, HOVER_HEAT = 0.4, COLD_HEAT = 0.15, CHARGE_HEAT = 0.6, CHARGE_STANDOFF = 24;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

class MinHeap {
  constructor() { this.keys = []; this.values = []; }
  get size() { return this.keys.length; }
  push(key, value) {
    let i = this.keys.length;
    this.keys.push(key); this.values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      [this.keys[parent], this.keys[i]] = [this.keys[i], this.keys[parent]];
      [this.values[parent], this.values[i]] = [this.values[i], this.values[parent]];
      i = parent;
    }
  }
  pop() {
    const top = this.values[0], lastKey = this.keys.pop(), lastValue = this.values.pop();
    if (this.keys.length) {
      this.keys[0] = lastKey; this.values[0] = lastValue;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1, right = left + 1;
        let smallest = i;
        if (left < this.keys.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.keys.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        [this.keys[smallest], this.keys[i]] = [this.keys[i], this.keys[smallest]];
        [this.values[smallest], this.values[i]] = [this.values[i], this.values[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

// Cells where the flame body (with a margin) overlaps rock. Static: computed once per level.
function rockGrid(hook) {
  const level = hook.game.L, flame = hook.game.flame, columns = Math.ceil(level.width / CELL), rows = Math.ceil(level.height / CELL);
  const hard = new Uint8Array(columns * rows), rock = hook.CONFIG.material.rock;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const left = column * CELL + CELL / 2 - flame.w / 2 - MARGIN, top = row * CELL + CELL / 2 - flame.h / 2 - MARGIN;
    if (top < 0) { hard[row * columns + column] = 1; continue; }
    let blocked = false;
    for (let y = Math.floor(top); y < Math.ceil(top + flame.h + 2 * MARGIN) && !blocked; y++) {
      for (let x = Math.floor(left); x < Math.ceil(left + flame.w + 2 * MARGIN); x++) if (hook.Terrain.get(level.terrain, x, y) === rock) { blocked = true; break; }
    }
    hard[row * columns + column] = blocked ? 1 : 0;
  }
  return { hard, columns, rows };
}

// Walls and costs that change during the level: drums and the water are walls, breakable objects add their cost.
function planGrid(hook, base) {
  const level = hook.game.L, flame = hook.game.flame, { columns, rows } = base;
  const hard = Uint8Array.from(base.hard), extra = new Uint8Array(columns * rows);
  const bodyLeft = column => column * CELL + CELL / 2 - flame.w / 2 - MARGIN, bodyTop = row => row * CELL + CELL / 2 - flame.h / 2 - MARGIN;
  const bodySize = flame.w + 2 * MARGIN;
  for (const object of level.objects) {
    if (!object.alive) continue;
    const cost = object.kind === 'barrel' ? 0 : BREAK_COST[object.kind];
    for (let row = Math.max(0, Math.floor((object.y - bodySize) / CELL)); row <= Math.min(rows - 1, Math.ceil((object.y + object.h + bodySize) / CELL)); row++) {
      for (let column = Math.max(0, Math.floor((object.x - bodySize) / CELL)); column <= Math.min(columns - 1, Math.ceil((object.x + object.w + bodySize) / CELL)); column++) {
        const left = bodyLeft(column), top = bodyTop(row);
        if (left >= object.x + object.w || left + bodySize <= object.x || top >= object.y + object.h || top + bodySize <= object.y) continue;
        if (object.kind === 'barrel') hard[row * columns + column] = 1; else extra[row * columns + column] = Math.max(extra[row * columns + column], cost);
      }
    }
  }
  for (const flood of level.floods) {
    for (let row = 0; row < rows; row++) {
      if (bodyTop(row) + bodySize <= flood.level - 3) continue;
      for (let column = Math.max(0, Math.floor((flood.x - bodySize) / CELL)); column <= Math.min(columns - 1, Math.ceil((flood.x + flood.w) / CELL)); column++) {
        const left = bodyLeft(column);
        if (left + bodySize > flood.x && left < flood.x + flood.w) hard[row * columns + column] = 1;
      }
    }
  }
  return { hard, extra, columns, rows };
}

// Cheapest path of cells from the flame to the reachable cell nearest the target point (8 neighbours), or null.
function findPath(grid, fromX, fromY, toX, toY) {
  const { hard, extra, columns, rows } = grid, cellAt = (x, y) => [clamp(Math.floor(x / CELL), 0, columns - 1), clamp(Math.floor(y / CELL), 0, rows - 1)];
  const [startX, startY] = cellAt(fromX, fromY), [goalX, goalY] = cellAt(toX, toY);
  const start = startY * columns + startX;
  const cost = new Float64Array(columns * rows).fill(Infinity), previous = new Int32Array(columns * rows).fill(-1);
  cost[start] = 0; previous[start] = start;
  const heap = new MinHeap();
  heap.push(0, start);
  let best = start, bestScore = Infinity;
  while (heap.size) {
    const key = heap.keys[0], index = heap.pop();
    if (key > cost[index]) continue;
    const x = index % columns, y = (index - x) / columns, distance = Math.hypot(x - goalX, y - goalY);
    const score = distance * 1000 + cost[index];
    if (score < bestScore) { bestScore = score; best = index; }
    for (let deltaY = -1; deltaY <= 1; deltaY++) for (let deltaX = -1; deltaX <= 1; deltaX++) {
      const nextX = x + deltaX, nextY = y + deltaY;
      if ((!deltaX && !deltaY) || nextX < 0 || nextY < 0 || nextX >= columns || nextY >= rows) continue;
      const next = nextY * columns + nextX;
      if (hard[next]) continue;
      if (deltaX && deltaY && (hard[y * columns + nextX] || hard[nextY * columns + x])) continue;
      const nextCost = cost[index] + (deltaX && deltaY ? 1.41 : 1) + extra[next];
      if (nextCost < cost[next]) { cost[next] = nextCost; previous[next] = index; heap.push(nextCost, next); }
    }
  }
  const bestX = best % columns, bestY = (best - bestX) / columns;
  if (Math.hypot(bestX - goalX, bestY - goalY) > 5) return null;
  const path = [];
  for (let index = best; index !== start; index = previous[index]) path.push({ x: (index % columns) * CELL + CELL / 2, y: Math.floor(index / columns) * CELL + CELL / 2, extra: extra[index] });
  return path.reverse();
}

function createPilot(hook) {
  const base = rockGrid(hook), CONFIG = hook.CONFIG;
  let path = null, pathFor = null, replanAt = 0, coldMode = false, charging = false, pushUntil = 0, anchorX = 0, anchorY = 0, anchorFrame = 0;

  // Where to go: the truck when carrying, else the waiting survivor with the least time left; above the water when it is too deep to reach.
  function target() {
    const game = hook.game, level = game.L, flame = game.flame;
    if (flame.carrying) return { id: 'truck', x: CONFIG.rescue.x + CONFIG.rescue.width / 2, y: level.groundY - 16, kind: 'truck' };
    const waiting = hook.waitingSurvivors();
    if (!waiting.length) return null;
    const survivor = waiting.slice().sort((first, second) => first.time - second.time)[0];
    const centerX = survivor.x + survivor.w / 2, centerY = survivor.y + survivor.h / 2;
    if (survivor.flood >= 0) {
      const flood = level.floods[survivor.flood];
      if (flood.level < survivor.y - 6) return { id: survivor, x: flood.x + flood.w / 2, y: flood.level - 9, kind: 'hover', flood };
    }
    return { id: survivor, x: centerX, y: centerY, kind: 'survivor', survivor };
  }

  function heatKeys(wanted) {
    const heat = hook.game.flame.heat;
    return heat < wanted - 0.03 ? ['KeyX'] : heat > wanted + 0.03 ? ['KeyZ'] : [];
  }

  // The smallest charge whose blast, centred in front of the flame, still reaches the object (survivors behind it burn less).
  function chargeFor(object, flame) {
    const config = hook.CONFIG.charge, needed = hook.rectDistance(object, hook.flameCenterX() + flame.face * 10, hook.flameCenterY()) + 4;
    return clamp((needed - config.radiusMin) / (config.radiusMax - config.radiusMin), config.minCharge + 0.02, 1);
  }

  // The object that the next cells of the path run into, if any.
  function blocker(flame) {
    if (!path) return null;
    let nearest = null, nearestDistance = Infinity;
    for (const cell of path.slice(0, 4)) {
      if (!cell.extra) continue;
      for (const object of hook.game.L.objects) {
        if (!object.alive || object.kind === 'barrel') continue;
        const distance = hook.rectDistance(object, cell.x, cell.y);
        if (distance < 6 && distance < nearestDistance) { nearest = object; nearestDistance = distance; }
      }
    }
    return nearest;
  }

  function decide() {
    const game = hook.game, flame = game.flame, goal = target();
    if (!goal) return { keys: [] };
    const x = hook.flameCenterX(), y = hook.flameCenterY(), closed = hook.closedAt(x, y);
    if (flame.out > 0) return { keys: [] };
    if (closed && !flame.carrying && flame.reserve < 0.4) coldMode = true;
    if (!closed || flame.carrying || flame.reserve > 0.8) coldMode = false;
    if (game.frame - anchorFrame >= 60) {
      if (Math.hypot(x - anchorX, y - anchorY) < 3 && !charging && !coldMode) pushUntil = game.frame + 40;
      anchorX = x; anchorY = y; anchorFrame = game.frame;
    }
    if (goal.id !== pathFor || game.frame >= replanAt || !path) {
      path = findPath(planGrid(hook, base), x, y, goal.x, goal.y);
      pathFor = goal.id; replanAt = game.frame + 45;
    }
    if (path) while (path.length > 1 && !path[0].extra && Math.hypot(path[0].x - x, path[0].y - y) < CELL * 0.8) path.shift();

    const keys = [];
    let heat = flame.carrying ? CARRY_HEAT : FLY_HEAT;
    if (goal.kind === 'hover') heat = HOVER_HEAT;
    if (goal.kind === 'survivor' && Math.hypot(goal.x - x, goal.y - y) < 40) heat = Math.min(heat, HOVER_HEAT);
    if (coldMode) heat = COLD_HEAT;

    const object = !coldMode && !flame.carrying ? blocker(flame) : null;
    if (object) {
      const distance = hook.rectDistance(object, x, y), side = Math.sign(object.x + object.w / 2 - x) || 1;
      if (object.kind === 'concrete') {
        if (distance > CHARGE_STANDOFF && !charging) { /* keep approaching along the path */ } else {
          heat = CHARGE_HEAT;
          keys.push(...heatKeys(heat));
          if (flame.face !== side && !charging) keys.push(side > 0 ? 'ArrowRight' : 'ArrowLeft');
          else if (flame.heat >= hook.CONFIG.charge.minHeat) {
            if (flame.charge < chargeFor(object, flame)) { keys.push('KeyC'); charging = true; } else charging = false;
          }
          if (y > object.y + object.h / 2 + 2 && flame.vy > -0.3) keys.push('ArrowUp');
          return { keys };
        }
      } else heat = BREAK_HEAT[object.kind];
    }
    charging = false;
    keys.push(...heatKeys(heat));

    let wantX = 0, wantY = 0;
    const remaining = Math.hypot(goal.x - x, goal.y - y);
    if (path && path.length) {
      const waypoint = path[Math.min(LOOKAHEAD, path.length - 1)];
      const deltaX = waypoint.x - x, deltaY = waypoint.y - y, length = Math.hypot(deltaX, deltaY) || 1;
      const cruise = remaining < 25 ? 0.4 : remaining < 60 ? 0.7 : 1;
      wantX = deltaX / length * cruise; wantY = deltaY / length * cruise;
      if (remaining < 5) { wantX = 0; wantY = goal.kind === 'hover' ? clamp((goal.y - y) * 0.15, -0.5, 0.2) : 0; }
    } else {
      wantX = goal.x - x > 8 ? 0.8 : x - goal.x > 8 ? -0.8 : 0;
      wantY = goal.y < y ? -0.8 : 0.5;
    }
    if (game.frame < pushUntil && path && path.length) { const length = Math.hypot(wantX, wantY) || 1; wantX = wantX / length * 1.5; wantY = wantY / length * 1.5; }
    if (wantX - flame.vx > 0.08) keys.push('ArrowRight'); else if (flame.vx - wantX > 0.08) keys.push('ArrowLeft');
    if (wantY < -0.12 || (wantY < 0.1 && flame.vy > 0.1)) keys.push('ArrowUp'); else if (wantY > 0.35) keys.push('ArrowDown');
    const grab = goal.kind === 'survivor' && remaining < 11 && !flame.carrying;
    decide.info = { goal: goal.kind, path: path && path.slice(0, 4).map(cell => cell.x + ',' + cell.y + (cell.extra ? 'x' + cell.extra : '')).join(' '), want: [wantX.toFixed(2), wantY.toFixed(2)] };
    return { keys, grab };
  }
  return decide;
}

const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyX', 'KeyZ', 'KeyC'];
function applyKeys(driver, keys) {
  for (const code of KEYS) if (keys.includes(code)) driver.keyDown(code); else driver.keyUp(code);
}

// One frame of the pilot: sets the keys, taps Space to pick up, advances the simulation.
function step(driver, decide) {
  const decision = decide();
  applyKeys(driver, decision.keys);
  if (decision.grab) driver.tap('Space'); else driver.tick();
}

// Plays one level to its end; returns { state, result, stars, saved, lost, total, burn, frames, reason, driver }.
function playLevel(spec, limit = 20000) {
  const driver = boot({ seededMath: 1, skipRender: true });
  const hook = driver.hook, game = hook.game;
  driver.play(spec);
  const decide = createPilot(hook);
  for (let i = 0; i < limit && game.state === 'play'; i++) step(driver, decide);
  applyKeys(driver, []);
  for (let i = 0; i < 200 && game.state === 'play'; i++) driver.tick();
  const level = game.L;
  return { state: game.state, result: game.result, stars: game.stars, saved: level.saved, lost: level.lost, total: level.total, burn: level.maxBurn, frames: game.frame, reason: game.overReason, driver };
}

module.exports = { playLevel, createPilot, findPath, rockGrid, planGrid, applyKeys, step };
