// Headless LifeEngine benchmark and experiment runner.
//
// usage:   node tools/bench.js [cols] [rows] [warmup_ticks] [timed_ticks]
// env:     SEED=<int>               RNG seed (default fixed, so runs repeat exactly)
//          SPECIES_THRESHOLD=<num>  Hyperparams.speciesThreshold for this run
// profile: node --cpu-prof --cpu-prof-dir=prof tools/bench.js ...
//          node tools/analyze-prof.js prof/<file>.cpuprofile
//
// The RNG is seeded so two runs evolve the identical world. That makes
// before/after timings comparable, and doubles as a correctness check: a
// change that should not affect behaviour must reproduce the population
// trace exactly.

const path = require('path');

const REPO = path.resolve(__dirname, '..');
const COLS = parseInt(process.argv[2] || '160');
const ROWS = parseInt(process.argv[3] || '120');
const WARM = parseInt(process.argv[4] || '20000');
const N    = parseInt(process.argv[5] || '5000');

// ---------------------------------------------------------------
// Seeded RNG, installed before anything from the engine loads.
// ---------------------------------------------------------------
let _seed = (parseInt(process.env.SEED || '625341585') >>> 0) || 1;
Math.random = function () {
    _seed ^= _seed << 13; _seed >>>= 0;
    _seed ^= _seed >> 17;
    _seed ^= _seed << 5;  _seed >>>= 0;
    return _seed / 4294967296;
};

// ---------------------------------------------------------------
// Replace the two DOM-bound modules with inert stubs. A benchmark
// wants zero render cost anyway.
// ---------------------------------------------------------------
function stubModule(relPath, exports) {
    const full = require.resolve(path.join(REPO, relPath));
    require.cache[full] = { id: full, filename: full, loaded: true, exports };
}

class StubRenderer {
    constructor(_c, _id, cell_size) {
        this.cell_size = cell_size;
        this.canvas = { width: 800, height: 600 };
        this.width = 800; this.height = 600;
        this.cells_to_render = new Set();
        this.cells_to_highlight = new Set();
        this.highlighted_cells = new Set();
    }
    fillWindow() {}
    fillShape(h, w) { this.height = h; this.width = w; }
    clear() {} renderFullGrid() {} renderCell() {} renderOrganism() {}
    renderCells() { this.cells_to_render.clear(); }
    addToRender() {}
    renderHighlights() { this.cells_to_highlight.clear(); }
    highlightOrganism() {} highlightCell() {} renderCellHighlight() {} clearAllHighlights() {}
}
class StubController {
    constructor() {}
    setControlPanel() {} defineZoomControls() {} resetView() {}
}
stubModule('src/Rendering/Renderer', StubRenderer);
stubModule('src/Controllers/EnvironmentController', StubController);

const jq = new Proxy(function () {}, {
    get(_t, p) {
        if (p === 'height') return () => 600;
        if (p === 'width')  return () => 800;
        if (p === 'val')    return () => 0;
        if (p === 'is')     return () => false;
        if (p === 'text')   return () => '';
        if (p === 'length') return 0;
        if (p === Symbol.iterator) return function* () {};
        if (p === 'then') return undefined;
        return () => jq;
    },
    apply() { return jq; },
    set() { return true; },
});
global.$ = () => jq;
global.jQuery = global.$;
global.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ getContext: () => ({}) }), addEventListener: () => {},
};
global.window = { addEventListener: () => {} };

// ---------------------------------------------------------------
const WorldConfig      = require(path.join(REPO, 'src/WorldConfig'));
const WorldEnvironment = require(path.join(REPO, 'src/Environments/WorldEnvironment'));
const Hyperparams      = require(path.join(REPO, 'src/Hyperparameters'));
const FossilRecord     = require(path.join(REPO, 'src/Stats/FossilRecord'));

if (process.env.SPECIES_THRESHOLD !== undefined) {
    Hyperparams.speciesThreshold = parseFloat(process.env.SPECIES_THRESHOLD);
}
const PhyloRecord = require(path.join(REPO, 'src/Stats/PhyloRecord'));
if (process.env.PHYLO) PhyloRecord.enabled = true;

WorldConfig.headless = true;
WorldConfig.auto_reset = true;
WorldConfig.auto_pause = false;

const fakeEngine = { fps: 60, last_fps: 60, running: false, start() {}, stop() {}, restart() {} };
const env = new WorldEnvironment(fakeEngine, 5);
env.resizeGridColRow(5, COLS, ROWS);
env.reset(false);

const squares = env.grid_map.cols * env.grid_map.rows;
console.log(`grid      : ${env.grid_map.cols} x ${env.grid_map.rows} = ${squares.toLocaleString()} squares`);
console.log(`seed      : ${process.env.SEED || 'default'}   speciesThreshold: ${Hyperparams.speciesThreshold}`);

function stats() {
    let cells = 0, eyes = 0, movers = 0;
    for (const o of env.organisms) {
        cells += o.anatomy.cells.length;
        if (o.anatomy.is_mover) movers++;
        for (const c of o.anatomy.cells) if (c.state && c.state.name === 'eye') eyes++;
    }
    return { orgs: env.organisms.length, cells, eyes, movers };
}

const t0 = process.hrtime.bigint();
const step = Math.max(Math.floor(WARM / 10), 1);
for (let i = 0; i < WARM; i++) {
    env.update();
    if ((i + 1) % step === 0) {
        const p = stats();
        const el = Number(process.hrtime.bigint() - t0) / 1e9;
        console.log(`  tick ${String(i + 1).padStart(9)}  ${el.toFixed(1).padStart(7)}s`
            + `  orgs ${String(p.orgs).padStart(6)}  cells ${String(p.cells).padStart(7)}`
            + `  species ${String(FossilRecord.numExtantSpecies()).padStart(5)}`
            + `  resets ${env.reset_count}`);
    }
}
const t1 = process.hrtime.bigint();
const w = stats();
console.log(`warmup    : ${WARM.toLocaleString()} ticks in ${(Number(t1 - t0) / 1e9).toFixed(1)}s`
    + ` -> ${w.orgs} orgs, ${w.cells} cells, ${w.eyes} eyes, ${w.movers} movers`);

const start = process.hrtime.bigint();
for (let i = 0; i < N; i++) env.update();
const end = process.hrtime.bigint();

const secs = Number(end - start) / 1e9;
const s = stats();
console.log(`\n--- timed run (${N.toLocaleString()} ticks) ---`);
console.log(`ticks / sec         : ${Math.round(N / secs).toLocaleString()}`);
console.log(`ms / tick           : ${(secs / N * 1000).toFixed(3)}`);
console.log(`organisms at end    : ${s.orgs}`);
console.log(`us / organism-tick  : ${(secs / N / Math.max(s.orgs, 1) * 1e6).toFixed(2)}`);

// ---------------------------------------------------------------
// Species structure
// ---------------------------------------------------------------
const extant = Object.values(FossilRecord.extant_species);
extant.sort((a, b) => b.population - a.population);

const SHORT = { mouth: 'm', producer: 'p', mover: 'v', killer: 'k', armor: 'a', eye: 'e' };
function plan(sp) {
    if (!sp.cell_counts) return '?';
    return Object.keys(SHORT)
        .filter(k => sp.cell_counts[k] > 0)
        .map(k => `${SHORT[k]}${sp.cell_counts[k]}`).join(' ');
}

const top = extant.slice(0, 8);
const covered = top.reduce((a, sp) => a + sp.population, 0);

console.log(`\n--- species ---`);
console.log(`extant species      : ${extant.length}`);
console.log(`species ever founded: ${FossilRecord.species_created || 0}`);
console.log(`extinct recorded    : ${FossilRecord.numExtinctSpecies()}`);
console.log(`top ${top.length} cover        : ${s.orgs ? (covered / s.orgs * 100).toFixed(1) : 0}% of organisms`);
console.log(`\n  ${'species'.padEnd(11)} ${'pop'.padStart(6)}  ${'depth'.padStart(5)}  ${'born'.padStart(7)}  body plan`);
for (const sp of top) {
    console.log(`  ${sp.name.padEnd(11)} ${String(sp.population).padStart(6)}  `
        + `${String(FossilRecord.lineageDepth(sp)).padStart(5)}  `
        + `${String(sp.start_tick).padStart(7)}  ${plan(sp)}`);
}

// Effective number of species: inverse Simpson, 1 / sum(p^2). A raw count is
// dominated by the cloud of brand-new single-organism mutants around each
// real species; this weights by population, so a world of one big species
// plus 100 singletons reads as ~1, not 101.
let simpson = 0;
for (const sp of extant) {
    const p = s.orgs ? sp.population / s.orgs : 0;
    simpson += p * p;
}
const sizeable = extant.filter(sp => s.orgs && sp.population / s.orgs >= 0.01).length;
console.log(`\neffective species   : ${simpson > 0 ? (1 / simpson).toFixed(1) : 0}   (inverse Simpson)`);
console.log(`species >= 1% of pop: ${sizeable}`);

// Lineage of the most populous species, root last. This is what a tree is
// made of - and what fossilize() used to throw away.
if (top.length) {
    console.log(`\nlineage of ${top[0].name}:`);
    let cur = top[0];
    const seen = new Set();
    let guard = 0;
    while (cur && !seen.has(cur.name) && guard++ < 40) {
        seen.add(cur.name);
        const life = cur.extinct
            ? `${cur.start_tick}-${cur.end_tick}`
            : `${cur.start_tick}-now`;
        console.log(`  ${cur.name}  ${life.padEnd(13)}  ${String(cur.cumulative_pop).padStart(7)} ever lived  ${plan(cur)}`);
        cur = cur.ancestor_name ? FossilRecord.lookupSpecies(cur.ancestor_name) : null;
    }
    if (cur && guard >= 40) console.log('  ...');
}

// Eras and extinction events (src/Stats/EraRecord.js).
const EraRecord = require(path.join(REPO, 'src/Stats/EraRecord'));
const { eras, events } = EraRecord.summary();
const GUILD = { plant: 'plant', armed_plant: 'armed plant', grazer: 'grazer', predator: 'predator', unknown: '?' };
const pct = x => `${Math.round(x * 100)}%`;
const k = t => t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}k` : `${t}`;

console.log(`\n--- eras (${eras.length}) ---`);
console.log(`   #  ${'ticks'.padEnd(15)} ${'ruler'.padEnd(11)} ${'guild'.padEnd(11)} ${'plan'.padEnd(16)} peak  ${'ended'.padEnd(9)} mix: plant/armed/graze/pred`);
for (const e of eras) {
    const span = `${k(e.start_tick)}-${e.end_tick == null ? 'now' : k(e.end_tick)}`;
    const planStr = e.plan ? plan({ cell_counts: e.plan }) : '?';
    const m = e.guild_mix;
    console.log(`  ${String(e.index).padStart(2)}  ${span.padEnd(15)} ${e.species.padEnd(11)} `
        + `${GUILD[e.guild].padEnd(11)} ${planStr.padEnd(16)} ${pct(e.peak_share).padStart(4)}  `
        + `${e.ended_by.padEnd(9)} ${pct(m.plant)}/${pct(m.armed_plant)}/${pct(m.grazer)}/${pct(m.predator)}`);
}

console.log(`\n--- extinction events (${events.length}) ---`);
for (const ev of events) {
    const lost = ev.lost.length
        ? '  lost: ' + ev.lost.map(l => `${l.name} (${GUILD[l.guild]}, ${l.ever_lived})`).join(', ')
        : '';
    console.log(`  ${k(ev.start_tick).padStart(6)}-${k(ev.trough_tick).padEnd(6)} ${ev.type.padEnd(16)} `
        + `pop ${ev.peak_pop}->${ev.trough_pop} (-${pct(ev.drop)})  `
        + `lineages lost ${ev.lineages_lost} of ${ev.lineages_lost + ev.lineages_survived} (${pct(ev.lineage_loss)})${lost}`);
}

// Phylogeny integrity (PHYLO=1): every node in the map set must trace back
// to a root through nodes that are themselves in the map, and pruning must
// actually be bounding memory.
if (PhyloRecord.enabled) {
    const nodes = PhyloRecord.nodes;
    let in_map = 0, roots = 0, broken = 0, with_series = 0, points = 0;
    for (const n of nodes.values()) {
        if (!n.in_map) continue;
        in_map++;
        if (n.series.length) with_series++;
        points += n.series.length;
        if (!n.ancestor) { roots++; continue; }
        let cur = n, guard = 0, ok = true;
        while (cur.ancestor && guard++ < 100000) {
            const p = nodes.get(cur.ancestor);
            if (!p || !p.in_map) { ok = false; break; }
            cur = p;
        }
        if (!ok) broken++;
    }
    const founded = FossilRecord.species_created || 0;
    console.log(`\n--- phylogeny ---`);
    console.log(`species founded     : ${founded}`);
    console.log(`held in memory      : ${nodes.size}  (${founded ? (nodes.size / founded * 100).toFixed(1) : 0}% of founded)`);
    console.log(`in the map          : ${in_map}  roots ${roots}  broken lineages ${broken}`);
    console.log(`series points       : ${points} across ${with_series} species`);
}

// Population trace for parity checks, one line, easy to diff.
console.log(`\ntrace: ${s.orgs} ${s.cells} ${s.eyes} ${s.movers}`);
