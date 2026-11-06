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

    // --- worker -> main ---
    READY:        'ready',
    SNAPSHOT:     'snapshot',
    STATS:        'stats',
    ORGANISM:     'organism',
    SERIALIZED:   'serialized',
    EXTINCT:      'extinct',
    PAUSED:       'paused',        // worker paused itself (auto-pause on extinction)
};

module.exports = { SimMsg };
