/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, {useState, useCallback, useEffect, useRef, useMemo} from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragOverEvent
} from '@dnd-kit/core';
import {SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable} from '@dnd-kit/sortable';
import {Player} from '../../components/player/player';
import {HamburgerMenu} from '../../components/hamburger-menu';
import {GridIcon} from '../../components/icons/GridIcon';
import {Mode, Protocol} from '../../utils/types';
import {TimeProvider} from '../../context/time-context';
import {TimelineAuthProvider} from '../../context/timeline-auth-context';
import {useCamerasList} from '../../hooks/useCamerasList';
import {CameraInfo} from '../../utils/api';

import styles from './FourCamerasApp.module.scss';

interface CameraConfig extends CameraInfo {
    streamUrl: string;
    streamPort: number;
    login: string;
    password?: string;
    protocol?: Protocol;
}

interface FourCamerasAppProps {}

// Получаем конфигурацию сервера из HTML
const getServerConfig = () => {
    const configElement = document.getElementById('server-config');
    if (!configElement) {
        throw new Error('Server configuration not found');
    }
    return JSON.parse(configElement.textContent || '{}');
};

type GridSize = 4 | 6 | 8 | 12;

// Компонент для перетаскиваемой камеры
interface SortableCameraProps {
    camera: CameraConfig;
    onDoubleClick: (cameraId: number) => void;
    isHovered: boolean;
    index: number;
}

const SortableCamera: React.FC<SortableCameraProps> = ({camera, onDoubleClick, isHovered, index}) => {
    const {attributes, listeners, setNodeRef, transition, isDragging} = useSortable({
        id: `${index}-${camera.id}`
    });

    const style = {
        transition: isDragging ? 'none' : transition,
        opacity: isDragging ? 0.5 : 1
    };

    // Обработчик для предотвращения перетаскивания при клике в controlArea
    const handlePointerDown = useCallback(
        (event: React.PointerEvent) => {
            const target = event.target as HTMLElement;
            // Проверяем, произошло ли событие в области контролов плеера
            if (
                target.closest('[class*="controlArea"]') ||
                target.closest('[class*="controlPanel"]') ||
                target.closest('[class*="timeline"]')
            ) {
                event.stopPropagation();
                return;
            }

            listeners?.onPointerDown(event);
        },
        [listeners]
    );

    return (
        <div
            ref={setNodeRef}
            data-index={index}
            data-camera-id={camera.id}
            style={style}
            className={`${styles.cameraContainer} ${isDragging ? styles.dragging : ''} ${isHovered ? styles.hovered : ''}`}
            aria-label={`Перетащить и развернуть ${camera.name} двойным кликом`}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onDoubleClick(camera.id);
                }
            }}
            onDoubleClick={() => onDoubleClick(camera.id)}
            {...attributes}
            {...listeners}
            onPointerDown={handlePointerDown}
        >
            <div className={styles.cameraHeader}>
                <h3 className={styles.cameraName}>{camera.name}</h3>
            </div>
            <div className={styles.cameraPlayer}>
                <TimeProvider>
                    <TimelineAuthProvider>
                        <Player
                            timelineHoverMode="delayed"
                            streamUrl={camera.streamUrl}
                            streamPort={camera.streamPort}
                            login={camera.login}
                            password={camera.password}
                            mode={Mode.Live}
                            camera={camera.id}
                            protocol={camera.protocol}
                            showCameraSelector={false}
                            muted={true} // Звук отключен для мини-плееров
                            useSubStream={true} // Используем sub.mp4 для мини-плееров
                            hideControlsOnMouseLeave={true} // Скрываем контролы сразу при уходе мыши
                            onDoubleClick={() => onDoubleClick(camera.id)}
                        />
                    </TimelineAuthProvider>
                </TimeProvider>
            </div>
        </div>
    );
};

export const FourCamerasApp: React.FC<FourCamerasAppProps> = () => {
    const [expandedCamera, setExpandedCamera] = useState<number | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
    const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(false);
    const [filterText, setFilterText] = useState<string>('');
    const [isGridTooltipOpen, setIsGridTooltipOpen] = useState<boolean>(false);
    const [gridSize, setGridSize] = useState<GridSize>(4);
    const [hoveredCameraId, setHoveredCameraId] = useState<string | null>(null);

    // Получаем список камер с сервера
    const {cameras: camerasList, isLoading, error, refetch} = useCamerasList();

    // Преобразуем список камер в нужный формат
    const cameras: CameraConfig[] = useMemo(() => {
        if (!camerasList.length) return [];

        const serverConfig = getServerConfig();
        return camerasList.map(camera => ({
            ...camera,
            streamUrl: serverConfig.streamUrl,
            streamPort: serverConfig.streamPort,
            login: serverConfig.login,
            password: serverConfig.password,
            protocol: serverConfig.protocol === 'https' ? Protocol.Https : Protocol.Http
        }));
    }, [camerasList]);

    // Инициализируем порядок камер на основе полученного списка
    const [cameraOrder, setCameraOrder] = useState<number[]>([]);

    // Обновляем порядок камер когда загружается список
    useEffect(() => {
        if (cameras.length > 0) {
            setCameraOrder(cameras.map(camera => camera.id));
        }
    }, [cameras]);

    const handleCameraClose = useCallback(() => {
        setExpandedCamera(null);
    }, []);

    const handleCameraDoubleClick = useCallback((cameraId: number) => {
        setExpandedCamera(cameraId);
    }, []);

    const handleMenuToggle = useCallback(() => {
        setIsMenuOpen(prev => !prev);
        setIsPanelExpanded(prev => !prev);
    }, []);

    const handleGridSizeChange = useCallback((newGridSize: GridSize) => {
        setGridSize(newGridSize);
        setIsGridTooltipOpen(false); // Закрываем тултип после выбора
    }, []);

    const handleGridIconClick = useCallback(() => {
        setIsGridTooltipOpen(prev => !prev);
    }, []);

    const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setFilterText(e.target.value);
    }, []);

    // Фильтрация камер
    const filteredCameras = cameras.filter(camera => camera.name?.toLowerCase().includes(filterText.toLowerCase()));

    // Функция для получения URL превью камеры
    const getCameraPreviewUrl = useCallback(
        (
            cameraId: number,
            streamUrl: string,
            streamPort: number,
            login: string,
            password: string = '',
            protocol: Protocol = Protocol.Https
        ) => {
            if (!streamUrl || !streamPort || !login) {
                return '';
            }

            const credentials = btoa(`${login}:${password}`);
            const protocolString = protocol === Protocol.Http ? 'http' : 'https';

            if (protocol === Protocol.Http) {
                return `https://proxy.devline.ru/${streamUrl}/${streamPort}/cameras/${cameraId}/image?authorization=Basic%20${credentials}&stream=main`;
            }

            return `${protocolString}://${streamUrl}:${streamPort}/cameras/${cameraId}/image?authorization=Basic%20${credentials}&stream=main`;
        },
        []
    );

    // Ref для тултипа грида
    const gridTooltipRef = useRef<HTMLDivElement>(null);

    // Обработка кликов вне тултипа грида
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (gridTooltipRef.current && !gridTooltipRef.current.contains(event.target as Node)) {
                setIsGridTooltipOpen(false);
            }
        };

        if (isGridTooltipOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isGridTooltipOpen]);

    // Настройка сенсоров для drag and drop
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8 // Минимальное расстояние в пикселях перед началом перетаскивания
            }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    // Обработчик начала перетаскивания
    const handleDragStart = useCallback(() => {
        // Добавляем класс на body для курсора
        document.body.classList.add('dragging-active');
    }, []);

    // Обработчик hover при перетаскивании
    const handleDragOver = useCallback((event: DragOverEvent) => {
        const {over} = event;

        if (over) {
            const overId = over.id as string;
            setHoveredCameraId(overId);
        } else {
            setHoveredCameraId(null);
        }
    }, []);

    // Обработчик завершения перетаскивания
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const {active, over} = event;
        const activeId = active.id as string;

        setHoveredCameraId(null);

        // Удаляем класс с body
        document.body.classList.remove('dragging-active');

        if (!over) return;

        // Если перетаскиваем камеру из меню
        if (typeof activeId === 'string' && activeId.startsWith('camera-')) {
            const draggedCameraId = Number(activeId.replace('camera-', ''));
            const targetCameraId = Number((over.id as string).split('-')[1]);

            // Заменяем камеру в сетке
            setCameraOrder(items => {
                const targetIndex = items.indexOf(targetCameraId);
                if (targetIndex !== -1) {
                    const newItems = [...items];
                    newItems[targetIndex] = draggedCameraId;
                    return newItems;
                }
                return items;
            });
        } else {
            // Обычная перестановка камер в сетке
            if (over && active.id !== over.id) {
                setCameraOrder(items => {
                    const [activeIndex, activeCameraId] = (active.id as string).split('-').map(Number);
                    const [overIndex, overCameraId] = (over.id as string).split('-').map(Number);

                    const newItems = [...items];
                    newItems[activeIndex] = overCameraId;
                    newItems[overIndex] = activeCameraId;
                    return newItems;
                });
            }
        }
    }, []);

    // Компонент для отображения состояния загрузки
    const LoadingScreen: React.FC = () => (
        <div className={styles.loadingScreen}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Загрузка камер...</p>
        </div>
    );

    // Компонент для отображения ошибки
    const ErrorScreen: React.FC<{error: string; onRetry: () => void}> = ({error, onRetry}) => (
        <div className={styles.errorScreen}>
            <div className={styles.errorIcon}>⚠️</div>
            <h2 className={styles.errorTitle}>Ошибка загрузки камер</h2>
            <p className={styles.errorMessage}>{error}</p>
            <button
                className={styles.retryButton}
                onClick={onRetry}
            >
                Повторить попытку
            </button>
        </div>
    );

    // Если загружается список камер
    if (isLoading) {
        return <LoadingScreen />;
    }

    // Если произошла ошибка при загрузке
    if (error) {
        return (
            <ErrorScreen
                error={error}
                onRetry={refetch}
            />
        );
    }

    // Если нет камер
    if (!cameras.length) {
        return (
            <div className={styles.errorScreen}>
                <div className={styles.errorIcon}>📹</div>
                <h2 className={styles.errorTitle}>Камеры не найдены</h2>
                <p className={styles.errorMessage}>На сервере не найдено доступных камер</p>
                <button
                    className={styles.retryButton}
                    onClick={refetch}
                >
                    Обновить
                </button>
            </div>
        );
    }

    // Если камера развернута, показываем только её
    if (expandedCamera !== null) {
        const camera = cameras.find(c => c.id === expandedCamera);
        if (!camera) {
            setExpandedCamera(null);
            return null;
        }
        return (
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className={styles.expandedView}>
                    <div className={styles.expandedHeader}>
                        <h1 className={styles.expandedTitle}>{camera.name}</h1>
                        <button
                            className={styles.closeButton}
                            onClick={handleCameraClose}
                            aria-label="Закрыть развернутый вид"
                        >
                            ✕
                        </button>
                    </div>
                    <div className={styles.expandedPlayer}>
                        <TimeProvider>
                            <TimelineAuthProvider>
                                <Player
                                    streamUrl={camera.streamUrl}
                                    streamPort={camera.streamPort}
                                    login={camera.login}
                                    password={camera.password}
                                    mode={Mode.Live}
                                    camera={camera.id}
                                    protocol={camera.protocol}
                                    showCameraSelector={false}
                                    useSubStream={false}
                                    onDoubleClick={handleCameraClose}
                                />
                            </TimelineAuthProvider>
                        </TimeProvider>
                    </div>
                </div>
            </DndContext>
        );
    }

    // Обычный вид с четырьмя камерами
    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className={styles.fourCamerasView}>
                {/* Вертикальная панель управления */}
                <div className={`${styles.controlPanel} ${isPanelExpanded ? styles.expanded : ''}`}>
                    {/* Иконки в свернутом виде */}
                    {!isPanelExpanded && (
                        <div className={styles.panelIcons}>
                            <HamburgerMenu
                                isOpen={isMenuOpen}
                                onToggle={handleMenuToggle}
                            />
                            <div className={styles.gridIconContainer}>
                                <button
                                    className={styles.gridIconButton}
                                    onClick={handleGridIconClick}
                                    aria-label="Выбрать размер сетки"
                                    aria-expanded={isGridTooltipOpen}
                                >
                                    <GridIcon
                                        className={styles.gridIcon}
                                        size={20}
                                    />
                                </button>
                                {isGridTooltipOpen && (
                                    <div
                                        className={styles.gridTooltip}
                                        ref={gridTooltipRef}
                                    >
                                        <div className={styles.gridTooltipContent}>
                                            {([4, 6, 8, 12] as const).map(size => (
                                                <button
                                                    key={size}
                                                    className={`${styles.gridTooltipButton} ${gridSize === size ? styles.active : ''}`}
                                                    onClick={() => handleGridSizeChange(size)}
                                                    aria-label={`Сетка ${size} камер`}
                                                >
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Кнопка закрытия в правом верхнем углу при раскрытой панели */}
                    {isPanelExpanded && (
                        <div className={styles.panelHeader}>
                            <button
                                className={styles.closeButton}
                                onClick={handleMenuToggle}
                                aria-label="Закрыть панель"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* Расширенная панель */}
                    {isPanelExpanded && (
                        <div className={styles.panelContent}>
                            {/* Фиксированные элементы управления */}
                            <div className={styles.panelControls}>
                                {/* Селектор сетки */}
                                <div className={styles.gridSizeSelector}>
                                    <span className={styles.gridSizeLabel}>Сетка:</span>
                                    <div className={styles.gridSizeButtons}>
                                        {([4, 6, 8, 12] as const).map(size => (
                                            <button
                                                key={size}
                                                className={`${styles.gridSizeButton} ${gridSize === size ? styles.active : ''}`}
                                                onClick={() => handleGridSizeChange(size)}
                                                aria-label={`Сетка ${size} камер`}
                                            >
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Фильтр камер */}
                                <div className={styles.filterSection}>
                                    <input
                                        type="text"
                                        placeholder="Фильтр камер..."
                                        value={filterText}
                                        onChange={handleFilterChange}
                                        className={styles.filterInput}
                                    />
                                </div>

                                {/* Заголовок списка камер */}
                                <div className={styles.camerasListTitle}>Все камеры:</div>
                            </div>

                            {/* Скроллируемый список камер */}
                            <div className={styles.camerasListContent}>
                                {filteredCameras.map(camera => {
                                    const previewUrl = getCameraPreviewUrl(
                                        camera.id,
                                        camera.streamUrl,
                                        camera.streamPort,
                                        camera.login,
                                        camera.password,
                                        camera.protocol
                                    );
                                    const isActive = cameraOrder.slice(0, gridSize).includes(camera.id);

                                    return (
                                        <div
                                            key={camera.id}
                                            id={`camera-${camera.id}`}
                                            className={`${styles.cameraListItem} ${!isActive ? styles.draggableCamera : styles.disabledCamera}`}
                                            aria-label={
                                                isActive
                                                    ? `${camera.name} уже используется`
                                                    : `Перетащить ${camera.name} в сетку`
                                            }
                                            draggable={!isActive}
                                            onDragStart={e => {
                                                if (isActive) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                e.dataTransfer.effectAllowed = 'move';
                                                e.dataTransfer.setData('text/plain', `camera-${camera.id}`);
                                                document.body.classList.add('dragging-active');
                                            }}
                                            onDragEnd={() => {
                                                document.body.classList.remove('dragging-active');
                                            }}
                                        >
                                            <div className={styles.listCameraHeader}>
                                                <div className={styles.listCameraNameContainer}>
                                                    <h4 className={styles.listCameraName}>{camera.name}</h4>
                                                    {isActive && <div className={styles.listStatusIndicator}></div>}
                                                </div>
                                            </div>
                                            <div className={styles.cameraPreview}>
                                                {previewUrl ? (
                                                    <img
                                                        src={previewUrl}
                                                        alt={`Предпросмотр ${camera.name}`}
                                                        className={styles.previewImage}
                                                        onError={e => {
                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                    />
                                                ) : (
                                                    <div className={styles.noPreview}>
                                                        <span>Нет изображения</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div
                    className={`${styles.camerasGrid} ${styles[`grid${gridSize}`]}`}
                    onDragOver={e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={e => {
                        e.preventDefault();
                        const draggedCameraId = e.dataTransfer.getData('text/plain');

                        if (draggedCameraId.startsWith('camera-')) {
                            const cameraId = Number(draggedCameraId.replace('camera-', ''));
                            const targetElement = e.target as HTMLElement;
                            const cameraContainer = targetElement.closest(`[data-camera-id]`);

                            if (cameraContainer) {
                                const targetCameraId = Number(cameraContainer.getAttribute('data-camera-id'));

                                // Заменяем камеру в сетке
                                setCameraOrder(items => {
                                    const targetIndex = items.indexOf(targetCameraId);
                                    if (targetIndex !== -1) {
                                        const newItems = [...items];
                                        newItems[targetIndex] = cameraId;
                                        return newItems;
                                    }
                                    return items;
                                });
                            }
                        }
                    }}
                >
                    <SortableContext
                        items={cameraOrder.slice(0, gridSize).map((cameraId, index) => `${index}-${cameraId}`)}
                        strategy={rectSortingStrategy}
                        // disabled={true}
                    >
                        {cameraOrder.slice(0, gridSize).map((cameraId, index) => {
                            const camera = cameras.find(c => c.id === cameraId);
                            if (!camera) return null;

                            return (
                                <SortableCamera
                                    key={`camera-${camera.id}-${index}`}
                                    index={index}
                                    camera={camera}
                                    onDoubleClick={handleCameraDoubleClick}
                                    isHovered={hoveredCameraId === `${index}-${camera.id}`}
                                />
                            );
                        })}
                    </SortableContext>
                </div>
            </div>
        </DndContext>
    );
};
