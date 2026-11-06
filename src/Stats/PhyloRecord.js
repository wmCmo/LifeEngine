// The phylogeny behind the evolution map: every species that matters, with
// its founder's body, its lineage, and its population over time.
//
// Off by default - only the evolution map page turns it on - because it holds
// more history than anything else in the simulation.
//
// What "matters": a species is ESTABLISHED once `sizeable` organisms have
// ever belonged to it. Established species and all their ancestors form the
// map set, and only those are sent to the main thread. Most species founded
// are a single mutant that dies within a few ticks; once one of those is
// extinct and has no living descendants it can never join the map, so it is
// folded into its parent's `died_young` count and forgotten. Without that,
// memory grows by ~12,000 species per 40k ticks.
//
// Lineage is never broken: a species with living descendants is kept even if
// it died young itself, because one of those descendants may yet establish
// and need the full chain back to the root.
//
// Hooked from FossilRecord: addSpecies -> onFounded, fossilize -> onExtinct,
// updateData -> sample (every 100 ticks).

const { genomeOf, guildOfGenome } = require('./Speciation');

const GUILD_NAMES = ['plant', 'armed_plant', 'grazer', 'predator'];

const PhyloRecord = {
    enabled: false,
    config: {
        sizeable: 50,
    },

    clear() {
        this.nodes = new Map();       // name -> node (worker side, full)
        this.dirty = new Set();       // in-map nodes whose metadata changed
        this.pending = new Map();     // name -> series points not yet sent
        this.was_reset = true;
    },

    // ---- hooks ----------------------------------------------------------

    onFounded(species, tick) {
        if (!this.enabled || this.nodes.has(species.name)) return;
        const anatomy = species.anatomy;
        const cells = [];
        let guild = 0;
        if (anatomy) {
            for (const c of anatomy.cells) {
                cells.push([c.loc_col, c.loc_row, c.state.index, (c.direction | 0) & 3]);
            }
            guild = guildOfGenome(genomeOf(anatomy));
        }
        const node = {
            name: species.name,
            ancestor: species.ancestor_name || null,
            start: tick,
            end: null,
            guild: GUILD_NAMES[guild],
            plan: species.cell_counts ? { ...species.cell_counts } : null,
            cells,
            cumulative: 1,
            peak_pop: 1,
            peak_tick: tick,
            kids: 0,            // child species founded
            died_young: 0,      // ...that died without ever establishing
            live_desc: 0,       // living descendant species, any depth
            established: false,
            in_map: false,
            series: [],         // [tick, population], every sample
        };
        this.nodes.set(node.name, node);

        const parent = node.ancestor ? this.nodes.get(node.ancestor) : null;
        if (parent) {
            parent.kids++;
            if (parent.in_map) this.dirty.add(parent.name);
        }
        // This species is alive: every ancestor now has one more living
        // descendant, which keeps them from being pruned.
        this.walkUp(node, a => { a.live_desc++; });
    },

    onExtinct(species, tick) {
        if (!this.enabled) return;
        const node = this.nodes.get(species.name);
        if (!node) return;
        node.end = tick;
        node.cumulative = species.cumulative_pop;
        if (node.in_map) this.dirty.add(node.name);

        if (!node.established) {
            const parent = node.ancestor ? this.nodes.get(node.ancestor) : null;
            if (parent) {
                parent.died_young++;
                if (parent.in_map) this.dirty.add(parent.name);
            }
        }
        this.walkUp(node, a => { a.live_desc--; });

        // This node, and any ancestor that just lost its last living
        // descendant, may now be safe to forget.
        this.prune(node);
        let cur = node.ancestor ? this.nodes.get(node.ancestor) : null;
        while (cur) {
            const next = cur.ancestor ? this.nodes.get(cur.ancestor) : null;
            this.prune(cur);
            cur = next;
        }
    },

    prune(node) {
        if (node.end !== null && !node.in_map && !node.established && node.live_desc <= 0) {
            this.nodes.delete(node.name);
            this.pending.delete(node.name);
        }
    },

    walkUp(node, fn) {
        let cur = node.ancestor ? this.nodes.get(node.ancestor) : null;
        let guard = 0;
        while (cur && guard++ < 100000) {
            fn(cur);
            cur = cur.ancestor ? this.nodes.get(cur.ancestor) : null;
        }
    },

    // Every 100 ticks: record populations and promote newly established
    // species into the map, along with their whole ancestry.
    sample(tick, fossil) {
        if (!this.enabled) return;
        for (const sp of Object.values(fossil.extant_species)) {
            let node = this.nodes.get(sp.name);
            if (!node) {                       // e.g. species from a loaded world
                this.onFounded(sp, sp.start_tick || tick);
                node = this.nodes.get(sp.name);
                if (!node) continue;
            }
            const pt = [tick, sp.population];
            node.series.push(pt);
            node.cumulative = sp.cumulative_pop;
            if (sp.population > node.peak_pop) {
                node.peak_pop = sp.population;
                node.peak_tick = tick;
                if (node.in_map) this.dirty.add(node.name);
            }
            if (node.in_map) this.queuePoint(node.name, pt);
            if (!node.established && sp.cumulative_pop >= this.config.sizeable) {
                node.established = true;
                this.addToMap(node);
            }
        }
    },

    addToMap(node) {
        // Root-first, so the main thread always receives a parent before
        // its child.
        const chain = [];
        let cur = node;
        while (cur && !cur.in_map) {
            chain.push(cur);
            cur = cur.ancestor ? this.nodes.get(cur.ancestor) : null;
        }
        for (let i = chain.length - 1; i >= 0; i--) {
            const n = chain[i];
            n.in_map = true;
            this.dirty.add(n.name);
            this.pending.set(n.name, n.series.slice());   // full history so far
        }
    },

    queuePoint(name, pt) {
        let arr = this.pending.get(name);
        if (!arr) { arr = []; this.pending.set(name, arr); }
        arr.push(pt);
    },

    // Everything new since the last flush, for the main thread.
    flush(fossil, now) {
        const nodes = [];
        // Dirty set preserves insertion order, and addToMap inserts
        // root-first, so parents arrive before children.
        for (const name of this.dirty) {
            const n = this.nodes.get(name);
            if (!n || !n.in_map) continue;
            nodes.push({
                name: n.name, ancestor: n.ancestor, start: n.start, end: n.end,
                guild: n.guild, plan: n.plan, cells: n.cells,
                cumulative: n.cumulative, peak_pop: n.peak_pop, peak_tick: n.peak_tick,
                kids: n.kids, died_young: n.died_young,
            });
        }
        const series = {};
        for (const [name, pts] of this.pending) {
            if (pts.length) series[name] = pts;
        }
        // Current population ranking, so the map can show today's
        // dominators before they have reigned long enough to be an era.
        const top = Object.values(fossil.extant_species)
            .filter(sp => this.nodes.get(sp.name) && this.nodes.get(sp.name).in_map)
            .sort((a, b) => b.population - a.population)
            .slice(0, 3)
            .map(sp => sp.name);

        const out = { nodes, series, now, top, reset: this.was_reset };
        this.dirty.clear();
        this.pending = new Map();
        this.was_reset = false;
        return out;
    },

    stats() {
        let in_map = 0;
        for (const n of this.nodes.values()) if (n.in_map) in_map++;
        return { held: this.nodes.size, in_map };
    },
};

PhyloRecord.clear();

module.exports = PhyloRecord;
