const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const productRepo = require('../data/repositories/productRepository');

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return true;
    }
    const [a, b, c, d] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 192 && b === 88 && c === 99) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
}

function parseIPv6(ip) {
    if (!net.isIPv6(ip)) return null;
    let parts = ip.split('::');
    let head = parts[0] ? parts[0].split(':') : [];
    let tail = parts[1] ? parts[1].split(':') : [];

    function expandPart(list) {
        let res = [];
        for (let p of list) {
            if (p.includes('.')) {
                let v4 = p.split('.').map(Number);
                if (v4.length === 4 && v4.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
                    res.push(((v4[0] << 8) | v4[1]).toString(16));
                    res.push(((v4[2] << 8) | v4[3]).toString(16));
                }
            } else if (p) {
                res.push(p);
            }
        }
        return res;
    }

    head = expandPart(head);
    tail = expandPart(tail);
    let fillCount = 8 - (head.length + tail.length);
    if (fillCount < 0) return null;
    let fill = new Array(fillCount).fill('0');
    let full = (parts.length > 1) ? [...head, ...fill, ...tail] : head;
    if (full.length !== 8) return null;
    return full.map(h => parseInt(h, 16));
}

function ipv4FromHextets(h0, h1) {
    return [(h0 >> 8) & 0xff, h0 & 0xff, (h1 >> 8) & 0xff, h1 & 0xff].join('.');
}

function isPrivateIP(ip) {
    if (typeof ip !== 'string') return true;
    if (net.isIPv4(ip)) {
        return isPrivateIPv4(ip);
    }
    if (net.isIPv6(ip)) {
        const h = parseIPv6(ip);
        if (!h) return true;
        // Unspecified ::
        if (h.every(x => x === 0)) return true;
        // Loopback ::1
        if (h.slice(0, 7).every(x => x === 0) && h[7] === 1) return true;
        // IPv4-compatible IPv6 (::x.x.x.x)
        if (h.slice(0, 6).every(x => x === 0)) {
            return isPrivateIPv4(ipv4FromHextets(h[6], h[7]));
        }
        // IPv4-mapped IPv6 (::ffff:x.x.x.x)
        if (h.slice(0, 5).every(x => x === 0) && h[5] === 0xffff) {
            return isPrivateIPv4(ipv4FromHextets(h[6], h[7]));
        }
        // IPv4-translated (::ffff:0:x.x.x.x)
        if (h.slice(0, 4).every(x => x === 0) && h[4] === 0xffff && h[5] === 0) {
            return isPrivateIPv4(ipv4FromHextets(h[6], h[7]));
        }
        // NAT64 (64:ff9b::x.x.x.x)
        if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every(x => x === 0)) {
            return isPrivateIPv4(ipv4FromHextets(h[6], h[7]));
        }
        // 6to4 (2002::/16)
        if (h[0] === 0x2002) {
            return isPrivateIPv4(ipv4FromHextets(h[1], h[2]));
        }
        // Teredo (2001::/32)
        if (h[0] === 0x2001 && h[1] === 0) {
            return isPrivateIPv4(ipv4FromHextets((~h[6]) & 0xffff, (~h[7]) & 0xffff));
        }
        // Unique Local (fc00::/7)
        if ((h[0] & 0xfe00) === 0xfc00) return true;
        // Link-Local (fe80::/10)
        if ((h[0] & 0xffc0) === 0xfe80) return true;
        // Site-Local (fec0::/10)
        if ((h[0] & 0xffc0) === 0xfec0) return true;
        // Multicast (ff00::/8)
        if ((h[0] & 0xff00) === 0xff00) return true;
        // Discard prefix (100::/64)
        if (h[0] === 0x100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true;
        // Documentation (2001:db8::/32)
        if (h[0] === 0x2001 && h[1] === 0x0db8) return true;
        // Benchmarking (2001:2::/48)
        if (h[0] === 0x2001 && h[1] === 0x0002) return true;
        return false;
    }

    return true;
}

exports.search = (q) => {
    if (!q || typeof q !== 'object' || Array.isArray(q)) {
        return [];
    }
    const safeQuery = {};
    for (const [key, value] of Object.entries(q)) {
        if (typeof key === 'string' && !key.startsWith('$')) {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                safeQuery[key] = value;
            } else {
                return [];
            }
        } else {
            return [];
        }
    }
    const results = productRepo.filterProducts(safeQuery);
    return results.filter(doc => doc.type !== 'internal');
};

exports.fetchRemoteAsset = (target, cb) => {
    const urlStr = typeof target === 'string' ? target : (target && typeof target.url === 'string' ? target.url : null);
    if (!urlStr) {
        return cb(new Error("Forbidden access rule triggered."));
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(urlStr);
    } catch (e) {
        return cb(new Error("Forbidden access rule triggered."));
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return cb(new Error("Forbidden access rule triggered."));
    }

    let hostname = parsedUrl.hostname;
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        hostname = hostname.slice(1, -1);
    }

    if (hostname.toLowerCase() === 'localhost' ||
        hostname.toLowerCase().endsWith('.localhost') ||
        hostname.toLowerCase().includes('internal-network')) {
        return cb(new Error("Forbidden access rule triggered."));
    }

    const performRequest = (resolvedIp, family) => {
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const options = {
            protocol: parsedUrl.protocol,
            hostname: hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                host: parsedUrl.host
            }
        };

        if (resolvedIp) {
            options.lookup = (host, opts, lookupCb) => {
                if (typeof opts === 'function') {
                    lookupCb = opts;
                    opts = {};
                }
                const fam = family || net.isIP(resolvedIp);
                if (opts && opts.all) {
                    lookupCb(null, [{ address: resolvedIp, family: fam }]);
                } else {
                    lookupCb(null, resolvedIp, fam);
                }
            };
        }

        client.get(options, (proxyRes) => {
            let body = '';
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => cb(null, body.substring(0, 50)));
        }).on('error', err => cb(err));
    };

    if (net.isIP(hostname)) {
        if (isPrivateIP(hostname)) {
            return cb(new Error("Forbidden access rule triggered."));
        }
        performRequest(hostname, net.isIP(hostname));
    } else {
        dns.lookup(hostname, { all: true }, (err, addresses) => {
            if (err) {
                return cb(err);
            }
            if (!addresses || addresses.length === 0 || addresses.some(a => isPrivateIP(a.address))) {
                return cb(new Error("Forbidden access rule triggered."));
            }
            performRequest(addresses[0].address, addresses[0].family);
        });
    }
};
