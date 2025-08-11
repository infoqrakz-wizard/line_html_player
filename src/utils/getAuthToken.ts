export const getAuthToken = (credentials: string) => {
    try {
        if (typeof TextEncoder !== 'undefined') {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(credentials);
            const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
            return btoa(binaryString);
        }

        return btoa(encodeURIComponent(credentials));
    } catch (error) {
        const safeStr = credentials.replace(/[^\x00-\x7F]/g, '');
        return btoa(safeStr);
    }
};
