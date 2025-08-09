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

// Путь к файлу статистики
const statsPath = path.join(__dirname, 'build', 'webpack-stats.json');

// Чтение файла статистики
fs.readFile(statsPath, 'utf8', (err, data) => {
    if (err) {
        console.error('Ошибка при чтении файла статистики:', err);
        return;
    }
    
    try {
        const stats = JSON.parse(data);
        const modules = stats.modules || [];
        
        // Сортировка модулей по размеру
        const sortedModules = modules.sort((a, b) => b.size - a.size);
        
        // Группировка модулей по пакетам
        const packages = {};
        
        sortedModules.forEach(module => {
            const name = module.name;
            
            // Извлечение имени пакета из пути модуля
            let packageName = 'unknown';
            
            if (name.includes('node_modules')) {
                const nodeModulesIndex = name.indexOf('node_modules');
                const pathAfterNodeModules = name.slice(nodeModulesIndex + 12); // 'node_modules/'.length = 12
                const parts = pathAfterNodeModules.split('/');
                
                // Обработка scoped packages (@org/package)
                if (parts[0].startsWith('@')) {
                    packageName = parts[0] + '/' + parts[1];
                } else {
                    packageName = parts[0];
                }
            } else if (name.includes('src/')) {
                // Для собственного кода проекта
                const srcIndex = name.indexOf('src/');
                const pathAfterSrc = name.slice(srcIndex + 4); // 'src/'.length = 4
                const parts = pathAfterSrc.split('/');
                packageName = 'src/' + (parts[0] || 'root');
            }
            
            if (!packages[packageName]) {
                packages[packageName] = {
                    size: 0,
                    count: 0,
                    modules: []
                };
            }
            
            packages[packageName].size += module.size;
            packages[packageName].count += 1;
            
            // Сохраняем только топ-5 самых больших модулей для каждого пакета
            if (packages[packageName].modules.length < 5) {
                packages[packageName].modules.push({
                    name: module.name,
                    size: module.size
                });
            }
        });
        
        // Сортировка пакетов по размеру
        const sortedPackages = Object.entries(packages)
            .sort((a, b) => b[1].size - a[1].size);
        
        // Вывод результатов
        console.log('Анализ бандла по пакетам:');
        console.log('=======================\n');
        
        let totalSize = 0;
        
        sortedPackages.forEach(([name, info]) => {
            totalSize += info.size;
            console.log(`${name}: ${formatSize(info.size)} (${info.count} модулей)`);
            
            // Вывод топ-5 самых больших модулей для каждого пакета
            if (info.modules.length > 0) {
                console.log('  Самые большие модули:');
                info.modules.forEach(module => {
                    console.log(`  - ${module.name.split('/').pop()}: ${formatSize(module.size)}`);
                });
                console.log('');
            }
        });
        
        console.log(`\nОбщий размер проанализированных модулей: ${formatSize(totalSize)}`);
        
        // Анализ размера по категориям
        const categories = {
            'React и React DOM': ['react', 'react-dom'],
            'UI компоненты': ['react-datepicker', 'react-modal'],
            'Утилиты': ['date-fns', '@msgpack'],
            'Медиа': ['hls.js'],
            'Собственный код': ['src/']
        };
        
        console.log('\nАнализ по категориям:');
        console.log('===================\n');
        
        Object.entries(categories).forEach(([categoryName, packagePatterns]) => {
            let categorySize = 0;
            let categoryPackages = [];
            
            sortedPackages.forEach(([name, info]) => {
                const matchesPattern = packagePatterns.some(pattern => 
                    name.includes(pattern)
                );
                
                if (matchesPattern) {
                    categorySize += info.size;
                    categoryPackages.push({name, size: info.size});
                }
            });
            
            console.log(`${categoryName}: ${formatSize(categorySize)}`);
            
            if (categoryPackages.length > 0) {
                categoryPackages.forEach(pkg => {
                    console.log(`  - ${pkg.name}: ${formatSize(pkg.size)}`);
                });
                console.log('');
            }
        });
        
    } catch (error) {
        console.error('Ошибка при анализе файла статистики:', error);
    }
});
