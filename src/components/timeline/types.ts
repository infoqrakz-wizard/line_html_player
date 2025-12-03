/**
 * Типы и интерфейсы для компонента Timeline
 */

/**
 * Свойства компонента Timeline
 */
import {Mode, Protocol} from '../../utils/types';
import {TimelineMotionFilter} from '../../types/motion-filter';

export interface TimelineProps {
    /** URL сервера */
    url: string;
    /** Порт сервера */
    port: number;
    /** Строка с учетными данными */
    credentials: string;
    /** Обработчик клика по временной шкале */
    onTimeClick?: (time: Date) => void;
    /** Прогресс воспроизведения в секундах */
    progress?: number;
    /** Идентификатор потока */
    stream?: string;
    /** Номер камеры */
    camera: number;
    /** Режим плеера (live/record) */
    mode?: Mode;
    /** Протокол */
    protocol?: Protocol;
    /** Прокси-сервер */
    proxy?: string;
    /** Фильтр движений */
    motionFilter?: TimelineMotionFilter | null;
}

/**
 * Интерфейс для экспорта методов через ref
 */
export interface TimelineRef {
    /** Установить видимый диапазон времени */
    setVisibleTimeRange: (start: Date, end: Date) => void;
    /** Центрировать на текущем времени */
    centerOnCurrentTime: () => void;
    /** Получить текущее серверное время */
    getCurrentTime: () => Date | null;
    /** Получить данные фрагментов */
    getFragmentsData: () => {
        fragments: number[];
        fragmentsBufferRange: TimeRange;
        intervalIndex: number;
        fragmentRanges: FragmentTimeRange[];
    } | null;
    /** Обновить позицию курсора по времени */
    updateCursorPositionByTime: (time: Date) => void;
    /** Очистить кэш скачанных фреймов */
    clearFramesCache: () => void;
    /** Перезагрузить фрагменты для текущего видимого диапазона */
    reloadFragments: () => void;
}

/**
 * Видимый диапазон времени
 */
export interface TimeRange {
    /** Начало диапазона */
    start: Date;
    /** Конец диапазона */
    end: Date;
}

/**
 * Параметры для загрузки фрагментов
 */
export interface LoadFragmentsParams {
    /** Начало временного диапазона */
    startTime: Date;
    /** Конец временного диапазона */
    endTime: Date;
    /** URL сервера */
    url: string;
    /** Порт сервера */
    port: number;
    /** Строка с учетными данными */
    credentials: string;
    /** Длина единицы времени в секундах */
    unitLength: number;
    /** Идентификатор потока */
    stream?: string;
    /** Номер камеры */
    channel: number;
}

/**
 * Ответ API с фрагментами временной шкалы
 */
export interface FragmentsResponse {
    /** Массив с наличием фрагментов */
    timeline: number[];
}

/**
 * Диапазон времени для одного фрагмента записи
 */
export interface FragmentTimeRange {
    /** Начало фрагмента */
    start: Date;
    /** Конец фрагмента */
    end: Date;
}

/**
 * Информация о позиции курсора
 */
export interface CursorPosition {
    /** X-координата курсора */
    x: number;
    /** Время, соответствующее позиции курсора */
    time: Date;
}

/**
 * Свойства для компонента TimelineCanvas
 */
export interface TimelineCanvasProps {
    /** Видимый диапазон времени */
    visibleTimeRange: TimeRange;
    /** Функция для установки видимого диапазона времени */
    setVisibleTimeRange: (range: TimeRange) => void;
    /** Индекс интервала масштабирования */
    intervalIndex: number;
    /** Массив с наличием фрагментов */
    fragments: number[];
    /** Буферизованный диапазон фрагментов */
    fragmentsBufferRange: TimeRange;
    /** Функция для загрузки фрагментов */
    loadFragments: (start: Date, end: Date, zoomIndex?: number, immediate?: boolean) => void;
    /** Текущее время */
    currentTime: Date;
    /** Серверное время (начало воспроизведения) */
    serverTime: Date | null;
    /** Прогресс воспроизведения в секундах */
    progress: number;
    /** Обработчик нажатия кнопки мыши */
    onMouseDown: (e: React.MouseEvent) => void;
    /** Обработчик отпускания кнопки мыши */
    onMouseUp: (e: React.MouseEvent) => void;
    /** Обработчик движения мыши */
    onMouseMove: (e: React.MouseEvent) => void;
    /** Обработчик выхода мыши за пределы контейнера */
    onMouseLeave: (e: React.MouseEvent) => void;
    /** Обработчик клика */
    onClick: (e: React.MouseEvent) => void;
    /** Обработчик начала касания */
    onTouchStart?: (e: React.TouchEvent) => void;
    /** Обработчик движения касания */
    onTouchMove?: (e: React.TouchEvent) => void;
    /** Обработчик окончания касания */
    onTouchEnd?: (e: React.TouchEvent) => void;
    /** Ссылка на контейнер */
    containerRef: React.RefObject<HTMLDivElement>;
    /** Ссылка на canvas */
    canvasRef: React.RefObject<HTMLCanvasElement>;
    /** Позиция курсора */
    cursorPosition: CursorPosition | null;
    /** Вертикальный режим таймлайна */
    isVertical?: boolean;
    /** Мобильное устройство */
    isMobile?: boolean;
    /** Флаг перетаскивания таймлайна */
    isDragging?: boolean;
}

/**
 * Ссылки на DOM-элементы для TimelineCanvas
 */
export interface TimelineCanvasRefs {
    /** Ссылка на контейнер */
    container: React.RefObject<HTMLDivElement>;
    /** Ссылка на canvas */
    canvas: React.RefObject<HTMLCanvasElement>;
}

/**
 * Параметры для хука useTimelineInteractions
 */
export interface TimelineInteractionsParams {
    /** Ссылка на canvas */
    canvasRef: React.RefObject<HTMLCanvasElement>;
    /** Ссылка на контейнер */
    containerRef: React.RefObject<HTMLDivElement>;
    /** Видимый диапазон времени */
    visibleTimeRange: TimeRange;
    /** Установить видимый диапазон времени */
    setVisibleTimeRange: (range: TimeRange) => void;
    /** Индекс интервала масштабирования */
    intervalIndex: number;
    /** Установить индекс интервала масштабирования */
    setIntervalIndex: (index: number) => void;
    /** Массив с наличием фрагментов */
    fragments: number[];
    /** Буферизованный диапазон фрагментов */
    fragmentsBufferRange: TimeRange;
    /** Загрузить фрагменты */
    loadFragments: (start: Date, end: Date, zoomIndex?: number, immediate?: boolean) => void;
    /** Обработать изменения timeline (вызывается после окончания взаимодействия) */
    handleTimelineChange?: (visibleStart: Date, visibleEnd: Date, intervalIndex?: number) => void;
    /** Текущее время */
    currentTime: Date;
    /** Обработчик клика по временной шкале */
    onTimeClick?: (time: Date) => void;
    /** Прогресс воспроизведения в секундах */
    progress: number;
    /** Вертикальный режим таймлайна */
    isVertical?: boolean;
}

/**
 * Параметры для хука useTimelineDrawing
 */
export interface TimelineDrawingParams {
    /** Ссылка на canvas */
    canvasRef: React.RefObject<HTMLCanvasElement>;
    /** Ссылка на контейнер */
    containerRef: React.RefObject<HTMLDivElement>;
    /** Видимый диапазон времени */
    visibleTimeRange: TimeRange;
    /** Функция для установки видимого диапазона времени */
    setVisibleTimeRange: (range: TimeRange) => void;
    /** Индекс интервала масштабирования */
    intervalIndex: number;
    /** Массив с наличием фрагментов */
    fragments: number[];
    /** Буферизованный диапазон фрагментов */
    fragmentsBufferRange: TimeRange;
    /** Функция для загрузки фрагментов */
    loadFragments: (start: Date, end: Date, zoomIndex?: number, immediate?: boolean) => void;
    /** Текущее время */
    currentTime: Date;
    /** Серверное время (начало воспроизведения) */
    serverTime: Date | null;
    /** Прогресс воспроизведения в секундах */
    progress: number;
    /** Позиция курсора */
    cursorPosition: CursorPosition | null;
    /** Вертикальный режим таймлайна */
    isVertical?: boolean;
    /** Мобильное устройство */
    isMobile?: boolean;
    /** Флаг перетаскивания таймлайна */
    isDragging?: boolean;
}

/**
 * Параметры для хука useTimelineFragments
 */
export interface TimelineFragmentsParams {
    /** URL сервера */
    url: string;
    /** Порт сервера */
    port: number;
    /** Строка с учетными данными */
    credentials: string;
    /** Номер камеры */
    camera: number;
    /** Протокол */
    protocol?: Protocol;
    /** Прокси-сервер */
    proxy?: string;
    /** Фильтр движений */
    motionFilter?: TimelineMotionFilter | null;
    /** Сигнатура фильтра */
    motionFilterSignature?: string | null;
}

/**
 * Элемент очереди загрузки фрагментов
 */
export interface LoadQueueItem {
    /** Начало временного диапазона */
    start: Date;
    /** Конец временного диапазона */
    end: Date;
    /** Индекс масштабирования */
    zoomIndex: number;
}
