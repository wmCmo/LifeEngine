// The live world, full screen, with zoom, pan and the original game's tools.
//
// Draws the worker's snapshot (one byte per square) through a SnapshotRenderer
// on an offscreen canvas at one pixel per square, then blits that with the
// camera transform. Tools don't touch the world here - they call back to the
// page, which asks the worker.

const SnapshotRenderer = require('../Sim/SnapshotRenderer');
const { drawEyeSlits } = SnapshotRenderer;

const TOOLS = ['move', 'food', 'wall', 'kill', 'select', 'drop'];

class WorldView {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.off = document.createElement('canvas');
        this.snap = new SnapshotRenderer(this.off, null);
        this.cols = 0;
        this.rows = 0;
        this.cam = { x: 0, y: 0, s: 3 };     // square at screen top-left, px per square
        this.fitted = false;
        this.tool = 'move';
        this.brush = 2;
        this.hover = null;                   // {c, r}
        this.marker = null;                  // {c, r}: last selected organism
        this.onTool = null;                  // (tool, c, r, button) => void
        this.visible = false;
        this.bind();
    }

    setTool(t) {
        if (!TOOLS.includes(t)) return;
        this.tool = t;
        this.canvas.style.cursor = t === 'move' ? 'grab' : 'crosshair';
        this.draw();
    }

    show(v) {
        this.visible = v;
        this.canvas.hidden = !v;
        if (v) { this.resize(); if (!this.fitted && this.cols) this.fit(); this.draw(); }
    }

    update(states, cols, rows) {
        if (this.off.width !== cols || this.off.height !== rows) {
            this.off.width = cols;
            this.off.height = rows;
            this.snap.fillShape(rows, cols);
            if (cols !== this.cols || rows !== this.rows) this.fitted = false;
        }
        this.cols = cols;
        this.rows = rows;
        this.snap.draw(states, null, cols, rows);
        this.states = states;
        if (this.visible) {
            if (!this.fitted) this.fit();
            this.draw();
        }
    }

    // ---- camera ---------------------------------------------------------

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const r = this.canvas.getBoundingClientRect();
        this.W = r.width;
        this.H = r.height;
        this.canvas.width = Math.round(r.width * dpr);
        this.canvas.height = Math.round(r.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    fit() {
        if (!this.cols || !this.W) return;
        const s = Math.min(this.W / this.cols, this.H / this.rows) * 0.92;
        this.cam.s = s;
        this.cam.x = this.cols / 2 - this.W / 2 / s;
        this.cam.y = this.rows / 2 - this.H / 2 / s;
        this.fitted = true;
        this.draw();
    }

    toCell(px, py) {
        return { c: Math.floor(this.cam.x + px / this.cam.s), r: Math.floor(this.cam.y + py / this.cam.s) };
    }

    // ---- drawing --------------------------------------------------------

    draw() {
        if (!this.visible || !this.W) return;
        const g = this.ctx, s = this.cam.s;
        g.fillStyle = '#070b0f';
        g.fillRect(0, 0, this.W, this.H);
        if (!this.cols) return;
        g.imageSmoothingEnabled = false;
        g.drawImage(this.off, (0 - this.cam.x) * s, (0 - this.cam.y) * s, this.cols * s, this.rows * s);

        // Eye slits, for the squares on screen, once they're big enough.
        if (this.states) {
            const c0 = Math.max(0, Math.floor(this.cam.x)), c1 = Math.min(this.cols, Math.ceil(this.cam.x + this.W / s));
            const r0 = Math.max(0, Math.floor(this.cam.y)), r1 = Math.min(this.rows, Math.ceil(this.cam.y + this.H / s));
            drawEyeSlits(g, this.states, this.cols, c0, c1, r0, r1, -this.cam.x * s, -this.cam.y * s, s);
        }

        // Board edge.
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.strokeRect((0 - this.cam.x) * s - 0.5, (0 - this.cam.y) * s - 0.5, this.cols * s + 1, this.rows * s + 1);

        // Grid lines once squares are big enough to aim at.
        if (s >= 10) {
            g.strokeStyle = 'rgba(255,255,255,0.05)';
            g.beginPath();
            const c0 = Math.max(0, Math.floor(this.cam.x)), c1 = Math.min(this.cols, Math.ceil(this.cam.x + this.W / s));
            const r0 = Math.max(0, Math.floor(this.cam.y)), r1 = Math.min(this.rows, Math.ceil(this.cam.y + this.H / s));
            for (let c = c0; c <= c1; c++) { const x = Math.round((c - this.cam.x) * s) + 0.5; g.moveTo(x, (r0 - this.cam.y) * s); g.lineTo(x, (r1 - this.cam.y) * s); }
            for (let r = r0; r <= r1; r++) { const y = Math.round((r - this.cam.y) * s) + 0.5; g.moveTo((c0 - this.cam.x) * s, y); g.lineTo((c1 - this.cam.x) * s, y); }
            g.stroke();
        }

        if (this.marker) {
            const x = (this.marker.c - this.cam.x) * s, y = (this.marker.r - this.cam.y) * s;
            const rad = Math.max(10, s * 4);
            g.strokeStyle = '#F2B84B';
            g.lineWidth = 2;
            g.beginPath(); g.arc(x + s / 2, y + s / 2, rad, 0, Math.PI * 2); g.stroke();
            g.lineWidth = 1;
        }

        // Brush outline under the cursor.
        if (this.hover && this.tool !== 'move') {
            const b = this.tool === 'drop' ? 0 : this.brush;
            const x = (this.hover.c - b - this.cam.x) * s, y = (this.hover.r - b - this.cam.y) * s;
            const w = (2 * b + 1) * s;
            g.strokeStyle = this.tool === 'kill' ? '#ff6b88' : this.tool === 'select' ? '#F2B84B' : 'rgba(255,255,255,0.7)';
            g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.max(3, w), Math.max(3, w));
        }
    }

    // ---- input ----------------------------------------------------------

    bind() {
        const c = this.canvas;
        let drag = null;     // panning
        let paint = null;    // painting with a tool: which button, last square
        c.addEventListener('contextmenu', e => e.preventDefault());

        c.addEventListener('mousedown', (e) => {
            const r = c.getBoundingClientRect();
            const px = e.clientX - r.left, py = e.clientY - r.top;
            if (e.button === 1 || (e.button === 0 && this.tool === 'move')) {
                drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y };
                c.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            }
            const cell = this.toCell(px, py);
            paint = { button: e.button, last: null };
            this.apply(cell, paint);
            // select and drop are single clicks, not strokes
            if (this.tool === 'select' || this.tool === 'drop') paint = null;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.visible) return;
            const r = c.getBoundingClientRect();
            const px = e.clientX - r.left, py = e.clientY - r.top;
            if (drag) {
                this.cam.x = drag.cx - (e.clientX - drag.x) / this.cam.s;
                this.cam.y = drag.cy - (e.clientY - drag.y) / this.cam.s;
                this.draw();
                return;
            }
            const inside = px >= 0 && py >= 0 && px <= this.W && py <= this.H && e.target === c;
            this.hover = inside ? this.toCell(px, py) : null;
            if (paint && this.hover) this.apply(this.hover, paint);
            this.draw();
        });

        window.addEventListener('mouseup', () => {
            if (drag) c.style.cursor = this.tool === 'move' ? 'grab' : 'crosshair';
            drag = null;
            paint = null;
        });
        c.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const r = c.getBoundingClientRect();
            const px = e.clientX - r.left, py = e.clientY - r.top;
            const wx = this.cam.x + px / this.cam.s, wy = this.cam.y + py / this.cam.s;
            const f = Math.pow(1.0015, -e.deltaY);
            this.cam.s = Math.min(60, Math.max(0.3, this.cam.s * f));
            this.cam.x = wx - px / this.cam.s;
            this.cam.y = wy - py / this.cam.s;
            this.draw();
        }, { passive: false });

        window.addEventListener('resize', () => { if (this.visible) { this.resize(); this.draw(); } });
    }

    // Mouse events skip squares on a fast stroke, so fill in the line from
    // the last painted square, one brush-width at a time.
    apply(cell, paint) {
        const last = paint.last;
        if (last && last.c === cell.c && last.r === cell.r) return;
        paint.last = cell;
        if (!this.onTool) return;
        const stepLen = Math.max(1, this.brush);
        const dc = last ? cell.c - last.c : 0, dr = last ? cell.r - last.r : 0;
        const n = last ? Math.max(1, Math.ceil(Math.max(Math.abs(dc), Math.abs(dr)) / stepLen)) : 1;
        for (let i = 1; i <= n; i++) {
            const c = last ? Math.round(last.c + dc * i / n) : cell.c;
            const r = last ? Math.round(last.r + dr * i / n) : cell.r;
            if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
            this.onTool(this.tool, c, r, paint.button);
        }
    }
}

module.exports = { WorldView, TOOLS };
