/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/**
 * Компонент для отрисовки canvas временной шкалы
 */
import React from 'react';
import {TimelineCanvasProps} from './types';
import {useTimelineDrawing} from './hooks/use-timeline-drawing';
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
    cursorPosition
}: TimelineCanvasProps) => {
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
        progress,
        cursorPosition
    });

    return (
        <div
            ref={containerRef}
            className={styles.timeline}
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
        </div>
    );
};
