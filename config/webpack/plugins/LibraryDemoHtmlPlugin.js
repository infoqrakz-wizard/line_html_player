/**
 * Плагин для модификации HTML-файла демо-страницы библиотеки
 * Заменяет все скрипты и стили на единые файлы библиотеки
 */
class LibraryDemoHtmlPlugin {
    constructor(options) {
        this.options = options || {};
    }

    apply(compiler) {
        // Хук после эмиссии ассетов
        compiler.hooks.afterEmit.tapAsync('LibraryDemoHtmlPlugin', (compilation, callback) => {
            const outputPath = compilation.outputOptions.path;
            const fs = compiler.outputFileSystem;
            const demoHtmlPath = `${outputPath}/demo.html`;

            // Проверяем, существует ли файл demo.html
            fs.stat(demoHtmlPath, (err, stats) => {
                if (err) {
                    console.error('Error accessing demo.html:', err);
                    callback();
                    return;
                }

                // Читаем содержимое файла
                fs.readFile(demoHtmlPath, 'utf8', (err, data) => {
                    if (err) {
                        console.error('Error reading demo.html:', err);
                        callback();
                        return;
                    }

                    // Заменяем все скрипты и стили на наши единые файлы
                    const modifiedHtml = this.replaceScriptsAndStyles(data);

                    // Записываем обратно модифицированный HTML
                    fs.writeFile(demoHtmlPath, modifiedHtml, err => {
                        if (err) {
                            console.error('Error writing modified demo.html:', err);
                        } else {
                            console.log('Successfully modified demo.html to use library files');
                        }
                        callback();
                    });
                });
            });
        });
    }

    replaceScriptsAndStyles(html) {
        // Удаляем все существующие скрипты
        let modifiedHtml = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');

        // Удаляем все существующие стили
        modifiedHtml = modifiedHtml.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');

        // Находим закрывающий тег head
        const headCloseIndex = modifiedHtml.indexOf('</head>');

        if (headCloseIndex !== -1) {
            // Вставляем наш CSS перед закрывающим тегом head
            const cssLink = '<link href="./css/devline-player.css" rel="stylesheet" />\n';
            modifiedHtml = modifiedHtml.slice(0, headCloseIndex) + cssLink + modifiedHtml.slice(headCloseIndex);
        }

        // Находим закрывающий тег body
        const bodyCloseIndex = modifiedHtml.indexOf('</body>');

        if (bodyCloseIndex !== -1) {
            // Вставляем наш JS перед закрывающим тегом body
            const jsScript = '<script src="./devline-player.js"></script>\n';
            modifiedHtml = modifiedHtml.slice(0, bodyCloseIndex) + jsScript + modifiedHtml.slice(bodyCloseIndex);
        }

        return modifiedHtml;
    }
}

module.exports = LibraryDemoHtmlPlugin;
