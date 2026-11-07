const Neighbors = require("./Grid/Neighbors");

const Hyperparams = {
    setDefaults: function() {
        this.lifespanMultiplier = 100;
        this.foodProdProb = 5;
        this.killableNeighbors = Neighbors.adjacent;
        this.edibleNeighbors = Neighbors.adjacent;
        this.growableNeighbors = Neighbors.adjacent;

        this.useGlobalMutability = false;
        this.globalMutability = 5;
        this.addProb = 25;
        this.changeProb = 25;
        this.removeProb = 25;
        this.brainMutationChance = 25;
        this.mutationSymmetryChance = 10;
        
        this.rotationEnabled = true;

        this.foodBlocksReproduction = true;
        this.moversCanProduce = false;

        this.instaKill = false;
        this.dontKillSameSpecies = false;

        // A mutated child stays its parent's species while its body differs
        // from the species founder by at most this fraction of cells
        // (Stats/Speciation.js). Negative = upstream behaviour, where every
        // anatomy mutation founds a new species.
        this.speciesThreshold = 0.25;

        this.lookRange = 30;
        this.seeThroughSelf = false;
        this.evolveIndependentEyeDecisions = true;

        this.foodDropProb = 0;

        this.extraMoverFoodCost = 0;

        // Metabolism. upkeepScale 0 = off: the original game, where a cell
        // costs food once, to be born, and nothing to keep. Above 0, every
        // organism pays upkeepScale * cells^upkeepExponent food per tick -
        // Kleiber's law: a bigger body costs more in total but less per cell -
        // and starves once it is in debt by more than starveTicks ticks' worth
        // of upkeep. Newborns start with no food, so that allowance is what
        // lets them live long enough to find some.
        this.upkeepScale = 0;
        this.upkeepExponent = 0.75;
        this.starveTicks = 300;

        // Lifespan = lifespanMultiplier * cells^lifespanExponent, anchored so
        // a 5-cell body lives exactly as long either way. 1 = upstream (linear,
        // so size buys longevity at no discount). 0.25 = Kleiber: bigger still
        // lives longer, with steep diminishing returns.
        this.lifespanExponent = 1;

        // Swallowing (both 0 = off, the original game). swallowShare: the
        // share of a prey's body the killer gets as food when its blow kills;
        // the rest falls on the floor as food for anyone, as in the original.
        // gapeRatio: killer cells only hurt prey up to this many times the
        // attacker's own size - small predators can't touch big bodies.
        this.swallowShare = 0;
        this.gapeRatio = 0;

        this.maxOrganisms = -1;
    },

    loadJsonObj(obj) {
        for (let key in obj) {
            this[key] = obj[key];
        }
    }
}

Hyperparams.setDefaults();

module.exports = Hyperparams;