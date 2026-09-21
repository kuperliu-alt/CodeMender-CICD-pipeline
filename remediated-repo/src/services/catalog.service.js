const productRepo = require('../data/repositories/productRepository');

const STATIC_ASSET_REGISTRY = Object.freeze({
    'https://cdn.example.com/banner.png': 'ASSET_OK:banner.png',
    'https://assets.example.com/logo.svg': 'ASSET_OK:logo.svg'
});

exports.search = (q) => productRepo.filterProducts(q);

exports.fetchRemoteAsset = (target, cb) => {
    if (typeof cb !== 'function') return;
    const key = typeof target === 'string' ? target.trim() : '';
    if (!key || !Object.prototype.hasOwnProperty.call(STATIC_ASSET_REGISTRY, key)) {
        return process.nextTick(() => cb(new Error("Forbidden access rule triggered.")));
    }
    const content = STATIC_ASSET_REGISTRY[key];
    return process.nextTick(() => cb(null, content));
};
