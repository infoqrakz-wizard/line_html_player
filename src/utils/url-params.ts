import {isValidTimestamp, parseDate, isValid, parseTimestamp, addDaysToDate} from './dates';
import {Protocol} from './types';

export interface PlayerParams {
    mode: string;
    stream: string;
    // channel: string;
    start: Date;
    end: Date;
    muted: boolean;
    autoplay: boolean;
}

const parseTimeParam = (value: string | null): Date => {
    if (!value) {
        return addDaysToDate(new Date(), -1);
    }

    // Try parsing as date string (supports formats: ISO, DD.MM.YYYY HH:mm:ss)
    const dateFormats = ["yyyy-MM-dd'T'HH:mm:ss", 'dd.MM.yyyy HH:mm:ss'];

    for (const format of dateFormats) {
        const date = parseDate(value, format);
        if (isValid(date)) {
            return date;
        }
    }

    // Try parsing as timestamp
    const timestamp = parseInt(value);
    if (!isNaN(timestamp) && isValidTimestamp(timestamp)) {
        return parseTimestamp(timestamp);
    }

    throw new Error(`Invalid time format: ${value}`);
};

const parseBooleanParam = (value: string | null, defaultValue: boolean): boolean => {
    if (value === null) return defaultValue;
    return value === '1' || value.toLowerCase() === 'true';
};

export const parseUrlParams = (): PlayerParams => {
    const urlParams = new URLSearchParams(window.location.search);

    const mode = urlParams.get('mode');
    const stream = urlParams.get('stream');
    // const channel = urlParams.get('channel');

    if (!mode) {
        throw new Error('Required parameters are missing: mode');
    }

    if (!stream) {
        throw new Error('Required parameters are missing: stream');
    }

    const start = parseTimeParam(urlParams.get('start'));
    const end = parseTimeParam(urlParams.get('end'));
    // const endParam = urlParams.get('end');

    // const end = endParam ? parseTimeParam(endParam) : addDaysToDate(start, 1);

    // if (end <= start) {
    //     throw new Error('End time must be greater than start time');
    // }

    return {
        mode,
        stream,
        // channel,
        start,
        end,
        muted: parseBooleanParam(urlParams.get('muted'), false),
        autoplay: parseBooleanParam(urlParams.get('autoplay'), false)
    };
};

export const clickA = (link: string) => {
    const a = document.createElement('a');
    a.href = link;
    a.style.display = 'none'; // Скрываем элемент
    document.body.appendChild(a); // Добавляем в DOM для корректной работы в некоторых браузерах
    a.click();

    // Удаляем элемент после клика
    setTimeout(() => {
        document.body.removeChild(a);
    }, 1000); // Небольшая задержка для завершения загрузки
};

export const getProtocol = (): Protocol => {
    return window.location.protocol.includes('https') ? Protocol.Https : Protocol.Http;
};

// Функция для создания URL для скачивания
export const formatUrlForDownload = ({
    url,
    start,
    end,
    fileName,
    audio
}: {
    url: string;
    start: Date;
    end: Date;
    fileName: string;
    audio?: boolean;
}) => {
    const startTimestamp = Math.floor(start.getTime() / 1000);
    const endTimestamp = Math.floor(end.getTime() / 1000);
    return `${url}&start=${startTimestamp}&end=${endTimestamp}${audio ? '&audio=1' : ''}&filename=${encodeURIComponent(fileName)}.mp4`;
};
