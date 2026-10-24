// games/fiamma/test/snapshot.js
'use strict';
const crypto = require('crypto');
// Simulation state used by the harness stateHash(): everything that must be identical for two runs to count as the same game.
// The terrain mask is hashed as a whole, so every destroyed wall counts.
module.exports = (hook, encodeStable) => {
  const game = hook.game, level = game.L, noObjects = new Map();
  const fixed = value => encodeStable(value, noObjects);
  const flame = game.flame;
  return {
    flame: fixed({ x: flame.x, y: flame.y, vx: flame.vx, vy: flame.vy, face: flame.face, heat: flame.heat, reserve: flame.reserve, charge: flame.charge, charging: flame.charging, out: flame.out, carrying: level.survivors.indexOf(flame.carrying) }),
    survivors: level.survivors.map(survivor => fixed({ state: survivor.state, x: survivor.x, y: survivor.y, burn: survivor.burn, time: survivor.time })),
    objects: level.objects.map(object => fixed({ alive: object.alive, progress: object.progress })),
    floods: level.floods.map(flood => fixed(flood.level)),
    terrain: crypto.createHash('sha1').update(level.terrain.cells).digest('hex'),
    pending: fixed(game.pending),
    saved: level.saved, lost: level.lost, score: game.score, particles: game.parts.length,
    camera: fixed([game.camX, game.camY]), frame: game.frame,
  };
};
