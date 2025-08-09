const {paths, alias} = require('./webpack.constants');

module.exports = {
    entry: {
        'devline-player': paths.entries.library
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        alias
    },
    module: {
        rules: [
            {
                test: /\.(ts|js)x?$/,
                exclude: paths.nodeModules,
                use: [
                    {
                        loader: 'babel-loader'
                    }
                ]
            },
            {
                test: /\.(?:ico|gif|png|jpg|jpeg)$/i,
                type: 'asset/resource'
            },
            {
                test: /\.(woff(2)?|eot|ttf|otf|)$/,
                type: 'asset/inline'
            },
            {
                test: /\.svg$/i,
                use: [{loader: '@svgr/webpack', options: {icon: true}}, 'url-loader']
            }
        ]
    },
    plugins: [],
    stats: 'errors-only'
};
