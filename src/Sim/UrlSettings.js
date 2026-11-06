// Simulation settings carried in the page URL, so a link reproduces a world:
//
//   evomap.html?seed=42&food=7&mcp=1&drop=5
//
// Short keys, because these links get pasted into chat. Each maps onto one
// or more fields of Hyperparams (src/Hyperparameters.js). Only settings that
// differ from the defaults need to appear.

const Hyperparams = require('../Hyperparameters');

// key, Hyperparams field(s), type, min, max, label
const SETTINGS = [
    ['food',      'foodProdProb',           'num',  0, 100,   v => `food ${v}`],
    ['drop',      'foodDropProb',           'num',  0, 100,   v => `food drop ${v}`],
    ['mcp',       'moversCanProduce',       'bool', 0, 1,     v => v ? 'movers produce' : 'movers don\'t produce'],
    ['life',      'lifespanMultiplier',     'num',  1, 10000, v => `lifespan ×${v}`],
    ['movercost', 'extraMoverFoodCost',     'int',  0, 1000,  v => `mover cost +${v}`],
    ['kin',       'dontKillSameSpecies',    'bool', 0, 1,     v => v ? 'no killing own species' : 'kin can kill'],
    ['insta',     'instaKill',              'bool', 0, 1,     v => v ? 'one-touch kill' : 'normal kill'],
    ['block',     'foodBlocksReproduction', 'bool', 0, 1,     v => v ? 'food blocks births' : 'food doesn\'t block births'],
    ['mut',       ['addProb', 'changeProb', 'removeProb', 'brainMutationChance'], 'num', 0, 100, v => `mutation ${v}`],
    ['sym',       'mutationSymmetryChance', 'num',  0, 100,   v => `symmetry ${v}`],
    ['look',      'lookRange',              'int',  1, 500,   v => `look range ${v}`],
    ['species',   'speciesThreshold',       'num', -1, 1,     v => `species threshold ${v}`],
    // Metabolism (off at upkeep 0). See Hyperparameters.js.
    ['upkeep',    'upkeepScale',            'num',  0, 1,     v => v > 0 ? `upkeep ${v}` : 'no upkeep'],
    ['uexp',      'upkeepExponent',         'num',  0, 2,     v => `upkeep exponent ${v}`],
    ['starve',    'starveTicks',            'int',  1, 100000, v => `starve after ${v} ticks`],
    ['lexp',      'lifespanExponent',       'num',  0, 2,     v => `lifespan exponent ${v}`],
];

// From the two sweeps (docs/sweeps). Labels say why each is interesting.
const PRESETS = [
    { id: 'default',   label: 'Default settings',                         query: {} },
    { id: 'species',   label: 'Most species at once (food 10)',          query: { food: 10 } },
    { id: 'divergent', label: 'Most divergent histories (food 7, movers produce, food drop 5)',
                                                                          query: { food: 7, mcp: 1, drop: 5 } },
    { id: 'abundance', label: 'Abundance: every world converges (food 14)', query: { food: 14 } },
    { id: 'scarce',    label: 'Scarce: predators and eyes, risky (food 5, food drop 5)',
                                                                          query: { food: 5, drop: 5 } },
];

function fieldsOf(s) { return Array.isArray(s[1]) ? s[1] : [s[1]]; }

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
    for (const s of SETTINGS) out[s[0]] = Hyperparams[fieldsOf(s)[0]];
    return out;
}

// Build a query string: the seed plus every setting that differs from default.
function settingsQuery(values, seed) {
    const p = new URLSearchParams();
    if (seed !== undefined && seed !== null) p.set('seed', String(seed));
    for (const s of SETTINGS) {
        if (!(s[0] in values)) continue;
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
            if (!s) continue;
            const a = k in values ? values[k] : DEFAULTS[k];
            let b = k in want ? want[k] : DEFAULTS[k];
            if (s[2] === 'bool') b = !!b;
            if (a !== b) { same = false; break; }
        }
        if (same) return pr.id;
    }
    return null;
}

module.exports = { SETTINGS, PRESETS, DEFAULTS, parseSettings, applySettings, currentSettings, settingsQuery, matchPreset };
