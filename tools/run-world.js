// Runs one headless world and prints its outcome as a single JSON line.
// Used by sweep.js; handy on its own too:
//
//   node tools/run-world.js '{"seed":11,"ticks":40000,"params":{"lifespanMultiplier":50}}'
//
// Metrics describe the LATE half of the run (from ticks/2 on), so the early
// transient - the first plants spreading over an empty board - doesn't dilute
// what the world settled into.

const { createWorld } = require('./harness');

const spec = JSON.parse(process.argv[2] || '{}');
const cols = spec.cols || 300;
const rows = spec.rows || 220;
const ticks = spec.ticks || 40000;
const seed = spec.seed || 1;
const params = spec.params || {};
const max_secs = spec.max_secs || 900;

const { env, FossilRecord, EraRecord, CellStates } = createWorld({ cols, rows, seed, params });
const BODY = CellStates.living.map(s => s.name);
const late_from = Math.floor(ticks / 2);

// Body size and composition, sampled every 500 ticks over the late half.
const late = { n: 0, orgs: 0, cells: 0, comp: {} };
for (const b of BODY) late.comp[b] = 0;

const t0 = Date.now();
let done = 0;
let timed_out = false;
for (let t = 1; t <= ticks; t++) {
    env.update();
    done = t;
    if (t >= late_from && t % 500 === 0) {
        const orgs = env.organisms;
        late.n++;
        late.orgs += orgs.length;
        for (let i = 0; i < orgs.length; i++) {
            const cells = orgs[i].anatomy.cells;
            late.cells += cells.length;
            for (let j = 0; j < cells.length; j++) late.comp[cells[j].state.name]++;
        }
    }
    // Some settings blow the population up and crawl; cap the wall clock so
    // one pathological run can't hold up the sweep.
    if (t % 1000 === 0 && (Date.now() - t0) / 1000 > max_secs) {
        timed_out = true;
        break;
    }
}
const secs = (Date.now() - t0) / 1000;

const mean = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : 0;

// EraRecord samples every 100 ticks; take the late half. After a world reset
// its clock restarts, so this is the late half of the final epoch.
const samples = EraRecord.samples.filter(s => s.tick >= late_from);
const guild_mix = {};
for (const g of ['plant', 'armed_plant', 'grazer', 'predator']) {
    guild_mix[g] = +mean(samples, s => s.guilds[g]).toFixed(3);
}

const composition = {};
const totalCells = Object.values(late.comp).reduce((a, b) => a + b, 0);
for (const b of BODY) composition[b] = totalCells ? +(late.comp[b] / totalCells).toFixed(4) : 0;

const { eras, events } = EraRecord.summary();
const SHORT = { mouth: 'm', producer: 'p', mover: 'v', killer: 'k', armor: 'a', eye: 'e' };
const planText = p => p ? Object.keys(SHORT).filter(k => p[k] > 0).map(k => SHORT[k] + p[k]).join(' ') : '?';

let cells_end = 0;
for (const o of env.organisms) cells_end += o.anatomy.cells.length;

const out = {
    config: spec.config || 'adhoc',
    params, seed, cols, rows,
    ticks: done, timed_out,
    secs: +secs.toFixed(1),
    tps: Math.round(done / Math.max(secs, 0.001)),
    resets: env.reset_count,
    alive_end: env.organisms.length > 0,
    pop_end: env.organisms.length,
    pop_late: Math.round(mean(samples, s => s.pop)),
    eff_species_late: +mean(samples, s => s.eff).toFixed(2),
    cells_per_org_late: late.orgs ? +(late.cells / late.orgs).toFixed(2) : 0,
    eye_late: +mean(samples, s => s.eye).toFixed(3),
    guild_mix,
    composition,
    eras: eras.length,
    era_rulers: eras.map(e => ({ guild: e.guild, plan: planText(e.plan), from: e.start_tick })),
    ruler_plans: new Set(eras.map(e => planText(e.plan))).size,
    mass_extinctions: events.filter(e => e.type === 'mass extinction').length,
    crashes: events.filter(e => e.type !== 'mass extinction').length,
    species_founded: FossilRecord.species_created || 0,
    trace: `${env.organisms.length} ${cells_end}`,
};
process.stdout.write(JSON.stringify(out) + '\n');
