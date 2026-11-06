const path = require('path');
const webpack = require("webpack");

module.exports = {
    entry: {
        bundle: './src/index.js',
        workerbench: './src/worker-bench.js',
        multiworld: './src/multiworld.js',
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist/js/'),
    },
    plugins: [
        new webpack.ProvidePlugin({
            $: "jquery",
        })
    ]
};