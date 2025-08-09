const fs = require('fs');
const path = require('path');

// Функция для форматирования размера в читаемом виде
function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Путь к бандлу
const bundlePath = path.join(__dirname, 'build', 'devline-player.js');

// Чтение файла
fs.readFile(bundlePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Ошибка при чтении файла:', err);
        return;
    }
    
    console.log(`Общий размер бандла: ${formatSize(data.length)}`);
    
    // Поиск основных модулей и библиотек
    const libraries = [
        { name: 'React', pattern: /react/gi },
        { name: 'ReactDOM', pattern: /react-dom/gi },
        { name: 'HLS.js', pattern: /hls\.js|hls-/gi },
        { name: 'date-fns', pattern: /date-fns/gi },
        { name: 'msgpack', pattern: /@msgpack/gi },
        { name: 'react-datepicker', pattern: /react-datepicker/gi },
        { name: 'react-modal', pattern: /react-modal/gi },
        { name: 'react-router', pattern: /react-router/gi }
    ];
    
    console.log('\nПримерная оценка размера основных библиотек в бандле:');
    console.log('(Обратите внимание, что это приблизительная оценка)');
    console.log('--------------------------------------------------');
    
    libraries.forEach(lib => {
        const matches = data.match(lib.pattern);
        if (matches) {
            // Примерная оценка размера на основе количества упоминаний
            const approximateSize = matches.length * 100; // Очень приблизительно
            console.log(`${lib.name}: примерно ${formatSize(approximateSize)} (${matches.length} упоминаний)`);
        } else {
            console.log(`${lib.name}: не найдено`);
        }
    });
    
    // Поиск импортов и определение основных компонентов
    console.log('\nОсновные импорты в коде:');
    const importRegex = /import\s+(?:{[^}]*}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    const imports = {};
    
    let match;
    while ((match = importRegex.exec(data)) !== null) {
        const importPath = match[1];
        imports[importPath] = (imports[importPath] || 0) + 1;
    }
    
    // Сортировка импортов по количеству
    const sortedImports = Object.entries(imports)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20); // Топ-20 импортов
    
    sortedImports.forEach(([importPath, count]) => {
        console.log(`${importPath}: ${count} раз`);
    });
});
