import React, {useState, useCallback} from 'react';
import {Player} from '../../components/player/player';
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

export const FourCamerasApp: React.FC<FourCamerasAppProps> = () => {
    const [expandedCamera, setExpandedCamera] = useState<number | null>(null);

    const streamUrl = '8.devline.ru';
    const streamPort = 443;
    const login = 'monit';
    const password = 'monit';
    const protocol = Protocol.Https;

    // Конфигурация камер - можно будет сделать настраиваемой через пропсы
    const cameras: CameraConfig[] = [
        {
            id: 0,
            name: 'Camera 1',
            streamUrl,
            streamPort,
            login,
            password,
            protocol
        },
        {
            id: 1,
            name: 'Camera 2',
            streamUrl,
            streamPort,
            login,
            password,
            protocol
        },
        {
            id: 2,
            name: 'Camera 3',
            streamUrl,
            streamPort,
            login,
            password,
            protocol
        },
        {
            id: 6,
            name: 'Camera 4',
            streamUrl,
            streamPort,
            login,
            password,
            protocol
        }
    ];

    const handleCameraClick = useCallback((cameraId: number) => {
        setExpandedCamera(prev => (prev === cameraId ? null : cameraId));
    }, []);

    const handleCameraClose = useCallback(() => {
        setExpandedCamera(null);
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
                <h1 className={styles.title}>Four Cameras View</h1>
            </div>
            <div className={styles.camerasGrid}>
                {cameras.map(camera => (
                    <div
                        key={camera.id}
                        className={styles.cameraContainer}
                        onClick={() => handleCameraClick(camera.id)}
                        role="button"
                        tabIndex={0}
                        aria-label={`Развернуть ${camera.name}`}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleCameraClick(camera.id);
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
                                    />
                                </TimelineAuthProvider>
                            </TimeProvider>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
