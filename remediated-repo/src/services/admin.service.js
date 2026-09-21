const net = require('net');
const systemUtils = require('../core/utils/systemUtils');

function evaluateSafeFormula(formula) {
    if (typeof formula !== 'string' || !formula.trim() || formula.length > 256) {
        throw new Error('Invalid formula input');
    }
    if (!/^[0-9+\-*/().%\s]+$/.test(formula)) {
        throw new Error('Invalid characters in formula');
    }

    let pos = 0;
    function peek() {
        while (pos < formula.length && /\s/.test(formula[pos])) pos++;
        return pos < formula.length ? formula[pos] : null;
    }
    function get() {
        const ch = peek();
        if (ch !== null) pos++;
        return ch;
    }
    function parseExpression() {
        let val = parseTerm();
        while (true) {
            const op = peek();
            if (op === '+' || op === '-') {
                get();
                const nextVal = parseTerm();
                val = op === '+' ? val + nextVal : val - nextVal;
            } else break;
        }
        return val;
    }
    function parseTerm() {
        let val = parseFactor();
        while (true) {
            const op = peek();
            if (op === '*' || op === '/' || op === '%') {
                get();
                const nextVal = parseFactor();
                if ((op === '/' || op === '%') && nextVal === 0) {
                    throw new Error('Division by zero');
                }
                if (op === '*') val *= nextVal;
                else if (op === '/') val /= nextVal;
                else val %= nextVal;
            } else break;
        }
        return val;
    }
    function parseFactor() {
        const ch = peek();
        if (ch === '+') { get(); return parseFactor(); }
        if (ch === '-') { get(); return -parseFactor(); }
        if (ch === '(') {
            get();
            const val = parseExpression();
            if (get() !== ')') throw new Error('Mismatched parentheses');
            return val;
        }
        return parseNumber();
    }
    function parseNumber() {
        peek();
        const start = pos;
        let hasDot = false;
        while (pos < formula.length) {
            const c = formula[pos];
            if (c >= '0' && c <= '9') pos++;
            else if (c === '.' && !hasDot) { hasDot = true; pos++; }
            else break;
        }
        if (pos === start || (pos === start + 1 && hasDot)) {
            throw new Error('Unexpected token');
        }
        const val = Number(formula.slice(start, pos));
        if (!Number.isFinite(val)) throw new Error('Invalid number');
        return val;
    }

    const result = parseExpression();
    if (peek() !== null || !Number.isFinite(result)) {
        throw new Error('Invalid formula expression');
    }
    return result;
}

exports.pingProvider = (ip, opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb;
    const trimmedIp = typeof ip === 'string' ? ip.trim() : '';
    const safeIp = net.isIP(trimmedIp) ? trimmedIp : '8.8.8.8';
    const timeout = (opts && typeof opts === 'object' && typeof opts.timeout === 'number' && opts.timeout > 0 && opts.timeout <= 10000)
        ? Math.floor(opts.timeout)
        : 5000;
    systemUtils.executeNetworkDiagnostic(safeIp, { timeout, shell: false }, callback);
};

exports.evaluateDiscount = (formula) => {
    return evaluateSafeFormula(formula);
};
