import React, {useState} from 'react';
import {Player} from '../components/player';
import {TimeProvider} from '../context/time-context';
import {Mode, Protocol} from '../utils/types';

import './DebugPlayer.scss';

/**
 * Компонент для отладки Player
 * Позволяет настраивать параметры плеера и тестировать его функциональность
 */
const DebugPlayer: React.FC = () => {
    // Состояние для параметров плеера
    const [params, setParams] = useState({
        streamUrl: 'lc56.loc.devline.tv',
        streamPort: 2376,
        login: 'yandex',
        password: 'NLAWyYrH08nVTVthqsKk',
        rpcUrl: 'lc56.loc.devline.tv',
        rpcPort: 2376,
        mode: Mode.Live,
        muted: true,
        camera: 0,
        protocol: Protocol.Http
    });

    // Обработчик изменения параметров
    const handleParamChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const {name, value, type} = e.target as HTMLInputElement;

        let parsedValue: string | number | boolean = value;
        if (type === 'checkbox') {
            parsedValue = (e.target as HTMLInputElement).checked;
        } else if (type === 'number') {
            parsedValue = parseInt(value, 10);
        }

        setParams(prev => ({
            ...prev,
            [name]: parsedValue
        }));
    };

    // Обработчик отправки формы
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Форма уже изменяет состояние на лету, поэтому здесь ничего не делаем
        console.log('Применены параметры:', params);
    };

    return (
        <div className="debug-container">
            <h1>DevLine Player - Отладка</h1>

            <div className="debug-layout">
                <div className="debug-panel">
                    <h2 className="title">Параметры</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="protocol">Protocol:</label>
                            <select
                                id="protocol"
                                name="protocol"
                                value={params.protocol}
                                onChange={handleParamChange}
                            >
                                <option value={Protocol.Http}>http</option>
                                <option value={Protocol.Https}>https</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="streamUrl">Stream URL:</label>
                            <input
                                type="text"
                                id="streamUrl"
                                name="streamUrl"
                                value={params.streamUrl}
                                onChange={handleParamChange}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="streamPort">Stream Port:</label>
                            <input
                                type="number"
                                id="streamPort"
                                name="streamPort"
                                value={params.streamPort}
                                onChange={handleParamChange}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="camera">Stream ID:</label>
                            <input
                                type="number"
                                id="camera"
                                name="camera"
                                value={params.camera}
                                onChange={handleParamChange}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="login">Login:</label>
                            <input
                                type="text"
                                id="login"
                                name="login"
                                value={params.login}
                                onChange={handleParamChange}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password:</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                value={params.password}
                                onChange={handleParamChange}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="rpcUrl">RPC URL:</label>
                            <input
                                type="text"
                                id="rpcUrl"
                                name="rpcUrl"
                                value={params.rpcUrl}
                                onChange={handleParamChange}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="mode">Mode:</label>
                            <select
                                id="mode"
                                name="mode"
                                value={params.mode}
                                onChange={handleParamChange}
                            >
                                <option value={Mode.Record}>Record</option>
                                <option value={Mode.Live}>Live</option>
                            </select>
                        </div>

                        <div className="form-group checkbox">
                            <label htmlFor="muted">
                                <input
                                    type="checkbox"
                                    id="muted"
                                    name="muted"
                                    checked={params.muted}
                                    onChange={handleParamChange}
                                />
                                Muted
                            </label>
                        </div>

                        <button
                            type="submit"
                            className="apply-button"
                        >
                            Применить
                        </button>
                    </form>
                </div>

                <div className="player-container">
                    <h2 className="title">Плеер</h2>
                    <div className="player-wrapper">
                        <TimeProvider>
                            <Player {...params} />
                        </TimeProvider>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DebugPlayer;
