// The landing page's background: a real world, running behind the headline.
//
// It starts from a world evolved ahead of time (dist/hero-world.json, made by
// tools/make-hero-world.js), so the first frame is already full of life, then
// runs slowly - a page you read, not a benchmark. It costs almost nothing:
// ~15 ticks a second on a 160x100 board, and it stops whenever the hero is
// scrolled away or the tab is hidden. With reduced motion it shows one frame.

const SnapshotRenderer = require('./Sim/SnapshotRenderer');
const { drawEyeSlits } = SnapshotRenderer;
const CellStates = require('./Organism/Cell/CellStates');
const Hyperparams = require('./Hyperparameters');
const { SimMsg } = require('./Sim/SimProtocol');

const NEON = {
    empty: '#0E1318', food: '#2F7AB7', wall: '#FFFFFF', mouth: '#DEB14D',
    producer: '#15DE59', mover: '#60D4FF', killer: '#F82380', armor: '#7230DB', eye: '#B6C1EA',
};
for (const s of CellStates.all) s.color = NEON[s.name] || 'black';
CellStates.eye.slit_color = '#0E1318';

const TPS = 15;
const WORLD_URL = 'hero-world.json';

function boot() {
    const canvas = document.getElementById('hero-world');
    const hero = document.querySelector('.hero');
    if (!canvas || !hero || typeof Worker === 'undefined') return;

    const ctx = canvas.getContext('2d', { alpha: false });
    const off = document.createElement('canvas');
    const snap = new SnapshotRenderer(off, null);
    let states = null, cols = 0, rows = 0, W = 0, H = 0;
    let ticks = 0;
    let ready = false;   // the evolved world is in (or failed to load)

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = canvas.getBoundingClientRect();
        W = r.width; H = r.height;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    // Cover the hero with the board, centred, at whole-ish squares no
    // smaller than 9 px so the shapes read as organisms.
    function draw() {
        if (!states || !W) return;
        const s = Math.max(9, Math.max(W / cols, H / rows));
        const ox = (W - cols * s) / 2, oy = (H - rows * s) / 2;
        ctx.fillStyle = NEON.empty;
        ctx.fillRect(0, 0, W, H);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, ox, oy, cols * s, rows * s);

        const c0 = Math.max(0, Math.floor(-ox / s)), c1 = Math.min(cols, Math.ceil((W - ox) / s));
        const r0 = Math.max(0, Math.floor(-oy / s)), r1 = Math.min(rows, Math.ceil((H - oy) / s));
        drawEyeSlits(ctx, states, cols, c0, c1, r0, r1, ox, oy, s);

        // Faint grid, like the zoomed world view.
        ctx.strokeStyle = 'rgba(255,255,255,0.045)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = c0; c <= c1; c++) { const x = Math.round(ox + c * s) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let r = r0; r <= r1; r++) { const y = Math.round(oy + r * s) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
    }

    const worker = new Worker(new URL('./Sim/sim.worker.js', import.meta.url));
    worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === SimMsg.SNAPSHOT) {
            if (!ready) return;   // don't flash the single starting organism
            states = new Uint8Array(m.states);
            if (off.width !== m.cols || off.height !== m.rows) {
                off.width = m.cols; off.height = m.rows;
                snap.fillShape(m.rows, m.cols);
            }
            cols = m.cols; rows = m.rows; ticks = m.ticks;
            snap.draw(states, null, cols, rows);
            draw();
            if (!canvas.classList.contains('on')) canvas.classList.add('on');
            const t = document.getElementById('hero-tick');
            if (t) t.textContent = ticks.toLocaleString();
        } else if (m.type === SimMsg.WORLD_LOADED || m.type === SimMsg.LOAD_FAILED) {
            ready = true;
            worker.postMessage({ type: SimMsg.STEP, n: 1 });   // first frame now, even if paused
            update();
        }
    };

    const params = {};
    for (const k in Hyperparams) if (typeof Hyperparams[k] !== 'function') params[k] = Hyperparams[k];
    worker.postMessage({
        type: SimMsg.INIT, cols: 160, rows: 100, cell_size: 1, seed: 42,
        stats_mode: 'summary', want_phylo: false, auto_pause: false, params,
    });
    worker.postMessage({ type: SimMsg.SNAPSHOT_HZ, hz: TPS });

    fetch(WORLD_URL)
        .then(r => r.ok ? r.text() : Promise.reject(new Error(r.status)))
        .then(text => worker.postMessage({ type: SimMsg.LOAD_WORLD, text }))
        .catch(() => { ready = true; update(); });   // no file: grow one from scratch

    // Run only while someone can see it.
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let onScreen = true, running = false;
    function update() {
        const want = ready && !reduced && onScreen && !document.hidden;
        if (want === running) return;
        running = want;
        worker.postMessage(want ? { type: SimMsg.START, fps: TPS } : { type: SimMsg.STOP });
    }
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            onScreen = entries[0].isIntersecting;
            update();
        }, { threshold: 0.02 }).observe(hero);
    }
    document.addEventListener('visibilitychange', update);
    window.addEventListener('resize', resize);
    resize();
}

window.addEventListener('load', boot);
