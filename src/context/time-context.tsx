import React, {createContext, useCallback, useContext, useState} from 'react';

export interface TimeContextValue {
    skipCenterTimeline: boolean;
    serverTime: Date | null;
    progress: number; // seconds elapsed since serverTime
    setServerTime: (date: Date | null, skipCenterTimeline?: boolean) => void;
    setProgress: (seconds: number) => void;
}

const TimeContext = createContext<TimeContextValue | undefined>(undefined);

export const TimeProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const [serverTime, setServerTimeState] = useState<Date | null>(null);
    const [progress, setProgressState] = useState<number>(0);
    const [skipCenterTimeline, setSkipCenterTimeline] = useState<boolean>(false);

    const setServerTime = useCallback((date: Date | null, skipCenterTimeline?: boolean) => {
        setServerTimeState(date);
        // сбрасываем progress при смене базового времени
        console.log('call setProgressState(0)');
        setProgressState(0);
        setSkipCenterTimeline(skipCenterTimeline || false);
    }, []);

    const setProgress = useCallback((seconds: number) => {
        setSkipCenterTimeline(true);
        console.log('call setProgressState(seconds)', seconds);

        setProgressState(seconds);
    }, []);

    return (
        <TimeContext.Provider value={{skipCenterTimeline, serverTime, progress, setServerTime, setProgress}}>
            {children}
        </TimeContext.Provider>
    );
};

export const useTime = (): TimeContextValue => {
    const ctx = useContext(TimeContext);
    if (!ctx) throw new Error('useTime must be used within TimeProvider');
    return ctx;
};
