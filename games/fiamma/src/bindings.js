// games/fiamma/src/bindings.js
'use strict';
// Arrows / WASD fly, X (held) = hotter, Z (held) = cooler, C (held) = charge, released = blast, Space = pick up or put down.
// Gamepad: stick / d-pad fly, R1 hotter, L1 cooler, B (held) charge, A pick up, Y replay (daily challenge in menu; skips the tutorial), Start pause, Back restart.
// Continuous axes per frame: { hx, up, down, heatUp, heatDown, charge } in [-1,1]/[0,1].
function composeAxes({ keys, pad, touch }) {
  const keyboardX = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const keyboardUp = keys.ArrowUp || keys.KeyW ? 1 : 0;
  const keyboardDown = keys.ArrowDown || keys.KeyS ? 1 : 0;
  let padX = 0, padUp = 0, padDown = 0, padHeatUp = 0, padHeatDown = 0, padCharge = 0, padActive = false;
  if (pad) {
    let x = pad.axis(pad.axes[0] || 0), y = pad.axis(pad.axes[1] || 0);
    if (pad.pressed(14)) x = -1; if (pad.pressed(15)) x = 1;
    if (pad.pressed(12)) y = -1; if (pad.pressed(13)) y = 1;
    padHeatUp = pad.pressed(5) ? 1 : 0; padHeatDown = pad.pressed(4) ? 1 : 0; padCharge = pad.pressed(1) ? 1 : 0;
    if (x || y || padHeatUp || padHeatDown || padCharge) padActive = true;
    padX = x; padUp = Math.max(0, -y); padDown = Math.max(0, y);
  }
  const strongest = (...values) => values.reduce((strongest, candidate) => (Math.abs(candidate) > Math.abs(strongest) ? candidate : strongest), 0);
  return {
    hx: strongest(keyboardX, padX, touch.stickX),
    up: Math.max(keyboardUp, padUp, Math.max(0, -touch.stickY)),
    down: Math.max(keyboardDown, padDown, Math.max(0, touch.stickY)),
    heatUp: Math.max(keys.KeyX ? 1 : 0, padHeatUp, touch.held.heatUp || 0),
    heatDown: Math.max(keys.KeyZ ? 1 : 0, padHeatDown, touch.held.heatDown || 0),
    charge: Math.max(keys.KeyC ? 1 : 0, padCharge, touch.held.charge || 0),
    padActive,
  };
}

Input.configure({
  keyEdges: {
    Enter: 'confirm', NumpadEnter: 'confirm', Space: 'grab',
    KeyP: 'pause', Escape: 'pause', KeyR: 'restart', KeyM: 'mute', KeyV: 'replay', KeyG: 'daily', KeyN: 'skip',
  },
  padEdges: { 0: ['confirm', 'grab'], 3: ['replay'], 9: ['pause'], 8: ['restart'] },
  blockKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'],
  rumble: { blast: [350, 1], boom: [250, 0.8], grab: [60, 0.3], saved: [100, 0.5], out: [200, 0.6], burn: [120, 0.5] },
  unlock: () => Sfx.unlock(),
  axes: composeAxes,
});
Sfx.onPlay(Input.rumble);
