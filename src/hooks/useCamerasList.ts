import {useState, useEffect} from 'react';
import {getCamerasList, CameraInfo} from '../utils/api';
import {Protocol} from '../utils/types';

interface ServerConfig {
    streamUrl: string;
    streamPort: number;
    login: string;
    password: string;
    protocol: Protocol;
    proxy?: string;
}

interface UseCamerasListReturn {
    cameras: CameraInfo[];
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

export const useCamerasList = (): UseCamerasListReturn => {
    const [cameras, setCameras] = useState<CameraInfo[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCameras = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Получаем конфигурацию сервера из HTML
            const configElement = document.getElementById('server-config');
            if (!configElement) {
                throw new Error('Server configuration not found');
            }

            const config: ServerConfig = JSON.parse(configElement.textContent || '{}');

            if (!config.streamUrl || !config.streamPort || !config.login) {
                throw new Error('Invalid server configuration');
            }

            const credentials = `${config.login}:${config.password || ''}`;
            const protocol = config.protocol === 'https' ? Protocol.Https : Protocol.Http;

            const camerasList = await getCamerasList(
                config.streamUrl,
                config.streamPort,
                credentials,
                5000,
                protocol,
                config.proxy
            );

            setCameras(camerasList);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to fetch cameras';
            setError(errorMessage);
            console.error('Error fetching cameras:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCameras();
    }, []);

    const refetch = () => {
        fetchCameras();
    };

    return {
        cameras,
        isLoading,
        error,
        refetch
    };
};
