/**
 * Based on https://github.com/peterolson/BigInteger.js
 *
 * @fileoverview A library for handling big integers found as time codes.
 */

"use strict";
goog.provide('shaka.vimond.Integer');

shaka.vimond.Integer = function() {};

var BASE = 1e7,
    LOG_BASE = 7,
    MAX_INT = 9007199254740992,
    MAX_INT_ARR = smallToArray(MAX_INT),
    LOG_MAX_INT = Math.log(MAX_INT);

shaka.vimond.Integer.create = function Integer(v, radix) {
    if (typeof v === "undefined") return shaka.vimond.Integer[0];
    if (typeof radix !== "undefined") return +radix === 10 ? parseValue(v) : parseBase(v, radix);
    return parseValue(v);
};

shaka.vimond.BigInteger = function BigInteger(value, sign) {
    this.value = value;
    this.sign = sign;
    this.isSmall = false;
};

shaka.vimond.BigInteger.prototype = Object.create(shaka.vimond.Integer.prototype);

shaka.vimond.SmallInteger = function SmallInteger(value) {
    this.value = value;
    this.sign = value < 0;
    this.isSmall = true;
};
shaka.vimond.SmallInteger.prototype = Object.create(shaka.vimond.Integer.prototype);

function isPrecise(n) {
    return -MAX_INT < n && n < MAX_INT;
}

function smallToArray(n) { // For performance reasons doesn't reference BASE, need to change this function if BASE changes
    if (n < 1e7)
        return [n];
    if (n < 1e14)
        return [n % 1e7, Math.floor(n / 1e7)];
    return [n % 1e7, Math.floor(n / 1e7) % 1e7, Math.floor(n / 1e14)];
}

function arrayToSmall(arr) { // If BASE changes this function may need to change
    trim(arr);
    var length = arr.length;
    if (length < 4 && compareAbs(arr, MAX_INT_ARR) < 0) {
        switch (length) {
            case 0: return 0;
            case 1: return arr[0];
            case 2: return arr[0] + arr[1] * BASE;
            default: return arr[0] + (arr[1] + arr[2] * BASE) * BASE;
        }
    }
    return arr;
}

function trim(v) {
    var i = v.length;
    while (v[--i] === 0);
    v.length = i + 1;
}

function createArray(length) { // function shamelessly stolen from Yaffle's library https://github.com/Yaffle/BigInteger
    var x = new Array(length);
    var i = -1;
    while (++i < length) {
        x[i] = 0;
    }
    return x;
}

function truncate(n) {
    if (n > 0) return Math.floor(n);
    return Math.ceil(n);
}

function add(a, b) { // assumes a and b are arrays with a.length >= b.length
    var l_a = a.length,
        l_b = b.length,
        r = new Array(l_a),
        carry = 0,
        base = BASE,
        sum, i;
    for (i = 0; i < l_b; i++) {
        sum = a[i] + b[i] + carry;
        carry = sum >= base ? 1 : 0;
        r[i] = sum - carry * base;
    }
    while (i < l_a) {
        sum = a[i] + carry;
        carry = sum === base ? 1 : 0;
        r[i++] = sum - carry * base;
    }
    if (carry > 0) r.push(carry);
    return r;
}

function addAny(a, b) {
    if (a.length >= b.length) return add(a, b);
    return add(b, a);
}

function addSmall(a, carry) { // assumes a is array, carry is number with 0 <= carry < MAX_INT
    var l = a.length,
        r = new Array(l),
        base = BASE,
        sum, i;
    for (i = 0; i < l; i++) {
        sum = a[i] - base + carry;
        carry = Math.floor(sum / base);
        r[i] = sum - carry * base;
        carry += 1;
    }
    while (carry > 0) {
        r[i++] = carry % base;
        carry = Math.floor(carry / base);
    }
    return r;
}

shaka.vimond.BigInteger.prototype.add = function (v) {
    var value, n = parseValue(v);
    if (this.sign !== n.sign) {
        return this.subtract(n.negate());
    }
    var a = this.value, b = n.value;
    if (n.isSmall) {
        return new shaka.vimond.BigInteger(addSmall(a, Math.abs(b)), this.sign);
    }
    return new shaka.vimond.BigInteger(addAny(a, b), this.sign);
};
shaka.vimond.BigInteger.prototype.plus = shaka.vimond.BigInteger.prototype.add;

shaka.vimond.SmallInteger.prototype.add = function (v) {
    var n = parseValue(v);
    var a = this.value;
    if (a < 0 !== n.sign) {
        return this.subtract(n.negate());
    }
    var b = n.value;
    if (n.isSmall) {
        if (isPrecise(a + b)) return new shaka.vimond.SmallInteger(a + b);
        b = smallToArray(Math.abs(b));
    }
    return new shaka.vimond.BigInteger(addSmall(b, Math.abs(a)), a < 0);
};
shaka.vimond.SmallInteger.prototype.plus = shaka.vimond.SmallInteger.prototype.add;

function subtract(a, b) { // assumes a and b are arrays with a >= b
    var a_l = a.length,
        b_l = b.length,
        r = new Array(a_l),
        borrow = 0,
        base = BASE,
        i, difference;
    for (i = 0; i < b_l; i++) {
        difference = a[i] - borrow - b[i];
        if (difference < 0) {
            difference += base;
            borrow = 1;
        } else borrow = 0;
        r[i] = difference;
    }
    for (i = b_l; i < a_l; i++) {
        difference = a[i] - borrow;
        if (difference < 0) difference += base;
        else {
            r[i++] = difference;
            break;
        }
        r[i] = difference;
    }
    for (; i < a_l; i++) {
        r[i] = a[i];
    }
    trim(r);
    return r;
}

function subtractAny(a, b, sign) {
    var value, isSmall;
    if (compareAbs(a, b) >= 0) {
        value = subtract(a,b);
    } else {
        value = subtract(b, a);
        sign = !sign;
    }
    value = arrayToSmall(value);
    if (typeof value === "number") {
        if (sign) value = -value;
        return new shaka.vimond.SmallInteger(value);
    }
    return new shaka.vimond.BigInteger(value, sign);
}

function subtractSmall(a, b, sign) { // assumes a is array, b is number with 0 <= b < MAX_INT
    var l = a.length,
        r = new Array(l),
        carry = -b,
        base = BASE,
        i, difference;
    for (i = 0; i < l; i++) {
        difference = a[i] + carry;
        carry = Math.floor(difference / base);
        difference %= base;
        r[i] = difference < 0 ? difference + base : difference;
    }
    r = arrayToSmall(r);
    if (typeof r === "number") {
        if (sign) r = -r;
        return new shaka.vimond.SmallInteger(r);
    } return new shaka.vimond.BigInteger(r, sign);
}

shaka.vimond.BigInteger.prototype.subtract = function (v) {
    var n = parseValue(v);
    if (this.sign !== n.sign) {
        return this.add(n.negate());
    }
    var a = this.value, b = n.value;
    if (n.isSmall)
        return subtractSmall(a, Math.abs(b), this.sign);
    return subtractAny(a, b, this.sign);
};
shaka.vimond.BigInteger.prototype.minus = shaka.vimond.BigInteger.prototype.subtract;

shaka.vimond.SmallInteger.prototype.subtract = function (v) {
    var n = parseValue(v);
    var a = this.value;
    if (a < 0 !== n.sign) {
        return this.add(n.negate());
    }
    var b = n.value;
    if (n.isSmall) {
        return new shaka.vimond.SmallInteger(a - b);
    }
    return subtractSmall(b, Math.abs(a), a >= 0);
};
shaka.vimond.SmallInteger.prototype.minus = shaka.vimond.SmallInteger.prototype.subtract;

shaka.vimond.BigInteger.prototype.negate = function () {
    return new shaka.vimond.BigInteger(this.value, !this.sign);
};
shaka.vimond.SmallInteger.prototype.negate = function () {
    var sign = this.sign;
    var small = new shaka.vimond.SmallInteger(-this.value);
    small.sign = !sign;
    return small;
};

shaka.vimond.BigInteger.prototype.abs = function () {
    return new shaka.vimond.BigInteger(this.value, false);
};
shaka.vimond.SmallInteger.prototype.abs = function () {
    return new shaka.vimond.SmallInteger(Math.abs(this.value));
};

function multiplyLong(a, b) {
    var a_l = a.length,
        b_l = b.length,
        l = a_l + b_l,
        r = createArray(l),
        base = BASE,
        product, carry, i, a_i, b_j;
    for (i = 0; i < a_l; ++i) {
        a_i = a[i];
        for (var j = 0; j < b_l; ++j) {
            b_j = b[j];
            product = a_i * b_j + r[i + j];
            carry = Math.floor(product / base);
            r[i + j] = product - carry * base;
            r[i + j + 1] += carry;
        }
    }
    trim(r);
    return r;
}

function multiplySmall(a, b) { // assumes a is array, b is number with |b| < BASE
    var l = a.length,
        r = new Array(l),
        base = BASE,
        carry = 0,
        product, i;
    for (i = 0; i < l; i++) {
        product = a[i] * b + carry;
        carry = Math.floor(product / base);
        r[i] = product - carry * base;
    }
    while (carry > 0) {
        r[i++] = carry % base;
        carry = Math.floor(carry / base);
    }
    return r;
}

function shiftLeft(x, n) {
    var r = [];
    while (n-- > 0) r.push(0);
    return r.concat(x);
}

function multiplyKaratsuba(x, y) {
    var n = Math.max(x.length, y.length);

    if (n <= 30) return multiplyLong(x, y);
    n = Math.ceil(n / 2);

    var b = x.slice(n),
        a = x.slice(0, n),
        d = y.slice(n),
        c = y.slice(0, n);

    var ac = multiplyKaratsuba(a, c),
        bd = multiplyKaratsuba(b, d),
        abcd = multiplyKaratsuba(addAny(a, b), addAny(c, d));

    var product = addAny(addAny(ac, shiftLeft(subtract(subtract(abcd, ac), bd), n)), shiftLeft(bd, 2 * n));
    trim(product);
    return product;
}

// The following function is derived from a surface fit of a graph plotting the performance difference
// between long multiplication and karatsuba multiplication versus the lengths of the two arrays.
function useKaratsuba(l1, l2) {
    return -0.012 * l1 - 0.012 * l2 + 0.000015 * l1 * l2 > 0;
}

shaka.vimond.BigInteger.prototype.multiply = function (v) {
    var value, n = parseValue(v),
        a = this.value, b = n.value,
        sign = this.sign !== n.sign,
        abs;
    if (n.isSmall) {
        if (b === 0) return shaka.vimond.Integer[0];
        if (b === 1) return this;
        if (b === -1) return this.negate();
        abs = Math.abs(b);
        if (abs < BASE) {
            return new shaka.vimond.BigInteger(multiplySmall(a, abs), sign);
        }
        b = smallToArray(abs);
    }
    if (useKaratsuba(a.length, b.length)) // Karatsuba is only faster for certain array sizes
        return new shaka.vimond.BigInteger(multiplyKaratsuba(a, b), sign);
    return new shaka.vimond.BigInteger(multiplyLong(a, b), sign);
};

shaka.vimond.BigInteger.prototype.times = shaka.vimond.BigInteger.prototype.multiply;

function multiplySmallAndArray(a, b, sign) { // a >= 0
    if (a < BASE) {
        return new shaka.vimond.BigInteger(multiplySmall(b, a), sign);
    }
    return new shaka.vimond.BigInteger(multiplyLong(b, smallToArray(a)), sign);
}
shaka.vimond.SmallInteger.prototype._multiplyBySmall = function (a) {
    if (isPrecise(a.value * this.value)) {
        return new shaka.vimond.SmallInteger(a.value * this.value);
    }
    return multiplySmallAndArray(Math.abs(a.value), smallToArray(Math.abs(this.value)), this.sign !== a.sign);
};
shaka.vimond.BigInteger.prototype._multiplyBySmall = function (a) {
    if (a.value === 0) return shaka.vimond.Integer[0];
    if (a.value === 1) return this;
    if (a.value === -1) return this.negate();
    return multiplySmallAndArray(Math.abs(a.value), this.value, this.sign !== a.sign);
};
shaka.vimond.SmallInteger.prototype.multiply = function (v) {
    return parseValue(v)._multiplyBySmall(this);
};
shaka.vimond.SmallInteger.prototype.times = shaka.vimond.SmallInteger.prototype.multiply;

function square(a) {
    var l = a.length,
        r = createArray(l + l),
        base = BASE,
        product, carry, i, a_i, a_j;
    for (i = 0; i < l; i++) {
        a_i = a[i];
        for (var j = 0; j < l; j++) {
            a_j = a[j];
            product = a_i * a_j + r[i + j];
            carry = Math.floor(product / base);
            r[i + j] = product - carry * base;
            r[i + j + 1] += carry;
        }
    }
    trim(r);
    return r;
}

shaka.vimond.BigInteger.prototype.square = function () {
    return new shaka.vimond.BigInteger(square(this.value), false);
};

shaka.vimond.SmallInteger.prototype.square = function () {
    var value = this.value * this.value;
    if (isPrecise(value)) return new shaka.vimond.SmallInteger(value);
    return new shaka.vimond.BigInteger(square(smallToArray(Math.abs(this.value))), false);
};

function divMod1(a, b) { // Left over from previous version. Performs faster than divMod2 on smaller input sizes.
    var a_l = a.length,
        b_l = b.length,
        base = BASE,
        result = createArray(b.length),
        divisorMostSignificantDigit = b[b_l - 1],
    // normalization
        lambda = Math.ceil(base / (2 * divisorMostSignificantDigit)),
        remainder = multiplySmall(a, lambda),
        divisor = multiplySmall(b, lambda),
        quotientDigit, shift, carry, borrow, i, l, q;
    if (remainder.length <= a_l) remainder.push(0);
    divisor.push(0);
    divisorMostSignificantDigit = divisor[b_l - 1];
    for (shift = a_l - b_l; shift >= 0; shift--) {
        quotientDigit = base - 1;
        if (remainder[shift + b_l] !== divisorMostSignificantDigit) {
            quotientDigit = Math.floor((remainder[shift + b_l] * base + remainder[shift + b_l - 1]) / divisorMostSignificantDigit);
        }
        // quotientDigit <= base - 1
        carry = 0;
        borrow = 0;
        l = divisor.length;
        for (i = 0; i < l; i++) {
            carry += quotientDigit * divisor[i];
            q = Math.floor(carry / base);
            borrow += remainder[shift + i] - (carry - q * base);
            carry = q;
            if (borrow < 0) {
                remainder[shift + i] = borrow + base;
                borrow = -1;
            } else {
                remainder[shift + i] = borrow;
                borrow = 0;
            }
        }
        while (borrow !== 0) {
            quotientDigit -= 1;
            carry = 0;
            for (i = 0; i < l; i++) {
                carry += remainder[shift + i] - base + divisor[i];
                if (carry < 0) {
                    remainder[shift + i] = carry + base;
                    carry = 0;
                } else {
                    remainder[shift + i] = carry;
                    carry = 1;
                }
            }
            borrow += carry;
        }
        result[shift] = quotientDigit;
    }
    // denormalization
    remainder = divModSmall(remainder, lambda)[0];
    return [arrayToSmall(result), arrayToSmall(remainder)];
}

function divMod2(a, b) { // Implementation idea shamelessly stolen from Silent Matt's library http://silentmatt.com/biginteger/
    // Performs faster than divMod1 on larger input sizes.
    var a_l = a.length,
        b_l = b.length,
        result = [],
        part = [],
        base = BASE,
        guess, xlen, highx, highy, check;
    while (a_l) {
        part.unshift(a[--a_l]);
        if (compareAbs(part, b) < 0) {
            result.push(0);
            continue;
        }
        xlen = part.length;
        highx = part[xlen - 1] * base + part[xlen - 2];
        highy = b[b_l - 1] * base + b[b_l - 2];
        if (xlen > b_l) {
            highx = (highx + 1) * base;
        }
        guess = Math.ceil(highx / highy);
        do {
            check = multiplySmall(b, guess);
            if (compareAbs(check, part) <= 0) break;
            guess--;
        } while (guess);
        result.push(guess);
        part = subtract(part, check);
    }
    result.reverse();
    return [arrayToSmall(result), arrayToSmall(part)];
}

function divModSmall(value, lambda) {
    var length = value.length,
        quotient = createArray(length),
        base = BASE,
        i, q, remainder, divisor;
    remainder = 0;
    for (i = length - 1; i >= 0; --i) {
        divisor = remainder * base + value[i];
        q = truncate(divisor / lambda);
        remainder = divisor - q * lambda;
        quotient[i] = q | 0;
    }
    return [quotient, remainder | 0];
}

function divModAny(self, v) {
    var value, n = parseValue(v);
    var a = self.value, b = n.value;
    var quotient;
    if (b === 0) throw new Error("Cannot divide by zero");
    if (self.isSmall) {
        if (n.isSmall) {
            return [new shaka.vimond.SmallInteger(truncate(a / b)), new shaka.vimond.SmallInteger(a % b)];
        }
        return [Integer[0], self];
    }
    if (n.isSmall) {
        if (b === 1) return [self, shaka.vimond.Integer[0]];
        if (b == -1) return [self.negate(), shaka.vimond.Integer[0]];
        var abs = Math.abs(b);
        if (abs < BASE) {
            value = divModSmall(a, abs);
            quotient = arrayToSmall(value[0]);
            var remainder = value[1];
            if (self.sign) remainder = -remainder;
            if (typeof quotient === "number") {
                if (self.sign !== n.sign) quotient = -quotient;
                return [new shaka.vimond.SmallInteger(quotient), new shaka.vimond.SmallInteger(remainder)];
            }
            return [new shaka.vimond.BigInteger(quotient, self.sign !== n.sign), new shaka.vimond.SmallInteger(remainder)];
        }
        b = smallToArray(abs);
    }
    var comparison = compareAbs(a, b);
    if (comparison === -1) return [Integer[0], self];
    if (comparison === 0) return [Integer[self.sign === n.sign ? 1 : -1], shaka.vimond.Integer[0]];

    // divMod1 is faster on smaller input sizes
    if (a.length + b.length <= 200)
        value = divMod1(a, b);
    else value = divMod2(a, b);

    quotient = value[0];
    var qSign = self.sign !== n.sign,
        mod = value[1],
        mSign = self.sign;
    if (typeof quotient === "number") {
        if (qSign) quotient = -quotient;
        quotient = new shaka.vimond.SmallInteger(quotient);
    } else quotient = new shaka.vimond.BigInteger(quotient, qSign);
    if (typeof mod === "number") {
        if (mSign) mod = -mod;
        mod = new shaka.vimond.SmallInteger(mod);
    } else mod = new shaka.vimond.BigInteger(mod, mSign);
    return [quotient, mod];
}

shaka.vimond.BigInteger.prototype.divmod = function (v) {
    var result = divModAny(this, v);
    return {
        quotient: result[0],
        remainder: result[1]
    };
};
shaka.vimond.SmallInteger.prototype.divmod = shaka.vimond.BigInteger.prototype.divmod;

shaka.vimond.BigInteger.prototype.divide = function (v) {
    return divModAny(this, v)[0];
};
shaka.vimond.SmallInteger.prototype.over = shaka.vimond.SmallInteger.prototype.divide = shaka.vimond.BigInteger.prototype.over = shaka.vimond.BigInteger.prototype.divide;

shaka.vimond.BigInteger.prototype.mod = function (v) {
    return divModAny(this, v)[1];
};
shaka.vimond.SmallInteger.prototype.remainder = shaka.vimond.SmallInteger.prototype.mod = shaka.vimond.BigInteger.prototype.remainder = shaka.vimond.BigInteger.prototype.mod;

shaka.vimond.BigInteger.prototype.pow = function (v) {
    var n = parseValue(v),
        a = this.value,
        b = n.value,
        value, x, y;
    if (b === 0) return shaka.vimond.Integer[1];
    if (a === 0) return shaka.vimond.Integer[0];
    if (a === 1) return shaka.vimond.Integer[1];
    if (a === -1) return n.isEven() ? shaka.vimond.Integer[1] : shaka.vimond.Integer[-1];
    if (n.sign) {
        return shaka.vimond.Integer[0];
    }
    if (!n.isSmall) throw new Error("The exponent " + n.toString() + " is too large.");
    if (this.isSmall) {
        if (isPrecise(value = Math.pow(a, b)))
            return new shaka.vimond.SmallInteger(truncate(value));
    }
    x = this;
    y = shaka.vimond.Integer[1];
    while (true) {
        if (b & 1 === 1) {
            y = y.times(x);
            --b;
        }
        if (b === 0) break;
        b /= 2;
        x = x.square();
    }
    return y;
};
shaka.vimond.SmallInteger.prototype.pow = shaka.vimond.BigInteger.prototype.pow;

shaka.vimond.BigInteger.prototype.modPow = function (exp, mod) {
    exp = parseValue(exp);
    mod = parseValue(mod);
    if (mod.isZero()) throw new Error("Cannot take modPow with modulus 0");
    var r = shaka.vimond.Integer[1],
        base = this.mod(mod);
    while (exp.isPositive()) {
        if (base.isZero()) return shaka.vimond.Integer[0];
        if (exp.isOdd()) r = r.multiply(base).mod(mod);
        exp = exp.divide(2);
        base = base.square().mod(mod);
    }
    return r;
};
shaka.vimond.SmallInteger.prototype.modPow = shaka.vimond.BigInteger.prototype.modPow;

function compareAbs(a, b) {
    if (a.length !== b.length) {
        return a.length > b.length ? 1 : -1;
    }
    for (var i = a.length - 1; i >= 0; i--) {
        if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
}

shaka.vimond.BigInteger.prototype.compareAbs = function (v) {
    var n = parseValue(v),
        a = this.value,
        b = n.value;
    if (n.isSmall) return 1;
    return compareAbs(a, b);
};
shaka.vimond.SmallInteger.prototype.compareAbs = function (v) {
    var n = parseValue(v),
        a = Math.abs(this.value),
        b = n.value;
    if (n.isSmall) {
        b = Math.abs(b);
        return a === b ? 0 : a > b ? 1 : -1;
    }
    return -1;
};

shaka.vimond.BigInteger.prototype.compare = function (v) {
    // See discussion about comparison with Infinity:
    // https://github.com/peterolson/BigInteger.js/issues/61
    if (v === Infinity) {
        return -1;
    }
    if (v === -Infinity) {
        return 1;
    }

    var n = parseValue(v),
        a = this.value,
        b = n.value;
    if (this.sign !== n.sign) {
        return n.sign ? 1 : -1;
    }
    if (n.isSmall) {
        return this.sign ? -1 : 1;
    }
    return compareAbs(a, b) * (this.sign ? -1 : 1);
};
shaka.vimond.BigInteger.prototype.compareTo = shaka.vimond.BigInteger.prototype.compare;

shaka.vimond.SmallInteger.prototype.compare = function (v) {
    if (v === Infinity) {
        return -1;
    }
    if (v === -Infinity) {
        return 1;
    }

    var n = parseValue(v),
        a = this.value,
        b = n.value;
    if (n.isSmall) {
        return a == b ? 0 : a > b ? 1 : -1;
    }
    if (a < 0 !== n.sign) {
        return a < 0 ? -1 : 1;
    }
    return a < 0 ? 1 : -1;
};
shaka.vimond.SmallInteger.prototype.compareTo = shaka.vimond.SmallInteger.prototype.compare;

shaka.vimond.BigInteger.prototype.equals = function (v) {
    return this.compare(v) === 0;
};
shaka.vimond.SmallInteger.prototype.eq = shaka.vimond.SmallInteger.prototype.equals = shaka.vimond.BigInteger.prototype.eq = shaka.vimond.BigInteger.prototype.equals;

shaka.vimond.BigInteger.prototype.notEquals = function (v) {
    return this.compare(v) !== 0;
};
shaka.vimond.SmallInteger.prototype.neq = shaka.vimond.SmallInteger.prototype.notEquals = shaka.vimond.BigInteger.prototype.neq = shaka.vimond.BigInteger.prototype.notEquals;

shaka.vimond.BigInteger.prototype.greater = function (v) {
    return this.compare(v) > 0;
};
shaka.vimond.SmallInteger.prototype.gt = shaka.vimond.SmallInteger.prototype.greater = shaka.vimond.BigInteger.prototype.gt = shaka.vimond.BigInteger.prototype.greater;

shaka.vimond.BigInteger.prototype.lesser = function (v) {
    return this.compare(v) < 0;
};
shaka.vimond.SmallInteger.prototype.lt = shaka.vimond.SmallInteger.prototype.lesser = shaka.vimond.BigInteger.prototype.lt = shaka.vimond.BigInteger.prototype.lesser;

shaka.vimond.BigInteger.prototype.greaterOrEquals = function (v) {
    return this.compare(v) >= 0;
};
shaka.vimond.SmallInteger.prototype.geq = shaka.vimond.SmallInteger.prototype.greaterOrEquals = shaka.vimond.BigInteger.prototype.geq = shaka.vimond.BigInteger.prototype.greaterOrEquals;

shaka.vimond.BigInteger.prototype.lesserOrEquals = function (v) {
    return this.compare(v) <= 0;
};
shaka.vimond.SmallInteger.prototype.leq = shaka.vimond.SmallInteger.prototype.lesserOrEquals = shaka.vimond.BigInteger.prototype.leq = shaka.vimond.BigInteger.prototype.lesserOrEquals;

shaka.vimond.BigInteger.prototype.isEven = function () {
    return (this.value[0] & 1) === 0;
};
shaka.vimond.SmallInteger.prototype.isEven = function () {
    return (this.value & 1) === 0;
};

shaka.vimond.BigInteger.prototype.isOdd = function () {
    return (this.value[0] & 1) === 1;
};
shaka.vimond.SmallInteger.prototype.isOdd = function () {
    return (this.value & 1) === 1;
};

shaka.vimond.BigInteger.prototype.isPositive = function () {
    return !this.sign;
};
shaka.vimond.SmallInteger.prototype.isPositive = function () {
    return this.value > 0;
};

shaka.vimond.BigInteger.prototype.isNegative = function () {
    return this.sign;
};
shaka.vimond.SmallInteger.prototype.isNegative = function () {
    return this.value < 0;
};

shaka.vimond.BigInteger.prototype.isUnit = function () {
    return false;
};
shaka.vimond.SmallInteger.prototype.isUnit = function () {
    return Math.abs(this.value) === 1;
};

shaka.vimond.BigInteger.prototype.isZero = function () {
    return false;
};
shaka.vimond.SmallInteger.prototype.isZero = function () {
    return this.value === 0;
};
shaka.vimond.BigInteger.prototype.isDivisibleBy = function (v) {
    var n = parseValue(v);
    var value = n.value;
    if (value === 0) return false;
    if (value === 1) return true;
    if (value === 2) return this.isEven();
    return this.mod(n).equals(Integer[0]);
};
shaka.vimond.SmallInteger.prototype.isDivisibleBy = shaka.vimond.BigInteger.prototype.isDivisibleBy;

function isBasicPrime(v) {
    var n = v.abs();
    if (n.isUnit()) return false;
    if (n.equals(2) || n.equals(3) || n.equals(5)) return true;
    if (n.isEven() || n.isDivisibleBy(3) || n.isDivisibleBy(5)) return false;
    if (n.lesser(25)) return true;
    // we don't know if it's prime: let the other functions figure it out
}

shaka.vimond.BigInteger.prototype.isPrime = function () {
    var isPrime = isBasicPrime(this);
    if (isPrime !== undefined) return isPrime;
    var n = this.abs(),
        nPrev = n.prev();
    var a = [2, 3, 5, 7, 11, 13, 17, 19],
        b = nPrev,
        d, t, i, x;
    while (b.isEven()) b = b.divide(2);
    for (i = 0; i < a.length; i++) {
        x = bigInt(a[i]).modPow(b, n);
        if (x.equals(Integer[1]) || x.equals(nPrev)) continue;
        for (t = true, d = b; t && d.lesser(nPrev) ; d = d.multiply(2)) {
            x = x.square().mod(n);
            if (x.equals(nPrev)) t = false;
        }
        if (t) return false;
    }
    return true;
};
shaka.vimond.SmallInteger.prototype.isPrime = shaka.vimond.BigInteger.prototype.isPrime;

shaka.vimond.BigInteger.prototype.isProbablePrime = function (iterations) {
    var isPrime = isBasicPrime(this);
    if (isPrime !== undefined) return isPrime;
    var n = this.abs();
    var t = iterations === undefined ? 5 : iterations;
    // use the Fermat primality test
    for (var i = 0; i < t; i++) {
        var a = bigInt.randBetween(2, n.minus(2));
        if (!a.modPow(n.prev(), n).isUnit()) return false; // definitely composite
    }
    return true; // large chance of being prime
};
shaka.vimond.SmallInteger.prototype.isProbablePrime = shaka.vimond.BigInteger.prototype.isProbablePrime;

shaka.vimond.BigInteger.prototype.next = function () {
    var value = this.value;
    if (this.sign) {
        return subtractSmall(value, 1, this.sign);
    }
    return new shaka.vimond.BigInteger(addSmall(value, 1), this.sign);
};
shaka.vimond.SmallInteger.prototype.next = function () {
    var value = this.value;
    if (value + 1 < MAX_INT) return new shaka.vimond.SmallInteger(value + 1);
    return new shaka.vimond.BigInteger(MAX_INT_ARR, false);
};

shaka.vimond.BigInteger.prototype.prev = function () {
    var value = this.value;
    if (this.sign) {
        return new shaka.vimond.BigInteger(addSmall(value, 1), true);
    }
    return subtractSmall(value, 1, this.sign);
};
shaka.vimond.SmallInteger.prototype.prev = function () {
    var value = this.value;
    if (value - 1 > -MAX_INT) return new shaka.vimond.SmallInteger(value - 1);
    return new shaka.vimond.BigInteger(MAX_INT_ARR, true);
};

var powersOfTwo = [1];
while (powersOfTwo[powersOfTwo.length - 1] <= BASE) powersOfTwo.push(2 * powersOfTwo[powersOfTwo.length - 1]);
var powers2Length = powersOfTwo.length, highestPower2 = powersOfTwo[powers2Length - 1];

function shift_isSmall(n) {
    return ((typeof n === "number" || typeof n === "string") && +Math.abs(n) <= BASE) ||
        (n instanceof shaka.vimond.BigInteger && n.value.length <= 1);
}

shaka.vimond.BigInteger.prototype.shiftLeft = function (n) {
    if (!shift_isSmall(n)) {
        throw new Error(String(n) + " is too large for shifting.");
    }
    n = +n;
    if (n < 0) return this.shiftRight(-n);
    var result = this;
    while (n >= powers2Length) {
        result = result.multiply(highestPower2);
        n -= powers2Length - 1;
    }
    return result.multiply(powersOfTwo[n]);
};
shaka.vimond.SmallInteger.prototype.shiftLeft = shaka.vimond.BigInteger.prototype.shiftLeft;

shaka.vimond.BigInteger.prototype.shiftRight = function (n) {
    var remQuo;
    if (!shift_isSmall(n)) {
        throw new Error(String(n) + " is too large for shifting.");
    }
    n = +n;
    if (n < 0) return this.shiftLeft(-n);
    var result = this;
    while (n >= powers2Length) {
        if (result.isZero()) return result;
        remQuo = divModAny(result, highestPower2);
        result = remQuo[1].isNegative() ? remQuo[0].prev() : remQuo[0];
        n -= powers2Length - 1;
    }
    remQuo = divModAny(result, powersOfTwo[n]);
    return remQuo[1].isNegative() ? remQuo[0].prev() : remQuo[0];
};
shaka.vimond.SmallInteger.prototype.shiftRight = shaka.vimond.BigInteger.prototype.shiftRight;

function bitwise(x, y, fn) {
    y = parseValue(y);
    var xSign = x.isNegative(), ySign = y.isNegative();
    var xRem = xSign ? x.not() : x,
        yRem = ySign ? y.not() : y;
    var xBits = [], yBits = [];
    var xStop = false, yStop = false;
    while (!xStop || !yStop) {
        if (xRem.isZero()) { // virtual sign extension for simulating two's complement
            xStop = true;
            xBits.push(xSign ? 1 : 0);
        }
        else if (xSign) xBits.push(xRem.isEven() ? 1 : 0); // two's complement for negative numbers
        else xBits.push(xRem.isEven() ? 0 : 1);

        if (yRem.isZero()) {
            yStop = true;
            yBits.push(ySign ? 1 : 0);
        }
        else if (ySign) yBits.push(yRem.isEven() ? 1 : 0);
        else yBits.push(yRem.isEven() ? 0 : 1);

        xRem = xRem.over(2);
        yRem = yRem.over(2);
    }
    var result = [];
    for (var i = 0; i < xBits.length; i++) result.push(fn(xBits[i], yBits[i]));
    var sum = bigInt(result.pop()).negate().times(bigInt(2).pow(result.length));
    while (result.length) {
        sum = sum.add(bigInt(result.pop()).times(bigInt(2).pow(result.length)));
    }
    return sum;
}

shaka.vimond.BigInteger.prototype.not = function () {
    return this.negate().prev();
};
shaka.vimond.SmallInteger.prototype.not = shaka.vimond.BigInteger.prototype.not;

shaka.vimond.BigInteger.prototype.and = function (n) {
    return bitwise(this, n, function (a, b) { return a & b; });
};
shaka.vimond.SmallInteger.prototype.and = shaka.vimond.BigInteger.prototype.and;

shaka.vimond.BigInteger.prototype.or = function (n) {
    return bitwise(this, n, function (a, b) { return a | b; });
};
shaka.vimond.SmallInteger.prototype.or = shaka.vimond.BigInteger.prototype.or;

shaka.vimond.BigInteger.prototype.xor = function (n) {
    return bitwise(this, n, function (a, b) { return a ^ b; });
};
shaka.vimond.SmallInteger.prototype.xor = shaka.vimond.BigInteger.prototype.xor;

var LOBMASK_I = 1 << 30, LOBMASK_BI = (BASE & -BASE) * (BASE & -BASE) | LOBMASK_I;
function roughLOB(n) { // get lowestOneBit (rough)
    // shaka.vimond.SmallInteger: return Min(lowestOneBit(n), 1 << 30)
    // shaka.vimond.BigInteger: return Min(lowestOneBit(n), 1 << 14) [BASE=1e7]
    var v = n.value, x = typeof v === "number" ? v | LOBMASK_I : v[0] + v[1] * BASE | LOBMASK_BI;
    return x & -x;
}

function max(a, b) {
    a = parseValue(a);
    b = parseValue(b);
    return a.greater(b) ? a : b;
}
function min(a,b) {
    a = parseValue(a);
    b = parseValue(b);
    return a.lesser(b) ? a : b;
}
function gcd(a, b) {
    a = parseValue(a).abs();
    b = parseValue(b).abs();
    if (a.equals(b)) return a;
    if (a.isZero()) return b;
    if (b.isZero()) return a;
    var c = shaka.vimond.Integer[1], d, t;
    while (a.isEven() && b.isEven()) {
        d = Math.min(roughLOB(a), roughLOB(b));
        a = a.divide(d);
        b = b.divide(d);
        c = c.multiply(d);
    }
    while (a.isEven()) {
        a = a.divide(roughLOB(a));
    }
    do {
        while (b.isEven()) {
            b = b.divide(roughLOB(b));
        }
        if (a.greater(b)) {
            t = b; b = a; a = t;
        }
        b = b.subtract(a);
    } while (!b.isZero());
    return c.isUnit() ? a : a.multiply(c);
}
function lcm(a, b) {
    a = parseValue(a).abs();
    b = parseValue(b).abs();
    return a.divide(gcd(a, b)).multiply(b);
}
function randBetween(a, b) {
    a = parseValue(a);
    b = parseValue(b);
    var low = min(a, b), high = max(a, b);
    var range = high.subtract(low);
    if (range.isSmall) return low.add(Math.round(Math.random() * range));
    var length = range.value.length - 1;
    var result = [], restricted = true;
    for (var i = length; i >= 0; i--) {
        var top = restricted ? range.value[i] : BASE;
        var digit = truncate(Math.random() * top);
        result.unshift(digit);
        if (digit < top) restricted = false;
    }
    result = arrayToSmall(result);
    return low.add(typeof result === "number" ? new shaka.vimond.SmallInteger(result) : new shaka.vimond.BigInteger(result, false));
}
var parseBase = function (text, base) {
    var val = shaka.vimond.Integer[0], pow = shaka.vimond.Integer[1],
        length = text.length;
    if (2 <= base && base <= 36) {
        if (length <= LOG_MAX_INT / Math.log(base)) {
            return new shaka.vimond.SmallInteger(parseInt(text, base));
        }
    }
    base = parseValue(base);
    var digits = [];
    var i;
    var isNegative = text[0] === "-";
    for (i = isNegative ? 1 : 0; i < text.length; i++) {
        var c = text[i].toLowerCase(),
            charCode = c.charCodeAt(0);
        if (48 <= charCode && charCode <= 57) digits.push(parseValue(c));
        else if (97 <= charCode && charCode <= 122) digits.push(parseValue(c.charCodeAt(0) - 87));
        else if (c === "<") {
            var start = i;
            do { i++; } while (text[i] !== ">");
            digits.push(parseValue(text.slice(start + 1, i)));
        }
        else throw new Error(c + " is not a valid character");
    }
    digits.reverse();
    for (i = 0; i < digits.length; i++) {
        val = val.add(digits[i].times(pow));
        pow = pow.times(base);
    }
    return isNegative ? val.negate() : val;
};

function stringify(digit) {
    var v = digit.value;
    if (typeof v === "number") v = [v];
    if (v.length === 1 && v[0] <= 35) {
        return "0123456789abcdefghijklmnopqrstuvwxyz".charAt(v[0]);
    }
    return "<" + v + ">";
}
function toBase(n, base) {
    base = bigInt(base);
    if (base.isZero()) {
        if (n.isZero()) return "0";
        throw new Error("Cannot convert nonzero numbers to base 0.");
    }
    if (base.equals(-1)) {
        if (n.isZero()) return "0";
        if (n.isNegative()) return new Array(1 - n).join("10");
        return "1" + new Array(+n).join("01");
    }
    var minusSign = "";
    if (n.isNegative() && base.isPositive()) {
        minusSign = "-";
        n = n.abs();
    }
    if (base.equals(1)) {
        if (n.isZero()) return "0";
        return minusSign + new Array(+n + 1).join(1);
    }
    var out = [];
    var left = n, divmod;
    while (left.isNegative() || left.compareAbs(base) >= 0) {
        divmod = left.divmod(base);
        left = divmod.quotient;
        var digit = divmod.remainder;
        if (digit.isNegative()) {
            digit = base.minus(digit).abs();
            left = left.next();
        }
        out.push(stringify(digit));
    }
    out.push(stringify(left));
    return minusSign + out.reverse().join("");
}

shaka.vimond.BigInteger.prototype.toString = function (radix) {
    if (radix === undefined) radix = 10;
    if (radix !== 10) return toBase(this, radix);
    var v = this.value, l = v.length, str = String(v[--l]), zeros = "0000000", digit;
    while (--l >= 0) {
        digit = String(v[l]);
        str += zeros.slice(digit.length) + digit;
    }
    var sign = this.sign ? "-" : "";
    return sign + str;
};
shaka.vimond.SmallInteger.prototype.toString = function (radix) {
    if (radix === undefined) radix = 10;
    if (radix != 10) return toBase(this, radix);
    return String(this.value);
};

shaka.vimond.BigInteger.prototype.valueOf = function () {
    return +this.toString();
};
shaka.vimond.BigInteger.prototype.toJSNumber = shaka.vimond.BigInteger.prototype.valueOf;

shaka.vimond.SmallInteger.prototype.valueOf = function () {
    return this.value;
};
shaka.vimond.SmallInteger.prototype.toJSNumber = shaka.vimond.SmallInteger.prototype.valueOf;

function parseStringValue(v) {
    if (isPrecise(+v)) {
        var x = +v;
        if (x === truncate(x))
            return new shaka.vimond.SmallInteger(x);
        throw "Invalid shaka.vimond.Integer: " + v;
    }
    var sign = v[0] === "-";
    if (sign) v = v.slice(1);
    var split = v.split(/e/i);
    if (split.length > 2) throw new Error("Invalid shaka.vimond.Integer: " + split.join("e"));
    if (split.length === 2) {
        var exp = split[1];
        if (exp[0] === "+") exp = exp.slice(1);
        exp = +exp;
        if (exp !== truncate(exp) || !isPrecise(exp)) throw new Error("Invalid shaka.vimond.Integer: " + exp + " is not a valid exponent.");
        var text = split[0];
        var decimalPlace = text.indexOf(".");
        if (decimalPlace >= 0) {
            exp -= text.length - decimalPlace - 1;
            text = text.slice(0, decimalPlace) + text.slice(decimalPlace + 1);
        }
        if (exp < 0) throw new Error("Cannot include negative exponent part for shaka.vimond.Integers");
        text += (new Array(exp + 1)).join("0");
        v = text;
    }
    var isValid = /^([0-9][0-9]*)$/.test(v);
    if (!isValid) throw new Error("Invalid shaka.vimond.Integer: " + v);
    var r = [], max = v.length, l = LOG_BASE, min = max - l;
    while (max > 0) {
        r.push(+v.slice(min, max));
        min -= l;
        if (min < 0) min = 0;
        max -= l;
    }
    trim(r);
    return new shaka.vimond.BigInteger(r, sign);
}

function parseNumberValue(v) {
    if (isPrecise(v)) {
        if (v !== truncate(v)) throw new Error(v + " is not an shaka.vimond.Integer.");
        return new shaka.vimond.SmallInteger(v);
    }
    return parseStringValue(v.toString());
}

function parseValue(v) {
    if (typeof v === "number") {
        return parseNumberValue(v);
    }
    if (typeof v === "string") {
        return parseStringValue(v);
    }
    return v;
}
// Pre-define numbers in range [-999,999]
for (var i = 0; i < 1000; i++) {
    shaka.vimond.Integer[i] = new shaka.vimond.SmallInteger(i);
    if (i > 0) shaka.vimond.Integer[-i] = new shaka.vimond.SmallInteger(-i);
}
// Backwards compatibility
shaka.vimond.Integer.one = shaka.vimond.Integer[1];
shaka.vimond.Integer.zero = shaka.vimond.Integer[0];
shaka.vimond.Integer.minusOne = shaka.vimond.Integer[-1];
shaka.vimond.Integer.max = max;
shaka.vimond.Integer.min = min;
shaka.vimond.Integer.gcd = gcd;
shaka.vimond.Integer.lcm = lcm;

// TEA/Vimond addition:
shaka.vimond.Integer.isPrecise = isPrecise;

shaka.vimond.Integer.isInstance = function (x) { return x instanceof shaka.vimond.BigInteger || x instanceof shaka.vimond.SmallInteger; };
shaka.vimond.Integer.randBetween = randBetween;

