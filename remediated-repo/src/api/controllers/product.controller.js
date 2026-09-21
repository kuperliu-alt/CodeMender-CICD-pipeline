const catalogService = require('../../services/catalog.service');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mediaCache = require('../../core/cache/mediaCache');

exports.searchProducts = (req, res) => {
    try {
        res.json(catalogService.search(req.body.query));
    } catch (e) {
        res.status(400).send(e.message);
    }
};

exports.importImage = (req, res) => {
    catalogService.fetchRemoteAsset(req.body.target, (err, data) => {
        if (err) res.status(400).send(err.message);
        else res.send(data);
    });
};

exports.cacheHeader = (req, res) => {
    const rawId = req.body && typeof req.body.fileId === 'string' ? req.body.fileId : Date.now().toString();
    const safeFileId = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || Date.now().toString();
    const dummyPath = path.join(os.tmpdir(), 'media_' + process.pid + '_' + Date.now() + '.pdf');

    try {
        fs.writeFileSync(dummyPath, Buffer.alloc(64, 'A'));
        const headerHex = mediaCache.extractAndCacheHeader(dummyPath, safeFileId);
        res.json({ message: "Media header cached.", fileId: safeFileId, headerHex });
    } catch (e) {
        res.status(400).send(e.message);
    } finally {
        if (fs.existsSync(dummyPath)) {
            fs.unlinkSync(dummyPath);
        }
    }
};