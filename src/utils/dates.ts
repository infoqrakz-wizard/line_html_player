import {format, fromUnixTime, parse, isValid, addDays, addMinutes, addSeconds} from 'date-fns';

export const formatDate = (date: Date = new Date(), formatString: string = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"): string => {
    return format(date, formatString);
};

export const parseTimestamp = (value: number): Date => {
    return fromUnixTime(value);
};

export const isValidTimestamp = (timestamp: number): boolean => {
    const date = fromUnixTime(timestamp);
    return date.toString() !== 'Invalid Date';
};

export const parseDate = (value: string, format: string = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"): Date => {
    return parse(value, format, new Date());
};

export const addDaysToDate = (date: Date, days: number): Date => {
    return addDays(date, days);
};

export const addMinutesToDate = (date: Date, minutes: number): Date => {
    return addMinutes(date, minutes);
};

export const addSecondsToDate = (date: Date, seconds: number): Date => {
    return addSeconds(date, seconds);
};

export {isValid};
