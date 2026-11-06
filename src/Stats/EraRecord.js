// Detects eras and extinction events from the running simulation.
//
// Everything here is numeric and deterministic - no model in the detection
// path. A mass extinction is a threshold on a time series; an era is a reign.
// Narrating them (naming an era, telling its story) is a separate layer that
// can sit on top of the records this produces.
//
// ERAS. An era is the reign of one dominant species: from the point a species
// becomes the most populous and stays there for `min_reign` samples, until
// another one does the same. Species are the clustered ones (Speciation.js),
// so "dominant species" now means a real body plan rather than the latest
// one-cell mutant. Each era is labelled by its species' guild:
//
//   plant        can't move, no killer
//   armed plant  can't move, has a killer cell
//   grazer       moves, no killer
//   predator     moves, has a killer cell
//
// EVENTS. Population is watched against its peak over the last
// `crash_window` samples. A fall of `crash_drop` or more opens an event; it
// closes at the trough, once population rebounds. It's a mass extinction if
// at least `lineage_loss` of the established lineages alive at the peak -
// species that had reached `sizeable` members - died out during the fall;
// otherwise a population crash, a boom-bust cycle the same lineages survive.
//
// Not diversity: inverse Simpson measures evenness as well as richness, and
// when the dominant species collapses hardest the survivors end up MORE
// evenly spread, so diversity rises through a die-off. The first run showed
// exactly that - 67 lineages lost while "diversity" went from 4.9 to 6.
//
// Sampled from FossilRecord.updateData(), every WorldEnvironment
// data_update_rate ticks (100). Only runs where real organisms exist - on the
// main thread of the worker build there are none.

const CellStates = require('../Organism/Cell/CellStates');

const GUILDS = ['plant', 'armed_plant', 'grazer', 'predator'];

function guildOfPlan(cell_counts) {
    if (!cell_counts) return 'unknown';
    const moves = cell_counts.mover > 0;
    const kills = cell_counts.killer > 0;
    if (moves) return kills ? 'predator' : 'grazer';
    return kills ? 'armed_plant' : 'plant';
}

function newAccum() {
    return { n: 0, pop: 0, eff: 0, eye: 0, plant: 0, armed_plant: 0, grazer: 0, predator: 0 };
}
function addTo(acc, s, sign) {
    acc.n += sign;
    acc.pop += sign * s.pop;
    acc.eff += sign * s.eff;
    acc.eye += sign * s.eye;
    for (const g of GUILDS) acc[g] += sign * s.guilds[g];
}

const EraRecord = {
    config: {
        min_reign: 20,        // samples (x100 ticks) on top before a new era is declared
        crash_window: 30,     // samples to look back for the pre-crash peak
        crash_drop: 0.4,      // fraction of population lost that opens an event
        rebound: 1.15,        // trough is final once population is this far back above it
        lineage_loss: 0.5,    // ...and this share of established lineages died: mass extinction
        sizeable: 50,         // a lineage is "established" once this many have ever lived
        max_samples: 2000,    // recent samples kept for windows and charts
    },

    clear() {
        this.samples = [];
        this.eras = [];
        this.events = [];
        this.current = null;      // the era in progress
        this.candidate = null;    // species currently on top but not yet reigning
        this.crash = null;        // event being tracked
        this.cooldown = 0;
    },

    sample(env, fossil) {
        if (!Array.isArray(env.organisms)) return;   // main-thread stand-in
        const tick = env.total_ticks;
        const last = this.samples[this.samples.length - 1];
        if (last && last.tick === tick) return;      // serialize() also samples

        const s = this.measure(env, fossil, tick);
        this.samples.push(s);
        if (this.samples.length > this.config.max_samples) this.samples.shift();

        this.trackEras(s, fossil);
        this.trackCrashes(s, fossil);
    },

    measure(env, fossil, tick) {
        const orgs = env.organisms;
        const pop = orgs.length;
        const guilds = { plant: 0, armed_plant: 0, grazer: 0, predator: 0 };
        let eye = 0;
        for (let i = 0; i < pop; i++) {
            const a = orgs[i].anatomy;
            let killer = false;
            const cells = a.cells;
            for (let j = 0; j < cells.length; j++) {
                if (cells[j].state === CellStates.killer) { killer = true; break; }
            }
            if (a.is_mover) guilds[killer ? 'predator' : 'grazer']++;
            else guilds[killer ? 'armed_plant' : 'plant']++;
            if (a.has_eyes) eye++;
        }
        if (pop > 0) {
            for (const g of GUILDS) guilds[g] /= pop;
            eye /= pop;
        }

        let total = 0, simpson = 0, top = null;
        for (const sp of Object.values(fossil.extant_species)) {
            total += sp.population;
            if (!top || sp.population > top.population) top = sp;
        }
        if (total > 0) {
            for (const sp of Object.values(fossil.extant_species)) {
                const p = sp.population / total;
                simpson += p * p;
            }
        }
        return {
            tick, pop, guilds, eye,
            eff: simpson > 0 ? 1 / simpson : 0,
            top: top ? top.name : null,
            top_share: top && total > 0 ? top.population / total : 0,
        };
    },

    // ---- eras -----------------------------------------------------------

    startEra(species_name, tick, fossil, accum) {
        const sp = fossil.lookupSpecies(species_name);
        this.current = {
            index: this.eras.length + 1,
            species: species_name,
            guild: guildOfPlan(sp && sp.cell_counts),
            plan: sp && sp.cell_counts ? { ...sp.cell_counts } : null,
            start_tick: tick,
            end_tick: null,
            ended_by: null,
            peak_pop: 0,
            peak_share: 0,
            accum: accum || newAccum(),
        };
    },

    closeEra(tick, fossil, accum_to_move) {
        const era = this.current;
        if (accum_to_move) addTo2(era.accum, accum_to_move, -1);
        era.end_tick = tick;
        era.ended_by = fossil.speciesIsExtant(era.species) ? 'overtaken' : 'extinct';
        this.eras.push(this.finish(era));
        this.current = null;
    },

    // Turn running sums into averages for reporting.
    finish(era) {
        const a = era.accum;
        const n = Math.max(a.n, 1);
        const out = { ...era };
        delete out.accum;
        out.mean_pop = Math.round(a.pop / n);
        out.mean_diversity = +(a.eff / n).toFixed(1);
        out.eye_share = +(a.eye / n).toFixed(2);
        out.guild_mix = {};
        for (const g of GUILDS) out.guild_mix[g] = +(a[g] / n).toFixed(2);
        return out;
    },

    trackEras(s, fossil) {
        if (!s.top) return;
        if (!this.current) {
            this.startEra(s.top, s.tick, fossil);
        }
        const era = this.current;
        addTo(era.accum, s, +1);

        if (s.top === era.species) {
            this.candidate = null;
            if (s.pop * s.top_share > era.peak_pop) era.peak_pop = Math.round(s.pop * s.top_share);
            if (s.top_share > era.peak_share) era.peak_share = +s.top_share.toFixed(2);
            return;
        }

        // Someone else is on top. Only a new era if it holds the position.
        if (!this.candidate || this.candidate.species !== s.top) {
            this.candidate = { species: s.top, since: s.tick, count: 0, accum: newAccum(),
                               peak_pop: 0, peak_share: 0 };
        }
        const c = this.candidate;
        c.count++;
        addTo(c.accum, s, +1);
        if (s.pop * s.top_share > c.peak_pop) c.peak_pop = Math.round(s.pop * s.top_share);
        if (s.top_share > c.peak_share) c.peak_share = +s.top_share.toFixed(2);

        if (c.count >= this.config.min_reign) {
            // The candidate's samples were provisionally counted in the old
            // era; the reign actually began when it first took the top spot.
            this.closeEra(c.since, fossil, c.accum);
            this.startEra(c.species, c.since, fossil, c.accum);
            this.current.peak_pop = c.peak_pop;
            this.current.peak_share = c.peak_share;
            this.candidate = null;
        }
    },

    // ---- extinction events ----------------------------------------------

    trackCrashes(s, fossil) {
        const cfg = this.config;
        if (this.cooldown > 0) this.cooldown--;

        if (this.crash) {
            const ev = this.crash;
            if (s.pop < ev.trough_pop) {
                ev.trough_pop = s.pop;
                ev.trough_tick = s.tick;
                ev.diversity_after = s.eff;
            }
            if (s.eff < ev.diversity_after) ev.diversity_after = s.eff;
            if (s.pop >= ev.trough_pop * cfg.rebound) {
                this.closeCrash(fossil);
            }
            return;
        }
        if (this.cooldown > 0) return;

        // Peak population over the recent window, and diversity there.
        const n = this.samples.length;
        const from = Math.max(0, n - 1 - cfg.crash_window);
        let peak = null;
        for (let i = from; i < n - 1; i++) {
            if (!peak || this.samples[i].pop > peak.pop) peak = this.samples[i];
        }
        if (!peak || peak.pop < 20) return;   // too few to say anything
        const drop = 1 - s.pop / peak.pop;
        if (drop >= cfg.crash_drop) {
            this.crash = {
                start_tick: peak.tick,
                peak_pop: peak.pop,
                diversity_before: peak.eff,
                trough_tick: s.tick,
                trough_pop: s.pop,
                diversity_after: s.eff,
            };
        }
    },

    closeCrash(fossil) {
        const cfg = this.config;
        const ev = this.crash;
        ev.drop = +(1 - ev.trough_pop / ev.peak_pop).toFixed(2);
        ev.diversity_before = +ev.diversity_before.toFixed(1);
        ev.diversity_after = +ev.diversity_after.toFixed(1);

        // Established lineages alive at the peak: those that died during the
        // fall, and those that came through it.
        const lost = [];
        for (const rec of Object.values(fossil.extinct_species)) {
            if (rec.start_tick <= ev.start_tick
                && rec.end_tick >= ev.start_tick && rec.end_tick <= ev.trough_tick
                && rec.cumulative_pop >= cfg.sizeable) {
                lost.push(rec);
            }
        }
        let survived = 0;
        for (const sp of Object.values(fossil.extant_species)) {
            if (sp.start_tick <= ev.start_tick && sp.cumulative_pop >= cfg.sizeable) survived++;
        }
        const established = lost.length + survived;
        ev.lineage_loss = established > 0 ? +(lost.length / established).toFixed(2) : 0;
        ev.type = ev.lineage_loss >= cfg.lineage_loss ? 'mass extinction' : 'population crash';

        lost.sort((a, b) => b.cumulative_pop - a.cumulative_pop);
        ev.lineages_lost = lost.length;
        ev.lineages_survived = survived;
        ev.lost = lost.slice(0, 5).map(r => ({
            name: r.name, guild: guildOfPlan(r.cell_counts), ever_lived: r.cumulative_pop,
        }));

        this.events.push(ev);
        this.crash = null;
        this.cooldown = cfg.crash_window;   // one event per fall
    },

    // Everything a timeline or a narrator needs, eras closed and open.
    summary() {
        const eras = this.eras.slice();
        if (this.current) {
            const open = this.finish(this.current);
            open.ended_by = 'ongoing';
            eras.push(open);
        }
        return { eras, events: this.events.slice() };
    },
};

function addTo2(acc, other, sign) {
    acc.n += sign * other.n;
    acc.pop += sign * other.pop;
    acc.eff += sign * other.eff;
    acc.eye += sign * other.eye;
    for (const g of GUILDS) acc[g] += sign * other[g];
}

EraRecord.clear();

module.exports = EraRecord;
