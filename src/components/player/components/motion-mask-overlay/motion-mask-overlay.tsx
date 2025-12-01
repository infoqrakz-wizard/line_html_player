import React, {useState, useRef} from 'react';

import styles from './motion-mask-overlay.module.scss';

interface MotionMaskOverlayProps {
    isVisible: boolean;
    maskGrid: number[][];
    onToggleCell: (rowIndex: number, colIndex: number) => void;
    onApply: () => void;
}

export const MotionMaskOverlay: React.FC<MotionMaskOverlayProps> = ({isVisible, maskGrid, onToggleCell, onApply}) => {
    const [isDrawing, setIsDrawing] = useState(false);
    // Запоминаем целевое состояние ячеек (0 или 1) для текущей сессии рисования
    const targetStateRef = useRef<0 | 1 | null>(null);
    // Отслеживаем ячейки, которые уже были обработаны в текущей сессии
    const processedCellsRef = useRef<Set<string>>(new Set());

    if (!isVisible) return null;

    const beginDrawing = (rowIndex: number, colIndex: number) => {
        setIsDrawing(true);
        // Очищаем список обработанных ячеек для новой сессии
        processedCellsRef.current.clear();

        // Определяем текущее состояние ячейки и запоминаем противоположное (целевое)
        const currentState = maskGrid[rowIndex][colIndex];
        const targetState: 0 | 1 = currentState === 1 ? 0 : 1;
        targetStateRef.current = targetState;

        // Добавляем текущую ячейку в список обработанных и переключаем ее
        const cellKey = `${rowIndex}-${colIndex}`;
        processedCellsRef.current.add(cellKey);
        onToggleCell(rowIndex, colIndex);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        // Очищаем состояние при окончании рисования
        targetStateRef.current = null;
        processedCellsRef.current.clear();
    };

    const handleCellEnter = (rowIndex: number, colIndex: number) => {
        if (!isDrawing || targetStateRef.current === null) return;

        const cellKey = `${rowIndex}-${colIndex}`;
        // Пропускаем ячейку, если она уже была обработана в этой сессии
        if (processedCellsRef.current.has(cellKey)) return;

        const currentState = maskGrid[rowIndex][colIndex];
        // Переключаем ячейку только если она не в целевом состоянии
        if (currentState !== targetStateRef.current) {
            processedCellsRef.current.add(cellKey);
            onToggleCell(rowIndex, colIndex);
        }
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
                <div className={styles.title}>Выберите зоны для поиска событий</div>
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
                    className={styles.actionButton}
                    onClick={onApply}
                    aria-label="Применить фильтр"
                >
                    ОК
                </button>
            </div>
        </div>
    );
};
