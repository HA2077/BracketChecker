# Bracket Checker — Deep File-by-File Breakdown
> Exhaustive guide to every module, function, and data structure

---

## Table of Contents

1. [C++ Core Layer](#1-c-core-layer-cpp)
   - [syntax_checker.h](#syntax_checkerh)
   - [syntax_checker.cpp](#syntax_checkercpp)
   - [bindings.cpp](#bindingscpp)
2. [WASM Bridge Layer](#2-wasm-bridge-layer)
   - [checker-bridge.js](#checker-bridgejs)
3. [Frontend Layer](#3-frontend-layer-src)
   - [main.js](#mainjs)
   - [editor.js](#editorjs)
   - [error-panel.js](#error-paneljs)
   - [error-state.js](#error-statejs)
   - [arc-overlay.js](#arc-overlayjs)
   - [style.css](#stylecss)
4. [Build & Config Files](#4-build--config-files)
   - [index.html](#indexhtml)
   - [vite.config.js](#viteconfigjs)
   - [WAcompile.sh](#wacompilesh)
   - [package.json](#packagejson)

---

## 1. C++ Core Layer (`cpp/`)

These three files compile into `public/checker.js` + `public/checker.wasm` via Emscripten. They contain zero browser knowledge — pure logic.

---

### `syntax_checker.h`

**Role:** Header file — declares all types, enums, structs, and the `SyntaxChecker` class interface. Every other file includes this.

**Contents breakdown:**

```cpp
enum class Mode { JSON, HTML, MATH };
```
- `JSON`: Checks `{}`, `[]`, `()`. Skips brackets inside double-quoted strings.
- `HTML`: Checks tag nesting (`<div>` → `</div>`). Knows void/self-closing tags.
- `MATH`: Checks `{}`, `[]`, `()` PLUS operator grammar (no `+*`, no `(1 +)`, etc.).

```cpp
enum class TokenType { NUMBER, OPERATOR, OPEN, CLOSE, INVALID };
```
- Used **only** in math mode's second pass (`checkMathSyntax`).
- `NUMBER`: digits `0-9` and decimal point `.`
- `OPERATOR`: `+`, `-`, `*`, `/`
- `OPEN`/`CLOSE`: `(` and `[` / `)` and `]` (note: `{}` are NOT math brackets here)
- `INVALID`: whitespace or anything else (ignored)

```cpp
struct Frame {
    std::string ch;
    int pos;
};
```
- One entry on the stack.
- `ch`: For JSON/MATH this is a single-char string like `"{"` or `"("`. For HTML it's the tag name like `"div"` or `"span"`.
- `pos`: The character index in the input string where this opener was found.
- **Why string instead of char?** HTML tag names are multi-character, so `ch` must be a string to handle both cases uniformly.

```cpp
struct Error {
    std::string type;
    int pos;
    std::string got;
    std::string expected;
    int pairedPos;
    std::vector<Frame> stackSnapshot;
};
```
- `type`: One of `"mismatch"`, `"unclosed"`, `"unexpected"`, `"syntax"`.
- `pos`: Where the error character is in the input string.
- `got`: The actual character/tag that caused the problem (e.g. `")"`, `"</span>"`).
- `expected`: What should have been there (e.g. `"]"`, `"<div>"`). Empty string if not applicable.
- `pairedPos`: For mismatches only — the position of the opener that doesn't match. `-1` for other error types.
- `stackSnapshot`: A **copy** of the entire stack at the moment the error occurred. This is what powers the "Stack:" visualization in the error panel. For syntax errors this is empty.

```cpp
struct CheckResult {
    bool valid;
    std::vector<Error> errors;
};
```
- `valid`: `true` only if `errors` is empty AND the stack is empty after parsing.
- `errors`: All detected errors, sorted by position (for MATH mode; JSON/HTML are naturally in order).

```cpp
class SyntaxChecker {
public:
    CheckResult check(const std::string &input, Mode mode);
    std::vector<Error> checkMathSyntax(const std::string& input);

private:
    bool isOpen(char c, Mode m);
    bool isClose(char c, Mode m);
    char matchingOpen(char closeChar);
    void skipString(const std::string &s, int &i);
    TokenType classifyMathToken(char c);

    bool isHtmlTagOpen(const std::string &s, int i, std::string &outTagName);
    bool isHtmlTagClose(const std::string &s, int i, std::string &outTagName);
    bool isHtmlVoidTag(const std::string &tagName);
    bool isHtmlSelfClose(const std::string &s, int i);
};
```
- `check()` is the main entry point called from JS.
- `checkMathSyntax()` is a **secondary** check run only in MATH mode after the bracket check completes.
- Private helpers are split by concern: generic bracket helpers, string skipping, math token classification, and HTML tag parsing.

---

### `syntax_checker.cpp`

**Role:** The entire algorithm lives here. This is the most important file in the project.

#### Helper: `isOpen(char c, Mode m)`
```cpp
bool SyntaxChecker::isOpen(char c, Mode m){
    if (m == Mode::HTML) return false;
    return c == '{' || c == '[' || c == '(';
}
```
- Returns `false` for HTML because HTML doesn't use raw `{[(` brackets — it uses `<tag>` syntax.
- For JSON and MATH, recognizes `{`, `[`, `(` as openers.

#### Helper: `isClose(char c, Mode m)`
```cpp
bool SyntaxChecker::isClose(char c, Mode m){
    if (m == Mode::HTML) return false;
    return c == '}' || c == ']' || c == ')';
}
```
- Same HTML exception as above.
- Recognizes `}`, `]`, `)` as closers.

#### Helper: `matchingOpen(char close)`
```cpp
char SyntaxChecker::matchingOpen(char close){
    if (close == ')') return '(';
    if (close == ']') return '[';
    if (close == '}') return '{';
    return 0;
}
```
- Simple lookup table. Returns `0` (null char) for unknown closers — shouldn't happen in practice since `isClose` filters them.

#### Helper: `skipString(const std::string &s, int &i)`
```cpp
void SyntaxChecker::skipString(const std::string &s, int &i){
    i++;
    while (i < (int)s.size()){
        if (s[i] == '\'){
            i += 2;
            continue;
        }
        if (s[i] == '"'){
            i++;
            break;
        }
        i++;
    }
}
```
- Called when `c == '"'` in JSON mode.
- Advances past the opening quote, then walks until it finds the closing quote.
- Handles escaped quotes (`"`) by skipping the backslash + next char.
- **Critical:** After this returns, the outer `for` loop will do `i++`, so the closing quote is consumed.
- **Bug risk:** If a string is unterminated (no closing quote), this walks to `s.size()` and stops. The outer loop then ends. No error is reported for the unterminated string — that's intentional scope (this is a bracket checker, not a full JSON parser).

#### Helper: `classifyMathToken(char c)`
```cpp
TokenType SyntaxChecker::classifyMathToken(char c) {
    if (isdigit(c) || c == '.')                          return TokenType::NUMBER;
    if (c == '+' || c == '-' || c == '*' || c == '/')    return TokenType::OPERATOR;
    if (c == '(' || c == '[')                            return TokenType::OPEN;
    if (c == ')' || c == ']')                            return TokenType::CLOSE;
    return TokenType::INVALID;
}
```
- Classifies a single character for math syntax checking.
- Note: `{}` are NOT considered math tokens here — they were already handled by the bracket stack in the first pass.
- `INVALID` covers whitespace and any other characters (letters, commas, etc.).

#### Method: `checkMathSyntax(const std::string& input)`
```cpp
std::vector<Error> SyntaxChecker::checkMathSyntax(const std::string& input) {
    std::vector<Error> errors;
    TokenType prev = TokenType::OPEN;
    int lastPos = -1;

    for (int i = 0; i < (int)input.size(); i++) {
        if (isspace(input[i])) continue;

        TokenType cur = classifyMathToken(input[i]);
        lastPos = i;
        bool bad = false;

        switch (cur) {
            case TokenType::OPERATOR:
                if (prev == TokenType::OPERATOR || prev == TokenType::OPEN)
                    bad = true;
                break;
            case TokenType::NUMBER:
                if (prev == TokenType::CLOSE)
                    bad = true;
                break;
            case TokenType::OPEN:
                if (prev == TokenType::NUMBER || prev == TokenType::CLOSE)
                    bad = true;
                break;
            case TokenType::CLOSE:
                break;
            case TokenType::INVALID:
                break;
        }

        if (bad)
            errors.push_back({ "syntax", i, std::string(1, input[i]), "", -1, {} });

        if (cur != TokenType::INVALID) prev = cur;
    }

    if (prev == TokenType::OPERATOR && lastPos != -1)
        errors.push_back({ "syntax", lastPos, std::string(1, input[lastPos]), "", -1, {} });

    return errors;
}
```

**State machine logic:**
- `prev` tracks the type of the **previous non-whitespace token**.
- Valid transitions:
  - `OPEN` → `NUMBER` (e.g. `(1`)
  - `OPEN` → `OPEN` (e.g. `([`)
  - `NUMBER` → `OPERATOR` (e.g. `1+`)
  - `NUMBER` → `CLOSE` (e.g. `1)`)
  - `OPERATOR` → `NUMBER` (e.g. `+1`)
  - `OPERATOR` → `OPEN` (e.g. `+(`)
  - `CLOSE` → `OPERATOR` (e.g. `)+`)
  - `CLOSE` → `CLOSE` (e.g. `])`)
- Invalid transitions (set `bad = true`):
  - `OPERATOR` → `OPERATOR` (e.g. `1 +* 2`)
  - `OPEN` → `OPERATOR` (e.g. `(+`)
  - `NUMBER` → `NUMBER` (not caught — treated as multi-digit number)
  - `NUMBER` → `OPEN` (e.g. `1(`) — missing operator
  - `CLOSE` → `NUMBER` (e.g. `)1`) — missing operator
  - `OPERATOR` → `CLOSE` (e.g. `1 + )`) — incomplete expression

**End-of-input check:**
- If the last token was an `OPERATOR`, report syntax error at `lastPos`.
- This catches inputs like `1 + 2 *`.

**Note on `INVALID` tokens:** They don't update `prev`, so whitespace and unknown chars are effectively invisible to the state machine.

#### Helper: `isHtmlTagOpen(const std::string &s, int i, std::string &outTagName)`
```cpp
bool SyntaxChecker::isHtmlTagOpen(const std::string &s, int i, std::string &outTagName){
    if (s[i] != '<') return false;
    int j = i + 1;
    if (j >= (int)s.size()) return false;
    if (s[j] == '/') return false;
    if (!std::isalpha(s[j]) && s[j] != '_') return false;
    int nameStart = j;
    while (j < (int)s.size() && (std::isalnum(s[j]) || s[j] == '_' || s[j] == '-')){
        j++;
    }
    outTagName = s.substr(nameStart, j - nameStart);
    return !outTagName.empty();
}
```
- Detects if position `i` starts an opening HTML tag like `<div>` or `<my-component>`.
- Returns `false` for closing tags (`</div>`) because `s[j] == '/'`.
- Tag names must start with a letter or underscore.
- Tag names can contain letters, digits, underscores, and hyphens.
- **Does NOT check for `>`** — it only extracts the tag name. The caller (`check()`) doesn't need the `>` position because it only cares about the tag name for stack matching.
- **Limitation:** Doesn't handle attributes. `<div class="x">` is treated as tag name `div` because parsing stops at the space. This is intentional — attributes don't affect nesting.

#### Helper: `isHtmlTagClose(const std::string &s, int i, std::string &outTagName)`
```cpp
bool SyntaxChecker::isHtmlTagClose(const std::string &s, int i, std::string &outTagName){
    if (s[i] != '<') return false;
    int j = i + 1;
    if (j >= (int)s.size() || s[j] != '/') return false;
    j++;
    if (j >= (int)s.size()) return false;
    if (!std::isalpha(s[j]) && s[j] != '_') return false;
    int nameStart = j;
    while (j < (int)s.size() && (std::isalnum(s[j]) || s[j] == '_' || s[j] == '-')){
        j++;
    }
    outTagName = s.substr(nameStart, j - nameStart);
    return !outTagName.empty();
}
```
- Same logic as `isHtmlTagOpen` but requires `</` prefix.
- Extracts the tag name from `</div>` → `div`.

#### Helper: `isHtmlVoidTag(const std::string &tagName)`
```cpp
bool SyntaxChecker::isHtmlVoidTag(const std::string &tagName){
    static const std::string voids[] = {
        "meta","link","br","hr","img","input","area","base",
        "col","embed","param","source","track","wbr","!DOCTYPE"
    };
    for (const auto &v : voids){
        if (tagName == v) return true;
    }
    return false;
}
```
- Hardcoded list of HTML void/self-closing tags that don't need a closing tag.
- `!DOCTYPE` is included because it looks like `<!DOCTYPE html>`.
- Case-sensitive! `<BR>` would NOT be recognized as void.

#### Helper: `isHtmlSelfClose(const std::string &s, int i)`
```cpp
bool SyntaxChecker::isHtmlSelfClose(const std::string &s, int i){
    int j = i + 1;
    while (j < (int)s.size() && s[j] != '>'){
        if (s[j] == '/') return j + 1 < (int)s.size() && s[j + 1] == '>';
        j++;
    }
    return false;
}
```
- Checks if a tag starting at `i` is self-closing: `<br/>` or `<img src="x"/>`.
- Walks from `i+1` (past `<`) looking for `>`.
- If it sees `/` and the next char is `>`, returns `true`.
- **Limitation:** Doesn't validate that `/` is right before `>`. `<div/ >` would incorrectly return `true` if `/` is followed by `>` later. In practice this is rare.

#### Free function: `stackToVector(const std::stack<Frame> &stk)`
```cpp
std::vector<Frame> stackToVector(const std::stack<Frame> &stk){
    std::vector<Frame> frames;
    std::stack<Frame> temp = stk;
    while (!temp.empty()){
        frames.push_back(temp.top());
        temp.pop();
    }
    return frames;
}
```
- **Not a member of SyntaxChecker** — it's a free function in the `.cpp` file.
- Makes a **copy** of the stack (since `std::stack` can't be iterated), pops everything into a vector.
- The vector ends up in **reverse order** (top of stack is at index 0). This is fine because the frontend reverses it again for display.
- Called whenever an error occurs to snapshot the stack state.

#### Main Method: `check(const std::string &input, Mode mode)`
This is the heart of the entire application. ~100 lines that do everything.

**Setup:**
```cpp
std::stack<Frame> stck;
CheckResult result{true, {}};
```
- Fresh stack and result for each call.

**Main loop:**
```cpp
for (int i = 0; i < (int)input.size(); ++i){
    char c = input[i];
```
- Iterates character by character.

**JSON string skipping:**
```cpp
if (c == '"' && mode == Mode::JSON){
    skipString(input, i);
    continue;
}
```
- In JSON mode, double quotes trigger string skipping.
- After `skipString`, `i` points at the closing quote. The outer loop's `i++` moves past it.
- **Important:** Brackets inside strings are completely ignored. `"a": {"b": [1]}` inside quotes would not push anything.

**HTML mode branch:**
```cpp
if (mode == Mode::HTML){
    std::string tagName;
    if (isHtmlTagClose(input, i, tagName)){
        if (stck.empty()){
            result.valid = false;
            Error err{"unexpected", i, "</" + tagName + ">", "", -1, {}};
            result.errors.push_back(err);
        } else {
            Frame top = stck.top();
            if (top.ch != tagName){
                result.valid = false;
                Error err{"mismatch", i, "</" + tagName + ">", "<" + top.ch + ">", top.pos, stackToVector(stck)};
                result.errors.push_back(err);
                stck.pop();
            } else {
                stck.pop();
            }
        }
        continue;
    }
    if (isHtmlTagOpen(input, i, tagName)){
        if (isHtmlVoidTag(tagName) || isHtmlSelfClose(input, i))
            continue;
        stck.push({tagName, i});
        continue;
    }
}
```
- **Closing tag handling:**
  - If stack is empty → `unexpected` error (closing tag with no opener).
  - If top of stack doesn't match → `mismatch` error. **Pops the stack anyway** (error recovery — keeps parsing).
  - If it matches → pop and continue.
- **Opening tag handling:**
  - If it's a void tag or self-closing → skip (don't push).
  - Otherwise → push `{tagName, i}` onto stack.
- **Note:** `continue` skips the rest of the loop, so HTML tags don't fall through to the generic bracket check.

**Generic bracket check (JSON + MATH):**
```cpp
if (isOpen(c, mode))
    stck.push({std::string(1, c), i});
else if (isClose(c, mode)){
    if (stck.empty()){
        result.valid = false;
        Error err{"unexpected", i, std::string(1, c), "", -1, {}};
        result.errors.push_back(err);
    } else {
        Frame top = stck.top();
        if (top.ch != std::string(1, matchingOpen(c))){
            result.valid = false;
            Error err{"mismatch", i, std::string(1, c), std::string(1, matchingOpen(c)), top.pos, stackToVector(stck)};
            result.errors.push_back(err);
            stck.pop();
        } else {
            stck.pop();
        }
    }
}
```
- Same logic as HTML but with single characters.
- `std::string(1, c)` converts a `char` to a `std::string` so it matches the `Frame::ch` type.
- For mismatches, `expected` is set to the matching opener (e.g. if top is `[` and we see `)`, expected is `]`). Wait — actually `matchingOpen(c)` returns the opener for `c`, not the closer for the top. **This is a subtle bug/feature:** If top is `[` and we see `)`, `matchingOpen(')')` returns `'('`, so `expected` becomes `"("`. But the frontend's `error-panel.js` doesn't actually use `expected` for mismatch display in the current code — it uses the top frame's opener. So this field is somewhat misleading for mismatches. The frontend reconstructs the expected closer from the opener.

**Post-loop unclosed check:**
```cpp
while (!stck.empty()){
    Frame f = stck.top();
    stck.pop();
    Error err{"unclosed", f.pos, "<" + f.ch + ">", "", -1, stackToVector(stck)};
    result.valid = false;
    result.errors.push_back(err);
}
```
- Pops remaining frames and reports each as `unclosed`.
- `got` is formatted as `"<" + f.ch + ">"` — this works for HTML tags but looks weird for JSON: `"<{>"`. The frontend's `tagDisplayName()` strips these angle brackets.
- `stackSnapshot` contains the stack **after** popping the current frame. So the first unclosed error shows the remaining stack, the last shows an empty stack.

**MATH mode second pass:**
```cpp
if (mode == Mode::MATH) {
    std::vector<Error> syntaxErrors = checkMathSyntax(input);
    for (auto& e : syntaxErrors) {
        result.valid = false;
        result.errors.push_back(e);
    }
    std::sort(result.errors.begin(), result.errors.end(),
        [](const Error& a, const Error& b) { return a.pos < b.pos; });
}
```
- Runs `checkMathSyntax` and appends syntax errors to the bracket errors.
- Sorts all errors by position so they appear in left-to-right order in the UI.
- Without this sort, bracket errors and syntax errors could be interleaved randomly.

**Return:**
```cpp
return result;
```

---

### `bindings.cpp`

**Role:** Emscripten glue. Exposes C++ types to JavaScript.

```cpp
#include <emscripten/bind.h>
#include "syntax_checker.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(checker_module){
```
- `EMSCRIPTEN_BINDINGS` is a macro that registers everything inside it with the Emscripten runtime.
- The name `checker_module` is arbitrary but must be unique.

**Enum binding:**
```cpp
enum_<Mode>("Mode")
    .value("JSON", Mode::JSON)
    .value("HTML", Mode::HTML)
    .value("MATH", Mode::MATH);
```
- Creates a JS object `Module.Mode` with properties `JSON`, `HTML`, `MATH`.
- In JS: `_module.Mode.JSON` returns the numeric value the C++ enum maps to.

**Value object bindings:**
```cpp
value_object<Frame>("Frame")
    .field("ch",  &Frame::ch)
    .field("pos", &Frame::pos);

value_object<Error>("Error")
    .field("type",        &Error::type)
    .field("pos",         &Error::pos)
    .field("got",         &Error::got)
    .field("expected",    &Error::expected)
    .field("pairedPos",   &Error::pairedPos)
    .field("stackSnapshot", &Error::stackSnapshot);

value_object<CheckResult>("CheckResult")
    .field("valid",  &CheckResult::valid)
    .field("errors", &CheckResult::errors);
```
- `value_object` creates a JS object that maps directly to the C++ struct.
- Each `.field()` call binds a JS property name to a C++ member pointer.
- `Error.stackSnapshot` is a `vector<Frame>` — this works because we also register the vector type.

**Vector bindings:**
```cpp
register_vector<Frame>("VectorFrame");
register_vector<Error>("VectorError");
```
- These create special JS objects that behave like arrays but are backed by WASM memory.
- They have `.size()` and `.get(i)` methods (not normal JS array bracket indexing).
- `checker-bridge.js` converts these to real JS arrays.

**Class binding:**
```cpp
class_<SyntaxChecker>("SyntaxChecker")
    .constructor()
    .function("check", &SyntaxChecker::check);
```
- Exposes the `SyntaxChecker` class to JS.
- `.constructor()` allows `new _module.SyntaxChecker()` in JS.
- `.function("check", ...)` binds the C++ method to a JS method of the same name.

**Why this file matters:** Without it, the C++ code is invisible to JavaScript. Emscripten compiles the `.wasm` binary, but this file tells it *what* to expose and *how* to expose it.

---

## 2. WASM Bridge Layer

### `checker-bridge.js`

**Role:** The only file that imports the WASM module and converts its outputs to plain JS.

```js
import CheckerModule from '../public/checker.js';
```
- Imports the Emscripten-generated JS glue file.
- `checker.js` is a self-initializing ES module that loads `checker.wasm` automatically.

```js
let _module = null;
let _checker = null;
```
- Module-level state. `_module` is the Emscripten module object. `_checker` is the `SyntaxChecker` instance.

**`initChecker()`:**
```js
export async function initChecker() {
    _module = await CheckerModule();
    _checker = new _module.SyntaxChecker();
}
```
- `CheckerModule()` returns a Promise that resolves when the WASM binary is loaded and initialized.
- Creates one `SyntaxChecker` instance. This instance is reused for all subsequent checks (more efficient than creating a new one each time).
- **Must be awaited** before calling `check()`. `main.js` does `await initChecker()` at the top level.

**`check(input, mode = 'JSON')`:**
```js
export function check(input, mode = 'JSON') {
    if (!_checker) {
        throw new Error('Call initChecker() before check()');
    }

    const result = _checker.check(input, _module.Mode[mode]);
```
- Validates that `initChecker()` was called.
- `_module.Mode[mode]` looks up the enum value. If `mode` is `"JSON"`, this is `_module.Mode.JSON`.
- Calls the C++ `check()` method. The string `input` is automatically converted to `std::string` by Emscripten.

**Vector conversion:**
```js
    return {
        valid: result.valid,
        errors: Array.from({ length: result.errors.size() }, (_, i) => {
            const e = result.errors.get(i);
            const snapshot = e.stackSnapshot 
                ? Array.from({ length: e.stackSnapshot.size() }, (_, j) => {
                    const f = e.stackSnapshot.get(j);
                    return { ch: f.ch, pos: f.pos };
                })
                : [];
            return {
                type: e.type,
                pos: e.pos,
                got: e.got,
                expected: e.expected || null,
                pairedPos: e.pairedPos,
                stackSnapshot: snapshot,
            };
        })
    };
```
- `result.errors` is an Emscripten `VectorError` object, not a real JS array.
- `Array.from({ length: result.errors.size() }, ...)` creates a real JS array by calling `.get(i)` for each index.
- Nested `Array.from` does the same for `stackSnapshot` (which is a `VectorFrame`).
- `e.expected || null` converts empty C++ strings to JS `null`.
- Returns a plain JS object that the rest of the frontend can use without knowing WASM exists.

**Design note:** This file is the **abstraction boundary**. If you ever swap the C++ backend for a pure JS implementation, only this file needs to change.

---

## 3. Frontend Layer (`src/`)

### `main.js`

**Role:** Application entry point. Orchestrates all other modules.

```js
import { initChecker, check } from './checker-bridge.js';
import { createEditor, applyErrorDecorations } from './editor.js';
import { renderErrors } from './error-panel.js';
import { drawMultiArcs, clearArcs } from './arc-overlay.js';
```
- Imports from all other frontend modules.

```js
await initChecker();
```
- Top-level await. The entire module waits for WASM to load before doing anything else.

**State:**
```js
let debounceTimer;
let currentInput = '';
let editorView = null;
```
- `debounceTimer`: ID from `setTimeout`, used to cancel pending checks.
- `currentInput`: The latest editor content.
- `editorView`: The CodeMirror `EditorView` instance.

**`initEditor()`:**
```js
function initEditor() {
    if (editorView) {
        editorView.destroy();
    }
    editorView = createEditor(document.getElementById('editor-pane'), (input) => {
        currentInput = input;
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            hideWelcome();
            const mode = getActiveMode();
            const result = check(input, mode);

            renderErrors(result.errors, input);

            if (editorView && result.errors.length > 0) {
                applyErrorDecorations(editorView, result.errors);
                if (mode !== 'HTML')
                    drawMultiArcs(editorView.dom, result.errors);
            } else if (editorView)
                clearArcs(editorView.dom);

            updateStatusBadge(result.valid, result.errors.length);
            updateTabTitle(result.valid, result.errors.length);
        }, 150);
    });
}
```
- Creates the CodeMirror editor inside `#editor-pane`.
- The callback fires on every document change (keystroke, paste, etc.).
- **Debouncing:** Cancels any pending check and schedules a new one 150ms later. This prevents checking on every keystroke during fast typing.
- **Check sequence:**
  1. Hide welcome screen
  2. Get active mode from DOM
  3. Call `check(input, mode)` via WASM bridge
  4. Render errors in sidebar (`renderErrors`)
  5. Apply editor underlines (`applyErrorDecorations`)
  6. Draw SVG arcs (`drawMultiArcs`) — skipped in HTML mode because arcs between multi-character tags look bad
  7. Update status badge and browser tab title

```js
initEditor();
```
- Called immediately on module load.

**`getActiveMode()`:**
```js
function getActiveMode() {
    const activeBtn = document.querySelector('.mode-btn.active');
    return activeBtn ? activeBtn.dataset.mode : 'JSON';
}
```
- Reads the `data-mode` attribute from whichever mode button has the `active` class.
- Defaults to `'JSON'` if nothing is selected.

**`updateStatusBadge(valid, count)`:**
```js
function updateStatusBadge(valid, count) {
    const badge = document.getElementById('status-badge');
    if (valid) {
        badge.textContent = '✓ valid';
        badge.className = 'status-badge badge-ok';
    } else {
        badge.textContent = `${count} error${count > 1 ? 's' : ''}`;
        badge.className = 'status-badge badge-err';
    }
}
```
- Updates the header badge. Green "✓ valid" or red "N errors".
- Adds a pulse animation via CSS class `badge-err`.

**`updateTabTitle(valid, errorCount)`:**
```js
function updateTabTitle(valid, errorCount){
    if (valid)
        document.title = 'Bracket Checker';
    else
        document.title = `(${errorCount}) Bracket Checker`;
}
```
- Updates the browser tab title to show error count (like Gmail's unread count).

**`runCheck()`:**
```js
function runCheck() {
    const input = editorView ? editorView.state.doc.toString() : '';
    const mode = getActiveMode();
    const appMain = document.querySelector('.app-main');
    appMain.classList.remove('html-mode');
    if (input) {
        const result = check(input, mode);
        renderErrors(result.errors, input);
        if (editorView) {
            if (result.errors.length > 0) {
                applyErrorDecorations(editorView, result.errors);
                if (mode !== 'HTML')
                    drawMultiArcs(editorView.dom, result.errors);
            } else {
                clearArcs(editorView.dom);
            }
        }
        updateStatusBadge(result.valid, result.errors.length);
        updateTabTitle(result.valid, result.errors.length);
    } else {
        renderErrors([], '');
        if (editorView) clearArcs(editorView.dom);
        document.getElementById('status-badge').textContent = '';
        document.getElementById('status-badge').className = 'status-badge';
        document.title = 'Bracket Checker';
    }
}
```
- **Synchronous** check function (not debounced). Used when:
  - Switching modes
  - Loading a sample
- Removes `html-mode` class from `.app-main` (this class hides the editor in HTML mode, though the current code removes it unconditionally — this might be a leftover from an earlier design).
- If input is empty, clears everything (errors, arcs, badge).

**Mode button handlers:**
```js
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById('sample-selector').value = '';
        const mode = e.target.dataset.mode;

        if (mode === 'JSON' || mode === 'MATH' || mode === 'HTML') {
            editorView.dispatch({
                changes: { from: 0, to: editorView.state.doc.length, insert: '' }
            });
            editorView.focus();
        }

        runCheck();
    });
});
```
- Clears the editor when switching modes. This prevents confusion (e.g. HTML code in JSON mode).
- Resets the sample dropdown.
- Calls `runCheck()` immediately.

```js
editorView.focus();
```
- Focuses the editor on page load.

**Sample data:**
```js
const SAMPLES = {
    'valid_json': { mode: 'JSON', text: '{ "user": { "name": "Ali", 
"scores": [88, 92, 100] } }' },
    'mismatch': { mode: 'JSON', text: '{ "scores": [ 88, 92 ) }' },
    'unclosed': { mode: 'JSON', text: '{ "name": "Ali", "scores": [88, 92' },
    'unexpected': { mode: 'JSON', text: '"name": "Ali" }' },
    'multiple': { mode: 'JSON', text: '{ [ ( ] ) }' },

    'valid_math': { mode: 'MATH', text: '(1 + 2) * [3 - 4] / (5 + 6)' },
    'math_double_op': { mode: 'MATH', text: '1 +* 2' },
    'math_start_op': { mode: 'MATH', text: '* 2 + 1' },
    'math_end_op': { mode: 'MATH', text: '1 + 2 *' },
    'math_paren_close': { mode: 'MATH', text: '(1 +)' },
    'math_missing_op': { mode: 'MATH', text: '1(2 + 3)' },
    'math_both': { mode: 'MATH', text: '(1 +* 2' },

    'valid_html': { mode: 'HTML', text: '<div><span>Hello</span></div>' },
    'html_mismatch': { mode: 'HTML', text: '<div></span>' },
    'html_unclosed': { mode: 'HTML', text: '<div><p>' },
    'html_unexpected': { mode: 'HTML', text: '</div><div></div>' },
};
```
- Hardcoded sample strings for the dropdown.
- Each has a `mode` property so the UI can auto-switch modes.

**Sample dropdown handler:**
```js
document.getElementById('sample-selector').addEventListener('change', (e) => {
    const sampleKey = e.target.value;
    if (!sampleKey || !SAMPLES[sampleKey]) return;

    const sample = SAMPLES[sampleKey];

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[data-mode="${sample.mode}"]`).classList.add('active');

    if (editorView) {
        editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: sample.text }
        });
        editorView.focus();
    }

    runCheck();
});
```
- Looks up the sample, switches the mode button, injects text into the editor, and runs a check.

**Welcome screen:**
```js
const welcomeScreen = document.getElementById('welcome-screen');

export function hideWelcome() {
    if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) {
        welcomeScreen.classList.add('hidden');
    }
}

welcomeScreen.addEventListener('click', () => {
    hideWelcome();
    if (editorView) editorView.focus();
});
```
- The welcome screen is a full-screen overlay. Clicking it hides it and focuses the editor.
- `hideWelcome` is also called by the editor's `onChange` callback and mode buttons.

---

### `editor.js`

**Role:** CodeMirror 6 setup and error decoration system.

```js
import { EditorView, basicSetup } from 'codemirror';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { setEditorView, getCurrentErrors } from './error-state.js';
```
- `codemirror` is the core editor package.
- `@codemirror/view` and `@codemirror/state` are sub-packages for decorations and effects.
- `error-state.js` is used to share the editor instance and current errors.

```js
export const setErrors = StateEffect.define();
```
- Defines a custom CodeMirror effect. Effects are how you send data into the editor's state system.
- When `applyErrorDecorations` dispatches this effect, the `errorHighlightField` state field catches it and updates decorations.

**Decoration types:**
```js
const mismatchMark = Decoration.mark({ class: 'cm-mismatch' });
const unclosedMark = Decoration.mark({ class: 'cm-unclosed' });
const unexpectedMark = Decoration.mark({ class: 'cm-unexpected' });
const syntaxMark = Decoration.mark({ class: 'cm-syntax-error' });
const openMark = Decoration.mark({ class: 'cm-open-pair' });
```
- `Decoration.mark()` creates inline decorations that apply CSS classes to character ranges.
- Each corresponds to a CSS class in `style.css` with specific colors:
  - `cm-mismatch`: red wavy underline
  - `cm-unclosed`/`cm-unexpected`: orange wavy underline
  - `cm-syntax-error`: purple wavy underline
  - `cm-open-pair`: green border/background (highlights the matching opener)

**`posToRange(doc, charPos)`:**
```js
function posToRange(doc, charPos){
    if (charPos < 0) return null;
    if (charPos >= doc.length) charPos = doc.length - 1;
    return { from: charPos, to: charPos + 1 };
}
```
- Converts a character position to a `{from, to}` range for CodeMirror.
- Clamps out-of-bounds positions to the last valid character.
- Returns `null` for negative positions.

**`getDecorations(errors, doc)`:**
```js
function getDecorations(errors, doc) {
    const decorations = [];

    for (const err of errors) {
        const range = posToRange(doc, err.pos);
        if (!range) continue;

        if (err.type === 'mismatch') {
            decorations.push(mismatchMark.range(range.from, range.to));
            if (err.pairedPos >= 0) {
                const openRange = posToRange(doc, err.pairedPos);
                if (openRange)
                    decorations.push(openMark.range(openRange.from, openRange.to));
            }
        } 
        else if (err.type === 'unclosed')
            decorations.push(unclosedMark.range(range.from, range.to));
        else if (err.type === 'unexpected')
            decorations.push(unexpectedMark.range(range.from, range.to));
        else if (err.type === 'syntax')
            decorations.push(syntaxMark.range(range.from, range.to));
    }

    return Decoration.set(decorations, true);
}
```
- Iterates errors and creates decoration ranges.
- For **mismatch** errors: decorates both the bad closer (red) AND the matching opener (green).
- For **unclosed**/**unexpected**/**syntax**: decorates only the error position.
- `Decoration.set(decorations, true)` creates an efficient immutable set. The `true` argument enables sorting/merging.

**`errorHighlightField` (StateField):**
```js
const errorHighlightField = StateField.define({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        for (const e of tr.effects){
            if (e.is(setErrors))
                return getDecorations(e.value, tr.state.doc);
        }
        return decorations.map(tr.changes);
    },
    provide: field => EditorView.decorations.from(field),
});
```
- `create()`: Starts with no decorations.
- `update()`: On every transaction (`tr`), checks if any effect is `setErrors`. If so, rebuilds decorations from the new errors. Otherwise, maps existing decorations through document changes (so underlines stay in the right place as you type).
- `provide`: Tells CodeMirror to use this field as a decoration source.

**`applyErrorDecorations(view, errors)`:**
```js
export function applyErrorDecorations(view, errors) {
    view.dispatch({
        effects: setErrors.of(errors)
    });
}
```
- The public API. Dispatches the `setErrors` effect with the error array.
- CodeMirror's state system handles the rest.

**`createEditor(parent, onChange)`:**
```js
export function createEditor(parent, onChange) {
    const view = new EditorView({
        extensions: [
            basicSetup,
            errorHighlightField,
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    onChange(update.state.doc.toString());
                }
            }),
        ],
        parent,
    });

    view.dom.cmView = view;
    setEditorView(view);
```
- Creates the editor with three extensions:
  1. `basicSetup` — line numbers, keybindings, etc.
  2. `errorHighlightField` — our custom error decorations
  3. `updateListener` — fires `onChange` with the full document text whenever content changes
- `view.dom.cmView = view` — hacks the DOM element to hold a reference to the CodeMirror view. This is used by `arc-overlay.js` to access `view.scrollDOM` and `view.coordsAtPos()`.
- `setEditorView(view)` — stores the view in `error-state.js` for other modules.

**Click handler:**
```js
    view.dom.addEventListener('click', (e) => {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return;
        const errors = getCurrentErrors();
        const err = errors.find(e => e.pos === pos);
        if (err) {
            document.dispatchEvent(new CustomEvent('error-click', { detail: { pos: err.pos } }));
        }
    });
```
- Listens for clicks on the editor's DOM element.
- `view.posAtCoords()` converts mouse coordinates to document position.
- If the clicked position matches an error position, dispatches a custom `error-click` event.
- `error-panel.js` listens for this event and scrolls/highlight the matching error card.

**Initial empty dispatch:**
```js
    view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: '' }
    });

    return view;
}
```
- Dispatches an empty change to ensure the editor starts clean.
- Returns the view instance.

---

### `error-panel.js`

**Role:** Renders the right sidebar with human-readable error cards.

```js
import { getEditorView } from './error-state.js';

let _currentErrors = [];
let _editorInput = '';
```
- Module-level cache of the last rendered errors and input.

**`getLineCol(text, pos)`:**
```js
function getLineCol(text, pos) {
    let line = 1;
    let col = 1;
    for (let i = 0; i < pos; ++i){
        if (text[i] === '
') {
            line++;
            col = 1;
        } else {
            col++;
        }
    }
    return `line ${line}, col ${col}`;
}
```
- Converts a 0-based character position to 1-based line/column.
- Counts `
` characters to determine line number.
- **O(n)** for each call — fine for small inputs, could be slow for huge files. Not optimized because this is a student project.

**`escapeHTML(str)`:**
```js
function escapeHTML(str){
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
```
- Sanitizes strings before injecting them into HTML.
- Prevents XSS if error messages contain user input.

**`tagDisplayName(tagStr)`:**
```js
function tagDisplayName(tagStr) {
    if (!tagStr) return '';
    return tagStr.replace(/^<\/?/, '').replace(/>$/, '');
}
```
- Strips `<`, `</`, and `>` from tag strings.
- `"</div>"` → `"div"`, `"<{>"` → `"{"`.
- Used to make error messages cleaner.

**`formatStackSnapshot(snapshot)`:**
```js
function formatStackSnapshot(snapshot) {
    if (!snapshot || snapshot.length === 0)
        return '<span class="stack-empty">empty stack</span>';

    return snapshot.map((frame, index) => {
        const isTop = index === snapshot.length - 1;
        const label = `L${frame.pos}`;
        return `<span class="stack-pill ${isTop ? 'top' : ''}">&lt;${tagDisplayName(frame.ch)}&gt; ${label}${isTop ? ' ← top' : ''}</span>`;
    }).join(' ');
}
```
- Formats the stack snapshot into HTML pills.
- Reverses the order (since `stackToVector` puts the top first, but we want bottom-to-top display).
- The last element gets the `top` class (green highlight) and a "← top" label.
- `L${frame.pos}` shows the character position of each opener.

**`formatTitle(err, locStr)`:**
```js
function formatTitle(err, locStr) {
    if (err.type === 'mismatch') return `Mismatch at ${locStr}`;
    if (err.type === 'unclosed') return `Unclosed tag at ${locStr}`;
    if (err.type === 'unexpected') return `Unexpected tag at ${locStr}`;
    if (err.type === 'syntax') return `Syntax error at ${locStr}`;
    return `Error at ${locStr}`;
}
```
- Maps error types to human-readable titles.

**`formatSyntaxMessage(err)`:**
```js
function formatSyntaxMessage(err) {
    const c = err.got;
    const isOp = c === '+' || c === '-' || c === '*' || c === '/';
    if (isOp) return `Unexpected operator <code>${escapeHTML(c)}</code> here — cannot follow another operator or opening bracket`;
    if (c === '(' || c === '[') return `Missing operator before <code>${escapeHTML(c)}</code>`;
    if (c === ')' || c === ']') return `Operator before closing bracket <code>${escapeHTML(c)}</code> — expression incomplete`;
    return `Unexpected token <code>${escapeHTML(c)}</code>`;
}
```
- Context-aware syntax error messages for math mode.
- Different messages depending on what token caused the error.

**`formatMessage(err, text)`:**
```js
function formatMessage(err, text) {
    const got = tagDisplayName(err.got);
    const expected = tagDisplayName(err.expected);

    if (err.type === 'mismatch') {
        const openerLoc = getLineCol(text, err.pairedPos);
        return `&lt;${escapeHTML(got)}&gt; cannot close opener from ${openerLoc}.<br>Did you mean &lt;<strong>${escapeHTML(expected)}</strong>&gt; ?`;
    }
    if (err.type === 'unclosed')
        return `&lt;<strong>${escapeHTML(got)}</strong>&gt; opened but never closed.`;
    if (err.type === 'unexpected')
        return `&lt;<strong>${escapeHTML(got)}</strong>&gt; found with nothing open.`;
    if (err.type === 'syntax')
        return formatSyntaxMessage(err);
    return `Unknown error`;
}
```
- The main message formatter.
- For **mismatch**: Shows the bad closer, the opener's location, and a "did you mean?" suggestion.
- For **unclosed**/**unexpected**: Simple messages with the offending token bolded.
- Note: `expected` for mismatches comes from C++ as the matching opener, but the message asks "did you mean [closer]?" — there's a slight mismatch here. The frontend shows `expected` which is actually the opener, not the closer. This is a minor UI quirk.

**`renderErrors(errors, input)`:**
```js
export function renderErrors(errors, input) {
    _currentErrors = errors;
    _editorInput = input;

    const pane = document.getElementById('error-pane');
    pane.innerHTML = '';
```
- Clears the error panel and caches the new data.

**Empty input state:**
```js
    if (!input || input.trim() === '') {
        pane.innerHTML = `
            <div class="coming-soon">
                <div class="coming-soon-icon" style="font-size: 2.5rem; opacity: 0.5;">⌨️</div>
                <p style="font-size: 1.05rem; color: var(--text-muted); margin-top: 10px;">Waiting for input... Start typing!</p>
            </div>
        `;
        return;
    }
```
- Shows a friendly "Waiting for input" message if the editor is empty.

**No errors state:**
```js
    if (!errors || errors.length === 0) {
        pane.innerHTML = '<p class="no-errors">✓ No errors found</p>';
        return;
    }
```
- Shows a green checkmark when everything is valid.

**Error card generation:**
```js
    const fragment = document.createDocumentFragment();

    errors.forEach((err, index) => {
        const locStr = getLineCol(input, err.pos);
        const stackHtml = err.stackSnapshot && err.stackSnapshot.length > 0 
            ? formatStackSnapshot(err.stackSnapshot) 
            : '<span class="stack-empty">no stack for syntax errors</span>';

        const icon = { mismatch: '!', unclosed: '~', unexpected: '?', syntax: '×' }[err.type] || '!';

        const card = document.createElement('div');
        card.className = `error-item ${err.type}`;
        card.dataset.index = index;

        card.innerHTML = `
            <div class="err-icon">${icon}</div>
            <div class="err-body">
                <p class="err-title">${formatTitle(err, locStr)}</p>
                <p class="err-msg">${formatMessage(err, input)}</p>
                <p class="err-stack">
                    <span class="stack-label">Stack:</span>
                    ${stackHtml}
                </p>
            </div>
        `;

        card.addEventListener('click', () => {
            const view = getEditorView();
            if (view) {
                view.dispatch({
                    selection: { anchor: err.pos },
                    scrollIntoView: true
                });
                view.focus();
            }
        });

        fragment.appendChild(card);
    });

    pane.appendChild(fragment);
```
- Uses `DocumentFragment` for efficient batch DOM insertion.
- Each card has:
  - An icon (`!`, `~`, `?`, `×`) based on error type
  - A title with line/column
  - A descriptive message
  - A stack visualization (if available)
- Clicking a card scrolls the editor to the error position and places the cursor there.

**Error-click listener:**
```js
    document.addEventListener('error-click', (e) => {
        const err = errors.find(err => err.pos === e.detail.pos);
        if (err) {
            const index = errors.indexOf(err);
            const cards = pane.querySelectorAll('.error-item');
            cards.forEach(c => c.classList.remove('active'));
            if (cards[index]) {
                cards[index].classList.add('active');
                cards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
}
```
- Listens for the custom `error-click` event from `editor.js`.
- Finds the matching error card, adds the `active` class (green border glow), and scrolls it into view.
- **Note:** This listener is registered INSIDE `renderErrors`, so a new listener is added every time errors are rendered. This is a **memory leak** — after many checks, there will be many duplicate listeners. In practice it's not noticeable, but it's a bug.

---

### `error-state.js`

**Role:** Minimal shared state container.

```js
let _view = null;
let _errors = [];

export function setEditorView(view) { _view = view; }
export function getEditorView() { return _view; }
export function setCurrentErrors(errors) { _errors = errors; }
export function getCurrentErrors() { return _errors; }
```
- Four functions, no logic.
- `setEditorView` / `getEditorView`: Lets `error-panel.js` access the editor to scroll/focus.
- `setCurrentErrors` / `getCurrentErrors`: Lets `editor.js` click handler know what errors exist.
- **Note:** `setCurrentErrors` is exported but never called in the current codebase. `editor.js` imports `getCurrentErrors` but the errors are never actually set. This means the click-to-error-card feature in `editor.js` might not work correctly because `_errors` is always `[]`. This is a bug.

---

### `arc-overlay.js`

**Role:** Draws curved SVG lines between mismatched bracket pairs.

**`drawArc(editorDom, fromPos, toPos, color)`:**
```js
export function drawArc(editorDom, fromPos, toPos, color = '#E24B4A') {
    const view = editorDom.cmView;
    if (!view || typeof view.coordsAtPos !== 'function')
        return null;

    const fromCoords = view.coordsAtPos(fromPos);
    const toCoords = view.coordsAtPos(toPos);

    if (!fromCoords || !toCoords)
        return null;
```
- Gets the CodeMirror view from the DOM element (set in `editor.js` via `view.dom.cmView = view`).
- `coordsAtPos()` returns `{left, top, right, bottom}` pixel coordinates for a character position.
- Returns `null` if coordinates can't be determined (e.g. character is scrolled out of view).

```js
    const scrollDOM = view.scrollDOM;
    if (!scrollDOM) return null;

    if (getComputedStyle(scrollDOM).position === 'static')
        scrollDOM.style.position = 'relative';

    const scrollRect = scrollDOM.getBoundingClientRect();

    const fx = fromCoords.left - scrollRect.left + scrollDOM.scrollLeft;
    const fy = fromCoords.top - scrollRect.top + scrollDOM.scrollTop;
    const tx = toCoords.left - scrollRect.left + scrollDOM.scrollLeft;
    const ty = toCoords.top - scrollRect.top + scrollDOM.scrollTop;
```
- Calculates coordinates relative to the scrollable editor area.
- Adds `scrollLeft`/`scrollTop` so arcs are positioned correctly even when scrolled.
- Forces `position: relative` on the scroll container so the absolutely-positioned SVG works.

```js
    const midX = (fx + tx) / 2;
    const dx = Math.abs(tx - fx);
    const midY = Math.max(fy, ty) + Math.max(40, Math.min(dx * 0.05, 5000));
```
- `midX`: Horizontal midpoint.
- `dx`: Horizontal distance between the two brackets.
- `midY`: Controls how deep the arc dips. Minimum 40px, scales with distance (`dx * 0.05`), capped at 5000px. This creates a nice curve even for far-apart brackets.

```js
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${fx},${fy} Q${midX},${midY} ${tx},${ty}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '200');
    path.setAttribute('stroke-dashoffset', '200');
    path.classList.add('arc-animated');

    return path;
}
```
- Creates an SVG `<path>` with a quadratic Bezier curve (`Q` command).
- `stroke-dasharray: 200` and `stroke-dashoffset: 200` make the path invisible initially.
- CSS animation in `style.css` animates `stroke-dashoffset` to `0`, creating a "drawing" effect.

**`drawMultiArcs(editorDom, errors)`:**
```js
export function drawMultiArcs(editorDom, errors){
    clearArcs(editorDom);

    const view = editorDom.cmView;
    if (!view) return;

    const scrollDOM = view.scrollDOM;
    if (!scrollDOM) return;

    if (getComputedStyle(scrollDOM).position === 'static')
        scrollDOM.style.position = 'relative';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;pointer-events:none;overflow:visible;z-index:10;';
    svg.style.height = scrollDOM.scrollHeight + 'px';
    svg.dataset.arcOverlay = 'true';
    scrollDOM.appendChild(svg);

    for (const err of errors){
        if (err.type === 'mismatch' && err.pairedPos >= 0){
            const path = drawArc(editorDom, err.pairedPos, err.pos);
            if (path)
                svg.appendChild(path);
        }
    }
}
```
- Clears old arcs first.
- Creates a single SVG container that spans the full scroll height of the editor.
- `pointer-events: none` lets clicks pass through to the text below.
- Iterates errors and draws an arc for each mismatch (where `pairedPos >= 0`).
- Only mismatch errors get arcs — unclosed/unexpected/syntax errors have no pair to connect.

**`clearArcs(editorDom)`:**
```js
export function clearArcs(editorDom) {
    const view = editorDom.cmView;
    if (view && view.scrollDOM)
        view.scrollDOM.querySelectorAll('[data-arc-overlay]').forEach(el => el.remove());
}
```
- Finds and removes all SVG overlays by the `data-arc-overlay` attribute.
- Called before drawing new arcs and when clearing errors.

---

### `style.css`

**Role:** Complete visual styling for the dark-mode UI.

**CSS Variables (`:root`):**
```css
:root {
    --bg-main: #0d1117;        /* GitHub-dark background */
    --bg-panel: #161b22;       /* Slightly elevated surfaces */
    --bg-elevated: #1c2128;    /* Cards, buttons */
    --bg-editor: #1e1e1e;      /* CodeMirror background */

    --text-primary: #e6edf3;   /* Headings, main text */
    --text-secondary: #8b949e; /* Descriptions */
    --text-muted: #6e7681;     /* Line numbers, labels */

    --accent-green: #39ff14;   /* Neon green for valid state */
    --accent-green-subtle: #238636;
    --accent-error: #E24B4A;   /* Red for errors */
    --accent-warning: #EF9F27; /* Orange for warnings */
    --accent-open: #2ea043;    /* Green for matching opener */

    --border-subtle: #30363d;
    --border-divider: #555;

    --font-primary: 'Inter', ...;
    --font-mono: 'JetBrains Mono', ...;

    --space-xs: 4px; --space-sm: 8px; --space-md: 16px;
    --space-lg: 24px; --space-xl: 32px;

    --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;

    --shadow-panel: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.3);
}
```
- Centralized design tokens. Change these to retheme the entire app.

**Header:**
- Flexbox layout with three sections: left (logo+title), center (mode buttons + badge + dropdown), right (GitHub link).
- `position: sticky; top: 0` keeps it visible while scrolling.
- Mode buttons use `.mode-btn.active` with neon green background and glow shadow.

**Sample selector:**
- Custom-styled `<select>` with dark background, custom dropdown arrow SVG, and hover effects.
- `appearance: none` removes native styling.
- `optgroup` and `option` styling for the dropdown menu.

**Main layout:**
- `.app-main` is a flex container: editor 60%, error panel 40%.
- `height: calc(100vh - 64px - 48px)` accounts for header (64px) and footer (48px).
- `.html-mode` class can hide the editor and make the error panel full-width (currently unused).

**Error panel:**
- Custom scrollbar styling (`::-webkit-scrollbar`) with dark track and subtle thumb.
- `.no-errors`: Centered green checkmark with circular background.
- `.coming-soon`: Placeholder for empty state.

**Error cards:**
- `.error-item`: Flex row with left border color indicating type:
  - `.mismatch`: red left border (`--accent-error`)
  - `.unclosed`/`.unexpected`: orange left border (`--accent-warning`)
  - `.syntax`: purple left border (`#8A7BF2`)
- Hover effect: brightness increase + green border glow.
- `.active` class: green border + stronger glow (set when clicking from editor).
- `.err-icon`: Circular badge with error type symbol.
- `.err-stack`: Stack pills with `.top` class highlighting the stack top in green.

**CodeMirror overrides:**
- `.cm-editor`: Forces dark background.
- `.cm-gutters`: Dark gutter with subtle border.
- `.cm-lineNumbers`: Muted color for line numbers.
- `.cm-activeLine`: Very subtle white highlight.
- `.cm-selectionBackground`: Neon green tint (`rgba(57, 255, 20, 0.15)`).
- `.cm-cursor`: Neon green cursor.

**Error highlight classes:**
- `.cm-mismatch`: Red background tint + wavy red underline.
- `.cm-unclosed`/`.cm-unexpected`: Orange background tint + wavy orange underline.
- `.cm-open-pair`: Green background tint + solid green border (highlights matching opener).
- `.cm-syntax-error`: Purple background tint + wavy purple underline.

**Responsive design (`@media (max-width: 650px)`):**
- Header stacks vertically with `flex-wrap`.
- Mode selector and sample dropdown become full-width.
- Main layout switches to vertical stack: editor 45%, error panel 55%.
- `border-left` removed from error panel, `border-top` added instead.

**Arc animation:**
```css
@keyframes drawArc {
    from { stroke-dashoffset: 200; }
    to   { stroke-dashoffset: 0; }
}
.arc-animated {
    animation: drawArc 0.35s ease-out forwards;
}
```
- Animates the SVG path "drawing" itself over 350ms.

---

## 4. Build & Config Files

### `index.html`

**Role:** Single-page application shell.

**`<head>`:**
- Meta viewport for mobile responsiveness.
- Google Fonts preconnect for performance.
- Loads Inter (UI) and JetBrains Mono (code) fonts.
- Links `style.css`.
- Favicon is an SVG (`Project_Logo.svg`).

**Header structure:**
- `.header-left`: Logo SVG + "Bracket Checker" title.
- `.header-center`:
  - `#mode-selector`: Three buttons (JSON/C style Brackets, HTML/XML, Math).
  - `#status-badge`: Dynamic badge showing valid/error count.
  - `#sample-selector`: Dropdown with grouped examples.
- `.header-right`: GitHub link with SVG icon.

**Main structure:**
- `#welcome-screen`: Full-screen overlay with floating logo animation. Hidden on first interaction.
- `.editor-panel`: Contains `#editor-pane` (CodeMirror mounts here).
- `.error-panel`: Contains `#error-pane` (error cards render here).

**Footer:**
- Centered text with team initials and year.

**Script:**
- `<script type="module" src="/src/main.js">` loads the app as an ES module.

---

### `vite.config.js`

**Role:** Vite development server and build configuration.

```js
export default {
    optimizeDeps: { exclude: ['checker.js'] },
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        }
    }
}
```

**`optimizeDeps.exclude`:**
- Tells Vite NOT to pre-bundle `checker.js`.
- `checker.js` is the Emscripten glue that dynamically loads `checker.wasm`. Pre-bundling would break the relative `.wasm` path resolution.

**COOP/COEP headers:**
- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` enable cross-origin isolation.
- This is required for `SharedArrayBuffer` and some WASM memory features that Emscripten may use.
- Without these, the WASM module might fail to instantiate in some browsers.

---

### `WAcompile.sh`

**Role:** Build script — C++ to WASM.

```bash
#!/bin/bash
emcc cpp/syntax_checker.cpp cpp/bindings.cpp   -o public/checker.js   --bind -O2   -s MODULARIZE=1   -s EXPORT_NAME="CheckerModule"   -s ALLOW_MEMORY_GROWTH=1   -s EXPORT_ES6=1   -s ENVIRONMENT='web'
```

**Command breakdown:**
- `emcc`: The Emscripten C++ compiler.
- Input files: `syntax_checker.cpp` and `bindings.cpp`.
- `-o public/checker.js`: Output path. Emscripten generates both `.js` (glue) and `.wasm` (binary) here.
- `--bind`: Enables embind for C++ ↔ JS class/object binding.
- `-O2`: Optimization level 2 (good balance of speed and size).
- `-s MODULARIZE=1`: Wraps output in a factory function so you can `import` it as a module.
- `-s EXPORT_NAME="CheckerModule"`: Names the factory function. In JS: `await CheckerModule()`.
- `-s ALLOW_MEMORY_GROWTH=1`: WASM memory can grow if needed (for large inputs).
- `-s EXPORT_ES6=1`: Outputs ES6 module syntax instead of UMD/CommonJS.
- `-s ENVIRONMENT='web'`: Optimizes for web only (no Node.js or worker code included).

**Usage:**
```bash
chmod +x WAcompile.sh
./WAcompile.sh
```
- Must have Emscripten SDK installed and activated (`source emsdk_env.sh`).
- Run this after ANY change to `.h` or `.cpp` files.

---

### `package.json`

**Role:** Node.js project manifest.

```json
{
  "name": "bracketchecker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^8.0.9"
  },
  "dependencies": {
    "codemirror": "^6.0.2"
  }
}
```

**Key fields:**
- `"type": "module"`: All `.js` files are treated as ES modules (enables `import`/`export` syntax).
- `"scripts"`:
  - `dev`: Starts Vite dev server with hot reload.
  - `build`: Creates production bundle in `dist/`.
  - `preview`: Serves the production build locally.
- `"dependencies"`:
  - `codemirror`: The editor. Version `^6.0.2` is the core package that pulls in all sub-packages (state, view, commands, etc.).
- `"devDependencies"`:
  - `vite`: Build tool and dev server. Version `^8.0.9`.

**Note:** `counter.js` is listed in the file tree but not imported anywhere — it's a leftover from `npm create vite@latest` scaffold.
