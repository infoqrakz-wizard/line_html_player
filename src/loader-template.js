/**
 * DevLine Player Loader
 * Этот файл отвечает за загрузку всех необходимых чанков библиотеки
 * с учетом их хешей
 */

(function () {
    'use strict';

    // Конфигурация загрузчика будет заменена плагином
    /* LOADER_CONFIG */

    /**
     * Определяет базовый путь к ресурсам
     * @returns {string} - базовый путь к ресурсам
     */
    function getBasePath() {
        // Проверяем, есть ли глобальная конфигурация с baseUrl
        if (window.__DEVLINE_PLAYER_CONFIG__ && window.__DEVLINE_PLAYER_CONFIG__.baseUrl) {
            return window.__DEVLINE_PLAYER_CONFIG__.baseUrl;
        }
        
        // Получаем текущий скрипт
        const scripts = document.getElementsByTagName('script');
        let currentScript = null;
        
        // Ищем скрипт с атрибутом data-base-url
        for (let i = 0; i < scripts.length; i++) {
            if (scripts[i].src.indexOf('devline-player-loader.js') !== -1) {
                currentScript = scripts[i];
                break;
            }
        }
        
        // Если нашли скрипт и у него есть атрибут data-base-url, используем его
        if (currentScript && currentScript.getAttribute('data-base-url')) {
            return currentScript.getAttribute('data-base-url');
        }
        
        // Если в конфигурации указан baseUrl, используем его
        if (config.baseUrl) {
            return config.baseUrl;
        }
        
        // В крайнем случае, определяем базовый путь на основе расположения скрипта
        if (currentScript) {
            const scriptSrc = currentScript.src;
            return scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
        }
        
        // Если ничего не помогло, используем текущий путь
        return '/';
    }

    // Получаем базовый путь
    const basePath = getBasePath();

    // Глобальный объект для хранения состояния загрузки
    window.__DEVLINE_PLAYER_LOADER__ = {
        loaded: false,
        chunks: {},
        callbacks: [],
        version: config.version,
        basePath: basePath,
        onLoad: function (callback) {
            if (this.loaded) {
                callback();
            } else {
                this.callbacks.push(callback);
            }
        }
    };

    /**
     * Формирует полный URL к файлу с учетом базового пути
     * @param {string} url - относительный или абсолютный путь к файлу
     * @returns {string} - полный URL к файлу
     */
    function resolveUrl(url) {
        // Если URL абсолютный (начинается с http или /), используем его как есть
        if (url.startsWith('http') || url.startsWith('/')) {
            return url;
        }
        
        // Иначе добавляем базовый путь
        return basePath + (url.startsWith('./') ? url.substring(2) : url);
    }

    /**
     * Загружает JavaScript-файл
     * @param {string} url - путь к файлу
     * @returns {Promise} - промис, который резолвится после загрузки файла
     */
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');

            // Разрешаем URL с учетом базового пути
            const resolvedUrl = resolveUrl(url);

            // Добавляем timestamp для предотвращения кеширования, если нужно
            script.src = config.noCache ? `${resolvedUrl}?t=${Date.now()}` : resolvedUrl;

            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Ошибка при загрузке скрипта: ${resolvedUrl}`));
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

            // Разрешаем URL с учетом базового пути
            const resolvedUrl = resolveUrl(url);

            // Добавляем timestamp для предотвращения кеширования, если нужно
            link.href = config.noCache ? `${resolvedUrl}?t=${Date.now()}` : resolvedUrl;

            link.onload = resolve;
            link.onerror = () => reject(new Error(`Ошибка при загрузке стилей: ${resolvedUrl}`));
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
     * Инициализирует загрузку всех необходимых файлов в правильном порядке
     */
    function init() {
        console.log(`DevLine Player Loader v${config.version} инициализирован (базовый путь: ${basePath})`);

        // Разделяем файлы по категориям
        const runtimeFiles = config.files.filter(file => file.includes('runtime'));
        const vendorFiles = config.files.filter(file => 
            file.includes('vendor') || 
            file.includes('react') || 
            file.includes('hls')
        );
        const cssFiles = config.files.filter(file => file.endsWith('.css'));
        const playerFiles = config.files.filter(file => 
            !runtimeFiles.includes(file) && 
            !vendorFiles.includes(file) && 
            !cssFiles.includes(file)
        );

        // Функция для загрузки массива файлов
        const loadFiles = (files) => {
            return Promise.all(
                files.map(file => {
                    return loadFile(file)
                        .then(() => {
                            console.log(`DevLine Player: Файл загружен: ${file}`);
                            window.__DEVLINE_PLAYER_LOADER__.chunks[file] = true;
                        })
                        .catch(error => {
                            console.error(`DevLine Player: Ошибка загрузки файла ${file}:`, error);
                            throw error;
                        });
                })
            );
        };

        // Последовательная загрузка файлов в нужном порядке
        // 1. Сначала загружаем runtime
        loadFiles(runtimeFiles)
            .then(() => {
                console.log('DevLine Player: Runtime файлы загружены');
                // 2. Загружаем vendor файлы
                return loadFiles(vendorFiles);
            })
            .then(() => {
                console.log('DevLine Player: Vendor файлы загружены');
                // 3. Загружаем CSS файлы параллельно
                return loadFiles(cssFiles);
            })
            .then(() => {
                console.log('DevLine Player: CSS файлы загружены');
                // 4. В самом конце загружаем основной файл плеера
                return loadFiles(playerFiles);
            })
            .then(() => {
                console.log('DevLine Player: Все файлы загружены успешно');

                // Экспортируем DevLinePlayer в глобальное пространство имен, если он определен в UMD
                if (typeof window !== 'undefined' && window.DevLinePlayer) {
                    // DevLinePlayer уже доступен в глобальном пространстве имен
                    window.__DEVLINE_PLAYER_LOADER__.loaded = true;
                } else if (typeof DevLinePlayer !== 'undefined') {
                    // Экспортируем DevLinePlayer в глобальное пространство имен
                    window.DevLinePlayer = DevLinePlayer;
                    window.__DEVLINE_PLAYER_LOADER__.loaded = true;
                } else {
                    console.error('DevLine Player: Ошибка - библиотека не найдена после загрузки всех файлов');
                    window.__DEVLINE_PLAYER_LOADER__.loaded = false;
                }

                // Вызываем все зарегистрированные колбэки
                window.__DEVLINE_PLAYER_LOADER__.callbacks.forEach(callback => {
                    try {
                        callback();
                    } catch (error) {
                        console.error('DevLine Player: Ошибка в колбэке:', error);
                    }
                });
            })
            .catch(error => {
                console.error('DevLine Player: Ошибка при загрузке файлов:', error);
            });
    }

    // Запускаем инициализацию
    init();
})();
