// Runs several independent worlds at once, one per core.
//
// The question this exists to answer: when the simulation settles into
// minimal movers and checkerboard plants, is that forced by the rules, or is
// it one history out of many? One world can't tell you. Sixteen worlds with
// different seeds can.

const SnapshotRenderer = require('./Sim/SnapshotRenderer');
const CellStates = require('./Organism/Cell/CellStates');
const Hyperparams = require('./Hyperparameters');
const { SimMsg } = require('./Sim/SimProtocol');

const NEON = {
    empty: '#0E1318', food: '#2F7AB7', wall: '#FFFFFF', mouth: '#DEB14D',
    producer: '#15DE59', mover: '#60D4FF', killer: '#F82380',
    armor: '#7230DB', eye: '#B6C1EA',
};
for (const s of CellStates.all) s.color = NEON[s.name] || 'black';

// The cell types a body plan is made of (everything but empty/food/wall).
const BODY_TYPES = CellStates.living.map(s => s.name);

const COLS = 140;
const ROWS = 100;

let worlds = [];
let running = false;
let snapshot_hz = 4;

function $id(id) { return document.getElementById(id); }

class World {
    constructor(index, seed) {
        this.index = index;
        this.seed = seed;
        this.ticks = 0;
        this.tps = 0;
        this.orgs = 0;
        this.species = 0;
        this.resets = 0;
        this.avg_cells = 0;
        this.composition = null;

        const cellEl = document.createElement('div');
        cellEl.className = 'world';
        cellEl.innerHTML = `
            <canvas width="${COLS}" height="${ROWS}"></canvas>
            <div class="meta">
                <span class="idx">#${index + 1}</span>
                <span class="st"></span>
            </div>
            <div class="bar"></div>`;
        $id('grid').appendChild(cellEl);

        this.canvas = cellEl.querySelector('canvas');
        this.statEl = cellEl.querySelector('.st');
        this.barEl = cellEl.querySelector('.bar');
        this.renderer = new SnapshotRenderer(this.canvas, null);

        this.worker = new Worker(new URL('./Sim/sim.worker.js', import.meta.url));
        this.worker.onmessage = (e) => this.handle(e.data);
        this.worker.postMessage({
            type: SimMsg.INIT,
            cols: COLS, rows: ROWS, cell_size: 1,
            seed,
            stats_mode: 'summary',
            auto_pause: false,
            params: jsonParams(),
        });
        this.worker.postMessage({ type: SimMsg.SNAPSHOT_HZ, hz: snapshot_hz });
    }

    handle(msg) {
        if (msg.type === SimMsg.SNAPSHOT) {
            this.ticks = msg.ticks;
            this.tps = msg.tps;
            this.orgs = msg.organisms;
            this.renderer.draw(new Uint8Array(msg.states), null, msg.cols, msg.rows);
        }
        else if (msg.type === SimMsg.STATS) {
            this.orgs = msg.organisms;
            this.species = msg.num_extant;
            this.resets = msg.reset_count;
            this.avg_cells = msg.avg_cells;
            this.composition = msg.composition;
            this.drawBar();
        }
        else if (msg.type === SimMsg.EXTINCT) {
            this.statEl.classList.add('died');
            setTimeout(() => this.statEl.classList.remove('died'), 1500);
        }
    }

    // Proportion of each body cell type, as a stacked bar. Two worlds that
    // evolved the same body plan produce the same bar.
    proportions() {
        if (!this.composition) return null;
        let total = 0;
        for (const t of BODY_TYPES) total += this.composition[t] || 0;
        if (total <= 0) return null;
        const out = {};
        for (const t of BODY_TYPES) out[t] = (this.composition[t] || 0) / total;
        return out;
    }

    drawBar() {
        const p = this.proportions();
        if (!p) { this.barEl.innerHTML = ''; return; }
        let html = '';
        for (const t of BODY_TYPES) {
            const pct = p[t] * 100;
            if (pct < 0.5) continue;
            html += `<i style="width:${pct.toFixed(1)}%;background:${NEON[t]}" title="${t} ${pct.toFixed(0)}%"></i>`;
        }
        this.barEl.innerHTML = html;
    }

    post(msg) { this.worker.postMessage(msg); }
    start(fps) { this.post({ type: SimMsg.START, fps }); }
    stop() { this.post({ type: SimMsg.STOP }); }
    terminate() { this.worker.terminate(); }
}

function jsonParams() {
    const out = {};
    for (const k in Hyperparams) {
        if (typeof Hyperparams[k] !== 'function') out[k] = Hyperparams[k];
    }
    return out;
}

// How far apart are the worlds' body plans? Mean absolute deviation from the
// across-world average, summed over cell types. 0 means every world evolved
// the same composition; the scale runs to 2 for complete disagreement.
function divergence(props) {
    if (props.length < 2) return null;
    const mean = {};
    for (const t of BODY_TYPES) {
        let s = 0;
        for (const p of props) s += p[t];
        mean[t] = s / props.length;
    }
    let total = 0;
    for (const p of props) {
        let d = 0;
        for (const t of BODY_TYPES) d += Math.abs(p[t] - mean[t]);
        total += d;
    }
    return { value: total / props.length, mean };
}

function refreshSummary() {
    let ticks = 0, orgs = 0, tps = 0, alive = 0;
    const props = [];
    for (const w of worlds) {
        ticks += w.ticks;
        orgs += w.orgs;
        tps += w.tps;
        if (w.orgs > 0) alive++;
        const p = w.proportions();
        if (p) props.push(p);
        w.statEl.textContent = `${fmt(w.ticks)}t  ${w.orgs}org  ${w.species}sp`
            + (w.resets ? `  ${w.resets}r` : '');
    }

    $id('total-tps').textContent = fmt(Math.round(tps));
    $id('total-ticks').textContent = fmt(ticks);
    $id('total-orgs').textContent = fmt(orgs);
    $id('alive').textContent = `${alive} / ${worlds.length}`;

    const d = divergence(props);
    if (!d) { $id('divergence').textContent = '-'; $id('verdict').textContent = ''; return; }
    $id('divergence').textContent = d.value.toFixed(3);
    $id('verdict').textContent = d.value < 0.15
        ? 'worlds agree - the body plan looks forced'
        : d.value < 0.4
            ? 'partial agreement'
            : 'worlds disagree - the body plan is contingent';

    let rows = '';
    for (const t of BODY_TYPES) {
        let min = Infinity, max = -Infinity;
        for (const p of props) { if (p[t] < min) min = p[t]; if (p[t] > max) max = p[t]; }
        rows += `<tr><td><i style="background:${NEON[t]}"></i>${t}</td>`
            + `<td>${(d.mean[t] * 100).toFixed(1)}%</td>`
            + `<td>${(min * 100).toFixed(1)}&ndash;${(max * 100).toFixed(1)}%</td></tr>`;
    }
    $id('comp-rows').innerHTML = rows;
}

function fmt(n) { return (n || 0).toLocaleString(); }

function buildWorlds(count, baseSeed) {
    for (const w of worlds) w.terminate();
    worlds = [];
    $id('grid').innerHTML = '';
    for (let i = 0; i < count; i++) {
        worlds.push(new World(i, baseSeed + i * 7919));
    }
    $id('worldcount').textContent = count;
}

function boot() {
    const cores = navigator.hardwareConcurrency || 8;
    const suggested = Math.max(2, Math.min(cores - 1, 12));
    $id('count').value = suggested;

    buildWorlds(suggested, Date.now() & 0x7fffffff);

    $id('run').addEventListener('click', () => {
        running = !running;
        const fps = 0; // unlimited
        for (const w of worlds) running ? w.start(fps) : w.stop();
        $id('run').textContent = running ? 'pause all' : 'run all';
    });

    $id('reseed').addEventListener('click', () => {
        running = false;
        $id('run').textContent = 'run all';
        buildWorlds(parseInt($id('count').value), Date.now() & 0x7fffffff);
    });

    $id('count').addEventListener('change', () => {
        running = false;
        $id('run').textContent = 'run all';
        buildWorlds(parseInt($id('count').value), Date.now() & 0x7fffffff);
    });

    $id('cores').textContent = cores;
    setInterval(refreshSummary, 500);
}

window.addEventListener('load', boot);
