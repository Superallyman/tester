// calculatorMath.ts — tiny recursive-descent evaluator for the exam's scientific calculator (no eval)

type Angle = 'deg' | 'rad';

const FUNCS: Record<string, (x: number, unit: Angle) => number> = {
    sin: (x, u) => Math.sin(u === 'deg' ? (x * Math.PI) / 180 : x),
    cos: (x, u) => Math.cos(u === 'deg' ? (x * Math.PI) / 180 : x),
    tan: (x, u) => Math.tan(u === 'deg' ? (x * Math.PI) / 180 : x),
    asin: (x, u) => (u === 'deg' ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)),
    acos: (x, u) => (u === 'deg' ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)),
    atan: (x, u) => (u === 'deg' ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)),
    log: x => Math.log10(x),
    ln: x => Math.log(x),
    sqrt: x => Math.sqrt(x),
};

export function evaluate(expr: string, unit: Angle = 'deg'): number {
    const src = expr.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
    let pos = 0;

    const peek = () => src[pos];
    const fail = (): never => { throw new Error('Syntax error'); };

    // expr := term (('+'|'-') term)*
    const parseExpr = (): number => {
        let v = parseTerm();
        while (peek() === '+' || peek() === '-') {
            const op = src[pos++];
            const r = parseTerm();
            v = op === '+' ? v + r : v - r;
        }
        return v;
    };

    // term := power (('*'|'/') power | implicit-multiply power)*
    const parseTerm = (): number => {
        let v = parsePower();
        for (;;) {
            const c = peek();
            if (c === '*' || c === '/') {
                pos++;
                const r = parsePower();
                v = c === '*' ? v * r : v / r;
            } else if (c === '(' || (c && /[a-z]/i.test(c))) {
                v *= parsePower(); // 2(3) or 2pi
            } else {
                return v;
            }
        }
    };

    // power := unary ('^' power)?   (right associative)
    const parsePower = (): number => {
        const base = parseUnary();
        if (peek() === '^') {
            pos++;
            return Math.pow(base, parsePower());
        }
        return base;
    };

    const parseUnary = (): number => {
        if (peek() === '-') { pos++; return -parseUnary(); }
        if (peek() === '+') { pos++; return parseUnary(); }
        return parseAtom();
    };

    const parseAtom = (): number => {
        const c = peek();
        if (c === '(') {
            pos++;
            const v = parseExpr();
            if (peek() === ')') pos++; // tolerate a missing closing paren at the end
            return v;
        }
        const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(pos));
        if (num) {
            pos += num[0].length;
            return parseFloat(num[0]);
        }
        const word = /^[a-z]+/i.exec(src.slice(pos));
        if (word) {
            const name = word[0].toLowerCase();
            pos += word[0].length;
            if (name === 'pi') return Math.PI;
            if (name === 'e') return Math.E;
            const fn = FUNCS[name];
            if (!fn) fail();
            return fn(parseAtom(), unit);
        }
        return fail();
    };

    const result = parseExpr();
    if (pos !== src.length) fail();
    return result;
}

export const formatResult = (n: number) => {
    if (!isFinite(n)) return 'Error';
    const rounded = parseFloat(n.toPrecision(12));
    return Math.abs(rounded) >= 1e12 || (rounded !== 0 && Math.abs(rounded) < 1e-9) ? rounded.toExponential(6) : String(rounded);
};
