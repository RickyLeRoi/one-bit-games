// games/fiamma/src/config.js
'use strict';
// Units: pixels and frames (60 frames = 1 second). The world is a long side view: the rescue truck on the left, the survivors to the right,
// in chambers behind a breakable wall or on ledges inside flooded basins. Walls, floors and breakable objects are one terrain mask.
const CONFIG = {
  W: 384, H: 216,
  input: { deadzone: 0.18, stickRadius: 46 },
  maxParticles: 400,
  touchGutter: 84,
  world: { width: 1152, height: 240, tutorialWidth: 640, ground: 22, ceiling: 10, startX: 36 },
  material: { rock: 1, concrete: 2, beam: 3, wood: 4, cable: 5, barrel: 6 },
  rescue: { x: 8, width: 56 },                     // the truck: a carried survivor is handed over inside this span
  flame: {
    w: 8, h: 8,
    startHeat: 0.4, minHeat: 0.1, heatRate: 0.012,   // heat 0..1 changes by heatRate per frame while a heat button is held
    stages: [0.25, 0.5, 0.75],                       // heat thresholds between the four looks of the flame (red, green, blue, white)
    slowSpeed: 0.9, fastSpeed: 2.2, response: 0.1,   // top speed at heat 0 and 1 (px per frame), share of the speed gap closed per frame
    hover: 0.2,                                      // sink speed with no vertical input
    carrySpeed: 0.8, carryMinHeat: 0.35,             // carrying slows down; below this heat a carried survivor drags the flame down
    sinkSpeed: 0.6,                                  // fall speed when the flame cannot lift (too cold with a survivor, empty reserve)
    outTime: 90, outRise: 0.05,                      // frames the flame stays out after touching water, and how fast it floats up meanwhile
  },
  // Reserve of a closed place (rooms, chambers): 0..1. Drain per frame = base + drainHeat * heat^2; flying open is free.
  reserve: { drainBase: 0.0004, drainHeat: 0.002, rechargeOpen: 0.01, rechargeCold: 0.003, coldHeat: 0.2, emptyHeat: 0.1, resume: 0.2 },
  charge: { rate: 0.006, slow: 0.5, minHeat: 0.5, minCharge: 0.1, cost: 0.0015, radiusMin: 14, radiusMax: 56, reach: 10 },
  // Burnable things: frames of exposure at full heat (the time at a lower heat is frames / heat) and the heat needed.
  objects: {
    wood: { minHeat: 0.1, frames: 20 }, cable: { minHeat: 0.25, frames: 30 },
    beam: { minHeat: 0.5, frames: 70 }, barrel: { minHeat: 0.75, frames: 30 },
    reach: 9,                                        // px from the centre of the flame to the object
    cooling: 0.004,                                  // exposure lost per frame when the flame is away
    barrelRadius: 30, chainDelay: 8,
  },
  blast: { burnFactor: 1, burn: 1.4, shake: 8 },     // survivors inside radius * burnFactor of a blast burn, up to `burn` at its centre
  survivor: {
    w: 6, h: 8, grabRadius: 14,
    time: 3000, dryRate: 0.2,                        // frames of life; a survivor under water loses 1 per frame, a dry one dryRate
    burnNear: 20, burnHeat: 0.6, burnRate: 0.012,    // too close to a flame hotter than burnHeat
    steamRadius: 36, steamHeat: 0.45, steamRate: 0.012,
  },
  flood: { evaporate: 0.05, evaporateHeat: 0.25, reach: 18, depthStart: 17, depthCap: 26 },   // evaporate: px per frame at heat 0 + heat * evaporateHeat
  base: 3, perLoop: 1, max: 6,
  score: { saved: 100, starBonus: [0, 0, 100, 250], twoStars: 0.75, threeStarsBurn: 0.5 },
};
