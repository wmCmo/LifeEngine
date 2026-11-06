// Evolution map page: runs one world in a worker at full speed and draws its
// phylogeny live. URL params: ?cols=300&rows=220&seed=123 plus any simulation
// setting from src/Sim/UrlSettings.js, e.g. &food=7&mcp=1&drop=5 - so a link
// reproduces the exact world.

const SnapshotRenderer = require('./Sim/SnapshotRenderer');
const CellStates = require('./Organism/Cell/CellStates');
const Hyperparams = require('./Hyperparameters');
const { SimMsg } = require('./Sim/SimProtocol');
const { EvoMap, GUILD_COLOR, GUILD_LABEL } = require('./Map/EvoMap');
const { PRESETS, parseSettings, applySettings, currentSettings, settingsQuery, matchPreset } = require('./Sim/UrlSettings');

const NEON = {
    empty: '#0E1318', food: '#2F7AB7', wall: '#FFFFFF', mouth: '#DEB14D',
    producer: '#15DE59', mover: '#60D4FF', killer: '#F82380', armor: '#7230DB', eye: '#B6C1EA',
};
for (const s of CellStates.all) s.color = NEON[s.name] || 'black';

const params = new URLSearchParams(location.search);
const COLS = parseInt(params.get('cols') || '300');
const ROWS = parseInt(params.get('rows') || '220');
const SEED = params.has('seed') ? parseInt(params.get('seed')) : (Date.now() & 0x7fffffff);

// Settings from the URL go into Hyperparams before the worker is created -
// it takes its copy at INIT and keeps it for the life of the world.
const SETTINGS = parseSettings(params);
applySettings(SETTINGS.values);

// Settings change the rules, so they start a new world - on the same seed, so
// two settings can be compared from the same start.
function gotoSettings(values) {
    const q = settingsQuery(values, SEED);
    const keep = new URLSearchParams(q);
    if (params.has('cols')) keep.set('cols', params.get('cols'));
    if (params.has('rows')) keep.set('rows', params.get('rows'));
    location.search = keep.toString();
}

function shareLink() {
    const q = new URLSearchParams(settingsQuery(SETTINGS.values, SEED));
    if (params.has('cols')) q.set('cols', params.get('cols'));
    if (params.has('rows')) q.set('rows', params.get('rows'));
    return `${location.origin}${location.pathname}?${q.toString()}`;
}

function $id(id) { return document.getElementById(id); }
function fmt(n) { return (n || 0).toLocaleString(); }
function fmtTick(t) {
    if (t >= 1e6) return (t / 1e6).toFixed(2) + 'M';
    if (t >= 1e3) return (t / 1e3).toFixed(1) + 'k';
    return String(t);
}

let worker, map, inset, running = false, resets = 0;

function jsonParams() {
    const out = {};
    for (const k in Hyperparams) if (typeof Hyperparams[k] !== 'function') out[k] = Hyperparams[k];
    return out;
}

function speed() { return parseInt($id('speed').value); }

function setRunning(v) {
    running = v;
    worker.postMessage(v ? { type: SimMsg.START, fps: speed() } : { type: SimMsg.STOP });
    $id('run').textContent = v ? 'pause' : 'run';
    $id('run').classList.toggle('alt', v);
}

function refreshPanel() {
    let shown = 0;
    for (const n of map.nodes.values()) if (n.visible) shown++;
    $id('s-map').textContent = `${shown} shown / ${map.nodes.size} established`;
    $id('s-eras').textContent = map.eras.length;
    const mass = map.events.filter(e => e.type === 'mass extinction').length;
    $id('s-events').textContent = `${mass} mass · ${map.events.length - mass} crashes`;
    $id('follow').classList.toggle('on', map.follow);
    $id('all').classList.toggle('on', map.showAll);

    const cur = map.eras[map.eras.length - 1];
    $id('s-era').innerHTML = cur
        ? `<i style="background:${GUILD_COLOR[cur.guild]}"></i>era ${cur.index} · ${GUILD_LABEL[cur.guild]}`
        : '&mdash;';
}

function boot() {
    map = new EvoMap($id('map'), $id('tooltip'));
    map.onChange = refreshPanel;
    inset = new SnapshotRenderer($id('board'), null);

    $id('seed').textContent = SEED;
    $id('grid').textContent = `${COLS}×${ROWS}`;

    // Active settings line.
    const active = $id('active');
    const bits = SETTINGS.labels.slice();
    active.classList.toggle('plain', bits.length === 0);
    active.innerHTML = (bits.length ? bits.join(' · ') : 'default settings')
        + (SETTINGS.invalid.length ? ` <span class="bad">· ignored: ${SETTINGS.invalid.join(', ')}</span>` : '');

    // Presets from the sweeps.
    const preset = $id('preset');
    const matched = matchPreset(SETTINGS.values);
    preset.innerHTML = PRESETS.map(p => `<option value="${p.id}">${p.label}</option>`).join('')
        + (matched ? '' : '<option value="" selected>custom settings</option>');
    if (matched) preset.value = matched;
    preset.addEventListener('change', () => {
        const p = PRESETS.find(x => x.id === preset.value);
        if (p) gotoSettings(p.query);
    });

    // Editor.
    const cur = currentSettings();
    $id('e-food').value = cur.food;
    $id('e-drop').value = cur.drop;
    $id('e-life').value = cur.life;
    $id('e-movercost').value = cur.movercost;
    $id('e-mcp').checked = !!cur.mcp;
    $id('e-kin').checked = !!cur.kin;
    $id('edit').addEventListener('click', () => {
        const ed = $id('editor');
        ed.hidden = !ed.hidden;
        $id('edit').classList.toggle('on', !ed.hidden);
    });
    $id('apply').addEventListener('click', () => {
        gotoSettings({
            ...SETTINGS.values,
            food: parseFloat($id('e-food').value),
            drop: parseFloat($id('e-drop').value),
            life: parseFloat($id('e-life').value),
            movercost: parseInt($id('e-movercost').value, 10),
            mcp: $id('e-mcp').checked,
            kin: $id('e-kin').checked,
        });
    });

    // Copy a link to exactly this world.
    $id('copy').addEventListener('click', async () => {
        const link = shareLink();
        try {
            await navigator.clipboard.writeText(link);
            $id('copy').textContent = 'copied!';
        } catch (e) {
            window.prompt('Copy this link:', link);
        }
        $id('copy').classList.add('done');
        setTimeout(() => { $id('copy').textContent = 'copy link'; $id('copy').classList.remove('done'); }, 1500);
    });
    $id('legend').innerHTML = Object.keys(GUILD_LABEL).filter(k => k !== 'unknown').map(k =>
        `<span><i style="background:${GUILD_COLOR[k]}"></i>${GUILD_LABEL[k]}</span>`).join('');

    worker = new Worker(new URL('./Sim/sim.worker.js', import.meta.url));
    worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === SimMsg.SNAPSHOT) {
            inset.draw(new Uint8Array(m.states), null, m.cols, m.rows);
            $id('s-tick').textContent = fmtTick(m.ticks);
            $id('s-tps').textContent = fmt(m.tps);
            $id('s-orgs').textContent = fmt(m.organisms);
        } else if (m.type === SimMsg.PHYLO) {
            map.applyUpdate(m.update);
        } else if (m.type === SimMsg.EXTINCT) {
            resets++;
            $id('s-resets').textContent = resets;
        }
    };
    worker.postMessage({
        type: SimMsg.INIT,
        cols: COLS, rows: ROWS, cell_size: 1,
        seed: SEED,
        stats_mode: 'summary',
        want_phylo: true,
        auto_pause: false,
        params: jsonParams(),
    });
    worker.postMessage({ type: SimMsg.SNAPSHOT_HZ, hz: 6 });

    $id('run').addEventListener('click', () => setRunning(!running));
    $id('speed').addEventListener('change', () => {
        worker.postMessage({ type: SimMsg.SET_FPS, fps: speed() });
    });
    $id('follow').addEventListener('click', () => map.setFollow(!map.follow));
    $id('fit').addEventListener('click', () => map.fit());
    $id('all').addEventListener('click', () => { map.setShowAll(!map.showAll); refreshPanel(); });
    $id('reseed').addEventListener('click', () => {
        const p = new URLSearchParams(location.search);
        p.set('seed', String(Date.now() & 0x7fffffff));
        location.search = p.toString();
    });
    // The help box covers the bottom-right of the map, so let it go away.
    const setHelp = (show) => {
        $id('help').style.display = show ? '' : 'none';
        $id('help-btn').style.display = show ? 'none' : 'block';
    };
    $id('help').addEventListener('click', () => setHelp(false));
    $id('help-btn').addEventListener('click', () => setHelp(true));

    window.addEventListener('keydown', (e) => {
        // Typing a value into the settings editor mustn't pause the world
        // or toggle follow.
        if (['SELECT', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        if (e.key === '?') setHelp($id('help').style.display === 'none');
        if (e.code === 'Space') { e.preventDefault(); setRunning(!running); }
        if (e.key === 'f') map.setFollow(!map.follow);
        if (e.key === 'z') map.fit();
    });

    setRunning(true);
    refreshPanel();
}

window.addEventListener('load', boot);
