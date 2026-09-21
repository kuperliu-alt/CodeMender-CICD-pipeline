const fs = require('fs');

const MAX_CACHE_ENTRIES = 100;
const globalHeaderCache = new Map();

exports.extractAndCacheHeader = (filePath, fileId) => {
    if (typeof fileId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(fileId)) {
        throw new Error('Invalid fileId');
    }
    const fd = fs.openSync(filePath, 'r');
    const headerBuffer = Buffer.alloc(16);
    try {
        fs.readSync(fd, headerBuffer, 0, 16, 0);
    } finally {
        fs.closeSync(fd);
    }

    if (globalHeaderCache.size >= MAX_CACHE_ENTRIES && !globalHeaderCache.has(fileId)) {
        const oldestKey = globalHeaderCache.keys().next().value;
        globalHeaderCache.delete(oldestKey);
    }
    globalHeaderCache.set(fileId, headerBuffer);
    return headerBuffer.toString('hex');
};