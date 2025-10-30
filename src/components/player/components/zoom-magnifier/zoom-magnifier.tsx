import React, {useEffect, useRef} from 'react';
import styles from './zoom-magnifier.module.scss';

export interface ZoomMagnifierProps {
    videoElement: HTMLVideoElement | null;
    mouseX: number;
    mouseY: number;
    isActive: boolean;
    zoomFactor?: number;
    size?: number;
    isFullscreen?: boolean;
    playerContainerRef?: React.RefObject<HTMLElement>;
}

const DEFAULT_ZOOM_FACTOR = 2;
const DEFAULT_SIZE = 200;

export const ZoomMagnifier: React.FC<ZoomMagnifierProps> = ({
    videoElement,
    mouseX,
    mouseY,
    isActive,
    zoomFactor = DEFAULT_ZOOM_FACTOR,
    size = DEFAULT_SIZE,
    isFullscreen = false,
    playerContainerRef
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isActive || !videoElement || !canvasRef.current) {
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const video = videoElement;

        const updateZoom = () => {
            if (!isActive || !video || !canvas || !ctx) return;

            // Получаем позицию видео элемента на странице
            const videoRect = video.getBoundingClientRect();

            // Вычисляем относительную позицию курсора внутри видео
            const relativeX = mouseX - videoRect.left;
            const relativeY = mouseY - videoRect.top;

            // Получаем размеры видео (с учетом масштабирования)
            const videoWidth = video.videoWidth || videoRect.width;
            const videoHeight = video.videoHeight || videoRect.height;

            // Масштаб видео элемента относительно его реальных размеров
            const scaleX = videoWidth / videoRect.width;
            const scaleY = videoHeight / videoRect.height;

            // Вычисляем координаты в исходном видео
            const sourceX = relativeX * scaleX;
            const sourceY = relativeY * scaleY;

            // Размер области, которую нужно взять из видео (уменьшаем, чтобы увеличить)
            const sourceSize = size / zoomFactor;
            const halfSourceSize = sourceSize / 2;

            // Ограничиваем координаты, чтобы не выходить за границы видео
            const clampedX = Math.max(halfSourceSize, Math.min(sourceX, videoWidth - halfSourceSize));
            const clampedY = Math.max(halfSourceSize, Math.min(sourceY, videoHeight - halfSourceSize));

            // Очищаем canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Рисуем увеличенную область
            ctx.drawImage(
                video,
                clampedX - halfSourceSize,
                clampedY - halfSourceSize,
                sourceSize,
                sourceSize,
                0,
                0,
                size,
                size
            );
        };

        const animate = () => {
            updateZoom();
            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isActive, videoElement, mouseX, mouseY, zoomFactor, size]);

    if (!isActive) {
        return null;
    }

    // Вычисляем позицию в зависимости от того, в fullscreen мы или нет
    let left = mouseX;
    let top = mouseY;

    if (!isFullscreen && playerContainerRef?.current) {
        const playerRect = playerContainerRef.current.getBoundingClientRect();
        left = mouseX - playerRect.left;
        top = mouseY - playerRect.top;
    }

    return (
        <div
            ref={containerRef}
            className={styles.zoomMagnifier}
            style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${size}px`,
                height: `${size}px`,
                position: isFullscreen ? 'fixed' : 'absolute'
            }}
        >
            <canvas
                ref={canvasRef}
                width={size}
                height={size}
                className={styles.canvas}
            />
        </div>
    );
};
