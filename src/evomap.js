// Evolution map page: runs one world in a worker at full speed and draws its
// phylogeny live. URL params: ?cols=300&rows=220&seed=123 plus any simulation
// setting from src/Sim/UrlSettings.js, e.g. &food=7&mcp=1&drop=5 - so a link
// reproduces the exact world.

const SnapshotRenderer = require('./Sim/SnapshotRenderer');
const CellStates = require('./Organism/Cell/CellStates');
const Hyperparams = require('./Hyperparameters');
const { SimMsg } = require('./Sim/SimProtocol');
const { EvoMap, GUILD_COLOR, GUILD_LABEL } = require('./Map/EvoMap');
const { WorldView, TOOLS } = require('./Map/WorldView');
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
let SETTINGS = parseSettings(params);
applySettings(SETTINGS.values);
let LOADED = null;     // {name, ticks} once a world has been loaded from a file

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
    // A loaded world isn't its seed any more - share its settings only.
    const q = new URLSearchParams(settingsQuery(SETTINGS.values, LOADED ? null : SEED));
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

let worker, map, inset, world, running = false, resets = 0;
let last_snapshot = null;   // so a paused world still shows when the view opens
let picked = null;      // {raw organism, name, from: 'world'|'species'|'founder'|'file'}

function toast(text, bad) {
    const t = $id('toast');
    t.textContent = text;
    t.classList.toggle('bad', !!bad);
    t.style.display = 'block';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.style.display = 'none'; }, bad ? 6000 : 3000);
}

function download(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function readFile(input, cb) {
    input.onchange = () => {
        const f = input.files && input.files[0];
        input.value = '';
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => cb(rd.result, f.name);
        rd.readAsText(f);
    };
    input.click();
}

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

// The settings line, preset menu and editor, from SETTINGS.
function refreshSettingsUI() {
    const active = $id('active');
    const bits = SETTINGS.labels.slice();
    if (LOADED) bits.unshift(`loaded ${LOADED.name}`);
    active.classList.toggle('plain', bits.length === 0);
    active.innerHTML = (bits.length ? bits.join(' · ') : 'default settings')
        + (SETTINGS.invalid.length ? ` <span class="bad">· ignored: ${SETTINGS.invalid.join(', ')}</span>` : '');

    const preset = $id('preset');
    const matched = matchPreset(SETTINGS.values);
    preset.innerHTML = PRESETS.map(p => `<option value="${p.id}">${p.label}</option>`).join('')
        + (matched ? '' : '<option value="" selected>custom settings</option>');
    if (matched) preset.value = matched;

    const cur = currentSettings();
    $id('e-food').value = cur.food;
    $id('e-drop').value = cur.drop;
    $id('e-life').value = cur.life;
    $id('e-movercost').value = cur.movercost;
    $id('e-upkeep').value = cur.upkeep;
    $id('e-lexp').value = cur.lexp;
    $id('e-swallow').value = cur.swallow;
    $id('e-gape').value = cur.gape;
    $id('e-mcp').checked = !!cur.mcp;
    $id('e-kin').checked = !!cur.kin;
}

// ---- the live world -------------------------------------------------------

function setView(worldView) {
    document.body.classList.toggle('mapview', !worldView);
    $id('map').hidden = worldView;
    $id('inset').style.display = worldView ? 'none' : '';
    $id('help').style.display = 'none';
    $id('help-btn').style.display = 'block';
    $id('tools').hidden = !worldView;
    $id('view').textContent = worldView ? 'back to map' : 'open world';
    world.show(worldView);
    if (worldView && last_snapshot) world.update(last_snapshot.states, last_snapshot.cols, last_snapshot.rows);
    else if (!worldView && last_snapshot) inset.draw(last_snapshot.states, null, last_snapshot.cols, last_snapshot.rows);
    worker.postMessage({ type: SimMsg.SNAPSHOT_HZ, hz: worldView ? 30 : 6 });
    if (!worldView) { map.resize(); map.requestDraw(); }
}

function setTool(t) {
    world.setTool(t);
    for (const b of document.querySelectorAll('#tools button[data-tool]')) {
        b.classList.toggle('on', b.dataset.tool === t);
    }
}

const FOOD = CellStates.food.index, WALL = CellStates.wall.index, EMPTY = CellStates.empty.index;

// Same rules as the original game: left paints, right removes; walls crush
// whatever they land on; food and empty never overwrite a wall.
function onTool(tool, c, r, button) {
    const brush = world.brush;
    const remove = button === 2;
    if (tool === 'food') {
        worker.postMessage({ type: SimMsg.DROP_CELLS, c, r, brush, state: remove ? EMPTY : FOOD, kill_blocking: false, ignore: WALL });
    } else if (tool === 'wall') {
        worker.postMessage(remove
            ? { type: SimMsg.DROP_CELLS, c, r, brush, state: EMPTY, kill_blocking: false, ignore: FOOD }
            : { type: SimMsg.DROP_CELLS, c, r, brush, state: WALL, kill_blocking: true });
    } else if (tool === 'kill') {
        worker.postMessage({ type: SimMsg.KILL_AT, c, r, brush });
    } else if (tool === 'select') {
        world.marker = { c, r };
        worker.postMessage({ type: SimMsg.SELECT_AT, c, r, brush: Math.max(2, brush), token: 'select' });
    } else if (tool === 'drop') {
        if (!picked) { toast('pick an organism first: select one, click a species on the map, or load a file'); return; }
        worker.postMessage({ type: SimMsg.DROP_ORG, organism: picked.raw, c, r });
    }
}

// An organism file in the original game's format, from a map node's founder
// cells - used when a species has no living member to copy.
function founderRaw(node) {
    return {
        species_name: node.name,
        move_range: 4,
        mutability: 5,
        anatomy: {
            cells: node.cells.map(([c, r, si, dir]) => ({
                loc_col: c, loc_row: r, state: { name: CellStates.all[si].name }, direction: dir,
            })),
        },
    };
}

function cellsOfRaw(raw) {
    const out = [];
    for (const cell of (raw.anatomy && raw.anatomy.cells) || []) {
        const st = CellStates.all.find(s => s.name === (cell.state && cell.state.name));
        out.push([cell.loc_col, cell.loc_row, st ? st.index : 0]);
    }
    return out;
}

function drawPortrait(canvas, cells) {
    const g = canvas.getContext('2d');
    g.fillStyle = '#0E1318';
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (!cells.length) return;
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const [c, r] of cells) { minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
    const w = maxC - minC + 1, h = maxR - minR + 1;
    const px = Math.max(1, Math.floor(Math.min((canvas.width - 6) / w, (canvas.height - 6) / h)));
    const ox = Math.floor((canvas.width - w * px) / 2), oy = Math.floor((canvas.height - h * px) / 2);
    for (const [c, r, si] of cells) {
        g.fillStyle = CellStates.all[si] ? CellStates.all[si].color : '#888';
        g.fillRect(ox + (c - minC) * px, oy + (r - minR) * px, px, px);
    }
}

const SOURCE_TEXT = {
    world: 'picked from the world',
    species: 'a living member',
    founder: "extinct - the founder's body",
    file: 'loaded from a file',
};

function setPicked(p) {
    picked = p;
    $id('picked').hidden = !p;
    if (!p) return;
    const cells = cellsOfRaw(p.raw);
    drawPortrait($id('picked-art'), cells);
    $id('picked-name').textContent = p.name || 'organism';
    // Only movers with eyes have a brain worth saving (as in the original).
    const brain = p.raw.brain ? ', with its brain' : '';
    $id('picked-info').textContent = `${cells.length} cells · ${SOURCE_TEXT[p.from] || ''}${brain}`;
}

// Picking a species on the map: ask the worker for a living member (body
// and brain); if the species is gone, fall back to its founder's body.
function pickSpecies(node) {
    pickSpecies.pending = node;
    worker.postMessage({ type: SimMsg.SPECIES_ORG, name: node.name, token: 'species' });
}

function onWorldLoaded(info, name) {
    Hyperparams.setDefaults();
    Hyperparams.loadJsonObj(info.controls);
    SETTINGS = parseSettings(new URLSearchParams(settingsQuery(currentSettings(), null)));
    LOADED = { name, ticks: info.ticks };
    resets = 0;
    $id('s-resets').textContent = 0;
    $id('seed').textContent = 'loaded';
    $id('grid').textContent = `${info.cols}×${info.rows}`;
    // Keep the link honest: it now carries this world's settings, no seed.
    history.replaceState(null, '', `${location.pathname}?${settingsQuery(SETTINGS.values, null)}`);
    refreshSettingsUI();
    world.fitted = false;
    toast(`loaded ${name}: tick ${fmtTick(info.ticks)}, ${fmt(info.organisms)} organisms`
        + (info.has_history ? ', with its map history' : ' - no map history in this file, the map starts now'));
}

function boot() {
    map = new EvoMap($id('map'), $id('tooltip'));
    map.onChange = refreshPanel;
    inset = new SnapshotRenderer($id('board'), null);

    $id('seed').textContent = SEED;
    $id('grid').textContent = `${COLS}×${ROWS}`;

    // Settings line, presets from the sweeps, editor.
    refreshSettingsUI();
    const preset = $id('preset');
    preset.addEventListener('change', () => {
        const p = PRESETS.find(x => x.id === preset.value);
        if (p) gotoSettings(p.query);
    });
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
            upkeep: parseFloat($id('e-upkeep').value),
            lexp: parseFloat($id('e-lexp').value),
            swallow: parseFloat($id('e-swallow').value),
            gape: parseFloat($id('e-gape').value),
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

    world = new WorldView($id('world'));
    world.onTool = onTool;
    map.onSelect = pickSpecies;
    setTool('move');
    for (const b of document.querySelectorAll('#tools button[data-tool]')) {
        b.addEventListener('click', () => setTool(b.dataset.tool));
    }
    $id('brush').addEventListener('input', () => { world.brush = parseInt($id('brush').value, 10); world.draw(); });
    $id('rwalls').addEventListener('click', () => worker.postMessage({ type: SimMsg.RANDOM_WALLS, thickness: 1 }));
    $id('cwalls').addEventListener('click', () => worker.postMessage({ type: SimMsg.CLEAR_WALLS }));
    $id('wfit').addEventListener('click', () => world.fit());
    $id('back').addEventListener('click', () => setView(false));
    $id('view').addEventListener('click', () => setView(!world.visible));
    $id('inset').addEventListener('click', () => setView(true));
    $id('picked-close').addEventListener('click', () => { setPicked(null); world.marker = null; world.draw(); });
    $id('picked-drop').addEventListener('click', () => { if (!world.visible) setView(true); setTool('drop'); });
    $id('picked-save').addEventListener('click', () => {
        if (picked) download(JSON.stringify(picked.raw), `${picked.name || 'organism'}.json`);
    });
    $id('lorg').addEventListener('click', () => readFile($id('file-org'), (text, name) => {
        try {
            const raw = JSON.parse(text);
            if (!raw.anatomy || !Array.isArray(raw.anatomy.cells)) throw new Error('no anatomy');
            setPicked({ raw, name: raw.species_name || name.replace(/\.json$/, ''), from: 'file' });
            setTool('drop');
        } catch (e) {
            toast(`that isn't an organism file (${e.message})`, true);
        }
    }));
    $id('save').addEventListener('click', () => {
        toast('saving…');
        worker.postMessage({ type: SimMsg.SAVE_WORLD, meta: { seed: LOADED ? null : SEED, settings: SETTINGS.values } });
    });
    $id('load').addEventListener('click', () => readFile($id('file-world'), (text, name) => {
        onWorldLoaded.pendingName = name;
        toast(`loading ${name}…`);
        worker.postMessage({ type: SimMsg.LOAD_WORLD, text });
    }));

    worker = new Worker(new URL('./Sim/sim.worker.js', import.meta.url));
    worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === SimMsg.SNAPSHOT) {
            const states = new Uint8Array(m.states);
            last_snapshot = { states, cols: m.cols, rows: m.rows };
            if (world.visible) world.update(states, m.cols, m.rows);
            else inset.draw(states, null, m.cols, m.rows);
            $id('s-tick').textContent = fmtTick(m.ticks);
            $id('s-tps').textContent = fmt(m.tps);
            $id('s-orgs').textContent = fmt(m.organisms);
        } else if (m.type === SimMsg.PHYLO) {
            map.applyUpdate(m.update);
        } else if (m.type === SimMsg.EXTINCT) {
            resets++;
            $id('s-resets').textContent = resets;
        } else if (m.type === SimMsg.ORGANISM) {
            if (m.token === 'select') {
                if (!m.organism) { world.marker = null; world.draw(); toast('no organism there'); return; }
                setPicked({ raw: m.organism, name: m.organism.species_name, from: 'world' });
            } else if (m.token === 'species') {
                const node = pickSpecies.pending;
                if (!node || node.name !== m.species) return;
                setPicked(m.organism
                    ? { raw: m.organism, name: node.name, from: 'species' }
                    : { raw: founderRaw(node), name: node.name, from: 'founder' });
            }
        } else if (m.type === SimMsg.WORLD_SAVED) {
            const name = `world-${LOADED ? 'loaded' : SEED}-t${m.ticks}.json`;
            download(m.text, name);
            toast(`saved ${name} (${(m.text.length / 1e6).toFixed(1)} MB)`);
        } else if (m.type === SimMsg.WORLD_LOADED) {
            onWorldLoaded(m.info, onWorldLoaded.pendingName || 'world');
        } else if (m.type === SimMsg.LOAD_FAILED) {
            toast(`couldn't load that file: ${m.error}`, true);
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
        if (e.key === 'w' || (e.key === 'Escape' && world.visible)) { setView(!world.visible); return; }
        if (world.visible) {
            const n = parseInt(e.key, 10);
            if (n >= 1 && n <= TOOLS.length) setTool(TOOLS[n - 1]);
            if (e.key === 'z') world.fit();
            return;
        }
        if (e.key === 'f') map.setFollow(!map.follow);
        if (e.key === 'z') map.fit();
    });

    document.body.classList.add('mapview');
    setRunning(true);
    refreshPanel();
}

window.addEventListener('load', boot);
