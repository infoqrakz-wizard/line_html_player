import {useState, useRef, useEffect, useMemo} from 'react';

import DatePicker, {registerLocale} from 'react-datepicker';
import '../../../../styles/datepicker-custom.scss';

import {ru} from 'date-fns/locale/ru';
import {addMonths, format, startOfDay, startOfMonth} from 'date-fns';
registerLocale('ru', ru);

import styles from './save-stream-modal.module.scss';
import {addMinutesToDate} from '../../../../utils/dates';
import {getFramesTimeline} from '../../../../utils/api';
import {useTimelineAuth} from '../../../../context/timeline-auth-context';
import {Protocol} from '../../../../utils/types';

interface SaveStreamProps {
    isOpen: boolean;
    onClose: () => void;
    onFinish?: (start: Date, finish: Date) => void;
    currentTime: Date;
    url?: string;
    port?: number;
    credentials?: string;
    camera?: number;
    protocol?: Protocol;
}

export const SaveStreamModal: React.FC<SaveStreamProps> = ({
    isOpen,
    onClose,
    onFinish,
    currentTime,
    url,
    port,
    credentials,
    camera,
    protocol
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const [startDate, setStartDate] = useState(addMinutesToDate(currentTime, -2));
    const [endDate, setEndDate] = useState(addMinutesToDate(currentTime, 2));

    const {hasTimelineAccess, setTimelineAccess} = useTimelineAuth();
    const [highlightedDates, setHighlightedDates] = useState<Date[]>([]);
    const loadedMonths = useRef<Set<string>>(new Set());

    const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
    const monthKey = (d: Date) => format(d, 'yyyy-MM');

    const allowedDayKeys = useMemo(() => new Set(highlightedDates.map(dayKey)), [highlightedDates]);

    const fetchMonthAvailability = async (viewDate: Date) => {
        if (!url || !port || !credentials || !hasTimelineAccess) return;

        const currentMonthKey = monthKey(viewDate);
        const previousMonthKey = monthKey(addMonths(viewDate, -1));

        if (loadedMonths.current.has(currentMonthKey) && loadedMonths.current.has(previousMonthKey)) return;

        const monthsToLoad: Array<{key: string; start: Date; end: Date}> = [];

        if (!loadedMonths.current.has(currentMonthKey)) {
            monthsToLoad.push({
                key: currentMonthKey,
                start: startOfMonth(viewDate),
                end: startOfMonth(addMonths(viewDate, 1))
            });
        }

        if (!loadedMonths.current.has(previousMonthKey)) {
            monthsToLoad.push({
                key: previousMonthKey,
                start: startOfMonth(addMonths(viewDate, -1)),
                end: startOfMonth(viewDate)
            });
        }

        for (const month of monthsToLoad) {
            try {
                const result = await getFramesTimeline({
                    url,
                    port,
                    credentials,
                    startTime: startOfDay(month.start),
                    endTime: startOfDay(month.end),
                    unitLength: 86400,
                    channel: camera,
                    protocol
                });

                const days: Date[] = [];
                const totalDays = result.timeline.length;
                for (let i = 0; i < totalDays; i += 1) {
                    if (result.timeline[i] > 0) {
                        const d = new Date(month.start);
                        d.setDate(month.start.getDate() + i);
                        days.push(d);
                    }
                }

                setHighlightedDates(prev => {
                    const map = new Map<string, Date>();
                    for (const d of prev) map.set(dayKey(d), d);
                    for (const d of days) map.set(dayKey(d), d);
                    return Array.from(map.values()).sort((a, b) => a.getTime() - b.getTime());
                });

                loadedMonths.current.add(month.key);
            } catch (e) {
                if (e instanceof Error && e.message === 'FORBIDDEN') {
                    setTimelineAccess(false);
                    return;
                }
            }
        }
    };

    const handleCalendarOpen = () => {
        void fetchMonthAvailability(startDate);
    };

    const handleMonthChange = (date: Date) => {
        void fetchMonthAvailability(date);
    };

    // Обработка клика вне модального окна для его закрытия
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Обработка нажатия клавиши Escape для закрытия модального окна
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscapeKey);
        }

        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [isOpen, onClose]);

    const onChangeStart = (date: Date | null) => {
        if (!date) return;
        setStartDate(date);
    };

    const onChangeEnd = (date: Date | null) => {
        if (!date) return;
        setEndDate(date);
    };

    const onSave = () => {
        if (onFinish) {
            onFinish(startDate, endDate);
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay}>
            <div
                className={styles.modal}
                ref={modalRef}
            >
                <button
                    className={styles.close}
                    onClick={onClose}
                >
                    &times;
                </button>

                <div>
                    <h3 className={styles.mb1}>Начало периода</h3>
                    <DatePicker
                        selected={startDate}
                        locale={ru}
                        showTimeSelect
                        timeIntervals={10}
                        dateFormat="dd.MM.yyyy HH:mm:ss"
                        showTimeCaption={false}
                        onChange={date => onChangeStart(date)}
                        popperClassName={styles.datePickerPopper}
                        calendarClassName={styles.datePickerCalendar}
                        highlightDates={highlightedDates.length ? [{'highlighted-date': highlightedDates}] : undefined}
                        filterDate={date => allowedDayKeys.size === 0 || allowedDayKeys.has(dayKey(date))}
                        onCalendarOpen={handleCalendarOpen}
                        onMonthChange={handleMonthChange}
                        customInput={
                            <input
                                type="text"
                                className={styles.datePickerInput}
                            />
                        }
                    />
                </div>

                <div className={styles.mt2}>
                    <h3 className={styles.mb1}>Окончание периода</h3>
                    <DatePicker
                        selected={endDate}
                        locale={ru}
                        showTimeSelect
                        timeIntervals={10}
                        dateFormat="dd.MM.yyyy HH:mm:ss"
                        showTimeCaption={false}
                        onChange={date => onChangeEnd(date)}
                        popperClassName={styles.datePickerPopper}
                        calendarClassName={styles.datePickerCalendar}
                        highlightDates={highlightedDates.length ? [{'highlighted-date': highlightedDates}] : undefined}
                        filterDate={date => allowedDayKeys.size === 0 || allowedDayKeys.has(dayKey(date))}
                        onCalendarOpen={handleCalendarOpen}
                        onMonthChange={handleMonthChange}
                        customInput={
                            <input
                                type="text"
                                className={styles.datePickerInput}
                            />
                        }
                    />
                </div>

                <button
                    className={styles.saveBtn}
                    onClick={onSave}
                >
                    Сохранить
                </button>
            </div>
        </div>
    );
};
