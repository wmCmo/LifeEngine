
//An evironment has a grid_map, controller, and renderer
class Environment{
    constructor() {
    }

    update(){
        alert("Environment.update() must be overriden");
    }

    changeCell(c, r, state, owner) {
        this.grid_map.setCellType(c, r, state);
        this.grid_map.setCellOwner(c, r, owner);
        // Refresh the flat state/owner mirror once per change. The setters
        // used to do it individually, which meant two passes for every single
        // cell change - and changeCell is ~9% of total runtime.
        if (this.grid_map.isValidLoc(c, r)) {
            this.grid_map.refreshView(c, r);
        }
    }
}


module.exports = Environment;