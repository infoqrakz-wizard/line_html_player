const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SRC_DIR = path.resolve(ROOT_DIR, 'src');
const BUILD_DIR = path.resolve(ROOT_DIR, 'build');
const ASSETS_DIR = path.resolve(ROOT_DIR, 'assets');
const DEMO_DIR = path.resolve(SRC_DIR, 'pages/demo');
const DEBUG_DIR = path.resolve(SRC_DIR, 'debug');
const PLAYER_DIR = path.resolve(SRC_DIR, 'player-page');
const FOUR_CAMERAS_DIR = path.resolve(SRC_DIR, 'pages/four-cameras');

module.exports = {
    paths: {
        root: ROOT_DIR,
        src: SRC_DIR,
        build: BUILD_DIR,
        assets: ASSETS_DIR,
        demo: DEMO_DIR,
        debug: DEBUG_DIR,
        player: PLAYER_DIR,
        fourCameras: FOUR_CAMERAS_DIR,
        entries: {
            library: path.resolve(SRC_DIR, 'lib/DevLinePlayer.tsx'),
            debug: path.resolve(DEBUG_DIR, 'index.tsx'),
            fourCameras: path.resolve(FOUR_CAMERAS_DIR, 'index.tsx')
        },
        templates: {
            demo: path.resolve(DEMO_DIR, 'index.html'),
            debug: path.resolve(DEBUG_DIR, 'index.html'),
            player: path.resolve(PLAYER_DIR, 'index.html'),
            fourCameras: path.resolve(FOUR_CAMERAS_DIR, 'index.html')
        },
        nodeModules: path.resolve(ROOT_DIR, 'node_modules'),
        packageJson: path.resolve(ROOT_DIR, 'package.json')
    },
    alias: {
        '@': SRC_DIR,
        '@components': path.resolve(SRC_DIR, 'components'),
        '@utils': path.resolve(SRC_DIR, 'utils'),
        '@styles': path.resolve(SRC_DIR, 'styles')
    }
};
