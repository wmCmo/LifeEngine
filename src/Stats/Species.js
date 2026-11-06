const CellStates = require("../Organism/Cell/CellStates");
let FossilRecord = undefined; // workaround to a circular dependency problem
const getFossilRecord = () => {
    if (!FossilRecord)
        FossilRecord = require("./FossilRecord");
    return FossilRecord;
}

// Species names come from their own stream rather than Math.random. Naming is
// bookkeeping and shouldn't consume - and so shift - the simulation's random
// numbers; that keeps evolution independent of how species are counted, which
// is testable: with a seeded RNG the population trace is identical whatever
// Hyperparams.speciesThreshold is set to. One draw at load makes names differ
// between runs. Same look as the old names (10 base-36 characters).
let name_state = (Math.floor(Math.random() * 4294967296) >>> 0) || 0x9E3779B9;
function nextSpeciesName() {
    let out = '';
    while (out.length < 10) {
        name_state ^= name_state << 13; name_state >>>= 0;
        name_state ^= name_state >> 17;
        name_state ^= name_state << 5;  name_state >>>= 0;
        out += name_state.toString(36);
    }
    return out.substr(0, 10);
}

class Species {
    constructor(anatomy, ancestor, start_tick) {
        this.anatomy = anatomy;
        this.ancestor = ancestor; // eventually need to garbage collect ancestors to avoid memory problems
        // Kept as a plain string so the lineage survives fossilize(), which
        // drops the object reference.
        this.ancestor_name = ancestor ? ancestor.name : null;
        this.population = 1;
        this.cumulative_pop = 1;
        this.start_tick = start_tick;
        this.end_tick = -1;
        this.name = nextSpeciesName();
        this.extinct = false;
        this.calcAnatomyDetails();
    }

    calcAnatomyDetails() {
        if (!this.anatomy) return;
        var cell_counts = {};
        for (let c of CellStates.living) {
            cell_counts[c.name] = 0;
        }
        for (let cell of this.anatomy.cells) {
            cell_counts[cell.state.name]+=1;
        }
        this.cell_counts=cell_counts;
    }

    addPop() {
        this.population++;
        this.cumulative_pop++;
    }

    decreasePop() {
        this.population--;
        if (this.population <= 0) {
            this.extinct = true;
            getFossilRecord().fossilize(this);
        }
    }

    lifespan() {
        return this.end_tick - this.start_tick;
    }
}

module.exports = Species;