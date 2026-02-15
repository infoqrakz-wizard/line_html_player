/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/**
 * Компонент для отрисовки canvas временной шкалы
 */
import React, {useState, useCallback, useEffect} from 'react';
import {TimelineCanvasProps} from './types';
import {useTimelineDrawing} from './hooks/use-timeline-drawing';
import {useTimelinePreview} from './hooks/use-timeline-preview';
import styles from './timeline.module.scss';

/**
 * Компонент для отрисовки canvas временной шкалы
 */
export const TimelineCanvas = ({
    visibleTimeRange,
    setVisibleTimeRange,
    intervalIndex,
    fragments,
    fragmentsBufferRange,
    loadFragments,
    currentTime,
    serverTime,
    liveStreamStartTime,
    progress,
    onMouseDown,
    onMouseUp,
    onMouseMove,
    onMouseLeave,
    onClick,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    containerRef,
    canvasRef,
    cursorPosition,
    isVertical = false,
    isMobile = false,
    isDragging = false,
    mode,
    serverVersion,
    url,
    port,
    credentials,
    camera,
    protocol,
    proxy
}: TimelineCanvasProps) => {
    const [containerWidth, setContainerWidth] = useState(0);

    const updateContainerWidth = useCallback(() => {
        if (containerRef.current) {
            setContainerWidth(containerRef.current.getBoundingClientRect().width);
        }
    }, [containerRef]);

    useEffect(() => {
        updateContainerWidth();
        window.addEventListener('resize', updateContainerWidth);
        return () => window.removeEventListener('resize', updateContainerWidth);
    }, [updateContainerWidth]);

    // Используем хук для отрисовки временной шкалы
    useTimelineDrawing({
        canvasRef,
        containerRef,
        visibleTimeRange,
        setVisibleTimeRange,
        intervalIndex,
        fragments,
        fragmentsBufferRange,
        loadFragments,
        currentTime,
        serverTime,
        liveStreamStartTime,
        progress,
        cursorPosition,
        isVertical,
        isMobile,
        isDragging,
        mode
    });

    const {previewUrl, previewX, previewTime} = useTimelinePreview({
        cursorPosition,
        serverVersion,
        url: url ?? '',
        port: port ?? 0,
        credentials: credentials ?? '',
        camera: camera ?? 0,
        protocol,
        proxy,
        isDragging,
        containerWidth
    });

    return (
        <div
            ref={containerRef}
            className={`${styles.timeline} ${isMobile ? styles.mobile : ''} ${isVertical ? styles.vertical : ''}`}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <canvas ref={canvasRef} />
            {previewUrl && cursorPosition && !isVertical && (
                <div
                    className={styles.previewContainer}
                    style={{left: previewX}}
                >
                    <img
                        src={previewUrl}
                        className={styles.previewImage}
                        alt=""
                        draggable={false}
                    />
                    {previewTime && <div className={styles.previewTime}>{previewTime}</div>}
                </div>
            )}
        </div>
    );
};
