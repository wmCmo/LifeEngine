// Parameter sweep: which evolution controls actually change what evolves?
//
//   node tools/sweep.js                      full one-at-a-time sweep
//   node tools/sweep.js --only lifespan      just the configs whose name matches
//   node tools/sweep.js --ticks 20000 --seeds 2 --jobs 8
//
// Moves ONE control at a time away from its default, runs each setting on the
// same seeds as the baseline, and compares. It's a sensitivity pass: ten
// controls at four values each is a million combinations, so first find out
// which ones matter, then explore those together.
//
// Each run is a separate process (tools/run-world.js) because the engine's
// modules are singletons and the seed must be installed before they load.
// Results land in runs/sweep-<time>/ as they finish: results.jsonl, then
// summary.md and summary.json once everything is in.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');

// ---------------------------------------------------------------- options

const argv = process.argv.slice(2);
function opt(name, def) {
    const i = argv.indexOf('--' + name);
    return i >= 0 ? argv[i + 1] : def;
}
const TICKS = parseInt(opt('ticks', '40000'));
const NSEEDS = parseInt(opt('seeds', '3'));
const COLS = parseInt(opt('cols', '300'));
const ROWS = parseInt(opt('rows', '220'));
const JOBS = parseInt(opt('jobs', String(Math.max(1, os.cpus().length - 2))));
const ONLY = opt('only', null);
const MAX_SECS = parseInt(opt('max-secs', '900'));
const PLAN = opt('plan', 'oat');

const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88].slice(0, NSEEDS);

// ---------------------------------------------------------------- what to vary

// Each dimension: a label, and for each value the parameter overrides it
// means. Defaults are in src/Hyperparameters.js.
const MUT = v => ({ addProb: v, changeProb: v, removeProb: v, brainMutationChance: v });
const DIMENSIONS = [
    ['extraMoverFoodCost',     [1, 2, 4, 8].map(v => [v, { extraMoverFoodCost: v }])],
    ['lifespanMultiplier',     [25, 50, 200].map(v => [v, { lifespanMultiplier: v }])],
    ['moversCanProduce',       [[true, { moversCanProduce: true }]]],
    ['foodProdProb',           [2, 10, 20].map(v => [v, { foodProdProb: v }])],
    ['foodDropProb',           [1, 5].map(v => [v, { foodDropProb: v }])],
    ['dontKillSameSpecies',    [[true, { dontKillSameSpecies: true }]]],
    ['instaKill',              [[true, { instaKill: true }]]],
    ['foodBlocksReproduction', [[false, { foodBlocksReproduction: false }]]],
    ['mutationRates',          [10, 50].map(v => [v, MUT(v)])],
    ['mutationSymmetryChance', [0, 50].map(v => [v, { mutationSymmetryChance: v }])],
    ['lookRange',              [10].map(v => [v, { lookRange: v }])],
];

// --plan energy: every combination of the three controls that changed the
// most in the one-at-a-time pass (docs/sweeps/sweep-1.md). The question is
// whether they interact - e.g. does more food help differently once movers
// can produce? A flat list of combinations hides that; the summary pivots it.
// First value of each factor is its default, so the all-defaults combination
// is the baseline.
const PLANS = {
    energy: [
        ['foodProdProb',     'food', [5, 7, 10, 14]],
        ['moversCanProduce', 'mcp',  [false, true]],
        ['foodDropProb',     'drop', [0, 5]],
    ],
    // Metabolic upkeep: a wide log range first, to find where it starts to
    // matter and where everything starves.
    'upkeep-cal': [
        ['upkeepScale', 'upkeep', [0, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02]],
    ],
    // The range upkeep-cal found to matter (0.0005-0.005; 0.01 kills half the
    // worlds, 0.02 all), crossed with Kleiber lifespan scaling.
    metabolism: [
        ['upkeepScale',      'upkeep', [0, 0.0005, 0.001, 0.002, 0.005]],
        ['lifespanExponent', 'lexp',   [1, 0.25]],
    ],
    // Swallowing: does eating prey whole, and only prey your own size or
    // smaller, make size pay? Share 0 with gape 0 is the original game.
    swallow: [
        ['swallowShare', 'swallow', [0, 0.5, 1]],
        ['gapeRatio',    'gape',    [0, 1, 2]],
    ],
};

let configs;
let FACTORS = null;
if (PLAN === 'oat') {
    configs = [{ name: 'baseline', params: {} }];
    for (const [dim, values] of DIMENSIONS) {
        for (const [v, params] of values) configs.push({ name: `${dim}=${v}`, params });
    }
} else if (PLANS[PLAN]) {
    FACTORS = PLANS[PLAN];
    configs = [{ name: 'baseline', params: {} }];
    const combos = FACTORS.reduce((acc, [, , values]) =>
        acc.flatMap(prefix => values.map(v => [...prefix, v])), [[]]);
    for (const combo of combos) {
        if (combo.every((v, i) => v === FACTORS[i][2][0])) {
            // all defaults: that's the baseline, already first
            configs[0].params = Object.fromEntries(combo.map((v, i) => [FACTORS[i][0], v]));
            continue;
        }
        configs.push({
            name: combo.map((v, i) => `${FACTORS[i][1]}=${v === true ? 1 : v === false ? 0 : v}`).join(' '),
            params: Object.fromEntries(combo.map((v, i) => [FACTORS[i][0], v])),
        });
    }
} else {
    console.error(`unknown plan "${PLAN}" (have: oat, ${Object.keys(PLANS).join(', ')})`);
    process.exit(1);
}
if (ONLY) configs = configs.filter(c => c.name === 'baseline' || c.name.includes(ONLY));

const runs = [];
for (const c of configs) {
    for (const seed of SEEDS) {
        runs.push({ config: c.name, params: c.params, seed, ticks: TICKS, cols: COLS, rows: ROWS, max_secs: MAX_SECS });
    }
}

// ---------------------------------------------------------------- run

// Down to the second, and never reuse a folder: two sweeps started in the
// same minute used to share one and mix their results.jsonl.
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
let OUT = path.join(REPO, 'runs', `sweep-${stamp}`);
for (let n = 2; fs.existsSync(OUT); n++) OUT = path.join(REPO, 'runs', `sweep-${stamp}-${n}`);
fs.mkdirSync(OUT, { recursive: true });
const jsonl = path.join(OUT, 'results.jsonl');

console.log(`sweep: ${configs.length} configs x ${SEEDS.length} seeds = ${runs.length} runs, `
    + `${TICKS.toLocaleString()} ticks, ${COLS}x${ROWS}, ${JOBS} at a time`);
console.log(`results -> ${path.relative(REPO, OUT)}`);

const results = [];
let next = 0, finished = 0;
const started = Date.now();

function launch() {
    if (next >= runs.length) return null;
    const spec = runs[next++];
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(__dirname, 'run-world.js'), JSON.stringify(spec)],
            { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('close', (code) => {
            finished++;
            let r;
            try {
                r = JSON.parse(out.trim().split('\n').pop());
            } catch (e) {
                r = { config: spec.config, seed: spec.seed, params: spec.params, failed: true,
                      error: (err || out || `exit ${code}`).slice(-400) };
            }
            results.push(r);
            fs.appendFileSync(jsonl, JSON.stringify(r) + '\n');
            const el = ((Date.now() - started) / 60000).toFixed(1);
            console.log(`[${String(finished).padStart(3)}/${runs.length}] ${el}m  `
                + `${spec.config.padEnd(28)} seed ${String(spec.seed).padEnd(3)} `
                + (r.failed ? `FAILED: ${r.error.split('\n')[0]}`
                    : `eff ${String(r.eff_species_late).padStart(5)}  cells/org ${String(r.cells_per_org_late).padStart(5)}  `
                    + `eras ${r.eras}  resets ${r.resets}${r.timed_out ? '  TIMED OUT' : ''}  ${r.secs}s`));
            resolve();
        });
    });
}

async function worker() {
    for (;;) {
        const p = launch();
        if (!p) return;
        await p;
    }
}

(async () => {
    await Promise.all(Array.from({ length: Math.min(JOBS, runs.length) }, worker));
    summarise();
})();

// ---------------------------------------------------------------- summary

function summarise() {
    const BODY = ['mouth', 'producer', 'mover', 'killer', 'armor', 'eye'];
    const GUILDS = ['plant', 'armed_plant', 'grazer', 'predator'];
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const sd = a => {
        if (a.length < 2) return 0;
        const m = avg(a);
        return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
    };

    const byConfig = new Map();
    for (const r of results) {
        if (!byConfig.has(r.config)) byConfig.set(r.config, []);
        byConfig.get(r.config).push(r);
    }

    function summarize(name) {
        const all = byConfig.get(name) || [];
        const ok = all.filter(r => !r.failed);
        const meanComp = {};
        for (const b of BODY) meanComp[b] = avg(ok.map(r => r.composition[b]));
        // How much the seeds disagree with each other about the body plan.
        const divergence = avg(ok.map(r => BODY.reduce((a, b) => a + Math.abs(r.composition[b] - meanComp[b]), 0)));
        const eff = ok.map(r => r.eff_species_late);
        const guild = {};
        for (const g of GUILDS) guild[g] = avg(ok.map(r => r.guild_mix[g]));
        return {
            name,
            params: all[0] ? all[0].params : {},
            runs: all.length,
            failed: all.length - ok.length,
            survived: ok.filter(r => r.resets === 0 && r.alive_end && !r.timed_out).length,
            timed_out: ok.filter(r => r.timed_out).length,
            eff_mean: avg(eff), eff_min: Math.min(...eff), eff_max: Math.max(...eff), eff_sd: sd(eff),
            cells_per_org: avg(ok.map(r => r.cells_per_org_late)),
            pop: avg(ok.map(r => r.pop_late)),
            eye: avg(ok.map(r => r.eye_late)),
            guild,
            composition: meanComp,
            divergence,
            eras: avg(ok.map(r => r.eras)),
            ruler_plans: avg(ok.map(r => r.ruler_plans)),
            mass_extinctions: avg(ok.map(r => r.mass_extinctions)),
            vestigial: avg(ok.map(r => r.vestigial_share || 0)),
            starved: avg(ok.map(r => r.starved_share_late || 0)),
            hunters: avg(ok.map(r => r.hunter_share_late || 0)),
            hunter_cells: avg(ok.map(r => r.hunter_cells_late || 0)),
            cells_max: avg(ok.map(r => r.cells_max_late || 0)),
            tps: avg(ok.map(r => r.tps)),
        };
    }

    const summaries = configs.map(c => summarize(c.name));
    const base = summaries[0];
    for (const s of summaries) {
        // How far this setting moved the average body plan from baseline.
        s.shift = BODY.reduce((a, b) => a + Math.abs(s.composition[b] - base.composition[b]), 0);
        const flags = [];
        if (s.name !== 'baseline') {
            if (s.survived < s.runs) flags.push(`${s.runs - s.survived} died`);
            if (base.eff_mean > 0) {
                const d = (s.eff_mean - base.eff_mean) / base.eff_mean;
                if (Math.abs(d) >= 0.25) flags.push(`diversity ${d > 0 ? '+' : ''}${Math.round(d * 100)}%`);
            }
            if (base.cells_per_org > 0) {
                const d = (s.cells_per_org - base.cells_per_org) / base.cells_per_org;
                if (Math.abs(d) >= 0.2) flags.push(`bodies ${d > 0 ? '+' : ''}${Math.round(d * 100)}%`);
            }
            if (s.shift >= 0.1) flags.push(`plan shift ${s.shift.toFixed(2)}`);
            if (s.divergence - base.divergence >= 0.05) flags.push('worlds disagree more');
        }
        s.flags = flags;
    }

    const pct = x => `${Math.round(x * 100)}`;
    const rows = summaries.map(s =>
        `| ${s.name} | ${s.survived}/${s.runs} | ${s.eff_mean.toFixed(1)} (${s.eff_min.toFixed(1)}-${s.eff_max.toFixed(1)}) `
        + `| ${s.cells_per_org.toFixed(2)} | ${pct(s.guild.plant)}/${pct(s.guild.armed_plant)}/${pct(s.guild.grazer)}/${pct(s.guild.predator)} `
        + `| ${pct(s.eye)}% | ${s.eras.toFixed(1)} | ${s.ruler_plans.toFixed(1)} | ${s.mass_extinctions.toFixed(1)} `
        + `| ${s.divergence.toFixed(2)} | ${s.shift.toFixed(2)} | ${Math.round(s.pop)} | ${Math.round(s.tps)} | ${s.flags.join(', ')} |`);

    const md = [
        `# Sweep ${stamp}`,
        '',
        `${configs.length} configs x ${SEEDS.length} seeds (${SEEDS.join(', ')}), ${TICKS.toLocaleString()} ticks, ${COLS}x${ROWS}.`,
        `Metrics are the late half of each run (from tick ${TICKS / 2}). One control moved at a time; everything else default.`,
        '',
        '- **survived**: seeds with no extinction-reset',
        '- **eff species**: effective number of species (inverse Simpson), mean (min-max over seeds)',
        '- **cells/org**: average body size',
        '- **guilds**: % plant / armed plant / grazer / predator',
        '- **ruler plans**: distinct body plans that ruled an era',
        '- **disagree**: how much the seeds differ from each other in body-plan composition',
        '- **shift**: how far the average body plan moved from baseline',
        '',
        '| config | survived | eff species | cells/org | guilds | eyes | eras | ruler plans | mass ext | disagree | shift | pop | tps | notable |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
        ...rows,
        '',
    ].join('\n');

    // Factorial plans: one pivot per metric, rows = the first factor, columns
    // = combinations of the rest. Interactions show up as rows that move
    // differently from column to column.
    let pivots = '';
    if (FACTORS) {
        const [rowF, ...colFs] = FACTORS;
        const colCombos = colFs.reduce((acc, [, , vals]) =>
            acc.flatMap(p => vals.map(v => [...p, v])), [[]]);
        const lbl = (f, v) => `${f[1]}=${v === true ? 1 : v === false ? 0 : v}`;
        const find = (rv, combo) => summaries.find(s =>
            s.params[rowF[0]] === rv && colFs.every((f, i) => s.params[f[0]] === combo[i]));
        const METRICS = [
            ['survived (of seeds)', s => `${s.survived}/${s.runs}`],
            ['effective species, mean ± sd', s => `${s.eff_mean.toFixed(1)} ± ${s.eff_sd.toFixed(1)}`],
            ['body size (cells/org)', s => s.cells_per_org.toFixed(2)],
            ['predators %', s => `${Math.round(s.guild.predator * 100)}`],
            ['plants (incl. armed) %', s => `${Math.round((s.guild.plant + s.guild.armed_plant) * 100)}`],
            ['eyes %', s => `${Math.round(s.eye * 100)}`],
            ['hunters (movers with a killer) %', s => `${Math.round(s.hunters * 100)}`],
            ['hunter body size (cells)', s => s.hunter_cells.toFixed(1)],
            ['largest body (cells)', s => s.cells_max.toFixed(1)],
            ['distinct ruling body plans', s => s.ruler_plans.toFixed(1)],
            ['seeds disagree', s => s.divergence.toFixed(2)],
            ['movers carrying a useless producer cell %', s => `${Math.round(s.vestigial * 100)}`],
            ['deaths by starvation %', s => `${Math.round(s.starved * 100)}`],
            ['population', s => `${Math.round(s.pop)}`],
        ];
        const head = `| ${rowF[1]} | ${colCombos.map(c => c.map((v, i) => lbl(colFs[i], v)).join(' ')).join(' | ')} |`;
        const sep = `|---|${colCombos.map(() => '---').join('|')}|`;
        const blocks = METRICS.map(([title, fmtCell]) => [
            `### ${title}`, '', head, sep,
            ...rowF[2].map(rv => `| ${rv} | ${colCombos.map(c => {
                const s = find(rv, c);
                return s && s.runs ? fmtCell(s) : '—';
            }).join(' | ')} |`),
            '',
        ].join('\n'));
        pivots = '\n## Pivots\n\n' + blocks.join('\n');
    }

    fs.writeFileSync(path.join(OUT, 'summary.md'), md + pivots);
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summaries, null, 2));
    console.log('\n' + md + pivots);
    console.log(`done in ${((Date.now() - started) / 60000).toFixed(1)} min -> ${path.relative(REPO, OUT)}`);
}
