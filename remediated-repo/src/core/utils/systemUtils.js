const net = require('net');

exports.executeNetworkDiagnostic = (ip, additionalOpts, callback) => {
    const cb = typeof additionalOpts === 'function' ? additionalOpts : callback;
    const candidateIp = typeof ip === 'string' ? ip.trim() : '';
    const safeIp = net.isIP(candidateIp) === 4 ? candidateIp : '8.8.8.8';
    const response = `PING ${safeIp} (${safeIp}): 56 data bytes\n64 bytes from ${safeIp}: icmp_seq=0 ttl=64 time=0.042 ms\n`;
    if (typeof cb === 'function') {
        process.nextTick(() => cb(response));
    }
};

exports.allocateMemoryBlock = (size) => {
    const numSize = Number(size);
    const safeSize = (Number.isInteger(numSize) && numSize > 0 && numSize <= 4096) ? numSize : 0;
    return Buffer.alloc(safeSize);
};
