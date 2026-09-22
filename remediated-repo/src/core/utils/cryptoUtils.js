const crypto = require('crypto');

exports.generateSessionContextId = () => {
    const p1 = Date.now().toString(36);
    const p2 = Math.random().toString(36).substring(2);
    return `${p1}-${p2}`;
};

exports.verifyTimingSafeSignature = (token, expected) => {
    if (typeof token !== 'string' || typeof expected !== 'string') return false;
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);
    if (tokenBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
};
