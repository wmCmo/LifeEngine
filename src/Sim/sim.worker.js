// Runs the simulation off the main thread.
//
// Why this exists: the old Engine paced the sim with a fixed-timestep
// accumulator driven by setInterval, so it could never advance faster than
// wall-clock * target fps, and browsers clamp nested timers to ~4ms on top of
// that. Here we run ticks in a tight loop, yield through a MessageChannel
// (a macrotask, but not clamped the way setTimeout is), and push the board to
// the renderer at a much lower, fixed rate.

const WorldEnvironment = require('../Environments/WorldEnvironment');
const Organism = require('../Organism/Organism');
const Species = require('../Stats/Species');
const FossilRecord = require('../Stats/FossilRecord');
const CellStates = require('../Organism/Cell/CellStates');
const Neighbors = require('../Grid/Neighbors');
const Hyperparams = require('../Hyperparameters');
const WorldConfig = require('../WorldConfig');
const Perlin = require('../Utils/Perlin');
const { SimMsg } = require('./SimProtocol');

// Time inside the tick loop before yielding to handle messages. Long enough
// that yield overhead is noise, short enough that pause/reset feel instant.
const SLICE_MS = 8;

let env = null;
let running = false;
let target_fps = 0;          // 0 == unlimited
let snapshot_hz = 30;
let want_owners = false;
let scheduled = false;

let last_snapshot = 0;
let last_stats = 0;
let accum_ms = 0;
let last_slice_end = 0;

let tps = 0;
let tps_ticks = 0;
let tps_since = 0;

// 'full' ships the whole fossil record for the charts. 'summary' ships only
// scalars plus the current body-plan composition, which is what a grid of
// parallel worlds needs - sending 500-point records from 16 workers once a
// second is pure overhead.
let stats_mode = 'full';

// Optional per-world determinism. Seeding here rather than in the engine keeps
// it worker-scoped: each world gets its own stream, and a run can be repeated
// exactly. Without a seed the worlds just use the default Math.random.
function installSeededRandom(seed) {
    let s = (seed >>> 0) || 1;
    Math.random = function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;  s >>>= 0;
        return s / 4294967296;
    };
}

// WorldEnvironment.reset() calls back into an engine; give it one.
const fakeEngine = {
    fps: 60,
    last_fps: 60,
    get running() { return running; },
    start() {}, stop() {}, restart() {},
};

const yield_chan = new MessageChannel();
yield_chan.port1.onmessage = () => { scheduled = false; runSlice(); };
function scheduleSlice() {
    if (scheduled || !running) return;
    scheduled = true;
    yield_chan.port2.postMessage(0);
}

function now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
}

// ---------------------------------------------------------------- snapshots

function sendSnapshot() {
    if (!env) return;
    const gm = env.grid_map;
    const states = new Uint8Array(gm.view.length);
    states.set(gm.view);

    const payload = {
        type: SimMsg.SNAPSHOT,
        states: states.buffer,
        cols: gm.cols,
        rows: gm.rows,
        cell_size: gm.cell_size,
        ticks: env.total_ticks,
        tps: Math.round(tps),
        organisms: env.organisms.length,
    };
    const transfer = [states.buffer];

    // The owner map is only needed while the pointer is over the canvas.
    if (want_owners) {
        const owners = new Uint32Array(gm.owners.length);
        owners.set(gm.owners);
        payload.owners = owners.buffer;
        transfer.push(owners.buffer);
    }

    postMessage(payload, transfer);
    last_snapshot = now();
}

function sendStats() {
    if (!env) return;

    if (stats_mode === 'summary') {
        // Body-plan composition: average cells per organism of each type,
        // weighted by population. This is the number that answers "did these
        // worlds converge on the same shape".
        const cc = FossilRecord.av_cell_counts;
        const ac = FossilRecord.av_cells;
        postMessage({
            type: SimMsg.STATS,
            ticks: env.total_ticks,
            organisms: env.organisms.length,
            reset_count: env.reset_count,
            largest_cell_count: env.largest_cell_count,
            average_mutability: env.averageMutability(),
            num_extant: FossilRecord.numExtantSpecies(),
            avg_cells: ac.length ? ac[ac.length - 1] : 0,
            composition: cc.length ? cc[cc.length - 1] : null,
        });
        last_stats = now();
        return;
    }

    const species = {};
    for (const s of Object.values(FossilRecord.extant_species)) {
        species[s.name] = {
            name: s.name,
            population: s.population,
            cumulative_pop: s.cumulative_pop,
            start_tick: s.start_tick,
            cell_counts: s.cell_counts,
        };
    }
    postMessage({
        type: SimMsg.STATS,
        ticks: env.total_ticks,
        organisms: env.organisms.length,
        reset_count: env.reset_count,
        largest_cell_count: env.largest_cell_count,
        average_mutability: env.averageMutability(),
        num_extant: FossilRecord.numExtantSpecies(),
        num_extinct: FossilRecord.numExtinctSpecies(),
        species,
        records: {
            tick_record: FossilRecord.tick_record.slice(),
            pop_counts: FossilRecord.pop_counts.slice(),
            species_counts: FossilRecord.species_counts.slice(),
            av_mut_rates: FossilRecord.av_mut_rates.slice(),
            av_cells: FossilRecord.av_cells.slice(),
            av_cell_counts: FossilRecord.av_cell_counts.slice(),
        },
    });
    last_stats = now();
}

// ---------------------------------------------------------------- tick loop

function runSlice() {
    if (!running || !env) return;
    const slice_start = now();

    // A target fps still works, so the existing speed slider keeps its meaning.
    let budget = Infinity;
    if (target_fps > 0) {
        const step_ms = 1000 / target_fps;
        accum_ms += (last_slice_end === 0 ? step_ms : slice_start - last_slice_end);
        budget = Math.floor(accum_ms / step_ms);
        if (budget < 0) budget = 0;
    }

    let did = 0;
    while (did < budget && (now() - slice_start) < SLICE_MS) {
        env.update();
        did++;
        tps_ticks++;
    }

    if (target_fps > 0) {
        accum_ms -= did * (1000 / target_fps);
        if (accum_ms < 0) accum_ms = 0;
        if (accum_ms > 1000) accum_ms = 1000;   // don't build unpayable debt
    }
    last_slice_end = now();

    if (last_slice_end - tps_since >= 1000) {
        tps = tps_ticks * 1000 / (last_slice_end - tps_since);
        tps_ticks = 0;
        tps_since = last_slice_end;
    }
    if (last_slice_end - last_snapshot >= 1000 / snapshot_hz) sendSnapshot();
    if (last_slice_end - last_stats >= 1000) sendStats();

    scheduleSlice();
}

// ------------------------------------------------------------------ helpers

function organismAt(c, r, brush) {
    let closest = null;
    let closest_dist = Infinity;
    for (const loc of Neighbors.inRange(brush)) {
        const cell = env.grid_map.cellAt(c + loc[0], r + loc[1]);
        const dist = Math.abs(loc[0]) + Math.abs(loc[1]);
        if (cell != null && cell.owner != null && dist < closest_dist) {
            closest = cell.owner;
            closest_dist = dist;
        }
    }
    return closest;
}

function dropCells(c, r, state_index, brush, kill_blocking, ignore_index) {
    const state = CellStates.fromIndex(state_index);
    const ignore = ignore_index == null ? null : CellStates.fromIndex(ignore_index);
    for (const loc of Neighbors.inRange(brush)) {
        const cc = c + loc[0];
        const rr = r + loc[1];
        const cell = env.grid_map.cellAt(cc, rr);
        if (cell == null) continue;
        if (kill_blocking && cell.owner != null) cell.owner.die();
        else if (cell.owner != null) continue;
        if (ignore != null && cell.state === ignore) continue;
        env.changeCell(cc, rr, state, null);
    }
}

function dropOrganismRaw(raw, col, row) {
    const org = new Organism(col, row, env);
    org.loadRaw(raw);
    org.c = col;
    org.r = row;
    if (!org.isClear(col, row)) return false;
    if (!org.species) {
        org.species = new Species(org.anatomy, null, env.total_ticks);
    }
    if (!FossilRecord.speciesIsExtant(org.species.name)) {
        FossilRecord.addSpeciesObj(org.species);
        org.species.start_tick = env.total_ticks;
        org.species.population = 0;
    }
    env.addOrganism(org);
    org.species.addPop();
    return true;
}

function randomizeWalls(thickness) {
    env.clearWalls();
    const noise_threshold = -0.017;
    const resolution = 20;
    Perlin.seed();
    const cs = env.grid_map.cell_size;
    for (let r = 0; r < env.num_rows; r++) {
        for (let c = 0; c < env.num_cols; c++) {
            const xval = c / env.num_cols * (resolution / cs * (env.num_cols / env.num_rows));
            const yval = r / env.num_rows * (resolution / cs * (env.num_rows / env.num_cols));
            const noise = Perlin.get(xval, yval);
            if (noise > noise_threshold && noise < noise_threshold + thickness / resolution) {
                const cell = env.grid_map.cellAt(c, r);
                if (cell != null) {
                    if (cell.owner != null) cell.owner.die();
                    env.changeCell(c, r, CellStates.wall, null);
                }
            }
        }
    }
}

// ----------------------------------------------------------------- messages

onmessage = function (e) {
    const msg = e.data;
    switch (msg.type) {

        case SimMsg.INIT: {
            WorldConfig.headless = true;          // no canvas in here
            if (msg.seed != null) installSeededRandom(msg.seed);
            if (msg.stats_mode) stats_mode = msg.stats_mode;
            if (msg.params) Hyperparams.loadJsonObj(msg.params);
            env = new WorldEnvironment(fakeEngine, msg.cell_size || 5, {
                headless: true, cols: msg.cols, rows: msg.rows,
            });
            env.onExtinction = () => {
                postMessage({ type: SimMsg.EXTINCT, ticks: env.total_ticks });
                if (msg.auto_pause) {
                    running = false;
                    postMessage({ type: SimMsg.PAUSED });
                } else {
                    env.reset_count++;
                    env.reset(false);
                }
            };
            env.reset(false);
            tps_since = now();
            postMessage({ type: SimMsg.READY, cols: env.grid_map.cols, rows: env.grid_map.rows });
            sendSnapshot();
            sendStats();
            break;
        }

        case SimMsg.START:
            if (msg.fps !== undefined) target_fps = msg.fps;
            if (!running) {
                running = true;
                last_slice_end = 0;
                accum_ms = 0;
                tps_since = now();
                tps_ticks = 0;
                scheduleSlice();
            }
            break;

        case SimMsg.STOP:
            running = false;
            sendSnapshot();
            sendStats();
            break;

        case SimMsg.STEP: {
            const n = msg.n || 1;
            for (let i = 0; i < n; i++) env.update();
            sendSnapshot();
            break;
        }

        case SimMsg.SET_FPS:
            target_fps = msg.fps;
            accum_ms = 0;
            last_slice_end = 0;
            break;

        case SimMsg.SET_PARAMS:
            Hyperparams.loadJsonObj(msg.params);
            break;

        case SimMsg.SET_CONFIG:
            for (const k in msg.config) {
                if (k === 'headless') continue;   // always headless in here
                WorldConfig[k] = msg.config[k];
            }
            break;

        case SimMsg.SNAPSHOT_HZ:
            snapshot_hz = msg.hz;
            break;

        case SimMsg.WANT_OWNERS:
            want_owners = !!msg.on;
            break;

        case SimMsg.RESET:
            env.reset(false, msg.reset_life !== false);
            sendSnapshot();
            sendStats();
            break;

        case SimMsg.RESIZE:
            env.resizeGridColRow(msg.cell_size, msg.cols, msg.rows);
            env.reset(false, msg.reset_life !== false);
            postMessage({ type: SimMsg.READY, cols: env.grid_map.cols, rows: env.grid_map.rows });
            sendSnapshot();
            sendStats();
            break;

        case SimMsg.DROP_CELLS:
            dropCells(msg.c, msg.r, msg.state, msg.brush, msg.kill_blocking, msg.ignore);
            sendSnapshot();
            break;

        case SimMsg.KILL_AT: {
            for (const loc of Neighbors.inRange(msg.brush)) {
                const cell = env.grid_map.cellAt(msg.c + loc[0], msg.r + loc[1]);
                if (cell != null && cell.owner != null) cell.owner.die();
            }
            sendSnapshot();
            break;
        }

        case SimMsg.SELECT_AT: {
            const org = organismAt(msg.c, msg.r, msg.brush);
            postMessage({ type: SimMsg.ORGANISM, organism: org ? org.serialize() : null });
            break;
        }

        case SimMsg.DROP_ORG:
            dropOrganismRaw(msg.organism, msg.c, msg.r);
            sendSnapshot();
            sendStats();
            break;

        case SimMsg.RANDOM_ORGS: {
            env.reset(false, false);
            for (let i = 0; i < msg.organisms.length; i++) {
                const o = msg.organisms[i];
                dropOrganismRaw(o.raw, o.c, o.r);
            }
            sendSnapshot();
            sendStats();
            break;
        }

        case SimMsg.RANDOM_WALLS:
            randomizeWalls(msg.thickness || 1);
            sendSnapshot();
            break;

        case SimMsg.CLEAR_WALLS:
            env.clearWalls();
            sendSnapshot();
            break;

        case SimMsg.SERIALIZE:
            postMessage({ type: SimMsg.SERIALIZED, env: env.serialize(), token: msg.token });
            break;

        case SimMsg.LOAD:
            env.loadRaw(msg.env);
            postMessage({ type: SimMsg.READY, cols: env.grid_map.cols, rows: env.grid_map.rows });
            sendSnapshot();
            sendStats();
            break;
    }
};
