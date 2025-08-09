const webpack = require('webpack');
const {merge} = require('webpack-merge');
const {paths, alias} = require('./webpack.constants');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const commonConfig = require('./webpack.common');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const {WebpackManifestPlugin} = require('webpack-manifest-plugin');
const LoaderGeneratorPlugin = require('./plugins/LoaderGeneratorPlugin');
const path = require('path');

module.exports = () => {
    const config = merge(commonConfig, {
        mode: 'production',
        devtool: 'source-map',
        output: {
            path: paths.build,
            filename: '[name].[contenthash:8].js',
            chunkFilename: '[name].[contenthash:8].chunk.js',
            publicPath: '/',
            library: {
                name: 'DevLinePlayer',
                type: 'umd',
                export: 'default',
                umdNamedDefine: true
            },
            globalObject: 'this'
        },
        module: {
            rules: [
                {
                    test: /\.module\.scss$/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        {
                            loader: 'css-loader',
                            options: {
                                modules: {
                                    localIdentName: '[local]--[hash:base64:5]'
                                },
                                esModule: false
                            }
                        },
                        'sass-loader'
                    ]
                },
                {
                    test: /\.scss$/,
                    exclude: /\.module\.scss$/,
                    use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader']
                },
                {
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader']
                }
            ]
        },
        optimization: {
            minimize: true,
            minimizer: ['...', new CssMinimizerPlugin()],
            // Enable code splitting
            splitChunks: {
                chunks: 'all',
                maxInitialRequests: Infinity,
                minSize: 20000,
                cacheGroups: {
                    react: {
                        test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
                        name: 'react-vendor',
                        chunks: 'all',
                        priority: 20
                    },
                    hls: {
                        test: /[\\/]node_modules[\\/]hls\.js[\\/]/,
                        name: 'hls-vendor',
                        chunks: 'all',
                        priority: 15
                    },
                    ui: {
                        test: /[\\/]node_modules[\\/](react-datepicker|react-modal)[\\/]/,
                        name: 'ui-components',
                        chunks: 'all',
                        priority: 10
                    },
                    vendors: {
                        test: /[\\/]node_modules[\\/]/,
                        name: 'vendors',
                        chunks: 'all',
                        priority: 5
                    }
                }
            },
            runtimeChunk: 'single'
        },
        plugins: [
            new MiniCssExtractPlugin({
                filename: 'css/[name].[contenthash:8].css',
                chunkFilename: 'css/[name].[contenthash:8].chunk.css'
            }),
            new webpack.DefinePlugin({
                'process.env.name': JSON.stringify('Production')
            }),
            // Add HTML plugin for the demo page
            new HtmlWebpackPlugin({
                template: paths.templates.demo,
                filename: 'demo.html',
                chunks: [] // Не включаем никакие чанки, так как используем загрузчик
            }),
            // Generate manifest file
            new WebpackManifestPlugin({
                fileName: 'asset-manifest.json',
                publicPath: '/',
                generate: (seed, files, entrypoints) => {
                    const manifestFiles = files.reduce((manifest, file) => {
                        manifest[file.name] = file.path;
                        return manifest;
                    }, seed);

                    const entrypointFiles = entrypoints['devline-player'].filter(
                        fileName => !fileName.endsWith('.map')
                    );

                    return {
                        files: manifestFiles,
                        entrypoints: entrypointFiles
                    };
                }
            }),
            // Генерация файла-загрузчика
            new LoaderGeneratorPlugin({
                loaderTemplate: path.resolve(__dirname, '../../src/loader-template.js'),
                outputFilename: 'devline-player-loader.js',
                publicPath: '/',
                // baseUrl можно указать явно при сборке, например:
                // baseUrl: 'https://cdn.example.com/player/',
                entrypoint: 'devline-player',
                noCache: false
            }),
            // Add bundle analyzer plugin
            new BundleAnalyzerPlugin({
                analyzerMode: 'static',
                reportFilename: 'bundle-report.html',
                openAnalyzer: false,
                generateStatsFile: true,
                statsFilename: 'webpack-stats.json'
            })
        ]
    });

    // Set entry point for the library
    config.entry = {
        'devline-player': paths.entries.library
    };

    return config;
};
