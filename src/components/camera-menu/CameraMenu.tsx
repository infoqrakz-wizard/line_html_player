import React, {useState, useCallback} from 'react';
import styles from './CameraMenu.module.scss';

interface CameraInfo {
    id: number;
    name: string;
    streamUrl: string;
    streamPort: number;
    login: string;
    password?: string;
    protocol?: 'http' | 'https';
}

interface CameraMenuProps {
    cameras: CameraInfo[];
    isOpen: boolean;
    onClose: () => void;
    onCameraSelect: (cameraId: number) => void;
}

export const CameraMenu: React.FC<CameraMenuProps> = ({
    cameras,
    isOpen,
    onClose,
    onCameraSelect
}) => {
    const [activeCamera, setActiveCamera] = useState<number | null>(null);

    const getCameraPreviewUrl = useCallback((
        cameraId: number,
        streamUrl: string,
        streamPort: number,
        login: string,
        password: string = '',
        protocol: 'http' | 'https' = 'https'
    ) => {
        if (!streamUrl || !streamPort || !login) {
            return '';
        }

        const credentials = btoa(`${login}:${password}`);

        if (protocol === 'http') {
            // Для HTTP используем прокси
            return `https://proxy.devline.ru/${streamUrl}/${streamPort}/cameras/${cameraId}/image?authorization=Basic%20${credentials}&stream=main`;
        }

        // Для HTTPS используем прямое подключение
        return `${protocol}://${streamUrl}:${streamPort}/cameras/${cameraId}/image?authorization=Basic%20${credentials}&stream=main`;
    }, []);

    const handleCameraClick = useCallback((cameraId: number) => {
        setActiveCamera(cameraId);
        onCameraSelect(cameraId);
        onClose();
    }, [onCameraSelect, onClose]);

    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div className={styles.backdrop} onClick={handleBackdropClick}>
            <div className={styles.menu}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Выбор камеры</h3>
                    <button
                        className={styles.closeButton}
                        onClick={onClose}
                        aria-label="Закрыть меню"
                    >
                        ✕
                    </button>
                </div>
                <div className={styles.camerasList}>
                    {cameras.map((camera) => {
                        const previewUrl = getCameraPreviewUrl(
                            camera.id,
                            camera.streamUrl,
                            camera.streamPort,
                            camera.login,
                            camera.password,
                            camera.protocol
                        );
                        
                        return (
                            <div
                                key={camera.id}
                                className={`${styles.cameraItem} ${activeCamera === camera.id ? styles.active : ''}`}
                                onClick={() => handleCameraClick(camera.id)}
                                role="button"
                                tabIndex={0}
                                aria-label={`Выбрать ${camera.name}`}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleCameraClick(camera.id);
                                    }
                                }}
                            >
                                <div className={styles.preview}>
                                    {previewUrl ? (
                                        <img
                                            src={previewUrl}
                                            alt={`Предпросмотр ${camera.name}`}
                                            className={styles.previewImage}
                                            onError={(e) => {
                                                // Скрываем изображение при ошибке загрузки
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className={styles.noPreview}>
                                            <span>Нет изображения</span>
                                        </div>
                                    )}
                                </div>
                                <div className={styles.cameraInfo}>
                                    <h4 className={styles.cameraName}>{camera.name}</h4>
                                    <span className={styles.cameraId}>ID: {camera.id}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
