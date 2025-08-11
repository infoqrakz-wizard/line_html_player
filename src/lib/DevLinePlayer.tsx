import React from 'react';
import {createRoot} from 'react-dom/client';
import {Mode, Protocol} from '../utils/types';
import {Player} from '../components/player';
import {TimeProvider} from '../context/time-context';
import {TimelineAuthProvider} from '../context/timeline-auth-context';

import '../styles/global.scss';

interface DevLinePlayerOptions {
    mode?: Mode;
    autoplay?: boolean;
    muted?: boolean;
    streamUrl: string;
    streamPort: number;
    camera: number;
    login: string;
    password?: string;
    protocol?: Protocol;
}

class DevLinePlayer {
    private container: HTMLElement;
    private root: ReturnType<typeof createRoot>;
    private options: DevLinePlayerOptions;

    constructor(
        container: string | HTMLElement,
        options: DevLinePlayerOptions = {
            streamUrl: '',
            streamPort: 80,
            camera: 0,
            login: '',
            password: '',
            mode: Mode.Live,
            muted: true,
            protocol: Protocol.Http
        }
    ) {
        if (typeof container === 'string') {
            const element = document.querySelector(container);
            if (!element) {
                throw new Error(`Container element ${container} not found`);
            }
            this.container = element as HTMLElement;
        } else {
            this.container = container;
        }

        if (!options.streamUrl) throw new Error('streamUrl is required');
        this.options = options;
        this.root = createRoot(this.container);
        this.render();
    }

    private render() {
        this.root.render(
            <React.StrictMode>
                <TimeProvider>
                    <TimelineAuthProvider>
                        <Player {...this.options} />
                    </TimelineAuthProvider>
                </TimeProvider>
            </React.StrictMode>
        );
    }

    // Публичные методы для управления плеером
    destroy() {
        this.root.unmount();
    }
}

// Экспортируем как ES модуль (для импорта в другие модули)
export default DevLinePlayer;

// Расширяем глобальный интерфейс Window и экспортируем в глобальное пространство имен для UMD
declare global {
    interface Window {
        DevLinePlayer: typeof DevLinePlayer;
    }
}

if (typeof window !== 'undefined') {
    window.DevLinePlayer = DevLinePlayer;
}
