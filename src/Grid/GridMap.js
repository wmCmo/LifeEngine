const Cell = require('../Organism/Cell/GridCell');
const CellStates = require('../Organism/Cell/CellStates');

class GridMap {
    constructor(cols, rows, cell_size) {
        this.resize(cols, rows, cell_size);
    }

    resize(cols, rows, cell_size) {
        this.grid = [];
        this.cols = cols;
        this.rows = rows;
        this.cell_size = cell_size;
        // Byte-per-square mirror of the grid, kept in sync by setCellType /
        // setCellOwner. Low nibble = CellStates index, high nibble = facing
        // direction for eyes. Lets a worker ship the whole board to the
        // renderer as one transferable buffer. Zero == empty, which is what a
        // fresh Uint8Array already is.
        this.view = new Uint8Array(cols * rows);
        // Parallel map of which organism occupies each square (0 == nobody).
        // Lets the main thread answer "what am I hovering over" without owning
        // a single real Organism.
        this.owners = new Uint32Array(cols * rows);
        for(var c=0; c<cols; c++) {
            var row = [];
            for(var r=0; r<rows; r++) {
                var cell = new Cell(CellStates.empty, c, r, c*cell_size, r*cell_size);
                row.push(cell);
            }
            this.grid.push(row);
        }
    }

    // Recompute the packed byte for one square.
    refreshView(col, row) {
        const cell = this.grid[col][row];
        let packed = cell.state.index;
        if (cell.state === CellStates.eye && cell.cell_owner != null
            && typeof cell.cell_owner.getAbsoluteDirection === 'function') {
            packed |= (cell.cell_owner.getAbsoluteDirection() & 3) << 4;
        }
        const i = row * this.cols + col;
        this.view[i] = packed;
        this.owners[i] = (cell.owner != null && cell.owner.id) ? cell.owner.id : 0;
    }

    fillGrid(state, ignore_walls=false) {
        for (var col of this.grid) {
            for (var cell of col) {
                if (ignore_walls && cell.state===CellStates.wall) continue;
                cell.setType(state);
                cell.owner = null;
                cell.cell_owner = null;
                const i = cell.row * this.cols + cell.col;
                this.view[i] = state.index;
                this.owners[i] = 0;
            }
        }
    }

    cellAt(col, row) {
        if (!this.isValidLoc(col, row)) {
            return null;
        }
        return this.grid[col][row];
    }

    setCellType(col, row, state) {
        if (!this.isValidLoc(col, row)) {
            return;
        }
        this.grid[col][row].setType(state);
    }

    setCellOwner(col, row, cell_owner) {
        if (!this.isValidLoc(col, row)) {
            return;
        }
        this.grid[col][row].cell_owner = cell_owner;
        if (cell_owner != null)
            this.grid[col][row].owner = cell_owner.org;
        else
            this.grid[col][row].owner = null;
    }

    isValidLoc(col, row){
        return col<this.cols && row<this.rows && col>=0 && row>=0;
    }

    getCenter(){
        return [Math.floor(this.cols/2), Math.floor(this.rows/2)]
    }

    xyToColRow(x, y) {
        var c = Math.floor(x/this.cell_size);
        var r = Math.floor(y/this.cell_size);
        if (c >= this.cols)
            c = this.cols-1;
        else if (c < 0)
            c = 0;
        if (r >= this.rows)
            r = this.rows-1;
        else if (r < 0)
            r = 0;
        return [c, r];
    }

    serialize() {
        // Rather than store every single cell, we will store non organism cells (food+walls)
        // and assume everything else is empty. Organism cells will be set when the organism
        // list is loaded. This reduces filesize and complexity.
        let grid = {cell_size:this.cell_size, cols:this.cols, rows:this.rows};
        grid.food = [];
        grid.walls = [];
        for (let col of this.grid) {
            for (let cell of col) {
                if (cell.state===CellStates.wall || cell.state===CellStates.food){
                    let c = {c: cell.col, r: cell.row}; // no need to store state
                    if (cell.state===CellStates.food)
                        grid.food.push(c)
                    else
                        grid.walls.push(c)
                }
            }
        }
        return grid;
    }

    loadRaw(grid) {
        // setCellType no longer refreshes the mirror (changeCell does it once
        // instead), so these direct writes have to refresh it themselves.
        for (let f of grid.food) {
            this.setCellType(f.c, f.r, CellStates.food);
            if (this.isValidLoc(f.c, f.r)) this.refreshView(f.c, f.r);
        }
        for (let w of grid.walls) {
            this.setCellType(w.c, w.r, CellStates.wall);
            if (this.isValidLoc(w.c, w.r)) this.refreshView(w.c, w.r);
        }
    }
}

module.exports = GridMap;
