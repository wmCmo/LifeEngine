// Draws a packed grid snapshot (one byte per square) onto a canvas.
//
// The original Renderer issues one fillRect per changed square. On a large
// board that costs more than the simulation does. This writes an ImageData at
// one pixel per square and scales it up with drawImage + imageSmoothingEnabled
// = false: one blit instead of a hundred thousand calls.

const { ColorScheme } = require('../Rendering/ColorScheme');
const CellStates = require('../Organism/Cell/CellStates');

function hexToABGR(color) {
    // Accept '#rrggbb' and the handful of plain names the schemes use.
    let hex = color;
    if (color[0] !== '#') {
        const probe = document.createElement('canvas').getContext('2d');
        probe.fillStyle = color;
        hex = probe.fillStyle;
    }
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return (255 << 24) | (b << 16) | (g << 8) | r;   // little-endian RGBA
}

class SnapshotRenderer {
    constructor(canvas, container_id) {
        this.canvas = canvas;
        this.container_id = container_id;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.ctx.imageSmoothingEnabled = false;
        this.cell_size = 5;

        this.width = canvas.width;
        this.height = canvas.height;
        if (container_id) this.fillWindow();

        this.cols = 0;
        this.rows = 0;
        this.scratch = null;
        this.scratch_ctx = null;
        this.image = null;
        this.pixels = null;

        this.highlight_id = 0;
        this.highlight_cell = null;
        this.highlight_hits = [];

        this.refreshPalette();
    }

    // Called when the user picks a different colour scheme.
    refreshPalette() {
        this.palette = new Uint32Array(CellStates.all.length);
        for (let i = 0; i < CellStates.all.length; i++) {
            this.palette[i] = hexToABGR(CellStates.all[i].color || 'black');
        }
    }

    fillWindow() {
        this.fillShape($('#' + this.container_id).height(), $('#' + this.container_id).width());
    }

    fillShape(height, width) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.height = height;
        this.width = width;
        this.ctx.imageSmoothingEnabled = false;
    }

    ensureSize(cols, rows) {
        if (this.cols === cols && this.rows === rows && this.scratch) return;
        this.cols = cols;
        this.rows = rows;
        this.scratch = document.createElement('canvas');
        this.scratch.width = cols;
        this.scratch.height = rows;
        this.scratch_ctx = this.scratch.getContext('2d', { alpha: false });
        this.image = this.scratch_ctx.createImageData(cols, rows);
        this.pixels = new Uint32Array(this.image.data.buffer);
    }

    draw(states, owners, cols, rows) {
        this.ensureSize(cols, rows);
        const px = this.pixels;
        const pal = this.palette;
        const n = cols * rows;
        const hid = this.highlight_id;
        const hits = this.highlight_hits;
        hits.length = 0;

        if (hid && owners) {
            for (let i = 0; i < n; i++) {
                px[i] = pal[states[i] & 0x0F];
                if (owners[i] === hid) hits.push(i);
            }
        } else {
            for (let i = 0; i < n; i++) {
                px[i] = pal[states[i] & 0x0F];
            }
        }
        this.scratch_ctx.putImageData(this.image, 0, 0);

        const cw = this.canvas.width;
        const ch = this.canvas.height;
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.scratch, 0, 0, cols, rows, 0, 0, cw, ch);

        if (hits.length || this.highlight_cell) {
            const sx = cw / cols;
            const sy = ch / rows;
            this.ctx.fillStyle = 'yellow';
            this.ctx.globalAlpha = 0.5;
            for (let k = 0; k < hits.length; k++) {
                const i = hits[k];
                this.ctx.fillRect((i % cols) * sx, Math.floor(i / cols) * sy, sx, sy);
            }
            if (this.highlight_cell && !hits.length) {
                this.ctx.fillRect(this.highlight_cell.col * sx, this.highlight_cell.row * sy, sx, sy);
            }
            this.ctx.globalAlpha = 1;
        }
    }

    // ---- the highlight surface CanvasController expects ------------------

    clearAllHighlights() {
        this.highlight_id = 0;
        this.highlight_cell = null;
    }

    highlightOrganism(org) {
        this.highlight_id = org && org.id ? org.id : 0;
        this.highlight_cell = null;
    }

    highlightCell(cell) {
        this.highlight_cell = cell ? { col: cell.col, row: cell.row } : null;
        this.highlight_id = 0;
    }

    // no-ops kept so shared UI code can call them without branching
    addToRender() {}
    renderCells() {}
    renderHighlights() {}
    renderFullGrid() {}
    clear() {}
}

module.exports = SnapshotRenderer;
