// Evolves a world for the landing page's live background and saves it in the
// world format the worker loads (WorldSave), so the hero starts full of life
// instead of from a single organism.
//
//   node tools/make-hero-world.js <seed> <ticks> [out.json]
//
// Prints what the world looks like at the end, to compare candidates.

const fs = require('fs');
const { createWorld } = require('./harness');

const seed = parseInt(process.argv[2] || '11');
const ticks = parseInt(process.argv[3] || '30000');
const out = process.argv[4];

// The hero shows a fixed-size board, cropped to the screen, so every visitor
// sees the same world. "Size pays" gives the most varied bodies.
const COLS = 160, ROWS = 100;
const params = { swallowShare: 1, gapeRatio: 1 };

const w = createWorld({ cols: COLS, rows: ROWS, seed, params });
for (let t = 0; t < ticks; t++) w.env.update();

const guilds = { plant: 0, armed: 0, grazer: 0, predator: 0 };
let cells = 0, eyes = 0, biggest = 0;
for (const o of w.env.organisms) {
    const a = o.anatomy;
    let killer = false;
    for (const c of a.cells) {
        if (c.state === w.CellStates.killer) killer = true;
        if (c.state === w.CellStates.eye) eyes++;
    }
    cells += a.cells.length;
    biggest = Math.max(biggest, a.cells.length);
    guilds[a.is_mover ? (killer ? 'predator' : 'grazer') : (killer ? 'armed' : 'plant')]++;
}
const n = w.env.organisms.length;
let food = 0;
for (const col of w.env.grid_map.grid) for (const c of col) if (c.state === w.CellStates.food) food++;
const pct = x => Math.round(100 * x / Math.max(1, n));
console.log(JSON.stringify({
    seed, ticks: w.env.total_ticks, resets: w.env.reset_count, organisms: n,
    living_cover: +(cells / (COLS * ROWS)).toFixed(3), food_cover: +(food / (COLS * ROWS)).toFixed(3),
    guilds: { plant: pct(guilds.plant), armed: pct(guilds.armed), grazer: pct(guilds.grazer), predator: pct(guilds.predator) },
    eyes, biggest,
}));

if (out) {
    const text = JSON.stringify(w.env.serialize());
    fs.writeFileSync(out, text);
    console.log(`wrote ${out} (${Math.round(text.length / 1024)} KB)`);
}
