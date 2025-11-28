import React, {useState} from 'react';

import styles from './motion-mask-overlay.module.scss';
import {Icons} from '../../../icons';

type MaskTool = 'brush' | 'eraser';

const BRUSH_SIZES = [1, 2, 3];

interface MotionMaskOverlayProps {
    isVisible: boolean;
    maskGrid: number[][];
    activeTool: MaskTool;
    brushSize: number;
    onToolChange: (tool: MaskTool) => void;
    onBrushSizeChange: (size: number) => void;
    onPaintCell: (rowIndex: number, colIndex: number) => void;
    onClearMask: () => void;
    onApply: () => void;
    onCancel: () => void;
}

export const MotionMaskOverlay: React.FC<MotionMaskOverlayProps> = ({
    isVisible,
    maskGrid,
    activeTool,
    brushSize,
    onToolChange,
    onBrushSizeChange,
    onPaintCell,
    onClearMask,
    onApply,
    onCancel
}) => {
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    if (!isVisible) return null;

    const beginDrawing = (rowIndex: number, colIndex: number) => {
        setIsDrawing(true);
        onPaintCell(rowIndex, colIndex);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
    };

    const handleCellEnter = (rowIndex: number, colIndex: number) => {
        if (!isDrawing) return;
        onPaintCell(rowIndex, colIndex);
    };

    const handleToolChange = (tool: MaskTool) => {
        onToolChange(tool);
    };

    const handleBrushSizeClick = (size: number) => {
        onBrushSizeChange(size);
    };

    const rowsCount = maskGrid.length;
    const columnsCount = maskGrid[0]?.length ?? 0;

    return (
        <div className={styles.overlay}>
            <div
                className={styles.gridArea}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
            >
                <div
                    className={styles.maskGrid}
                    style={{
                        gridTemplateColumns: `repeat(${columnsCount}, 1fr)`,
                        gridTemplateRows: `repeat(${rowsCount}, 1fr)`
                    }}
                >
                    {maskGrid.map((row, rowIndex) =>
                        row.map((cell, colIndex) => (
                            <button
                                key={`cell-${rowIndex}-${colIndex}`}
                                className={`${styles.maskCell} ${cell ? styles.maskCellActive : ''}`}
                                onPointerDown={event => {
                                    event.preventDefault();
                                    beginDrawing(rowIndex, colIndex);
                                }}
                                onPointerEnter={() => handleCellEnter(rowIndex, colIndex)}
                                aria-pressed={cell === 1}
                                aria-label={`Ячейка ${rowIndex + 1}x${colIndex + 1}`}
                            />
                        ))
                    )}
                </div>
                <button
                    className={styles.closeOverlayButton}
                    onClick={onCancel}
                    aria-label="Закрыть маску"
                >
                    ×
                </button>
                <button
                    className={styles.settingsFab}
                    onClick={() => setIsSettingsOpen(true)}
                    aria-label="Настройки маски"
                >
                    <Icons.Settings />
                </button>
            </div>

            {isSettingsOpen && (
                <div
                    className={styles.modalBackdrop}
                    role="dialog"
                    aria-modal="true"
                >
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h3>Зона поиска движения</h3>
                            </div>
                            <button
                                className={styles.modalCloseButton}
                                onClick={() => setIsSettingsOpen(false)}
                                aria-label="Закрыть настройки"
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.controlGroup}>
                            <span className={styles.controlLabel}>Инструмент</span>
                            <div className={styles.iconToggles}>
                                <button
                                    className={`${styles.iconButton} ${
                                        activeTool === 'brush' ? styles.iconButtonActive : ''
                                    }`}
                                    onClick={() => handleToolChange('brush')}
                                    aria-pressed={activeTool === 'brush'}
                                    aria-label="Кисть"
                                >
                                    <div>🖌️ Кисть</div>
                                </button>
                                <button
                                    className={`${styles.iconButton} ${
                                        activeTool === 'eraser' ? styles.iconButtonActive : ''
                                    }`}
                                    onClick={() => handleToolChange('eraser')}
                                    aria-pressed={activeTool === 'eraser'}
                                    aria-label="Ластик"
                                >
                                    <div>🧹 Ластик</div>
                                </button>
                            </div>
                        </div>

                        <div className={styles.controlGroup}>
                            <span className={styles.controlLabel}>Размер кисти</span>
                            <div className={styles.sizeChips}>
                                {BRUSH_SIZES.map(size => (
                                    <button
                                        key={size}
                                        className={`${styles.sizeChip} ${
                                            brushSize === size ? styles.sizeChipActive : ''
                                        }`}
                                        onClick={() => handleBrushSizeClick(size)}
                                        aria-pressed={brushSize === size}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            className={styles.clearButton}
                            onClick={onClearMask}
                        >
                            Очистить сетку
                        </button>

                        <div className={styles.modalFooter}>
                            <span className={styles.resolution}>
                                {columnsCount} × {rowsCount}
                            </span>
                            <div className={styles.actionButtons}>
                                <button
                                    className={styles.secondaryButton}
                                    onClick={() => setIsSettingsOpen(false)}
                                >
                                    Закрыть
                                </button>
                                <button
                                    className={styles.primaryButton}
                                    onClick={onApply}
                                >
                                    Применить
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
