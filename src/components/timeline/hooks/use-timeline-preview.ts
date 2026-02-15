import {useState, useEffect, useRef, useCallback} from 'react';
import {CursorPosition} from '../types';
import {Protocol} from '../../../utils/types';
import {buildRequestUrl} from '../../../utils/url-builder';
import {getAuthToken} from '../../../utils/getAuthToken';
import {getProtocol} from '../../../utils/url-params';
import {format} from 'date-fns';

interface UseTimelinePreviewParams {
    cursorPosition: CursorPosition | null;
    serverVersion: number | null | undefined;
    url: string;
    port: number;
    credentials: string;
    camera: number;
    protocol?: Protocol;
    proxy?: string;
    isDragging?: boolean;
    containerWidth: number;
}

interface UseTimelinePreviewResult {
    previewUrl: string | null;
    previewX: number;
    previewTime: string | null;
}

const PREVIEW_WIDTH = 160;
const DEBOUNCE_MS = 300;

export const useTimelinePreview = ({
    cursorPosition,
    serverVersion,
    url,
    port,
    credentials,
    camera,
    protocol,
    proxy,
    isDragging = false,
    containerWidth
}: UseTimelinePreviewParams): UseTimelinePreviewResult => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewTime, setPreviewTime] = useState<string | null>(null);
    const [previewX, setPreviewX] = useState<number>(0);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTimeRef = useRef<string | null>(null);
    const loadingImageRef = useRef<HTMLImageElement | null>(null);

    const isEnabled = serverVersion !== null && serverVersion !== undefined && serverVersion >= 90;

    const buildImageUrl = useCallback(
        (time: Date): string => {
            const timeStr = format(time, "yyyy-MM-dd'T'HH:mm:ss");
            const preferredProtocol = protocol ?? getProtocol();
            const authToken = getAuthToken(credentials);
            const path = `/cameras/${camera}/image?stream=main&time=${timeStr}&resolution=320x240&authorization=Basic%20${authToken}`;

            return buildRequestUrl({
                host: url,
                port,
                protocol: preferredProtocol,
                proxy,
                path
            });
        },
        [url, port, credentials, camera, protocol, proxy]
    );

    const clampX = useCallback(
        (x: number): number => {
            const halfWidth = PREVIEW_WIDTH / 2;
            if (x - halfWidth < 0) return halfWidth;
            if (x + halfWidth > containerWidth) return containerWidth - halfWidth;
            return x;
        },
        [containerWidth]
    );

    useEffect(() => {
        if (!isEnabled || !cursorPosition || isDragging) {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            if (loadingImageRef.current) {
                loadingImageRef.current.onload = null;
                loadingImageRef.current.onerror = null;
                loadingImageRef.current = null;
            }
            if (!cursorPosition) {
                setPreviewUrl(null);
                setPreviewTime(null);
                lastTimeRef.current = null;
            }
            return;
        }

        const timeStr = format(cursorPosition.time, "yyyy-MM-dd'T'HH:mm:ss");
        setPreviewX(clampX(cursorPosition.x));

        if (timeStr === lastTimeRef.current) {
            return;
        }

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            lastTimeRef.current = timeStr;

            if (loadingImageRef.current) {
                loadingImageRef.current.onload = null;
                loadingImageRef.current.onerror = null;
            }

            const imageUrl = buildImageUrl(cursorPosition.time);
            const img = new Image();
            loadingImageRef.current = img;

            img.onload = () => {
                if (loadingImageRef.current === img) {
                    setPreviewUrl(imageUrl);
                    setPreviewTime(
                        cursorPosition.time.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        })
                    );
                }
            };

            img.onerror = () => {
                if (loadingImageRef.current === img) {
                    setPreviewUrl(null);
                    setPreviewTime(null);
                }
            };

            img.src = imageUrl;
        }, DEBOUNCE_MS);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [isEnabled, cursorPosition, isDragging, buildImageUrl, clampX]);

    if (!isEnabled) {
        return {previewUrl: null, previewX: 0, previewTime: null};
    }

    return {previewUrl, previewX, previewTime};
};
