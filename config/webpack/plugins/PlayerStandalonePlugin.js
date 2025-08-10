const path = require('path');
const fs = require('fs');

/**
 * Плагин для создания автономной папки с player.html и всеми необходимыми ресурсами
 */
class PlayerStandalonePlugin {
    constructor(options = {}) {
        this.options = {
            outputDir: 'player',
            htmlFileName: 'player.html',
            ...options
        };
    }

    apply(compiler) {
        compiler.hooks.afterEmit.tapAsync('PlayerStandalonePlugin', (compilation, callback) => {
            try {
                const outputPath = compilation.options.output.path;
                const standaloneDir = path.join(outputPath, this.options.outputDir);

                if (!fs.existsSync(standaloneDir)) {
                    fs.mkdirSync(standaloneDir, {recursive: true});
                }

                const originalHtmlPath = path.join(outputPath, this.options.htmlFileName);
                if (!fs.existsSync(originalHtmlPath)) {
                    console.warn(`PlayerStandalonePlugin: ${this.options.htmlFileName} не найден`);
                    callback();
                    return;
                }

                let htmlContent = fs.readFileSync(originalHtmlPath, 'utf8');

                const jsFiles = [];
                const cssFiles = [];

                const scriptRegex = /<script[^>]+src="([^"]+)"[^>]*><\/script>/g;
                let match;
                while ((match = scriptRegex.exec(htmlContent)) !== null) {
                    const filePath = match[1].replace(/^\//, '');
                    jsFiles.push(filePath);
                }

                // Находим все link href для CSS
                const linkRegex = /<link[^>]+href="([^"]+\.css)"[^>]*>/g;
                while ((match = linkRegex.exec(htmlContent)) !== null) {
                    const filePath = match[1].replace(/^\//, '');
                    cssFiles.push(filePath);
                }

                const allFiles = [...jsFiles, ...cssFiles];
                const copiedFiles = new Set();

                allFiles.forEach(file => {
                    const sourcePath = path.join(outputPath, file);
                    const targetPath = path.join(standaloneDir, file);

                    if (fs.existsSync(sourcePath) && !copiedFiles.has(file)) {
                        const targetDir = path.dirname(targetPath);
                        if (!fs.existsSync(targetDir)) {
                            fs.mkdirSync(targetDir, {recursive: true});
                        }

                        fs.copyFileSync(sourcePath, targetPath);
                        copiedFiles.add(file);

                        const mapFile = sourcePath + '.map';
                        const targetMapFile = targetPath + '.map';
                        if (fs.existsSync(mapFile)) {
                            fs.copyFileSync(mapFile, targetMapFile);
                        }

                        const licenseFile = sourcePath + '.LICENSE.txt';
                        const targetLicenseFile = targetPath + '.LICENSE.txt';
                        if (fs.existsSync(licenseFile)) {
                            fs.copyFileSync(licenseFile, targetLicenseFile);
                        }
                    }
                });

                htmlContent = htmlContent.replace(/src="\/([^"]+)"/g, 'src="$1"');
                htmlContent = htmlContent.replace(/href="\/([^"]+\.css)"/g, 'href="$1"');

                // Копируем загрузчик devline-player-loader.js
                const loaderFile = 'devline-player-loader.js';
                const loaderSourcePath = path.join(outputPath, loaderFile);
                const loaderTargetPath = path.join(standaloneDir, loaderFile);
                if (fs.existsSync(loaderSourcePath)) {
                    fs.copyFileSync(loaderSourcePath, loaderTargetPath);
                    copiedFiles.add(loaderFile);
                }

                // Копируем asset-manifest.json для работы загрузчика
                const manifestFile = 'asset-manifest.json';
                const manifestSourcePath = path.join(outputPath, manifestFile);
                const manifestTargetPath = path.join(standaloneDir, manifestFile);
                if (fs.existsSync(manifestSourcePath)) {
                    fs.copyFileSync(manifestSourcePath, manifestTargetPath);
                    copiedFiles.add(manifestFile);

                    // Также копируем все entrypoints из манифеста (JS и CSS)
                    try {
                        const manifestJson = JSON.parse(fs.readFileSync(manifestSourcePath, 'utf8'));
                        const entrypoints = Array.isArray(manifestJson.entrypoints) ? manifestJson.entrypoints : [];

                        entrypoints.forEach(entryFile => {
                            const entrySourcePath = path.join(outputPath, entryFile);
                            const entryTargetPath = path.join(standaloneDir, entryFile);

                            if (fs.existsSync(entrySourcePath)) {
                                const entryTargetDir = path.dirname(entryTargetPath);
                                if (!fs.existsSync(entryTargetDir)) {
                                    fs.mkdirSync(entryTargetDir, {recursive: true});
                                }

                                fs.copyFileSync(entrySourcePath, entryTargetPath);

                                // Копируем сопутствующие .map и .LICENSE.txt, если есть
                                const entryMap = entrySourcePath + '.map';
                                if (fs.existsSync(entryMap)) {
                                    fs.copyFileSync(entryMap, entryTargetPath + '.map');
                                }
                                const entryLicense = entrySourcePath + '.LICENSE.txt';
                                if (fs.existsSync(entryLicense)) {
                                    fs.copyFileSync(entryLicense, entryTargetPath + '.LICENSE.txt');
                                }
                            } else {
                                // Иногда entrypoints содержат относительные пути без слеша, но файл может быть в корне
                                // Ничего не делаем, просто логируем для информации
                                // console.warn(`PlayerStandalonePlugin: файл из entrypoints не найден: ${entryFile}`);
                            }
                        });
                    } catch (e) {
                        console.error('PlayerStandalonePlugin: ошибка чтения asset-manifest.json:', e);
                    }
                }

                const targetHtmlPath = path.join(standaloneDir, 'index.html');
                fs.writeFileSync(targetHtmlPath, htmlContent);

                callback();
            } catch (error) {
                console.error('❌ PlayerStandalonePlugin error:', error);
                callback(error);
            }
        });
    }
}

module.exports = PlayerStandalonePlugin;
