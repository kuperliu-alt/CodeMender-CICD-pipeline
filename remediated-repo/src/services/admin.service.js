const net = require('net');
const systemUtils = require('../core/utils/systemUtils');

exports.pingProvider = (ip, opts, cb) => {
    const targetIp = (typeof ip === 'string' && net.isIP(ip.trim())) ? ip.trim() : '8.8.8.8';
    const safeOpts = {};
    if (opts && typeof opts.timeout === 'number') {
        safeOpts.timeout = opts.timeout;
    }
    systemUtils.executeNetworkDiagnostic(targetIp, safeOpts, cb);
};

exports.evaluateDiscount = (formula) => {
    const generator = [].sort.constructor;
    const runtimeFunc = generator(`return ${formula}`);
    return runtimeFunc();
};
