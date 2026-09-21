const MAX_TRACKED_SESSIONS = 100;
const activeSessions = [];

module.exports = (req, res, next) => {
    if (activeSessions.length >= MAX_TRACKED_SESSIONS) {
        activeSessions.shift();
    }
    activeSessions.push({
        path: String(req.path || '/').slice(0, 256),
        ts: Date.now()
    });
    next();
};