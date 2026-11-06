const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");
const Directions = require("../../Directions");
const Observation = require("../../Perception/Observation")

const EMPTY_INDEX = CellStates.empty.index;

class EyeCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.eye, org, loc_col, loc_row);
        this.org.anatomy.has_eyes = true;
    }

    initInherit(parent) {
        // deep copy parent values
        super.initInherit(parent);
        this.direction = parent.direction;
    }
    
    initRandom() {
        // initialize values randomly
        this.direction = Directions.getRandomDirection();
    }

    initDefault() {
        // initialize to default values
        this.direction = Directions.up;
    }

    getAbsoluteDirection() {
        var dir = this.org.rotation + this.direction;
        if (dir > 3)
            dir -= 4;
        return dir;
    }

    performFunction() {
        var obs = this.look();
        this.org.brain.observe(obs);
    }

    look() {
        var env = this.org.env;
        var direction = this.getAbsoluteDirection();
        var addCol = 0;
        var addRow = 0;
        switch(direction) {
            case Directions.up:
                addRow = -1;
                break;
            case Directions.down:
                addRow = 1;
                break;
            case Directions.right:
                addCol = 1;
                break;
            case Directions.left:
                addCol = -1;
                break;
        }
        const start_col = this.getRealCol();
        const start_row = this.getRealRow();
        let col = start_col;
        let row = start_row;

        // NOTE: this loop is ~1% of total runtime - profiled, not guessed.
        // Walking GridMap.view (the flat state array) here instead of the cell
        // objects measures the same, so it isn't worth the extra coupling:
        // the GridCell objects are allocated in one sweep in GridMap.resize(),
        // so they're already contiguous and this walk is cache-friendly.
        // Don't spend time "optimising" it.
        const gm = env.grid_map;
        const grid = gm.grid;
        const cols = gm.cols;
        const rows = gm.rows;
        const range = Hyperparams.lookRange;
        const see_through_self = Hyperparams.seeThroughSelf;
        let cell = null;

        for (let i = 0; i < range; i++) {
            col += addCol;
            row += addRow;
            if (col < 0 || col >= cols || row < 0 || row >= rows) {
                cell = null;
                break;
            }
            cell = grid[col][row];
            if (see_through_self && cell.owner === this.org) {
                continue;
            }
            if (cell.state !== CellStates.empty) {
                const distance = Math.abs(start_col - col) + Math.abs(start_row - row);
                return this.setObs(cell, distance, direction);
            }
        }
        return this.setObs(cell, range, direction);
    }

    // One Observation per eye, reused every tick. Allocating a fresh one each
    // look() meant an object per eye per tick - tens of thousands a tick on a
    // full board, all of it immediate garbage. The brain consumes observations
    // within the same tick, so reuse is safe.
    setObs(cell, distance, direction) {
        if (this._obs === undefined) {
            this._obs = new Observation(cell, distance, direction);
            return this._obs;
        }
        this._obs.cell = cell;
        this._obs.distance = distance;
        this._obs.direction = direction;
        return this._obs;
    }
}

module.exports = EyeCell;