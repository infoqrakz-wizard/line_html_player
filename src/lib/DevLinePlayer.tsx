import React from 'react';
import {createRoot} from 'react-dom/client';
import {Mode} from '../utils/types';
import {Player} from '../components/player';
import {TimeProvider} from '../context/time-context';

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
    rpcUrl: string;
    rpcPort: number;
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
            rpcUrl: '',
            mode: Mode.Live,
            muted: true,
            rpcPort: 80
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
        // Значения по умолчанию: rpcUrl/rpcPort берутся из streamUrl/streamPort, если не заданы
        this.options = options;
        this.options.rpcPort = options.streamPort;
        this.options.rpcUrl = options.streamUrl;
        this.root = createRoot(this.container);
        this.render();
    }

    private render() {
        this.root.render(
            <React.StrictMode>
                <TimeProvider>
                    <Player {...this.options} />
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
