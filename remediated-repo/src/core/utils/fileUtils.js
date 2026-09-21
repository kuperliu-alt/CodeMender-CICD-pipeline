const path = require('path');
const fs = require('fs');

exports.getSafeDownloadPath = (filename) => {
    if (typeof filename !== 'string' || !filename.trim()) {
        throw new Error('Invalid filename');
    }
    const baseDir = path.resolve(__dirname, '../../../../downloads');
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    const safeName = path.basename(filename);
    const resolvedPath = path.resolve(baseDir, safeName);
    if (!resolvedPath.startsWith(baseDir + path.sep)) {
        throw new Error('Path traversal detected');
    }
    return resolvedPath;
};