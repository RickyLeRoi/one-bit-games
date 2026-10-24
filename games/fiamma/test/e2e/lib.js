// games/fiamma/test/e2e/lib.js
'use strict';
// Fiamma additions to the engine E2E helpers: the full state read includes the flame, its heat, reserve and charge.
const engineLib = require('../../../../engine/test/e2e/lib');

const state = page => page.evaluate(() => {
  const game = window.__debug.game, flame = game.flame;
  return {
    st: game.state, x: flame.x, y: flame.y, heat: flame.heat, reserve: flame.reserve, charge: flame.charge, charging: flame.charging,
    carrying: !!flame.carrying, tutorial: game.L.tutorial, n: game.L.n, used: game.used, saved: game.L.saved,
  };
});

module.exports = { ...engineLib, state };
