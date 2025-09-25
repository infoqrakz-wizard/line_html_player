import {getProtocol} from './url-params';
import {differenceInSeconds, format} from 'date-fns';
import {Protocol} from './types';
import {getAuthToken} from './getAuthToken';
import {buildRequestUrl} from './url-builder';

export interface CameraInfo {
    id: number;
    uri: string;
    name?: string;
    width?: number;
    height?: number;
    imageUri?: string;
    streamingUri?: string;
}

interface GetFramesTimelineParams {
    url: string;
    port: number;
    credentials: string;
    startTime: Date;
    endTime: Date;
    unitLength: number;
    channel?: number;
    stream?: string;
    protocol?: Protocol;
    proxy?: string;
}

interface TimelineResponse {
    timeline: number[];
}

export const getFramesTimeline = async (params: GetFramesTimelineParams): Promise<TimelineResponse> => {
    const {url, port, credentials, startTime, endTime, unitLength, channel, stream, proxy} = params;
    const preferredProtocol = params.protocol ?? getProtocol();

    const requestParams = {
        start_time: [
            startTime.getFullYear(),
            startTime.getMonth() + 1,
            startTime.getDate(),
            startTime.getHours(),
            startTime.getMinutes(),
            startTime.getSeconds()
        ],
        end_time: [
            endTime.getFullYear(),
            endTime.getMonth() + 1,
            endTime.getDate(),
            endTime.getHours(),
            endTime.getMinutes(),
            endTime.getSeconds()
        ],
        unit_len: unitLength,
        ...(channel !== undefined && {channel}),
        ...(stream !== undefined && {stream})
    };

    try {
        const rpcUrl = buildRequestUrl({
            host: url,
            port,
            protocol: preferredProtocol,
            proxy,
            path: proxy ? '/rpc' : `/rpc?authorization=Basic ${getAuthToken(credentials)}&content-type=application/json`
        });

        const headers: HeadersInit = {};

        // Если используется прокси, передаем через заголовки
        if (proxy) {
            headers['Content-Type'] = 'application/json';
            headers['Authorization'] = `Basic ${getAuthToken(credentials)}`;
        }

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({method: 'archive.get_frames_timeline', params: requestParams, version: 13})
        });

        if (!response.ok) {
            throw new Error('Failed to fetch timeline data');
        }

        const data = await response.json();

        // Проверяем наличие ошибки авторизации
        if (data.error && data.error.type === 'auth' && data.error.message === 'forbidden') {
            throw new Error('FORBIDDEN');
        }

        return data.result;
    } catch (error) {
        if (error instanceof Error && error.message === 'FORBIDDEN') {
            throw error;
        }
        throw new Error('Failed to fetch timeline data');
    }
};

interface UrlForDownloadParams {
    url: string;
    start: Date;
    end: Date;
    fileName?: string;
    audio?: boolean;
}

export const formatUrlForDownload = (params: UrlForDownloadParams) => {
    const diff = differenceInSeconds(params.end, params.start);

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff - hours * 3600) / 60);
    const seconds = Math.floor((diff - hours * 3600 - minutes * 60) % 60);

    const downloadUrl = `${params.url}&time=${format(params.start, "yyyy-MM-dd'T'HH:mm:ss")}&duration=${hours}:${minutes}:${seconds}&download=1&audio=${params?.audio ? 1 : 0}&filename=${params?.fileName ? params.fileName : 'video.mp4'}`;
    return downloadUrl;
};

export const getServerTime = async (
    url: string,
    port: number,
    credentials: string,
    protocol?: Protocol,
    proxy?: string
): Promise<Date> => {
    try {
        const rpcUrl = buildRequestUrl({
            host: url,
            port,
            protocol: protocol ?? getProtocol(),
            proxy,
            path: proxy ? '/rpc' : `/rpc?authorization=Basic ${getAuthToken(credentials)}&content-type=application/json`
        });

        const headers: HeadersInit = {};

        // Если используется прокси, передаем через заголовки
        if (proxy) {
            headers['Content-Type'] = 'application/json';
            headers['Authorization'] = `Basic ${getAuthToken(credentials)}`;
        }

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({method: 'get_server_info', version: 12})
        });

        if (!response.ok) {
            throw new Error('Failed to fetch server time');
        }

        const data = await response.json();
        const localTime = data.result.info.local_time;

        if (Array.isArray(localTime) && localTime.length >= 7) {
            // local_time format: [year, month, day, hour, minute, second, millisecond]
            // Note: JavaScript months are 0-indexed, but the API returns 1-indexed months
            const [year, month, day, hour, minute, second, millisecond] = localTime;
            const serverDate = new Date(year, month - 1, day, hour, minute, second, millisecond);
            return serverDate;
        } else {
            throw new Error('Invalid server time format');
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid server time format')) {
            throw error;
        }
        throw new Error('Failed to fetch server time');
    }
};

interface CameraStateResponse {
    result: {
        state: {
            video_streams: {video: {codec: string}};
            audio_streams: {audio: {signal: string}};
        };
    };
}

export const getCameraState = async (
    url: string,
    port: number,
    credentials: string,
    camera: number,
    protocol?: Protocol,
    proxy?: string
): Promise<CameraStateResponse> => {
    try {
        const rpcUrl = buildRequestUrl({
            host: url,
            port,
            protocol: protocol ?? getProtocol(),
            proxy,
            path: proxy ? '/rpc' : `/rpc?authorization=Basic ${getAuthToken(credentials)}&content-type=application/json`
        });

        const headers: HeadersInit = {};

        // Если используется прокси, передаем через заголовки
        if (proxy) {
            headers['Content-Type'] = 'application/json';
            headers['Authorization'] = `Basic ${getAuthToken(credentials)}`;
        }

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({method: 'get_camera_state', params: {camera: String(camera)}, version: 13})
        });

        if (!response.ok) {
            throw new Error('Failed to fetch camera state');
        }

        const data = (await response.json()) as CameraStateResponse;
        return data;
    } catch (error) {
        throw new Error('Failed to fetch camera state');
    }
};

/**
 * Запрашивает список камер и парсит XML-ответ
 */
export const getCamerasList = (
    url: string,
    port: number,
    credentials: string,
    timeoutMs: number = 5000,
    protocol?: Protocol,
    proxy?: string
): Promise<CameraInfo[]> => {
    return new Promise(async (resolve, reject) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const requestUrl = buildRequestUrl({
                host: url,
                port,
                protocol: protocol ?? getProtocol(),
                proxy,
                path: `/cameras?authorization=Basic%20${getAuthToken(credentials)}`
            });

            const res = await fetch(requestUrl, {method: 'GET', signal: controller.signal});
            clearTimeout(timeoutId);

            if (res.status === 401) {
                reject(new Error('FORBIDDEN'));
                return;
            }

            if (!res.ok) {
                reject(new Error(`Failed to fetch cameras: ${res.status}`));
                return;
            }

            const text = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'application/xml');

            const parserError = doc.getElementsByTagName('parsererror')[0];
            if (parserError) {
                reject(new Error('Failed to parse cameras XML'));
                return;
            }

            const cameraNodes = Array.from(doc.getElementsByTagName('camera'));
            const cameras: CameraInfo[] = cameraNodes.map(node => {
                const getText = (tag: string) => node.getElementsByTagName(tag)[0]?.textContent ?? undefined;
                const uri = getText('uri') ?? '';
                const idStr = uri.split('/').filter(Boolean).pop() ?? '0';
                const id = Number.parseInt(idStr, 10);
                const width = Number.parseInt(getText('width') ?? '', 10);
                const height = Number.parseInt(getText('height') ?? '', 10);

                return {
                    id: Number.isNaN(id) ? 0 : id,
                    uri,
                    name: getText('name') ?? undefined,
                    width: Number.isNaN(width) ? undefined : width,
                    height: Number.isNaN(height) ? undefined : height,
                    imageUri: getText('image-uri') ?? undefined,
                    streamingUri: getText('streaming-uri') ?? undefined
                } as CameraInfo;
            });

            resolve(cameras);
        } catch (err) {
            if ((err as Error).name === 'AbortError') {
                reject(new Error('Failed to fetch cameras: timeout'));
                return;
            }
            reject(new Error('Failed to fetch cameras'));
        }
    });
};
