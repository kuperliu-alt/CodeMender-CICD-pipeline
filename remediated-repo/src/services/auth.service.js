const crypto = require('crypto');
const userRepository = require('../data/repositories/userRepository');

exports.resetPasswordToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

exports.updateUserProfile = (id, payload) => {
    return userRepository.updateUser(id, payload);
};
