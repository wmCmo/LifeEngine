// Stands in for Renderer when the simulation runs somewhere without a canvas
// (a Web Worker, or a Node benchmark). Same surface, does nothing. Grid state
// for drawing is carried by GridMap.view instead.
class NullRenderer {
    constructor(cell_size, cols, rows) {
        this.cell_size = cell_size;
        this.width = cols * cell_size;
        this.height = rows * cell_size;
        this.canvas = null;
        this.cells_to_render = new Set();
        this.cells_to_highlight = new Set();
        this.highlighted_cells = new Set();
    }

    fillWindow() {}
    fillShape(height, width) { this.height = height; this.width = width; }
    clear() {}
    renderFullGrid() {}
    renderCells() {}
    renderCell() {}
    renderOrganism() {}
    addToRender() {}
    renderHighlights() {}
    highlightOrganism() {}
    highlightCell() {}
    renderCellHighlight() {}
    clearAllHighlights() {}
}

module.exports = NullRenderer;
