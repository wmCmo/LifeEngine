// Decides whether a mutated child is still its parent's species.
//
// Upstream made every successful mutation a new species, so "species" was a
// mutation log - a long run reports thousands of them, nearly all one or two
// cells away from each other. Here a species is everything within a distance
// threshold of the organism that founded it, which is roughly how NEAT does
// speciation: compare to a fixed representative, not to the immediate parent,
// so a lineage can't drift arbitrarily far while keeping one name.
//
// Distance is anatomy only. That matches upstream's own definition -
// Organism.mutate() returns true for body changes and explicitly not for
// brain changes - and it's the body plan the clustering is meant to measure.

const CellStates = require('../Organism/Cell/CellStates');

// Organisms are small (tens of cells) and live in local coordinates around a
// centre cell, so a packed integer key per position is plenty.
function posKey(c, r) {
    return (c + 512) * 1024 + (r + 512);
}

// position -> cell code. An eye facing a different way is a different cell.
function genomeOf(anatomy) {
    const g = new Map();
    for (const cell of anatomy.cells) {
        let code = cell.state.index * 4;
        if (cell.state === CellStates.eye) code += (cell.direction | 0) & 3;
        g.set(posKey(cell.loc_col, cell.loc_row), code);
    }
    return g;
}

// Fraction of the larger body that differs: positions present in only one of
// the two, or holding a different cell. 0 = identical, 1 = nothing in common.
function genomeDistance(a, b) {
    let diff = 0;
    for (const [k, v] of a) {
        if (b.get(k) !== v) diff++;
    }
    for (const k of b.keys()) {
        if (!a.has(k)) diff++;
    }
    return diff / Math.max(a.size, b.size, 1);
}

// The founder's genome never changes, so compute it once per species.
function founderGenome(species) {
    if (species._genome === undefined) {
        species._genome = species.anatomy ? genomeOf(species.anatomy) : null;
    }
    return species._genome;
}

module.exports = { genomeOf, genomeDistance, founderGenome };
