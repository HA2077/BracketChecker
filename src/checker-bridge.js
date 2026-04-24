import CheckerModule from '../public/checker.js';

let _module = null;
let _checker = null;

/**
 * Initializes the WASM module and the SyntaxChecker instance.
 * Must be called on page load.
 */
export async function initChecker() {
    _module = await CheckerModule();
    _checker = new _module.SyntaxChecker();
}

/**
 * Validates the input string based on the provided mode.
 * @param {string} input - The string to check.
 * @param {string} mode - 'JSON' or other supported modes.
 * @returns {object} Plain JS object with validation results.
 */
export function check(input, mode = 'JSON') {
    if (!_checker) {
        throw new Error('Call initChecker() before check()');
    }

    const result = _checker.check(input, _module.Mode[mode]);

    // Convert WASM vector to plain JS array for the frontend
    return {
        valid: result.valid,
        errors: Array.from({ length: result.errors.size() }, (_, i) => {
            const e = result.errors.get(i);
            const snapshot = e.stackSnapshot 
                ? Array.from({ length: e.stackSnapshot.size() }, (_, j) => {
                    const f = e.stackSnapshot.get(j);
                    return { ch: String.fromCharCode(f.ch), pos: f.pos };
                })
                : [];
            return {
                type: e.type,
                pos: e.pos,
                got: String.fromCharCode(e.got),
                expected: e.expected ? String.fromCharCode(e.expected) : null,
                pairedPos: e.pairedPos,
                stackSnapshot: snapshot,
            };
        })
    };
}