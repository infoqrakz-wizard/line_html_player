import React, {createContext, useContext, useState, ReactNode} from 'react';

interface TimelineAuthContextType {
    hasTimelineAccess: boolean;
    setTimelineAccess: (hasAccess: boolean) => void;
}

const TimelineAuthContext = createContext<TimelineAuthContextType | undefined>(undefined);

interface TimelineAuthProviderProps {
    children: ReactNode;
}

export const TimelineAuthProvider: React.FC<TimelineAuthProviderProps> = ({children}) => {
    const [hasTimelineAccess, setHasTimelineAccess] = useState(true); // По умолчанию разрешаем доступ

    const setTimelineAccess = (hasAccess: boolean) => {
        setHasTimelineAccess(hasAccess);
    };

    return (
        <TimelineAuthContext.Provider value={{hasTimelineAccess, setTimelineAccess}}>
            {children}
        </TimelineAuthContext.Provider>
    );
};

export const useTimelineAuth = (): TimelineAuthContextType => {
    const context = useContext(TimelineAuthContext);
    if (context === undefined) {
        throw new Error('useTimelineAuth must be used within a TimelineAuthProvider');
    }
    return context;
};
