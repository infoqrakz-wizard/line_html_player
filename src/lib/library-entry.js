// Импортируем компоненты, которые будут использоваться в библиотеке
// Это автоматически импортирует их стили через CSS-модули
import '../components/video-player/video-player';
import '../components/video-player/components/hls-player/hls-player';
import '../components/video-player/components/timeline/timeline';
import '../components/video-player/components/player-controls/player-controls';
import '../components/video-player/components/period-selector/period-selector';
import '../components/video-player/components/save-stream-modal/save-stream-modal';

import '../components/live-player/live-player';
import '../components/live-player/components/player-controls/player-controls';

import '../components/loader/loader';
import '../components/error/error';
import '../components/poster/poster';

// Экспортируем DevLinePlayer как основной экспорт
export {default} from './DevLinePlayer';
