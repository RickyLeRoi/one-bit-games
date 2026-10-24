// games/fiamma/test/helpers.js
'use strict';
// Fiamma specific helpers on top of the engine harness.
const engine = require('../../../engine/test/harness');

const boot = (options = {}) => engine.boot({ game: 'fiamma', ...options });

module.exports = { boot, randomKeysPolicy: engine.randomKeysPolicy, W: engine.W, H: engine.H };
