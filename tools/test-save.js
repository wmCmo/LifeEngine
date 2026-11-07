// Save a running world with its map history, load it into a fresh world,
// and check the two agree and the loaded one keeps running.
//   node tools/test-save.js [ticks]
const { createWorld } = require('./harness');
const ticks = parseInt(process.argv[2] || '20000');

const a = createWorld({ cols: 200, rows: 150, seed: 7, params: { swallowShare: 1, gapeRatio: 1 } });
const PhyloA = require('../src/Stats/PhyloRecord');
PhyloA.enabled = true;
for (let t = 0; t < ticks; t++) a.env.update();
const WorldSave = require('../src/Sim/WorldSave');
const text = WorldSave.buildSave(a.env, { seed: 7 });
const before = {
    ticks: a.env.total_ticks, orgs: a.env.organisms.length,
    extant: Object.keys(a.FossilRecord.extant_species).length,
    extinct: Object.keys(a.FossilRecord.extinct_species).length,
    phylo: PhyloA.nodes.size, in_map: PhyloA.stats().in_map,
    eras: a.EraRecord.eras.length, events: a.EraRecord.events.length,
};

// Scramble the live state so the load has to restore it.
for (let t = 0; t < 3000; t++) a.env.update();
a.Hyperparams.setDefaults();

const info = WorldSave.loadSave(a.env, text);
const after = {
    ticks: a.env.total_ticks, orgs: a.env.organisms.length,
    extant: Object.keys(a.FossilRecord.extant_species).length,
    extinct: Object.keys(a.FossilRecord.extinct_species).length,
    phylo: PhyloA.nodes.size, in_map: PhyloA.stats().in_map,
    eras: a.EraRecord.eras.length, events: a.EraRecord.events.length,
};
const flush = PhyloA.flush(a.FossilRecord, a.env.total_ticks);
console.log('file MB', (text.length / 1e6).toFixed(2));
console.log('before', JSON.stringify(before));
console.log('after ', JSON.stringify(after));
console.log('controls swallow/gape', a.Hyperparams.swallowShare, a.Hyperparams.gapeRatio, 'info', JSON.stringify({ ...info, controls: undefined }));
console.log('resend: nodes', flush.nodes.length, 'series', Object.keys(flush.series).length, 'reset', flush.reset);
const sameKeys = ['ticks', 'orgs', 'extant', 'extinct', 'phylo', 'in_map', 'eras', 'events'].every(k => before[k] === after[k]);
for (let t = 0; t < 5000; t++) a.env.update();
console.log('ran 5000 more ticks after load; orgs', a.env.organisms.length, 'eras', a.EraRecord.eras.length, 'phylo', PhyloA.nodes.size);
console.log(sameKeys ? 'PASS' : 'FAIL');
process.exit(sameKeys ? 0 : 1);
