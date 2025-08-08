import {useState, useRef, useEffect} from 'react';

import DatePicker, {registerLocale} from 'react-datepicker';
import '@/styles/datepicker-custom.scss';

import {ru} from 'date-fns/locale/ru';
registerLocale('ru', ru);

import styles from './save-stream-modal.module.scss';
import {addMinutesToDate} from '@/utils/dates';
import {Icons} from '../../../icons';

interface SaveStreamProps {
    isOpen: boolean;
    onClose: () => void;
    onFinish?: (start: Date, finish: Date) => void;
    currentTime: Date;
}

export const SaveStreamModal: React.FC<SaveStreamProps> = ({isOpen, onClose, onFinish, currentTime}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const [startDate, setStartDate] = useState(addMinutesToDate(currentTime, -2));
    const [endDate, setEndDate] = useState(addMinutesToDate(currentTime, 2));

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
                        dateFormat="dd.MM.yyyy HH:mm"
                        showTimeCaption={false}
                        onChange={date => onChangeStart(date)}
                        popperClassName={styles.datePickerPopper}
                        calendarClassName={styles.datePickerCalendar}
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
                        dateFormat="dd.MM.yyyy HH:mm"
                        showTimeCaption={false}
                        onChange={date => onChangeEnd(date)}
                        popperClassName={styles.datePickerPopper}
                        calendarClassName={styles.datePickerCalendar}
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
