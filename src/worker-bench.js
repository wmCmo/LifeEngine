// Measurement page for the worker-based simulation loop.
// Same world size as the Node benchmark so the numbers line up.

const SnapshotRenderer = require('./Sim/SnapshotRenderer');
const CellStates = require('./Organism/Cell/CellStates');
const { SimMsg } = require('./Sim/SimProtocol');

// The bench page has no colour-scheme UI, so paint the states directly.
const NEON = {
    empty: '#0E1318', food: '#2F7AB7', wall: '#FFFFFF', mouth: '#DEB14D',
    producer: '#15DE59', mover: '#60D4FF', killer: '#F82380',
    armor: '#7230DB', eye: '#B6C1EA',
};
for (const s of CellStates.all) s.color = NEON[s.name] || 'black';

const COLS = 400;
const ROWS = 300;

let worker = null;
let renderer = null;
let running = false;

let last_ticks = 0;
let peak_tps = 0;
let frames = 0;
let last_frame_check = performance.now();
let render_fps = 0;

function $id(id) { return document.getElementById(id); }

function setText(id, v) { $id(id).textContent = v; }

function boot() {
    const canvas = $id('board');
    renderer = new SnapshotRenderer(canvas, null);

    worker = new Worker(new URL('./Sim/sim.worker.js', import.meta.url));

    worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === SimMsg.READY) {
            setText('status', 'ready');
            return;
        }
        if (msg.type === SimMsg.EXTINCT) {
            setText('status', 'extinction at tick ' + msg.ticks.toLocaleString() + ' - world reset');
            return;
        }
        if (msg.type === SimMsg.SNAPSHOT) {
            const states = new Uint8Array(msg.states);
            renderer.draw(states, null, msg.cols, msg.rows);

            last_ticks = msg.ticks;
            if (msg.tps > peak_tps) peak_tps = msg.tps;

            setText('ticks', msg.ticks.toLocaleString());
            setText('tps', msg.tps.toLocaleString());
            setText('peak', peak_tps.toLocaleString());
            setText('orgs', msg.organisms.toLocaleString());

            frames++;
            const now = performance.now();
            if (now - last_frame_check >= 1000) {
                render_fps = Math.round(frames * 1000 / (now - last_frame_check));
                frames = 0;
                last_frame_check = now;
                setText('renderfps', render_fps);
            }
        }
    };

    worker.postMessage({
        type: SimMsg.INIT,
        cols: COLS,
        rows: ROWS,
        cell_size: 2,
    });

    setText('grid', COLS + ' x ' + ROWS + ' = ' + (COLS * ROWS).toLocaleString());

    $id('run').addEventListener('click', () => {
        running = !running;
        if (running) {
            worker.postMessage({ type: SimMsg.START, fps: currentFps() });
            $id('run').textContent = 'pause';
            setText('status', 'running');
        } else {
            worker.postMessage({ type: SimMsg.STOP });
            $id('run').textContent = 'run';
            setText('status', 'paused');
        }
    });

    $id('reset').addEventListener('click', () => {
        peak_tps = 0;
        worker.postMessage({ type: SimMsg.RESET });
    });

    $id('fps').addEventListener('change', () => {
        setText('fpslabel', currentFps() === 0 ? 'unlimited' : currentFps());
        worker.postMessage({ type: SimMsg.SET_FPS, fps: currentFps() });
    });

    $id('snaphz').addEventListener('change', () => {
        const hz = parseInt($id('snaphz').value);
        setText('snaplabel', hz);
        worker.postMessage({ type: SimMsg.SNAPSHOT_HZ, hz });
    });
}

function currentFps() {
    return parseInt($id('fps').value);
}

window.addEventListener('load', boot);
