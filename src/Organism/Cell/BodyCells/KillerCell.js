const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class KillerCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.killer, org, loc_col, loc_row);
    }

    // ~8% of runtime; same treatment as MouthCell.performFunction.
    performFunction() {
        const env = this.org.env;
        const c = this.getRealCol();
        const r = this.getRealRow();
        const gm = env.grid_map;
        const grid = gm.grid;
        const cols = gm.cols;
        const rows = gm.rows;
        const neighbors = Hyperparams.killableNeighbors;
        for (let i = 0; i < neighbors.length; i++) {
            const loc = neighbors[i];
            const nc = c + loc[0];
            const nr = r + loc[1];
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            this.killNeighbor(grid[nc][nr]);
        }
    }

    killNeighbor(n_cell) {
        if(n_cell == null || n_cell.owner == null || n_cell.owner == this.org || !n_cell.owner.living || n_cell.state == CellStates.armor) 
            return;
        if (Hyperparams.dontKillSameSpecies && n_cell.owner.species.name === this.org.species.name)
            return;
        const prey = n_cell.owner;
        if (!this.org.canSwallow(prey))
            return;
        var is_hit = n_cell.state == CellStates.killer; // has to be calculated before death
        prey.harm(this.org);
        if (Hyperparams.instaKill && is_hit) {
            this.org.harm(prey);
        }
    }
}

module.exports = KillerCell;
