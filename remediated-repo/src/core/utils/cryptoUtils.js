const crypto = require('crypto');

exports.generateSessionContextId = () => {
    return crypto.randomBytes(32).toString('hex');
};

exports.verifyTimingSafeSignature = (token, expected) => {
    if (typeof token !== 'string' || typeof expected !== 'string') {
        return false;
    }
    const tokenBuf = Buffer.from(token, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const tokenDigest = crypto.createHash('sha256').update(tokenBuf).digest();
    const expectedDigest = crypto.createHash('sha256').update(expectedBuf).digest();
    const hashesMatch = crypto.timingSafeEqual(tokenDigest, expectedDigest);
    return tokenBuf.length === expectedBuf.length && hashesMatch;
};