import {getProtocol} from './url-params';
import {differenceInSeconds, format} from 'date-fns';

interface GetFramesTimelineParams {
    url: string;
    port: number;
    credentials: string;
    startTime: Date;
    endTime: Date;
    unitLength: number;
    channel?: number;
    stream?: string;
}

interface TimelineResponse {
    timeline: number[];
}

export const getFramesTimeline = (params: GetFramesTimelineParams): Promise<TimelineResponse> => {
    const {url, port, credentials, startTime, endTime, unitLength, channel, stream} = params;

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

    //const credentials = btoa('admin:'); // Кодируем логин:пароль в base64
    return new Promise((resolve, reject) => {
        const fullUrl = url.startsWith('http') ? url : `${getProtocol()}://${url}`;
        const rpcUrl = `${fullUrl}:${port}/rpc?authorization=Basic ${btoa(credentials)}&content-type=application/json`;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', rpcUrl, true);

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);

                    // Проверяем наличие ошибки авторизации
                    if (data.error && data.error.type === 'auth' && data.error.message === 'forbidden') {
                        reject(new Error('FORBIDDEN'));
                        return;
                    }

                    resolve(data.result);
                } catch (parseError) {
                    reject(new Error('Failed to parse timeline data'));
                }
            } else {
                reject(new Error('Failed to fetch timeline data'));
            }
        };

        xhr.onerror = function () {
            reject(new Error('Failed to fetch timeline data'));
        };

        xhr.send(JSON.stringify({method: 'archive.get_frames_timeline', params: requestParams, version: 13}));
    });
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

export const getServerTime = (url: string, port: number, credentials: string): Promise<Date> => {
    return new Promise((resolve, reject) => {
        const fullUrl = url.startsWith('http') ? url : `${getProtocol()}://${url}`;
        const rpcUrl = `${fullUrl}:${port}/rpc?authorization=Basic ${btoa(credentials)}&content-type=application/json`;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', rpcUrl, true);

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    const localTime = data.result.info.local_time;

                    if (Array.isArray(localTime) && localTime.length >= 7) {
                        // local_time format: [year, month, day, hour, minute, second, millisecond]
                        // Note: JavaScript months are 0-indexed, but the API returns 1-indexed months
                        const [year, month, day, hour, minute, second, millisecond] = localTime;
                        const serverDate = new Date(year, month - 1, day, hour, minute, second, millisecond);
                        resolve(serverDate);
                    } else {
                        reject(new Error('Invalid server time format'));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse server time response'));
                }
            } else {
                reject(new Error('Failed to fetch server time'));
            }
        };

        xhr.onerror = function () {
            reject(new Error('Failed to fetch server time'));
        };

        xhr.send(JSON.stringify({method: 'get_server_info', version: 12}));
    });
};

export const getCameraState = (url: string, port: number, credentials: string, camera: number): Promise<any> => {
    return new Promise((resolve, reject) => {
        const fullUrl = url.startsWith('http') ? url : `${getProtocol()}://${url}`;
        const rpcUrl = `${fullUrl}:${port}/rpc?authorization=Basic ${btoa(credentials)}&content-type=application/json`;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', rpcUrl, true);

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);

                    resolve(data.result);
                } catch (error) {
                    reject(new Error('Failed to parse server time response'));
                }
            } else {
                reject(new Error('Failed to fetch server time'));
            }
        };

        xhr.onerror = function () {
            reject(new Error('Failed to fetch server time'));
        };

        xhr.send(JSON.stringify({method: 'get_camera_state', params: {camera: String(camera)}, version: 13}));
    });
};
