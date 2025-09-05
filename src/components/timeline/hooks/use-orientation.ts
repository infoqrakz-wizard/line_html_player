import {useEffect, useState} from 'react';
import {detect} from 'un-detector';

function checkIsMobileDevice() {
    const detected = detect(window.navigator.userAgent);

    // Проверяем различные мобильные устройства
    return {
        isMobile: detected.is.mobile,
        isIos: detected.is.iOS
    };
}

function getOrientation() {
    if (typeof window === 'undefined') return 'portrait'; // SSR fallback

    // 1. Современный API
    if (screen.orientation && screen.orientation.type) {
        if (screen.orientation.type.startsWith('portrait')) return 'portrait';
        if (screen.orientation.type.startsWith('landscape')) return 'landscape';
    }

    // 2. MatchMedia
    if (window.matchMedia('(orientation: portrait)').matches) return 'portrait';
    if (window.matchMedia('(orientation: landscape)').matches) return 'landscape';

    // 3. Fallback через размеры
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

export function useOrientation() {
    const [orientation, setOrientation] = useState(getOrientation);
    const [isMobileDevice, setIsMobileDevice] = useState(false);
    const [isIos, setIsIos] = useState(false);

    useEffect(() => {
        // Определяем мобильное устройство
        const mobileStatus = checkIsMobileDevice();
        console.log('useOrientation - mobile detection result:', mobileStatus);
        setIsMobileDevice(mobileStatus.isMobile);
        setIsIos(mobileStatus.isIos);

        const update = () => {
            const newOrientation = getOrientation();
            console.log('useOrientation - orientation changed to:', newOrientation);
            setOrientation(newOrientation);
        };

        // Новый API
        if (screen.orientation && screen.orientation.addEventListener) {
            screen.orientation.addEventListener('change', update);
        }

        // Fallback через resize
        window.addEventListener('resize', update);

        return () => {
            if (screen.orientation && screen.orientation.removeEventListener) {
                screen.orientation.removeEventListener('change', update);
            }
            window.removeEventListener('resize', update);
        };
    }, []);

    return {
        orientation, // "portrait" или "landscape"
        isMobile: isMobileDevice,
        isIos
    };
}
