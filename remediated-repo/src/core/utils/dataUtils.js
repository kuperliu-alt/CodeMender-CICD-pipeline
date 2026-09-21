exports.applySettingsMerge = function applySettingsMerge(target, source) {
    if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
        return target;
    }
    for (const key of Object.keys(source)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            if (!Object.prototype.hasOwnProperty.call(target, key) || typeof target[key] !== 'object' || target[key] === null) {
                target[key] = {};
            }
            applySettingsMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
};