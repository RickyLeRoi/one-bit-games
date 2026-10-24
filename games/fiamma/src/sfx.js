// games/fiamma/src/sfx.js
'use strict';
const Sfx = (() => {
  // The roar of the flame: a low rumble that gets brighter and louder with the heat, over a faint wind.
  function buildLoops({ context, master: masterGain, noiseSource, filter, gain }) {
    const windNoise = noiseSource(), windFilter = filter('lowpass', 400, 0.7), windGain = gain(0.03);
    windNoise.connect(windFilter); windFilter.connect(windGain); windGain.connect(masterGain);
    const fireNoise = noiseSource(), fireFilter = filter('bandpass', 500, 0.8), fireGain = gain(0);
    fireNoise.connect(fireFilter); fireFilter.connect(fireGain); fireGain.connect(masterGain);
    windNoise.start(); fireNoise.start();
    return { fireGain, fireFilter };
  }

  // levels = { heat } 0..1 (0 when nobody plays).
  function updateLoops(loops, levels, now) {
    loops.fireGain.gain.setTargetAtTime(levels.heat * 0.16, now, 0.1);
    loops.fireFilter.frequency.setTargetAtTime(350 + 1400 * levels.heat, now, 0.1);
  }

  const effects = ({ tone, noise }) => ({
    ui()      { tone(660, 990, 0.06, 'square', 0.08); },
    burn()    { noise(0.25, 'bandpass', 900, 300, 0.12); },
    melt()    { noise(0.35, 'lowpass', 1500, 300, 0.14); tone(300, 120, 0.3, 'sawtooth', 0.06); },
    charge()  { tone(200, 900, 0.5, 'sawtooth', 0.05); },
    blast()   { noise(0.6, 'lowpass', 900, 80, 0.4); tone(110, 40, 0.5, 'sawtooth', 0.2); },
    boom()    { noise(0.5, 'lowpass', 700, 60, 0.35); tone(90, 40, 0.4, 'square', 0.15); },
    steam()   { noise(0.25, 'highpass', 2500, 1500, 0.06); },
    out()     { noise(0.4, 'highpass', 1800, 600, 0.12); tone(300, 90, 0.35, 'triangle', 0.08); },
    grab()    { [523, 784].forEach((frequency, i) => tone(frequency, frequency, 0.1, 'triangle', 0.08, i * 0.09)); },
    drop()    { tone(400, 250, 0.1, 'triangle', 0.08); },
    saved()   { [523, 659, 784].forEach((frequency, i) => tone(frequency, frequency, 0.12, 'triangle', 0.1, i * 0.1)); },
    lost()    { [330, 262, 196].forEach((frequency, i) => tone(frequency, frequency, 0.18, 'triangle', 0.1, i * 0.16)); },
    empty()   { tone(400, 120, 0.6, 'square', 0.08); },
    win()     { [523, 659, 784, 1047].forEach((frequency, i) => tone(frequency, frequency, 0.14, 'square', 0.1, i * 0.12)); },
    fail()    { [392, 330, 262].forEach((frequency, i) => tone(frequency, frequency * 0.98, 0.2, 'triangle', 0.14, i * 0.18)); },
  });

  return Synth.create({ volume: 0.5, effects, loops: { build: buildLoops, update: updateLoops } });
})();
