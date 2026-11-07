// Every URL setting must survive a round trip: value -> link -> parse ->
// Hyperparams. Also checks the `mut` shorthand still expands, with explicit
// keys winning, and that a link with nothing in it changes nothing.
//   node tools/test-url-settings.js

const Hyperparams = require('../src/Hyperparameters');
const U = require('../src/Sim/UrlSettings');

let failed = 0;
function check(name, ok, detail) {
    if (!ok) { failed++; console.log(`FAIL ${name} ${detail || ''}`); }
}

// A valid value that isn't the default.
function otherValue(s) {
    const [key, , type, min, max] = s;
    const d = U.DEFAULTS[key];
    if (type === 'bool') return !d;
    let v = type === 'int' ? Math.round((min + max) / 3) : +(min + (max - min) * 0.37).toFixed(4);
    if (v === d) v = type === 'int' ? v + 1 : v / 2;
    return v;
}

function fieldsOf(s) { return Array.isArray(s[1]) ? s[1] : [s[1]]; }

const editable = U.SETTINGS.filter(s => !U.isAlias(s));
const all = {};
for (const s of editable) {
    const v = otherValue(s);
    all[s[0]] = v;
    Hyperparams.setDefaults();
    const q = U.settingsQuery({ [s[0]]: v }, 1);
    const parsed = U.parseSettings(new URLSearchParams(q));
    U.applySettings(parsed.values);
    check(s[0], Hyperparams[fieldsOf(s)[0]] === v, `link "${q}" gave ${Hyperparams[fieldsOf(s)[0]]}, wanted ${v}`);
    check(s[0] + ' label', parsed.labels.length === 1, JSON.stringify(parsed.labels));
    check(s[0] + ' editor', !!(s[6] && s[6].group && s[6].label), 'no editor group/label');
}

// Everything at once, and back out through currentSettings().
Hyperparams.setDefaults();
const q = U.settingsQuery(all, 7);
U.applySettings(U.parseSettings(new URLSearchParams(q)).values);
const cur = U.currentSettings();
for (const k in all) check('all:' + k, cur[k] === all[k], `${cur[k]} vs ${all[k]}`);
check('no alias in links', !/(^|&)mut=/.test(q), q);

// The shorthand: mut sets all four, explicit keys win.
Hyperparams.setDefaults();
const p = U.parseSettings(new URLSearchParams('mut=10&chg=3'));
U.applySettings(p.values);
check('mut alias', Hyperparams.addProb === 10 && Hyperparams.changeProb === 3
    && Hyperparams.removeProb === 10 && Hyperparams.brainMutationChance === 10,
    JSON.stringify(p.values));
check('mut survives a copied link', /add=10/.test(U.settingsQuery(p.values, 1)), U.settingsQuery(p.values, 1));

// An empty link changes nothing.
Hyperparams.setDefaults();
const before = JSON.stringify(Hyperparams);
U.applySettings(U.parseSettings(new URLSearchParams('seed=5')).values);
check('empty link', JSON.stringify(Hyperparams) === before);

console.log(`${editable.length} settings, ${failed ? failed + ' FAILED' : 'all round-trip'}`);
process.exit(failed ? 1 : 0);
