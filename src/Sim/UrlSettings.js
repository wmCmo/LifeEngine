// Simulation settings carried in the page URL, so a link reproduces a world:
//
//   evomap.html?seed=42&food=7&mcp=1&drop=5
//
// Short keys, because these links get pasted into chat. Each maps onto one
// or more fields of Hyperparams (src/Hyperparameters.js). Only settings that
// differ from the defaults need to appear.

const Hyperparams = require('../Hyperparameters');

// key, Hyperparams field(s), type, min, max, label, editor
//
// `editor` places the setting in the map's settings panel: its group, the
// field's label, the step for number inputs, and a tooltip. A setting marked
// `alias` is a shorthand that sets other settings (old links keep working);
// it never appears in links or in the editor itself.
const SETTINGS = [
    // Food
    ['food',      'foodProdProb',           'num',  0, 100,   v => `food ${v}`,
        { group: 'Food', label: 'food production %', step: 1, hint: 'chance a producer cell makes food each tick' }],
    ['drop',      'foodDropProb',           'num',  0, 100,   v => `food drop ${v}`,
        { group: 'Food', label: 'food from the sky', step: 1, hint: 'food dropped at random places every tick' }],
    ['mcp',       'moversCanProduce',       'bool', 0, 1,     v => v ? 'movers produce' : "movers don't produce",
        { group: 'Food', label: 'movers can produce food', hint: 'off: producer cells do nothing on a mover' }],
    ['block',     'foodBlocksReproduction', 'bool', 0, 1,     v => v ? 'food blocks births' : "food doesn't block births",
        { group: 'Food', label: 'food blocks births', hint: "on: a child can't be born on top of food" }],
    // Bodies and life
    ['life',      'lifespanMultiplier',     'num',  1, 10000, v => `lifespan ×${v}`,
        { group: 'Bodies', label: 'lifespan × (ticks per cell)', step: 10, hint: 'an organism lives this many ticks per cell of its body' }],
    ['lexp',      'lifespanExponent',       'num',  0, 2,     v => `lifespan exponent ${v}`,
        { group: 'Bodies', label: 'lifespan exponent', step: 0.25, hint: '1 = original (linear); 0.25 = Kleiber: bigger lives longer, with diminishing returns' }],
    ['movercost', 'extraMoverFoodCost',     'int',  0, 1000,  v => `mover cost +${v}`,
        { group: 'Bodies', label: 'mover birth cost +', step: 1, hint: 'extra food a mover needs to reproduce' }],
    ['rot',       'rotationEnabled',        'bool', 0, 1,     v => v ? 'rotation' : 'no rotation',
        { group: 'Bodies', label: 'rotation', hint: 'organisms rotate when born and while moving' }],
    ['max',       'maxOrganisms',           'int', -1, 1000000, v => v < 0 ? 'no population cap' : `max ${v} organisms`,
        { group: 'Bodies', label: 'max organisms (-1 = no cap)', step: 100, hint: 'births stop at this population' }],
    // Killing
    ['insta',     'instaKill',              'bool', 0, 1,     v => v ? 'one-touch kill' : 'normal kill',
        { group: 'Killing', label: 'one-touch kill', hint: 'on: a killer cell kills at once. Off: one damage per touch, health = cell count' }],
    ['kin',       'dontKillSameSpecies',    'bool', 0, 1,     v => v ? 'no killing own species' : 'kin can kill',
        { group: 'Killing', label: "don't kill own species" }],
    ['swallow',   'swallowShare',           'num',  0, 1,     v => v > 0 ? `swallow ${v}` : 'no swallowing',
        { group: 'Killing', label: 'swallow (0 = off)', step: 0.1, hint: 'share of a kill the killer eats; the rest falls on the floor as food' }],
    ['gape',      'gapeRatio',              'num',  0, 100,   v => v > 0 ? `gape ×${v}` : 'no gape limit',
        { group: 'Killing', label: 'gape × (0 = off)', step: 0.5, hint: 'killers only hurt prey up to this many times their own size' }],
    // Metabolism (off at upkeep 0). See Hyperparameters.js.
    ['upkeep',    'upkeepScale',            'num',  0, 1,     v => v > 0 ? `upkeep ${v}` : 'no upkeep',
        { group: 'Metabolism', label: 'upkeep (0 = off)', step: 0.0005, hint: 'food burned per tick: upkeep × cells ^ exponent' }],
    ['uexp',      'upkeepExponent',         'num',  0, 2,     v => `upkeep exponent ${v}`,
        { group: 'Metabolism', label: 'upkeep exponent', step: 0.05, hint: '0.75 = Kleiber: a bigger body costs less per cell' }],
    ['starve',    'starveTicks',            'int',  1, 100000, v => `starve after ${v} ticks`,
        { group: 'Metabolism', label: 'starve after (ticks of debt)', step: 50, hint: 'how long an organism can run on credit before it starves' }],
    // Mutation
    ['mut',       ['addProb', 'changeProb', 'removeProb', 'brainMutationChance'], 'num', 0, 100, v => `mutation ${v}`,
        { alias: true }],
    ['add',       'addProb',                'num',  0, 100,   v => `add cell ${v}`,
        { group: 'Mutation', label: 'add cell %', step: 1, hint: 'when a child mutates: chance a new cell grows' }],
    ['chg',       'changeProb',             'num',  0, 100,   v => `change cell ${v}`,
        { group: 'Mutation', label: 'change cell %', step: 1, hint: 'chance a cell changes type' }],
    ['rem',       'removeProb',             'num',  0, 100,   v => `remove cell ${v}`,
        { group: 'Mutation', label: 'remove cell %', step: 1, hint: 'chance a cell is removed' }],
    ['brain',     'brainMutationChance',    'num',  0, 100,   v => `brain mutation ${v}`,
        { group: 'Mutation', label: 'brain mutation %', step: 1, hint: "chance the brain's decisions change" }],
    ['sym',       'mutationSymmetryChance', 'num',  0, 100,   v => `symmetry ${v}`,
        { group: 'Mutation', label: 'symmetry %', step: 1, hint: 'chance a new cell is mirrored across an axis' }],
    ['fixedmut',  'useGlobalMutability',    'bool', 0, 1,     v => v ? 'fixed mutation rate' : 'evolved mutation rate',
        { group: 'Mutation', label: 'one fixed mutation rate', hint: 'off (original): each organism evolves its own rate' }],
    ['gmut',      'globalMutability',       'num',  0, 100,   v => `mutation rate ${v}`,
        { group: 'Mutation', label: 'fixed rate %', step: 1, hint: 'used only with a fixed mutation rate' }],
    // Eyes and brains
    ['look',      'lookRange',              'int',  1, 500,   v => `look range ${v}`,
        { group: 'Eyes', label: 'look range (cells)', step: 1 }],
    ['see',       'seeThroughSelf',         'bool', 0, 1,     v => v ? 'eyes see through own body' : 'eyes blocked by own body',
        { group: 'Eyes', label: 'see through own body' }],
    ['eyedec',    'evolveIndependentEyeDecisions', 'bool', 0, 1, v => v ? 'eyes can evolve separate decisions' : 'eyes share decisions',
        { group: 'Eyes', label: 'each eye can evolve its own decisions' }],
    // Species
    ['species',   'speciesThreshold',       'num', -1, 1,     v => `species threshold ${v}`,
        { group: 'Species', label: 'species threshold', step: 0.05, hint: 'how different a body must be to found a new species; -1 = original (every mutation)' }],
];

// From the sweeps (docs/sweeps). Labels say why each is interesting.
const PRESETS = [
    { id: 'default',   label: 'Default settings',                         query: {} },
    { id: 'species',   label: 'Most species at once (food 10)',          query: { food: 10 } },
    { id: 'divergent', label: 'Most divergent histories (food 7, movers produce, food drop 5)',
                                                                          query: { food: 7, mcp: 1, drop: 5 } },
    { id: 'abundance', label: 'Abundance: every world converges (food 14)', query: { food: 14 } },
    { id: 'scarce',    label: 'Scarce: predators and eyes, risky (food 5, food drop 5)',
                                                                          query: { food: 5, drop: 5 } },
    // Sweep 4: eat only what's no bigger than you, and eating feeds you.
    { id: 'sizepays',  label: 'Size pays: swallow prey, gape limit (swallow 1, gape 1)',
                                                                          query: { swallow: 1, gape: 1 } },
];

function fieldsOf(s) { return Array.isArray(s[1]) ? s[1] : [s[1]]; }
function isAlias(s) { return !!(s[6] && s[6].alias); }

// Defaults as they are before anything is applied.
const DEFAULTS = {};
for (const s of SETTINGS) DEFAULTS[s[0]] = Hyperparams[fieldsOf(s)[0]];

function parseValue(s, raw) {
    const [, , type, min, max] = s;
    if (type === 'bool') {
        if (/^(1|true|on|yes)$/i.test(raw)) return true;
        if (/^(0|false|off|no)$/i.test(raw)) return false;
        return undefined;
    }
    const v = type === 'int' ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isFinite(v)) return undefined;
    return Math.min(max, Math.max(min, v));
}

// Read settings from URLSearchParams. Returns the values to apply, labels
// for the ones that differ from default, and anything that didn't parse.
function parseSettings(search) {
    const values = {};
    const labels = [];
    const invalid = [];
    for (const s of SETTINGS) {
        if (!search.has(s[0])) continue;
        const v = parseValue(s, search.get(s[0]));
        if (v === undefined) { invalid.push(`${s[0]}=${search.get(s[0])}`); continue; }
        if (isAlias(s)) {
            // Expand into the settings it stands for; any of those given
            // explicitly in the link win.
            for (const f of fieldsOf(s)) {
                const t = SETTINGS.find(x => !isAlias(x) && fieldsOf(x)[0] === f);
                if (t && !search.has(t[0])) values[t[0]] = v;
            }
            if (v !== DEFAULTS[s[0]]) labels.push(s[5](v));
            continue;
        }
        values[s[0]] = v;
        if (v !== DEFAULTS[s[0]]) labels.push(s[5](v));
    }
    return { values, labels, invalid };
}

// Write parsed values into Hyperparams. Call before the world is created -
// the worker takes its copy of Hyperparams at INIT.
function applySettings(values) {
    for (const s of SETTINGS) {
        if (!(s[0] in values)) continue;
        for (const f of fieldsOf(s)) Hyperparams[f] = values[s[0]];
    }
}

// Current value of each setting, for filling an editor.
function currentSettings() {
    const out = {};
    for (const s of SETTINGS) if (!isAlias(s)) out[s[0]] = Hyperparams[fieldsOf(s)[0]];
    return out;
}

// Build a query string: the seed plus every setting that differs from default.
function settingsQuery(values, seed) {
    const p = new URLSearchParams();
    if (seed !== undefined && seed !== null) p.set('seed', String(seed));
    for (const s of SETTINGS) {
        if (isAlias(s) || !(s[0] in values)) continue;
        const v = values[s[0]];
        if (v === DEFAULTS[s[0]]) continue;
        p.set(s[0], typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    }
    return p.toString();
}

// Which preset, if any, the given values match exactly.
function matchPreset(values) {
    for (const pr of PRESETS) {
        const want = { ...pr.query };
        const keys = new Set([...Object.keys(want), ...Object.keys(values)]);
        let same = true;
        for (const k of keys) {
            const s = SETTINGS.find(x => x[0] === k);
            if (!s || isAlias(s)) continue;
            const a = k in values ? values[k] : DEFAULTS[k];
            let b = k in want ? want[k] : DEFAULTS[k];
            if (s[2] === 'bool') b = !!b;
            if (a !== b) { same = false; break; }
        }
        if (same) return pr.id;
    }
    return null;
}

module.exports = { isAlias, SETTINGS, PRESETS, DEFAULTS, parseSettings, applySettings, currentSettings, settingsQuery, matchPreset };
