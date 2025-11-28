const webpack = require('webpack');
const {merge} = require('webpack-merge');
const {paths, alias} = require('./webpack.constants');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const commonConfig = require('./webpack.common');

module.exports = () => {
    const config = merge(commonConfig, {
        mode: 'development',
        devtool: 'inline-source-map',
        devServer: {
            historyApiFallback: {
                rewrites: [
                    {from: /^\/debug/, to: '/debug.html'},
                    {from: /^\/demo/, to: '/demo.html'},
                    {from: /./, to: '/debug.html'}
                ]
            },
            open: ['/debug.html'],
            hot: true,
            port: 3005,
            compress: true,
            allowedHosts: 'all',
            client: {
                overlay: {
                    errors: true,
                    warnings: false
                }
            }
        },
        module: {
            rules: [
                {
                    test: /\.[jt]sx?$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'babel-loader',
                            options: {
                                plugins: [require.resolve('react-refresh/babel')]
                            }
                        }
                    ]
                },
                {
                    test: /\.module\.scss$/,
                    use: [
                        'style-loader',
                        {
                            loader: 'css-loader',
                            options: {
                                modules: {
                                    localIdentName: '[local]--[hash:base64:5]'
                                },
                                sourceMap: true,
                                importLoaders: 2
                            }
                        },
                        'postcss-loader',
                        {
                            loader: 'sass-loader',
                            options: {
                                sourceMap: true
                            }
                        }
                    ]
                },
                {
                    test: /\.scss$/,
                    exclude: /\.module\.scss$/,
                    use: [
                        'style-loader',
                        {
                            loader: 'css-loader',
                            options: {
                                sourceMap: true,
                                importLoaders: 2
                            }
                        },
                        'postcss-loader',
                        {
                            loader: 'sass-loader',
                            options: {
                                sourceMap: true
                            }
                        }
                    ]
                },
                {
                    test: /\.css$/,
                    use: [
                        'style-loader',
                        {
                            loader: 'css-loader',
                            options: {
                                sourceMap: true,
                                importLoaders: 1
                            }
                        },
                        'postcss-loader'
                    ]
                }
            ]
        },
        plugins: [
            new webpack.DefinePlugin({
                'process.env.name': JSON.stringify('Development')
            }),
            // Плагин для горячей перезагрузки React-компонентов
            new ReactRefreshWebpackPlugin(),
            // HTML-плагин для страницы отладки
            new HtmlWebpackPlugin({
                template: paths.templates.debug,
                filename: 'debug.html',
                chunks: ['debug']
            }),
            // HTML-плагин для демо-страницы
            new HtmlWebpackPlugin({
                template: paths.templates.demo,
                filename: 'demo.html',
                chunks: ['devline-player']
            }),
            // HTML-плагин для плеера на полный экран
            new HtmlWebpackPlugin({
                template: paths.templates.player,
                filename: 'player.html',
                chunks: []
            })
        ]
    });

    // Настройка точек входа
    config.entry = {
        'devline-player': paths.entries.library,
        debug: paths.entries.debug
    };

    return config;
};
