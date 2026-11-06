const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class MouthCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.mouth, org, loc_col, loc_row);
    }

    // Hottest function in the simulation (~19% of runtime). The `for...of`
    // allocated an array iterator per mouth per tick, and cellAt() re-checked
    // bounds through a method call. Indexed loop with the grid hoisted out.
    performFunction() {
        const env = this.org.env;
        const real_c = this.getRealCol();
        const real_r = this.getRealRow();
        const gm = env.grid_map;
        const grid = gm.grid;
        const cols = gm.cols;
        const rows = gm.rows;
        const neighbors = Hyperparams.edibleNeighbors;
        for (let i = 0; i < neighbors.length; i++) {
            const loc = neighbors[i];
            const c = real_c + loc[0];
            const r = real_r + loc[1];
            if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
            const cell = grid[c][r];
            if (cell.state === CellStates.food) {
                env.changeCell(c, r, CellStates.empty, null);
                this.org.food_collected++;
            }
        }
    }

    eatNeighbor(n_cell, env) {
        if (n_cell == null)
            return;
        if (n_cell.state == CellStates.food){
            env.changeCell(n_cell.col, n_cell.row, CellStates.empty, null);
            this.org.food_collected++;
        }
    }
}

module.exports = MouthCell;