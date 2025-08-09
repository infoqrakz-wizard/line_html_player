/**
 * Плагин для генерации файла-загрузчика с информацией о чанках
 * Встраивает пути к чанкам в шаблон загрузчика
 */
const fs = require('fs');
const path = require('path');

class LoaderGeneratorPlugin {
    constructor(options) {
        this.options = Object.assign(
            {
                loaderTemplate: '', // Путь к шаблону загрузчика
                outputFilename: 'devline-player-loader.js', // Имя выходного файла
                publicPath: './', // Публичный путь для ассетов
                baseUrl: null, // Базовый URL для загрузки ресурсов (если null, будет определен динамически)
                entrypoint: 'devline-player', // Имя точки входа
                noCache: false // Добавлять ли timestamp к запросам
            },
            options
        );
    }

    apply(compiler) {
        // Хук после эмиссии ассетов
        compiler.hooks.afterEmit.tapAsync('LoaderGeneratorPlugin', (compilation, callback) => {
            // Получаем информацию о чанках
            const {entrypoints, assets} = compilation;
            const entrypoint = entrypoints.get(this.options.entrypoint);

            if (!entrypoint) {
                console.error(`Точка входа "${this.options.entrypoint}" не найдена!`);
                callback();
                return;
            }

            // Получаем файлы чанков для точки входа
            const chunks = entrypoint.chunks;
            const files = [];

            chunks.forEach(chunk => {
                chunk.files.forEach(file => {
                    // Фильтруем map-файлы
                    if (!file.endsWith('.map')) {
                        // Используем относительные пути без publicPath
                        // Базовый путь будет добавлен в загрузчике
                        files.push(file);
                    }
                });
            });

            // Читаем шаблон загрузчика
            fs.readFile(this.options.loaderTemplate, 'utf8', (err, template) => {
                if (err) {
                    console.error('Ошибка при чтении шаблона загрузчика:', err);
                    callback();
                    return;
                }

                // Создаем объект конфигурации для загрузчика
                const loaderConfig = {
                    files,
                    version: require(path.resolve(process.cwd(), 'package.json')).version,
                    entrypoint: this.options.entrypoint,
                    noCache: this.options.noCache
                };
                
                // Добавляем baseUrl в конфигурацию, если он был указан
                if (this.options.baseUrl) {
                    loaderConfig.baseUrl = this.options.baseUrl;
                }

                // Заменяем плейсхолдер в шаблоне
                const loaderContent = template.replace(
                    '/* LOADER_CONFIG */',
                    `const config = ${JSON.stringify(loaderConfig, null, 4)};`
                );

                // Записываем результат в выходной файл
                const outputPath = path.join(compiler.outputPath, this.options.outputFilename);

                fs.writeFile(outputPath, loaderContent, err => {
                    if (err) {
                        console.error('Ошибка при записи файла-загрузчика:', err);
                    } else {
                        console.log(`Файл-загрузчик успешно создан: ${outputPath}`);
                    }
                    callback();
                });
            });
        });
    }
}

module.exports = LoaderGeneratorPlugin;
