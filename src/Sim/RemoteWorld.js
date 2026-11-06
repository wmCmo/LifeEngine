// Main-thread stand-in for WorldEnvironment when the simulation lives in a
// worker. It presents the small part of the WorldEnvironment surface the UI
// actually uses, backed by the latest snapshot plus commands posted to the
// worker.
//
// Reads that used to be synchronous and exact (cell.owner, organisms.length)
// are now answered from the last snapshot, so they can be up to one frame
// stale. Anything that needs real simulation state - selecting an organism,
// serializing the world - is a round trip.

const CellStates = require('../Organism/Cell/CellStates');
const SnapshotRenderer = require('./SnapshotRenderer');
const FossilRecord = require('../Stats/FossilRecord');
const Species = require('../Stats/Species');
const Hyperparams = require('../Hyperparameters');
const WorldConfig = require('../WorldConfig');
const { SimMsg } = require('./SimProtocol');

// A handle to an organism that lives in the worker. Enough for the UI to
// highlight it, kill it, or ask for its full anatomy.
class RemoteOrganism {
    constructor(world, id, col, row) {
        this.world = world;
        this.id = id;
        this.c = col;
        this.r = row;
    }
    die() {
        this.world.killAt(this.c, this.r, 0);
    }
}

class RemoteGridMap {
    constructor(world) {
        this.world = world;
        this.cols = 0;
        this.rows = 0;
        this.cell_size = 5;
    }

    isValidLoc(col, row) {
        return col < this.cols && row < this.rows && col >= 0 && row >= 0;
    }

    cellAt(col, row) {
        if (!this.isValidLoc(col, row)) return null;
        const w = this.world;
        const i = row * this.cols + col;
        const state = CellStates.fromIndex(w.states ? (w.states[i] & 0x0F) : 0);
        const owner_id = w.owners ? w.owners[i] : 0;
        return {
            col, row,
            x: col * this.cell_size,
            y: row * this.cell_size,
            state,
            owner: owner_id ? new RemoteOrganism(w, owner_id, col, row) : null,
            cell_owner: null,
        };
    }

    xyToColRow(x, y) {
        let c = Math.floor(x / this.cell_size);
        let r = Math.floor(y / this.cell_size);
        if (c >= this.cols) c = this.cols - 1; else if (c < 0) c = 0;
        if (r >= this.rows) r = this.rows - 1; else if (r < 0) r = 0;
        return [c, r];
    }

    getCenter() {
        return [Math.floor(this.cols / 2), Math.floor(this.rows / 2)];
    }
}

class RemoteWorld {
    constructor(engine, cell_size, canvas_id = 'env-canvas', container_id = 'env') {
        this.engine = engine;
        this.headless_view = false;

        this.renderer = new SnapshotRenderer(document.getElementById(canvas_id), container_id);
        this.renderer.cell_size = cell_size;
        this.grid_map = new RemoteGridMap(this);
        this.grid_map.cell_size = cell_size;

        this.states = null;
        this.owners = null;

        this.num_cols = 0;
        this.num_rows = 0;
        this.total_ticks = 0;
        this.reset_count = 0;
        this.largest_cell_count = 0;
        this.average_mutability = 0;
        this.tps = 0;
        this.organisms = { length: 0 };   // only .length is ever read

        this.pending_serialize = null;
        this.on_organism = null;          // set by the controller for SELECT_AT
        this.on_ready = null;
        this.on_paused = null;

        // The charts read FossilRecord directly and expect at least one data
        // point to exist before the first render. The worker owns the real
        // record; this seeds the main-thread copy so the charts can draw
        // before any stats message has arrived.
        FossilRecord.setEnv(this);

        this.worker = new Worker(new URL('./sim.worker.js', import.meta.url));
        this.worker.onmessage = (e) => this.handle(e.data);
    }

    init(cols, rows, cell_size) {
        this.grid_map.cell_size = cell_size;
        this.renderer.cell_size = cell_size;
        this.post({
            type: SimMsg.INIT,
            cols, rows, cell_size,
            params: jsonParams(),
            auto_pause: WorldConfig.auto_pause,
        });
    }

    post(msg, transfer) { this.worker.postMessage(msg, transfer || []); }

    handle(msg) {
        switch (msg.type) {
            case SimMsg.READY:
                this.num_cols = msg.cols;
                this.num_rows = msg.rows;
                this.grid_map.cols = msg.cols;
                this.grid_map.rows = msg.rows;
                if (this.on_ready) this.on_ready();
                break;

            case SimMsg.SNAPSHOT:
                this.states = new Uint8Array(msg.states);
                if (msg.owners) this.owners = new Uint32Array(msg.owners);
                this.num_cols = msg.cols;
                this.num_rows = msg.rows;
                this.grid_map.cols = msg.cols;
                this.grid_map.rows = msg.rows;
                this.grid_map.cell_size = msg.cell_size;
                this.total_ticks = msg.ticks;
                this.tps = msg.tps;
                this.organisms.length = msg.organisms;
                break;

            case SimMsg.STATS:
                this.total_ticks = msg.ticks;
                this.organisms.length = msg.organisms;
                this.reset_count = msg.reset_count;
                this.largest_cell_count = msg.largest_cell_count;
                this.average_mutability = msg.average_mutability;
                applyStatsToFossilRecord(msg);
                break;

            case SimMsg.ORGANISM:
                if (this.on_organism) this.on_organism(msg.organism);
                break;

            case SimMsg.SERIALIZED:
                if (this.pending_serialize) {
                    this.pending_serialize(msg.env);
                    this.pending_serialize = null;
                }
                break;

            case SimMsg.PAUSED:
                if (this.on_paused) this.on_paused();
                break;
        }
    }

    // ---- the surface the UI already calls -------------------------------

    render() {
        if (WorldConfig.headless || !this.states) return;
        this.renderer.draw(this.states, this.owners, this.num_cols, this.num_rows);
    }

    renderFull() { this.render(); }

    averageMutability() {
        if (Hyperparams.useGlobalMutability) return Hyperparams.globalMutability;
        return this.average_mutability;
    }

    reset(confirm_reset = true, reset_life = true) {
        if (confirm_reset && !confirm('The current environment will be lost. Proceed?'))
            return false;
        this.post({ type: SimMsg.RESET, reset_life });
        return true;
    }

    resizeGridColRow(cell_size, cols, rows) {
        this.grid_map.cell_size = cell_size;
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows * cell_size, cols * cell_size);
        this.post({ type: SimMsg.RESIZE, cell_size, cols, rows });
    }

    resizeFillWindow(cell_size) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow();
        const cols = Math.ceil(this.renderer.width / cell_size);
        const rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.cell_size = cell_size;
        this.post({ type: SimMsg.RESIZE, cell_size, cols, rows });
    }

    clearWalls() { this.post({ type: SimMsg.CLEAR_WALLS }); }

    serialize(cb) {
        this.pending_serialize = cb;
        this.post({ type: SimMsg.SERIALIZE });
    }

    loadRaw(env) {
        if ($('#override-controls').is(':checked') && env.controls)
            Hyperparams.loadJsonObj(env.controls);
        this.post({ type: SimMsg.LOAD, env, params: jsonParams() });
    }

    // ---- commands the controller used to perform directly ---------------

    dropCells(c, r, state, brush, kill_blocking, ignore_state) {
        this.post({
            type: SimMsg.DROP_CELLS, c, r,
            state: state.index,
            brush,
            kill_blocking: !!kill_blocking,
            ignore: ignore_state ? ignore_state.index : null,
        });
    }

    killAt(c, r, brush) { this.post({ type: SimMsg.KILL_AT, c, r, brush }); }

    selectAt(c, r, brush) { this.post({ type: SimMsg.SELECT_AT, c, r, brush }); }

    dropOrganism(raw, c, r) { this.post({ type: SimMsg.DROP_ORG, organism: raw, c, r }); }

    dropRandomOrganisms(list) { this.post({ type: SimMsg.RANDOM_ORGS, organisms: list }); }

    randomizeWalls(thickness = 1) { this.post({ type: SimMsg.RANDOM_WALLS, thickness }); }

    wantOwners(on) { this.post({ type: SimMsg.WANT_OWNERS, on }); }

    // ---- loop control ---------------------------------------------------

    start(fps) { this.post({ type: SimMsg.START, fps }); }
    stop() { this.post({ type: SimMsg.STOP }); }
    setFps(fps) { this.post({ type: SimMsg.SET_FPS, fps }); }
    syncParams() { this.post({ type: SimMsg.SET_PARAMS, params: jsonParams() }); }
    syncConfig() { this.post({ type: SimMsg.SET_CONFIG, config: { ...WorldConfig } }); }
}

function jsonParams() {
    const out = {};
    for (const k in Hyperparams) {
        if (typeof Hyperparams[k] !== 'function') out[k] = Hyperparams[k];
    }
    return out;
}

// The charts read FossilRecord directly, so keep the main-thread copy filled
// from the worker rather than rewriting four chart modules.
function applyStatsToFossilRecord(msg) {
    for (const k in msg.records) FossilRecord[k] = msg.records[k];
    const extant = {};
    for (const name in msg.species) {
        const s = new Species(null, null, msg.species[name].start_tick);
        Object.assign(s, msg.species[name]);
        extant[name] = s;
    }
    FossilRecord.extant_species = extant;
}

module.exports = RemoteWorld;
