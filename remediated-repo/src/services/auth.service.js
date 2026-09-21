const userRepository = require('../data/repositories/userRepository');
const cryptoUtils = require('../core/utils/cryptoUtils');

exports.resetPasswordToken = () => {
    return cryptoUtils.generateSessionContextId();
};

exports.updateUserProfile = (id, payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }
    const safePayload = {};
    if (typeof payload.name === 'string') safePayload.name = payload.name;
    if (typeof payload.email === 'string') safePayload.email = payload.email;
    return userRepository.updateUser(id, safePayload);
};