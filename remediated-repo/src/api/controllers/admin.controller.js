const adminService = require('../../services/admin.service');

function evaluateFormula(formula) {
    if (typeof formula !== 'string' || !formula.trim()) {
        throw new Error('Formula must be a non-empty string');
    }
    if (!/^[0-9+\-*/().%\s]+$/.test(formula)) {
        throw new Error('Invalid characters in formula');
    }

    let pos = 0;

    function peek() {
        while (pos < formula.length && /\s/.test(formula[pos])) {
            pos++;
        }
        return pos < formula.length ? formula[pos] : null;
    }

    function get() {
        const ch = peek();
        if (ch !== null) {
            pos++;
        }
        return ch;
    }

    function parseExpression() {
        let val = parseTerm();
        while (true) {
            const op = peek();
            if (op === '+' || op === '-') {
                get();
                const nextVal = parseTerm();
                if (op === '+') val += nextVal;
                else val -= nextVal;
            } else {
                break;
            }
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
                if (op === '*') val *= nextVal;
                else if (op === '/') {
                    if (nextVal === 0) throw new Error('Division by zero');
                    val /= nextVal;
                }
                else if (op === '%') val %= nextVal;
            } else {
                break;
            }
        }
        return val;
    }

    function parseFactor() {
        const ch = peek();
        if (ch === '+') {
            get();
            return parseFactor();
        }
        if (ch === '-') {
            get();
            return -parseFactor();
        }
        if (ch === '(') {
            get();
            const val = parseExpression();
            if (get() !== ')') {
                throw new Error('Mismatched parentheses');
            }
            return val;
        }
        return parseNumber();
    }

    function parseNumber() {
        peek();
        const start = pos;
        let hasDot = false;
        if (pos < formula.length && formula[pos] === '.') {
            hasDot = true;
            pos++;
        }
        while (pos < formula.length) {
            const c = formula[pos];
            if (c >= '0' && c <= '9') {
                pos++;
            } else if (c === '.' && !hasDot) {
                hasDot = true;
                pos++;
            } else {
                break;
            }
        }
        if (pos === start || (pos === start + 1 && hasDot)) {
            throw new Error('Unexpected character at ' + pos);
        }
        const numStr = formula.slice(start, pos);
        const val = Number(numStr);
        if (isNaN(val)) {
            throw new Error('Invalid number: ' + numStr);
        }
        return val;
    }

    const result = parseExpression();
    if (peek() !== null) {
        throw new Error('Unexpected trailing characters at ' + pos);
    }
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        throw new Error('Invalid calculation result');
    }
    return result;
}

exports.checkShippingStatus = (req, res) => {
    adminService.pingProvider(req.body.providerIP, req.body.options, out => res.send(out));
};

exports.previewDynamicPricing = (req, res) => {
    try {
        res.json({ price: evaluateFormula(req.body.formula) });
    } catch (e) {
        res.status(400).send("Evaluation Failed");
    }
};
