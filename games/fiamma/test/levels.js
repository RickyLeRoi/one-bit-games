#!/usr/bin/env node
// games/fiamma/test/levels.js
'use strict';
/*
 * Solvability: the scripted pilot (autopilot.js) wins levels 1-9, on at least 10 of the 12 fixed levels and on at least 15 of 20 daily
 * challenges. It is a heuristic, not an oracle: a few failures are allowed up to the stated limits (they point at the hardest levels),
 * failures on the first nine levels are not.
 *   node games/fiamma/test/levels.js        everything
 *   node games/fiamma/test/levels.js 7      level 7 only
 *   node games/fiamma/test/levels.js 0      the tutorial only
 */
const { playLevel } = require('./autopilot');
const { boot } = require('./helpers');

const FIXED_LEVELS = 12, MUST_WIN_LEVELS = 9, FIXED_MIN_WINS = 10;
const DAILY_DAYS = 20, DAILY_MIN_WINS = 15;

const only = process.argv[2] !== undefined ? Number(process.argv[2]) : null;
const hook = boot({ seededMath: 1, skipRender: true }).hook;
const won = result => result.state === 'done' && result.result === 'win';
const describe = result => (won(result) ? 'vinto, ' + result.stars + ' stelle' : result.state + (result.reason ? ' (' + result.reason + ')' : '')) + ', salvati ' + result.saved + '/' + result.total + ', persi ' + result.lost + ', ustioni ' + Math.round(result.burn * 100) + '%, ' + result.frames + ' frame';
let failures = 0, fixedWins = 0;
const startTime = Date.now();

if (only === 0) {
  const result = playLevel(hook.tutorialSpec());
  console.log((won(result) ? '  OK   ' : '  FAIL ') + 'addestramento: ' + describe(result));
  process.exit(won(result) ? 0 : 1);
}
for (let level = 1; level <= FIXED_LEVELS; level++) {
  if (only && only !== level) continue;
  const result = playLevel(hook.levelSpec(level));
  const isWon = won(result), mustWin = level <= MUST_WIN_LEVELS;
  console.log((isWon ? '  OK   ' : mustWin ? '  FAIL ' : '  --   ') + 'livello ' + level + ': ' + describe(result));
  if (isWon) fixedWins++;
  if (!isWon && mustWin) failures++;
}
if (!only && fixedWins < FIXED_MIN_WINS) { failures++; console.log('  FAIL livelli fissi vinti: ' + fixedWins + '/' + FIXED_LEVELS + ' (minimo ' + FIXED_MIN_WINS + ')'); }
if (!only) {
  let wins = 0;
  const losses = [];
  for (let day = 1; day <= DAILY_DAYS; day++) {
    const date = '2026-10-' + String(day).padStart(2, '0');
    const result = playLevel(hook.dailySpec(date));
    if (won(result)) wins++; else losses.push(date + ' (' + describe(result) + ')');
  }
  const enough = wins >= DAILY_MIN_WINS;
  console.log((enough ? '  OK   ' : '  FAIL ') + 'sfide del giorno: ' + wins + '/' + DAILY_DAYS + ' vinte (minimo ' + DAILY_MIN_WINS + ')' + (losses.length ? '\n         perse: ' + losses.join('\n                ') : ''));
  if (!enough) failures++;
}
console.log('\n' + (failures ? failures + ' controlli falliti' : 'livelli risolvibili') + ' in ' + Math.round((Date.now() - startTime) / 1000) + ' s');
process.exit(failures ? 1 : 0);
