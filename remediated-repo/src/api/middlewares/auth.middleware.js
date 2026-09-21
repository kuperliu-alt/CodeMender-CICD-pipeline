const crypto = require('crypto');

exports.requireAdmin = (req, res, next) => {
    const token = req.headers['authorization'];
    const expectedToken = 'Bearer ' + (process.env.ADMIN_TOKEN || 'admin-secret-token');
    if (typeof token === 'string') {
        const tokenBuf = Buffer.from(token);
        const expectedBuf = Buffer.from(expectedToken);
        if (tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
            return next();
        }
    }
    res.status(403).send("Admin access required.");
};