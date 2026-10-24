// games/fiamma/src/sprites.js
'use strict';
const SPRITES = {};

// The flame is always the same drop (9 x 13); only its fill changes with the heat, like the colours of a real flame turning white:
// 0 sparse dots (red), 1 stripes (green), 2 dense (blue), 3 solid (white). The contour is always drawn, two eyes stay black.
const FLAME_MASK = [
  '....1....',
  '....1....',
  '...111...',
  '...111...',
  '..11111..',
  '..11111..',
  '.1111111.',
  '.1111111.',
  '111111111',
  '111111111',
  '111111111',
  '.1111111.',
  '..11111..',
];
const FLAME_EYES = [[3, 9], [5, 9]];
const FLAME_FILL = [
  (x, y, phase) => (x + y * 2 + phase) % 4 === 0,
  (x, y, phase) => (y + phase) % 2 === 0,
  (x, y, phase) => (x + phase) % 2 === 0 || y % 2 === 0,
  () => true,
];

function buildFlame(stage, phase) {
  const inside = (x, y) => FLAME_MASK[y] !== undefined && FLAME_MASK[y][x] === '1';
  return makeSprite(FLAME_MASK.map((row, y) => [...row].map((cell, x) => {
    if (cell !== '1') return '.';
    const contour = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (FLAME_EYES.some(([eyeX, eyeY]) => eyeX === x && eyeY === y)) return '.';
    return contour || FLAME_FILL[stage](x, y, phase) ? '#' : '.';
  }).join('')));
}
SPRITES.flame = [0, 1, 2, 3].map(stage => [buildFlame(stage, 0), buildFlame(stage, 1)]);

// A survivor waiting (6 x 8), arms up to call; the second frame waves.
SPRITES.survivor = makeSprite([
  '..##..',
  '..##..',
  '.####.',
  '#.##.#',
  '..##..',
  '.#..#.',
  '.#..#.',
  '##..##',
]);
SPRITES.survivorWave = makeSprite([
  '..##..',
  '..##.#',
  '.####.',
  '..##..',
  '..##..',
  '.#..#.',
  '.#..#.',
  '##..##',
]);

// A fuel drum (6 x 8).
SPRITES.barrel = makeSprite([
  '.####.',
  '######',
  '#....#',
  '######',
  '######',
  '#....#',
  '######',
  '.####.',
]);

SPRITES.starOn = makeSprite([
  '....#....',
  '....#....',
  '...###...',
  '#########',
  '.#######.',
  '..#####..',
  '..##.##..',
  '.##...##.',
  '.#.....#.',
]);
SPRITES.starOff = outlineSprite(SPRITES.starOn);

// Icon source for the build (32 columns wide): the flame over the wreck of a wall, a survivor waiting beside it.
SPRITES.icon = makeSprite([
  '................................',
  '.............#..................',
  '.............#..................',
  '............###..............#..',
  '............###.............###.',
  '...........#####..........######',
  '...........#####.......#########',
  '..........#######.....##########',
  '..........#.#####.....##########',
  '.........#########....##########',
  '.........#########....##########',
  '.........#.#######....##########',
  '..........#########...##########',
  '...........#######....##########',
  '............#####...............',
  '................................',
  '.........................##.....',
  '.........................##.....',
  '........................####....',
  '.......................#.##.#...',
  '.........................##.....',
  '........................#..#....',
  '........................#..#....',
  '.......................##..##...',
  '................................',
  '################################',
]);
