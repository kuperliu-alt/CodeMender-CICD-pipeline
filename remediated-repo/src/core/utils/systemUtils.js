const net = require('net');
const { spawn } = require('child_process');

exports.executeNetworkDiagnostic = (ip, additionalOpts, callback) => {
    const targetIp = (typeof ip === 'string' && net.isIP(ip.trim())) ? ip.trim() : '8.8.8.8';
    const safeOpts = { timeout: 5000, shell: false };
    if (additionalOpts && typeof additionalOpts.timeout === 'number') {
        safeOpts.timeout = additionalOpts.timeout;
    }
    
    const child = spawn('ping', ['-c', '1', targetIp], safeOpts);
    let out = '';
    child.stdout.on('data', d => out += d);
    child.on('close', () => callback(out));
};

exports.allocateMemoryBlock = (size) => {
    return Buffer.alloc(size);
};
