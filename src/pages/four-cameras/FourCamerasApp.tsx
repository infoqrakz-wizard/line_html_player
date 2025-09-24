/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, {useState, useCallback, useEffect, useRef} from 'react';
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

import styles from './FourCamerasApp.module.scss';

interface CameraConfig {
    id: number;
    name: string;
    streamUrl: string;
    streamPort: number;
    login: string;
    password?: string;
    protocol?: Protocol;
}

interface FourCamerasAppProps {}

const streamUrl = '8.devline.ru';
const streamPort = 443;
const login = 'monit';
const password = 'monit';
const protocol = Protocol.Https;

const cameraMockData = {
    id: 0,
    name: 'Camera 1',
    streamUrl,
    streamPort,
    login,
    password,
    protocol
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
    const [cameraOrder, setCameraOrder] = useState<number[]>([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
    ]);
    const [hoveredCameraId, setHoveredCameraId] = useState<string | null>(null);

    // Конфигурация камер - можно будет сделать настраиваемой через пропсы
    const cameras: CameraConfig[] = Array.from({length: 20}, (_, index) => ({
        ...cameraMockData,
        name: `Camera ${index + 1}`,
        id: index
    }));

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

    const handleMenuClose = useCallback(() => {
        setIsMenuOpen(false);
        setIsPanelExpanded(false);
    }, []);

    const handleCameraSelect = useCallback((cameraId: number) => {
        setExpandedCamera(cameraId);
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
    const filteredCameras = cameras.filter(camera => camera.name.toLowerCase().includes(filterText.toLowerCase()));

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
                    const [activeCameraIndex, activeCameraId] = (active.id as string).split('-').map(Number);
                    const [overCameraIndex, overCameraId] = (over.id as string).split('-').map(Number);

                    items[activeCameraIndex] = overCameraId;
                    items[overCameraIndex] = activeCameraId;
                    return items;
                });
            }
        }
    }, []);

    // Если камера развернута, показываем только её
    if (expandedCamera !== null) {
        const camera = cameras[expandedCamera];
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
                                            className={`${styles.cameraListItem}`}
                                            onClick={() => handleCameraSelect(camera.id)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleCameraSelect(camera.id);
                                                }
                                            }}
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`Выбрать ${camera.name}`}
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
                <div className={`${styles.camerasGrid} ${styles[`grid${gridSize}`]}`}>
                    <SortableContext
                        items={cameraOrder.slice(0, gridSize).map((cameraId, index) => `${index}-${cameraId}`)}
                        strategy={rectSortingStrategy}
                        // disabled={true}
                    >
                        {cameraOrder.slice(0, gridSize).map((cameraId, index) => {
                            const camera = cameras[cameraId];

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
