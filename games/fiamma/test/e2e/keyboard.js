// games/fiamma/test/e2e/keyboard.js
'use strict';
const path = require('path');
const { GAME_URL, SHOTS, check, onlyBlackWhite, startPlay, state, collectErrors } = require('./lib');

module.exports = async browser => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await page.goto(GAME_URL);
  await page.waitForTimeout(500);
  await startPlay(page);
  let gameState = await state(page);
  check(gameState.st === 'play' && gameState.tutorial, "tastiera: dal titolo all'addestramento (" + gameState.st + ')');

  const startX = gameState.x;
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
  gameState = await state(page);
  check(gameState.x > startX + 5, 'tastiera: destra muove la fiamma (' + startX.toFixed(0) + ' -> ' + gameState.x.toFixed(0) + ')');

  const startHeat = gameState.heat;
  await page.keyboard.down('KeyX'); await page.waitForTimeout(400); await page.keyboard.up('KeyX');
  gameState = await state(page);
  check(gameState.heat > startHeat + 0.1, 'tastiera: X alza il calore (' + startHeat.toFixed(2) + ' -> ' + gameState.heat.toFixed(2) + ')');
  const hotHeat = gameState.heat;
  await page.keyboard.down('KeyZ'); await page.waitForTimeout(400); await page.keyboard.up('KeyZ');
  check((await state(page)).heat < hotHeat - 0.1, 'tastiera: Z abbassa il calore');

  await page.keyboard.down('KeyX'); await page.waitForTimeout(700); await page.keyboard.up('KeyX');
  await page.keyboard.down('KeyC'); await page.waitForTimeout(400);
  gameState = await state(page);
  check(gameState.charging && gameState.charge > 0.1, 'tastiera: C carica a calore alto (carica ' + gameState.charge.toFixed(2) + ')');
  await page.keyboard.up('KeyC'); await page.waitForTimeout(100);
  gameState = await state(page);
  check(!gameState.charging && gameState.used.blast, 'tastiera: rilasciare C scarica il colpo');

  await page.keyboard.press('KeyN'); await page.waitForTimeout(100);
  gameState = await state(page);
  check(!gameState.tutorial && gameState.n === 1, "tastiera: N salta l'addestramento (livello " + gameState.n + ')');
  await startPlay(page);
  const startY = (await state(page)).y;
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowDown');
  check((await state(page)).y > startY + 10, 'tastiera: giu fa scendere la fiamma');
  const colors = await onlyBlackWhite(page);
  check(colors.bad === 0 && colors.white > 0, 'tastiera: solo bianco, nero e rosso (' + colors.bad + ' pixel fuori palette)');
  await page.screenshot({ path: path.join(SHOTS, 'fiamma_desktop.png') });
  check(errors.length === 0, 'tastiera: nessun errore JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await page.close();
};
