/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, {useCallback} from 'react';
import {useDraggable} from '@dnd-kit/core';
import {CSS} from '@dnd-kit/utilities';
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
    activeCameraIds: number[];
}

// Компонент для перетаскиваемой камеры в меню
interface DraggableCameraItemProps {
    camera: CameraInfo;
    onCameraSelect: (cameraId: number) => void;
    isActive: boolean;
}

const DraggableCameraItem: React.FC<DraggableCameraItemProps> = ({camera, onCameraSelect, isActive}) => {
    const {attributes, listeners, setNodeRef, transform, isDragging} = useDraggable({
        id: `camera-${camera.id}`,
        data: {
            type: 'camera',
            camera
        }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1
    };

    const getCameraPreviewUrl = (
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
            return `https://proxy.devline.ru/${streamUrl}/${streamPort}/cameras/${cameraId}/image?authorization=Basic%20${credentials}&stream=main`;
        }

        return `${protocol}://${streamUrl}:${streamPort}/cameras/${cameraId}/image?authorization=Basic%20${credentials}&stream=main`;
    };

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
            ref={setNodeRef}
            style={style}
            className={`${styles.cameraItem} ${isDragging ? styles.dragging : ''}`}
            onClick={() => onCameraSelect(camera.id)}
            aria-label={`Перетащить или выбрать ${camera.name}`}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCameraSelect(camera.id);
                }
            }}
            {...attributes}
            {...listeners}
        >
            <div className={styles.preview}>
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
            <div className={styles.cameraInfo}>
                <div className={styles.cameraNameContainer}>
                    <h4 className={styles.cameraName}>{camera.name}</h4>
                    {isActive && <div className={styles.statusIndicator}></div>}
                </div>
                <span className={styles.cameraId}>ID: {camera.id}</span>
            </div>
        </div>
    );
};

export const CameraMenu: React.FC<CameraMenuProps> = ({cameras, isOpen, onClose, onCameraSelect, activeCameraIds}) => {
    const handleCameraClick = useCallback(
        (cameraId: number) => {
            onCameraSelect(cameraId);
            onClose();
        },
        [onCameraSelect, onClose]
    );

    if (!isOpen) return null;

    return (
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
                    {cameras.map(camera => (
                        <DraggableCameraItem
                            key={camera.id}
                            camera={camera}
                            onCameraSelect={handleCameraClick}
                            isActive={activeCameraIds.includes(camera.id)}
                        />
                    ))}
                </div>
        </div>
    );
};
