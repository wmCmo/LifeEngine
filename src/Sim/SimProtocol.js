// Messages between the main thread and the simulation worker.
//
// The worker owns the world: the grid, the organisms and the fossil record.
// The main thread owns the canvas and the UI, and never touches a real
// Organism. It sees the board as two typed arrays and asks the worker to do
// anything that needs real simulation state.
const SimMsg = {
    // --- main -> worker ---
    INIT:         'init',
    START:        'start',
    STOP:         'stop',
    STEP:         'step',
    SET_FPS:      'set_fps',       // 0 == run as fast as the CPU allows
    SET_PARAMS:   'set_params',    // Hyperparameters
    SET_CONFIG:   'set_config',    // WorldConfig
    SNAPSHOT_HZ:  'snapshot_hz',
    WANT_OWNERS:  'want_owners',   // ship the owner map too (mouse is over the canvas)

    RESET:        'reset',
    RESIZE:       'resize',
    DROP_CELLS:   'drop_cells',    // brush paint, worker applies the owner rules
    KILL_AT:      'kill_at',
    SELECT_AT:    'select_at',     // -> ORGANISM
    DROP_ORG:     'drop_org',
    RANDOM_ORGS:  'random_orgs',
    RANDOM_WALLS: 'random_walls',
    CLEAR_WALLS:  'clear_walls',
    SERIALIZE:    'serialize',     // -> SERIALIZED
    LOAD:         'load',
    SAVE_WORLD:   'save_world',    // -> WORLD_SAVED: original world format + map history
    LOAD_WORLD:   'load_world',    // file text -> WORLD_LOADED (or LOAD_FAILED)
    SPECIES_ORG:  'species_org',   // a living member of a species -> ORGANISM

    // --- worker -> main ---
    READY:        'ready',
    SNAPSHOT:     'snapshot',
    STATS:        'stats',
    ORGANISM:     'organism',
    SERIALIZED:   'serialized',
    EXTINCT:      'extinct',
    PHYLO:        'phylo',         // incremental phylogeny + eras, for the evolution map
    PAUSED:       'paused',
    WORLD_SAVED:  'world_saved',
    WORLD_LOADED: 'world_loaded',
    LOAD_FAILED:  'load_failed',        // worker paused itself (auto-pause on extinction)
};

module.exports = { SimMsg };
