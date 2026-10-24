// games/fiamma/src/tutorial.js
'use strict';
// Step conditions read the game state, so doing things in a different order never blocks progress.
const objectGone = kind => game.L.objects.some(object => object.kind === kind && !object.alive);
const TUTORIAL = [
  { kb: 'FRECCE: VOLA. LA FIAMMA GALLEGGIA PIANO', touch: 'LEVETTA: VOLA. LA FIAMMA GALLEGGIA PIANO', pad: 'LEVETTA: VOLA. LA FIAMMA GALLEGGIA PIANO',
    done: () => game.used.move },
  { kb: 'X: PIU\' CALDA (PIU\' LUCE E FORZA)  Z: MENO CALDA', touch: '+ CALDO: PIU\' LUCE E FORZA   - CALDO: MENO', pad: 'R1: PIU\' CALDA (LUCE E FORZA)  L1: MENO',
    done: () => game.used.heat },
  { text: 'AVVICINATI AI CAVI: SI FONDONO CON CALORE MEDIO', done: () => objectGone('cable') },
  { text: 'BRUCIA IL LEGNO DELLA STANZA PER ENTRARE', done: () => objectGone('wood') },
  { kb: 'SPAZIO: PRENDI IL SOPRAVVISSUTO. TROPPO CALORE LO USTIONA', touch: 'PRENDI: RACCOGLI IL SOPRAVVISSUTO. TROPPO CALORE LO USTIONA', pad: 'A: PRENDI IL SOPRAVVISSUTO. TROPPO CALORE LO USTIONA',
    done: () => game.L.survivors.some(survivor => survivor.state !== 'waiting') },
  { text: 'PORTALO AL CAMION A SINISTRA. SENZA CALORE NON SALE', done: () => game.L.saved > 0 },
  { kb: 'TIENI C: CARICA. RILASCIA PER ROMPERE IL CEMENTO', touch: 'TIENI CARICA, POI RILASCIA: ROMPE IL CEMENTO', pad: 'TIENI B: CARICA. RILASCIA PER ROMPERE IL CEMENTO',
    done: () => game.used.blast || objectGone('concrete') },
  { text: "SOPRA L'ACQUA LA FIAMMA LA FA EVAPORARE. NON TOCCARLA", done: () => game.used.evaporate },
  { text: "PORTA IN SALVO ANCHE L'ALTRO SOPRAVVISSUTO", done: () => game.L.saved > 1 },
];

const tutorialText = Steps.text;

function updateTutorial() {
  if (game.tut) Steps.update(game.tut, TUTORIAL, () => Sfx.play('ui'));
}
