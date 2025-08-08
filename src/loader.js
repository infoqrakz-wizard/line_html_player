/**
 * DevLine Player Loader
 * Этот файл отвечает за загрузку всех необходимых чанков библиотеки
 * с учетом их хешей из манифеста
 */

(function() {
    'use strict';

    // Конфигурация загрузчика
    const config = {
        manifestPath: './asset-manifest.json',
        entrypoint: 'devline-player',
        version: '1.0.0',
        noCache: false // Установите true, чтобы добавить timestamp к запросам
    };

    // Глобальный объект для хранения состояния загрузки
    window.__DEVLINE_PLAYER_LOADER__ = {
        loaded: false,
        chunks: {},
        callbacks: [],
        onLoad: function(callback) {
            if (this.loaded) {
                callback();
            } else {
                this.callbacks.push(callback);
            }
        }
    };

    /**
     * Загружает JSON-файл манифеста
     * @param {string} url - путь к файлу манифеста
     * @returns {Promise<Object>} - объект с данными манифеста
     */
    function loadManifest(url) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Добавляем timestamp для предотвращения кеширования
            const manifestUrl = config.noCache 
                ? `${url}?t=${Date.now()}` 
                : url;
            
            xhr.open('GET', manifestUrl, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        try {
                            const manifest = JSON.parse(xhr.responseText);
                            resolve(manifest);
                        } catch (e) {
                            reject(new Error('Ошибка при парсинге манифеста: ' + e.message));
                        }
                    } else {
                        reject(new Error('Ошибка при загрузке манифеста: ' + xhr.status));
                    }
                }
            };
            xhr.onerror = function() {
                reject(new Error('Ошибка сети при загрузке манифеста'));
            };
            xhr.send();
        });
    }

    /**
     * Загружает JavaScript-файл
     * @param {string} url - путь к файлу
     * @returns {Promise} - промис, который резолвится после загрузки файла
     */
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Ошибка при загрузке скрипта: ${url}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Загружает CSS-файл
     * @param {string} url - путь к файлу
     * @returns {Promise} - промис, который резолвится после загрузки файла
     */
    function loadStyle(url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.onload = resolve;
            link.onerror = () => reject(new Error(`Ошибка при загрузке стилей: ${url}`));
            document.head.appendChild(link);
        });
    }

    /**
     * Определяет тип файла по его расширению
     * @param {string} url - путь к файлу
     * @returns {string} - тип файла ('js', 'css' или 'unknown')
     */
    function getFileType(url) {
        if (url.endsWith('.js')) return 'js';
        if (url.endsWith('.css')) return 'css';
        return 'unknown';
    }

    /**
     * Загружает файл в зависимости от его типа
     * @param {string} url - путь к файлу
     * @returns {Promise} - промис, который резолвится после загрузки файла
     */
    function loadFile(url) {
        const fileType = getFileType(url);
        
        switch (fileType) {
            case 'js':
                return loadScript(url);
            case 'css':
                return loadStyle(url);
            default:
                return Promise.reject(new Error(`Неизвестный тип файла: ${url}`));
        }
    }

    /**
     * Инициализирует загрузку всех необходимых файлов
     */
    function init() {
        // Загружаем манифест
        loadManifest(config.manifestPath)
            .then(manifest => {
                console.log('DevLine Player: Манифест загружен', manifest);
                
                // Получаем список файлов для загрузки
                const filesToLoad = manifest.entrypoints;
                
                // Загружаем все файлы параллельно
                return Promise.all(
                    filesToLoad.map(file => {
                        const url = file;
                        return loadFile(url)
                            .then(() => {
                                console.log(`DevLine Player: Файл загружен: ${url}`);
                                window.__DEVLINE_PLAYER_LOADER__.chunks[url] = true;
                            })
                            .catch(error => {
                                console.error(`DevLine Player: Ошибка загрузки файла ${url}:`, error);
                                throw error;
                            });
                    })
                );
            })
            .then(() => {
                console.log('DevLine Player: Все файлы загружены успешно');
                window.__DEVLINE_PLAYER_LOADER__.loaded = true;
                
                // Вызываем все зарегистрированные колбэки
                window.__DEVLINE_PLAYER_LOADER__.callbacks.forEach(callback => {
                    try {
                        callback();
                    } catch (e) {
                        console.error('DevLine Player: Ошибка в колбэке:', e);
                    }
                });
                
                // Очищаем список колбэков
                window.__DEVLINE_PLAYER_LOADER__.callbacks = [];
            })
            .catch(error => {
                console.error('DevLine Player: Ошибка инициализации:', error);
            });
    }

    // Запускаем инициализацию
    init();
})();
