import React, {useState, useCallback} from 'react';
import {Player} from '../../components/player/player';
import {CameraMenu} from '../../components/camera-menu';
import {HamburgerMenu} from '../../components/hamburger-menu';
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
}

type GridSize = 4 | 6 | 8 | 12;

export const FourCamerasApp: React.FC<FourCamerasAppProps> = () => {
    const [expandedCamera, setExpandedCamera] = useState<number | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
    const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);
    const [gridSize, setGridSize] = useState<GridSize>(4);


    // Конфигурация камер - можно будет сделать настраиваемой через пропсы
    const cameras: CameraConfig[] = Array.from({length: 20}, (_, index) => ({
        ...cameraMockData,
        id: index
    }));

    const handleCameraClick = useCallback((cameraId: number) => {
        setExpandedCamera(prev => (prev === cameraId ? null : cameraId));
    }, []);

    const handleCameraClose = useCallback(() => {
        setExpandedCamera(null);
    }, []);

    const handleCameraDoubleClick = useCallback((cameraId: number) => {
        setExpandedCamera(cameraId);
    }, []);

    const handleMenuToggle = useCallback(() => {
        setIsMenuOpen(prev => !prev);
    }, []);

    const handleMenuClose = useCallback(() => {
        setIsMenuOpen(false);
    }, []);

    const handleCameraSelect = useCallback((cameraId: number) => {
        setSelectedCameraId(cameraId);
        setExpandedCamera(cameraId);
    }, []);

    const handleGridSizeChange = useCallback((newGridSize: GridSize) => {
        setGridSize(newGridSize);
    }, []);

    // Если камера развернута, показываем только её
    if (expandedCamera !== null) {
        const camera = cameras[expandedCamera];
        return (
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
        );
    }

    // Обычный вид с четырьмя камерами
    return (
        <div className={styles.fourCamerasView}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <HamburgerMenu
                        isOpen={isMenuOpen}
                        onToggle={handleMenuToggle}
                    />
                    <h1 className={styles.title}>Cameras View</h1>
                </div>
                <div className={styles.gridSizeSelector}>
                    <span className={styles.gridSizeLabel}>Сетка:</span>
                    <div className={styles.gridSizeButtons}>
                        {([4, 6, 8, 12] as const).map((size) => (
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
            </div>
            <div className={`${styles.camerasGrid} ${styles[`grid${gridSize}`]}`}>
                {cameras.slice(0, gridSize).map(camera => (
                    <div
                        key={camera.id}
                        className={styles.cameraContainer}
                        role="button"
                        tabIndex={0}
                        aria-label={`Развернуть ${camera.name} двойным кликом`}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleCameraDoubleClick(camera.id);
                            }
                        }}
                    >
                        <div className={styles.cameraHeader}>
                            <h3 className={styles.cameraName}>{camera.name}</h3>
                            <div className={styles.expandIcon}>⛶</div>
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
                                        onDoubleClick={() => handleCameraDoubleClick(camera.id)}
                                    />
                                </TimelineAuthProvider>
                            </TimeProvider>
                        </div>
                    </div>
                    ))}
            </div>
            <CameraMenu
                cameras={cameras}
                isOpen={isMenuOpen}
                onClose={handleMenuClose}
                onCameraSelect={handleCameraSelect}
            />
        </div>
    );
};
