// The simulation runs in a worker (see src/Sim/sim.worker.js). This class no
// longer ticks the world; it owns the UI loop, renders whatever snapshot the
// worker last sent, and forwards speed/pause commands.
//
// The old fixed-timestep accumulator lived here and capped throughput at the
// target fps, with browsers clamping nested timers to ~4ms underneath it. The
// worker has no such ceiling, so "max speed" now really means max speed.

const RemoteWorld = require('./Sim/RemoteWorld');
const EnvironmentController = require('./Controllers/EnvironmentController');
const ControlPanel = require('./Controllers/ControlPanel');
const OrganismEditor = require('./Environments/OrganismEditor');
const { ColorScheme } = require('./Rendering/ColorScheme');
const Hyperparams = require('./Hyperparameters');
const WorldConfig = require('./WorldConfig');

const UI_HZ = 60;

// Hyperparams carries its own methods; skip them when diffing.
function replacer(key, value) {
    return typeof value === 'function' ? undefined : value;
}

class Engine {
    constructor() {
        this.fps = 60;

        this.env = new RemoteWorld(this, 5);
        this.env.controller = new EnvironmentController(this.env, this.env.renderer.canvas);

        this.organism_editor = new OrganismEditor();
        this.organism_editor.engine = this;

        this.controlpanel = new ControlPanel(this);
        this.env.controller.setControlPanel(this.controlpanel);

        ColorScheme.setEnvironment(this.env, this.organism_editor);
        ColorScheme.loadColorScheme();
        this.env.renderer.refreshPalette();

        this.env.on_paused = () => {
            if (this.running) this.controlpanel.setPaused(true);
        };

        // Size the world to the canvas, then boot the worker's copy.
        const cell_size = this.env.renderer.cell_size;
        this.env.renderer.fillWindow();
        const cols = Math.ceil(this.env.renderer.width / cell_size);
        const rows = Math.ceil(this.env.renderer.height / cell_size);
        this.env.init(cols, rows, cell_size);

        this.ui_last_update = Date.now();
        this.ui_delta_time = 0;
        this.running = false;

        this.setUiLoop();
    }

    get actual_fps() {
        return this.env.tps;
    }

    start(fps = 60) {
        if (fps <= 0) fps = 1;
        this.fps = fps;
        this.env.start(this.simFps(fps));
        this.running = true;
    }

    stop() {
        this.env.stop();
        this.running = false;
    }

    restart(fps) {
        if (fps <= 0) fps = 1;
        this.fps = fps;
        this.env.setFps(this.simFps(fps));
        if (!this.running) {
            this.env.start(this.simFps(fps));
            this.running = true;
        }
    }

    // The control panel sends 1000 to mean "MAX". The worker takes 0 for
    // unlimited, which is the whole point of moving off the main thread.
    simFps(fps) {
        return fps >= 1000 ? 0 : fps;
    }

    setUiLoop() {
        if (!this.ui_loop) {
            this.ui_loop = setInterval(() => {
                this.updateUIDeltaTime();
                this.necessaryUpdate();
            }, 1000 / UI_HZ);
        }
    }

    updateUIDeltaTime() {
        this.ui_delta_time = Date.now() - this.ui_last_update;
        this.ui_last_update = Date.now();
    }

    necessaryUpdate() {
        this.env.render();
        this.controlpanel.update(this.ui_delta_time);
        this.organism_editor.update();
        this.syncSettings();
    }

    // The control panel writes straight into Hyperparams / WorldConfig, which
    // are main-thread objects; the worker holds its own copies. Rather than
    // make every one of those ~30 handlers worker-aware, notice when the
    // settings change and push them across.
    syncSettings() {
        const now = Date.now();
        if (this.last_settings_check && now - this.last_settings_check < 250) return;
        this.last_settings_check = now;

        const params = JSON.stringify(Hyperparams, replacer);
        if (params !== this.last_params) {
            this.last_params = params;
            this.env.syncParams();
        }
        const config = JSON.stringify(WorldConfig);
        if (config !== this.last_config) {
            this.last_config = config;
            this.env.syncConfig();
        }
    }
}

module.exports = Engine;
