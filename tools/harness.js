// Shared setup for headless runs (bench.js, run-world.js, sweep.js):
// a seeded RNG, inert stand-ins for the DOM-bound modules, and a world.
//
// The RNG is installed before any engine module loads, so two runs with the
// same seed and parameters evolve the identical world. That makes timings
// comparable and doubles as a correctness check: a change that shouldn't
// affect behaviour must reproduce the population trace exactly.

const path = require('path');

const REPO = path.resolve(__dirname, '..');

function installSeed(seed) {
    let s = (seed >>> 0) || 1;
    Math.random = function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;  s >>>= 0;
        return s / 4294967296;
    };
}

function stubModule(relPath, exports) {
    const full = require.resolve(path.join(REPO, relPath));
    require.cache[full] = { id: full, filename: full, loaded: true, exports };
}

class StubRenderer {
    constructor(_c, _id, cell_size) {
        this.cell_size = cell_size;
        this.canvas = { width: 800, height: 600 };
        this.width = 800; this.height = 600;
        this.cells_to_render = new Set();
        this.cells_to_highlight = new Set();
        this.highlighted_cells = new Set();
    }
    fillWindow() {}
    fillShape(h, w) { this.height = h; this.width = w; }
    clear() {} renderFullGrid() {} renderCell() {} renderOrganism() {}
    renderCells() { this.cells_to_render.clear(); }
    addToRender() {}
    renderHighlights() { this.cells_to_highlight.clear(); }
    highlightOrganism() {} highlightCell() {} renderCellHighlight() {} clearAllHighlights() {}
}
class StubController {
    constructor() {}
    setControlPanel() {} defineZoomControls() {} resetView() {}
}

function installStubs() {
    stubModule('src/Rendering/Renderer', StubRenderer);
    stubModule('src/Controllers/EnvironmentController', StubController);

    const jq = new Proxy(function () {}, {
        get(_t, p) {
            if (p === 'height') return () => 600;
            if (p === 'width')  return () => 800;
            if (p === 'val')    return () => 0;
            if (p === 'is')     return () => false;
            if (p === 'text')   return () => '';
            if (p === 'length') return 0;
            if (p === Symbol.iterator) return function* () {};
            if (p === 'then') return undefined;
            return () => jq;
        },
        apply() { return jq; },
        set() { return true; },
    });
    global.$ = () => jq;
    global.jQuery = global.$;
    global.document = {
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: () => ({ getContext: () => ({}) }), addEventListener: () => {},
    };
    global.window = { addEventListener: () => {} };
}

// One world per process: the seed has to be in place before the engine
// loads, and the engine's modules are singletons.
function createWorld({ cols = 160, rows = 120, seed = 625341585, params = {}, phylo = false } = {}) {
    installSeed(seed);
    installStubs();

    const WorldConfig      = require(path.join(REPO, 'src/WorldConfig'));
    const WorldEnvironment = require(path.join(REPO, 'src/Environments/WorldEnvironment'));
    const Hyperparams      = require(path.join(REPO, 'src/Hyperparameters'));
    const FossilRecord     = require(path.join(REPO, 'src/Stats/FossilRecord'));
    const EraRecord        = require(path.join(REPO, 'src/Stats/EraRecord'));
    const PhyloRecord      = require(path.join(REPO, 'src/Stats/PhyloRecord'));
    const CellStates       = require(path.join(REPO, 'src/Organism/Cell/CellStates'));

    for (const k in params) Hyperparams[k] = params[k];
    if (phylo) PhyloRecord.enabled = true;

    WorldConfig.headless = true;
    WorldConfig.auto_reset = true;
    WorldConfig.auto_pause = false;

    const fakeEngine = { fps: 60, last_fps: 60, running: false, start() {}, stop() {}, restart() {} };
    const env = new WorldEnvironment(fakeEngine, 5);
    env.resizeGridColRow(5, cols, rows);
    env.reset(false);

    return { env, Hyperparams, FossilRecord, EraRecord, PhyloRecord, CellStates, WorldConfig };
}

module.exports = { REPO, createWorld };
