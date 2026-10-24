// games/fiamma/test/e2e/touch.js
'use strict';
const path = require('path');
const { GAME_URL, SHOTS, check, state, collectErrors } = require('./lib');

module.exports = async browser => {
  const browserContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await browserContext.newPage();
  const errors = collectErrors(page);
  await page.goto(GAME_URL);
  await page.waitForTimeout(400);
  await page.touchscreen.tap(420, 200); await page.waitForTimeout(150);
  check(await page.evaluate(() => document.getElementById('touch').classList.contains('on')), 'telefono: i comandi touch compaiono al primo tocco');
  await page.touchscreen.tap(420, 200); await page.waitForTimeout(150);
  let gameState = await state(page);
  check(gameState.st === 'play', 'telefono: tocco = conferma nei menu (' + gameState.st + ')');

  const cdpSession = await browserContext.newCDPSession(page);
  const touch = (type, x, y, id = 1) => cdpSession.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] });
  const center = async selector => { const box = await (await page.$(selector)).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };
  const startX = gameState.x;
  await touch('touchStart', 150, 250);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', 150 + i * 10, 250); await page.waitForTimeout(20); }
  await page.waitForTimeout(700);
  await touch('touchEnd');
  gameState = await state(page);
  check(gameState.x > startX + 5, 'telefono: la levetta muove la fiamma (' + startX.toFixed(0) + ' -> ' + gameState.x.toFixed(0) + ')');

  const holdButton = async (selector, milliseconds) => {
    const [x, y] = await center(selector);
    await touch('touchStart', x, y, 2); await page.waitForTimeout(milliseconds);
    const during = await state(page);
    await touch('touchEnd', 0, 0, 2); await page.waitForTimeout(100);
    return during;
  };
  const before = (await state(page)).heat;
  const hotter = await holdButton('[data-hold="heatUp:1"]', 400);
  check(hotter.heat > before + 0.1, 'telefono: + CALDO alza il calore (' + before.toFixed(2) + ' -> ' + hotter.heat.toFixed(2) + ')');
  const cooler = await holdButton('[data-hold="heatDown:1"]', 400);
  check(cooler.heat < hotter.heat - 0.1, 'telefono: - CALDO abbassa il calore');
  await holdButton('[data-hold="heatUp:1"]', 700);
  const charging = await holdButton('[data-hold="charge:1"]', 400);
  check(charging.charging && charging.charge > 0.1, 'telefono: CARICA carica (' + charging.charge.toFixed(2) + ')');
  check((await state(page)).used.blast, 'telefono: rilasciare CARICA scarica il colpo');
  const [grabX, grabY] = await center('[data-edge="grab"]');
  await page.touchscreen.tap(grabX, grabY); await page.waitForTimeout(100);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('[data-edge="grab"]')).display !== 'none'), 'telefono: il pulsante PRENDI e visibile in gioco');
  await page.screenshot({ path: path.join(SHOTS, 'fiamma_phone.png') });
  check(errors.length === 0, 'telefono: nessun errore JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browserContext.close();
};
