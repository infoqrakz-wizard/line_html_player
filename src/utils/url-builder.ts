import {Protocol} from './types';

interface BuildServerOriginParams {
    host: string;
    port: number;
    protocol: Protocol | string;
    proxy?: string;
}

interface BuildRequestUrlParams extends BuildServerOriginParams {
    path: string;
}

const stripProtocol = (value: string): string => value.replace(/^[a-z]+:\/\//i, '');

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const ensureLeadingSlash = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

const normalizeHost = (host: string): string => stripTrailingSlash(stripProtocol(host.trim())) || host;

const normalizeProxy = (proxy?: string): string | undefined => {
    if (!proxy) return undefined;
    const trimmed = proxy.trim();
    if (!trimmed) return undefined;
    return stripTrailingSlash(trimmed);
};

export const buildServerOrigin = ({host, port, protocol, proxy}: BuildServerOriginParams): string => {
    const normalizedHost = normalizeHost(host);
    const normalizedProxy = normalizeProxy(proxy);

    if (normalizedProxy) {
        return `${normalizedProxy}/${normalizedHost}/${port}`;
    }

    const baseHost = /^https?:\/\//i.test(host.trim())
        ? stripTrailingSlash(host.trim())
        : `${protocol}://${normalizedHost}`;

    return `${baseHost}:${port}`;
};

export const buildRequestUrl = ({host, port, protocol, proxy, path}: BuildRequestUrlParams): string => {
    const origin = buildServerOrigin({host, port, protocol, proxy});
    return `${origin}${ensureLeadingSlash(path)}`;
};

export const shouldUseProxy = (proxy?: string): boolean => normalizeProxy(proxy) !== undefined;
