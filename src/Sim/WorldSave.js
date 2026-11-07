// Save files for the evolution map: the original game's world format, plus a
// `lab` section holding what the map needs to carry on where it left off -
// the phylogeny, the eras and extinction events, extinct species records,
// and each living species' founder body (speciation compares against it).
//
// The original game ignores `lab` (its loader only copies plain fields), so a
// map save opens in play.html as an ordinary world. A save from the original
// game opens in the map too, with its history starting at the moment of load.
//
// Runs in the worker, which owns the world.

const FossilRecord = require('../Stats/FossilRecord');
const PhyloRecord = require('../Stats/PhyloRecord');
const EraRecord = require('../Stats/EraRecord');
const Hyperparams = require('../Hyperparameters');
const { founderGenome } = require('../Stats/Speciation');

const LAB_VERSION = 1;

// Population series are sampled every 100 ticks forever; a species that
// rules for 18M ticks has 180k points. The map can't draw more points than
// it has pixels, so saves keep at most this many per species.
const MAX_SERIES = 4000;

function thin(series) {
    if (series.length <= MAX_SERIES) return series;
    const stride = Math.ceil(series.length / MAX_SERIES);
    const out = [];
    for (let i = 0; i < series.length; i += stride) out.push(series[i]);
    const last = series[series.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
}

function buildSave(env, meta) {
    const world = env.serialize();

    const founders = {};
    for (const sp of Object.values(FossilRecord.extant_species)) {
        const g = founderGenome(sp);
        if (g) founders[sp.name] = Array.from(g.entries());
    }

    const nodes = [];
    for (const n of PhyloRecord.nodes.values()) nodes.push({ ...n, series: thin(n.series) });

    world.lab = {
        version: LAB_VERSION,
        saved_at: new Date().toISOString(),
        meta: meta || {},
        species_created: FossilRecord.species_created || 0,
        // FossilRecord.clear_record() makes this an Array keyed by name, and
        // JSON drops named keys on arrays - copy into a plain object.
        extinct_species: Object.assign({}, FossilRecord.extinct_species),
        founders,
        phylo: PhyloRecord.enabled ? nodes : null,
        eras: {
            samples: EraRecord.samples,
            eras: EraRecord.eras,
            events: EraRecord.events,
            current: EraRecord.current,
            candidate: EraRecord.candidate,
            crash: EraRecord.crash,
            cooldown: EraRecord.cooldown,
        },
    };
    return JSON.stringify(world);
}

// Every map node, ancestors before descendants - the map links a child to
// its parent only if the parent arrived first.
function rootFirst(nodes) {
    const out = [];
    const seen = new Set();
    for (const n of nodes.values()) {
        if (!n.in_map || seen.has(n.name)) continue;
        const chain = [];
        let cur = n;
        while (cur && !seen.has(cur.name)) {
            chain.push(cur);
            seen.add(cur.name);
            cur = cur.ancestor ? nodes.get(cur.ancestor) : null;
        }
        for (let i = chain.length - 1; i >= 0; i--) if (chain[i].in_map) out.push(chain[i].name);
    }
    return out;
}

// Returns what the page needs to know about the loaded world.
function loadSave(env, text) {
    const world = typeof text === 'string' ? JSON.parse(text) : text;
    if (!world || !world.grid || !Array.isArray(world.organisms)) {
        throw new Error("this file isn't a Life Engine world");
    }

    // A world carries its rules. Start from defaults so a file from an older
    // version doesn't inherit whatever this world had switched on.
    if (world.controls) {
        Hyperparams.setDefaults();
        Hyperparams.loadJsonObj(world.controls);
    }

    env.loadRaw(world);            // clears the fossil record, eras and phylogeny

    const lab = world.lab;
    if (lab && lab.version === LAB_VERSION) {
        FossilRecord.species_created = lab.species_created || 0;
        FossilRecord.extinct_species = lab.extinct_species || {};
        for (const name in lab.founders || {}) {
            const sp = FossilRecord.extant_species[name];
            if (sp) sp._genome = new Map(lab.founders[name]);
        }
        if (lab.eras) {
            for (const k of ['samples', 'eras', 'events', 'current', 'candidate', 'crash', 'cooldown']) {
                if (k in lab.eras) EraRecord[k] = lab.eras[k];
            }
        }
        if (lab.phylo && PhyloRecord.enabled) {
            PhyloRecord.clear();
            for (const n of lab.phylo) PhyloRecord.nodes.set(n.name, n);
            // Resend the whole map.
            for (const name of rootFirst(PhyloRecord.nodes)) {
                PhyloRecord.dirty.add(name);
                PhyloRecord.pending.set(name, PhyloRecord.nodes.get(name).series.slice());
            }
            PhyloRecord.was_reset = true;
        }
    }

    return {
        ticks: env.total_ticks,
        organisms: env.organisms.length,
        cols: env.grid_map.cols,
        rows: env.grid_map.rows,
        has_history: !!(lab && lab.phylo),
        meta: lab ? lab.meta : null,
        controls: JSON.parse(JSON.stringify(Hyperparams)),
    };
}

// A living member of a species, as an organism file the original game can
// load (brain included). Null if the species has died out.
function speciesOrganism(env, name) {
    for (const org of env.organisms) {
        if (org.living && org.species && org.species.name === name) return org.serialize();
    }
    return null;
}

module.exports = { buildSave, loadSave, speciesOrganism };
