# Syntax Error Pinpointer
> Data Structures Course Project · C++ / WebAssembly / Web

**A live bracket & syntax validator that tells you _exactly_ where your code breaks — and why.**  
Not just "error on line 12." It says: `) at position 47 cannot close [ opened at position 12 — did you mean ]?`

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [The Problem We're Solving](#2-the-problem-were-solving)
3. [Data Structure Justification](#3-data-structure-justification)
4. [Architecture Overview](#4-architecture-overview)
5. [File Structure](#5-file-structure)
6. [C++ Core — Full Spec](#6-c-core--full-spec)
7. [WebAssembly Integration](#7-webassembly-integration)
8. [Frontend Spec](#8-frontend-spec)
9. [Feature List](#9-feature-list)
10. [Build Roadmap & Task Assignments](#10-build-roadmap--task-assignments)
11. [How to Run Locally](#11-how-to-run-locally)
12. [AI Agent Context](#12-ai-agent-context)

---

## 1. Project Summary

| Field | Detail |
|---|---|
| **Course** | Data Structures |
| **Language (core)** | C++23 |
| **Language (frontend)** | JavaScript (Vanilla + CodeMirror 6) |
| **Bridge** | WebAssembly via Emscripten |
| **Data structure** | Stack (`std::stack<Frame>`) |
| **Supported modes** | JSON · HTML · Math expressions |
| **Demo format** | Web app — live, in-browser, no install |

---

## 2. The Problem We're Solving

Every developer has stared at a cryptic `Unexpected token on line 47`, only to discover the real issue was an unclosed bracket on line 12. Existing linters flag the **symptom**, not the **cause**.

Most validators give you one of these:

```
SyntaxError: Unexpected token } (line 9)
Parse error: unexpected end of input
```

Ours gives you this:

```
✗ Mismatch at line 3, col 22
  ) cannot close [ opened at line 3, col 15
  Did you mean ] ?

  Stack state at error:
  [ { L1 ]  [ { L1 ]  [ [ L3 ← top ]
```

The difference: we store **where every bracket was opened**, so we always know both ends of the mistake.

### The three error types we catch

| Type | Example | What it means |
|---|---|---|
| **Mismatch** | `[ 1, 2 )` | A closer that doesn't match the top of the stack |
| **Unclosed** | `{ "a": 1` | Something left on the stack when input ends |
| **Unexpected** | `) "a": 1` | A closer fired when the stack was already empty |

---

## 3. Data Structure Justification

### Why a Stack — and only a Stack

Bracket nesting is inherently **LIFO** (Last In, First Out): the _last_ bracket you opened must be the _first_ you close. That is the exact contract a stack enforces.

```
Input:  { "a": [ 1, 2 ) }
               ↑       ↑
               opened   wrong closer

Stack grows:  push {  →  push [  →  see )  →  top is [ → MISMATCH
```

**Why not an array?**  
An array has no concept of "top." You'd have to track an index manually, and there's no enforced LIFO discipline. The stack _is_ the algorithm.

**Why not a linked list?**  
A linked list gives O(1) insert/delete anywhere, which is wasted complexity here. We only ever touch one end. Stack gives the same O(1) with no pointer overhead.

**Why not a queue?**  
FIFO is the opposite of what we need. A queue would match the _first_ thing opened to the first closer — wrong for nesting.

### Stack frame design

Each frame stores two things — this is the key insight that makes error messages actually useful:

```cpp
struct Frame {
    char ch;   // the opening bracket character: { [ (
    int  pos;  // the position in the string where it was opened
};
```

When a mismatch fires at position 47, we pop the top frame and immediately know: "this `[` was opened at position 12." That's where the error message comes from.

### Complexity

| Operation | Complexity | Notes |
|---|---|---|
| Push (open bracket) | O(1) | `stk.push({ch, pos})` |
| Pop (close bracket) | O(1) | `stk.top()` then `stk.pop()` |
| Full parse | O(n) | Single pass through input |
| Space | O(d) | d = max nesting depth |

---

## 4. Architecture Overview

```
User types in browser editor
        │
        ▼
  JavaScript (debounced 150ms)
        │  calls
        ▼
  checker.wasm  ◄── compiled from C++ by Emscripten
        │  returns
        ▼
  CheckResult { valid, errors[] }
        │
        ▼
  Frontend renders:
    - red underlines at error positions
    - SVG arc connecting mismatch pair
    - error panel with stack state
    - "did you mean X?" suggestion
```

The C++ core has **zero knowledge of the browser**. It takes a string, returns a struct. The frontend has **zero bracket-checking logic**. Clean separation.

---

## 5. File Structure

```
syntax-pinpointer/
│
├── cpp/
│   ├── syntax_checker.h        ← SyntaxChecker class declaration
│   ├── syntax_checker.cpp      ← Core algorithm (Stack logic lives here)
│   └── bindings.cpp            ← Emscripten WASM bindings
│
├── public/
│   ├── checker.wasm            ← compiled output (generated, don't edit)
│   └── checker.js              ← Emscripten glue (generated, don't edit)
│
├── src/
│   ├── main.js                 ← app entry point, loads WASM module
│   ├── editor.js               ← CodeMirror 6 setup + decoration API
│   ├── checker-bridge.js       ← JS wrapper around the WASM calls
│   ├── error-panel.js          ← renders the error list + stack state UI
│   └── arc-overlay.js          ← draws SVG arcs between mismatch pairs
│
├── index.html                  ← single page shell
├── vite.config.js              ← Vite config (serves .wasm correctly)
├── compile.sh                  ← one-command Emscripten build script
└── README.md
```

---

## 6. C++ Core — Full Spec

### `syntax_checker.h`

```cpp
#pragma once
#include <string>
#include <vector>
#include <stack>

// Supported parsing modes
enum class Mode { JSON, HTML, MATH };

// One entry on the stack — stores the bracket AND where it was opened
struct Frame {
    char ch;
    int  pos;
};

// One detected error
struct Error {
    std::string type;      // "mismatch" | "unclosed" | "unexpected"
    int         pos;       // position of the problematic character
    char        got;       // the character that caused the error
    char        expected;  // what we needed (0 if type == "unexpected")
    int         pairedPos; // where the opener was (-1 if type != "mismatch")
};

// What check() returns
struct CheckResult {
    bool               valid;
    std::vector<Error> errors;
};

class SyntaxChecker {
public:
    CheckResult check(const std::string& input, Mode mode);

private:
    bool isOpen (char c, Mode m);
    bool isClose(char c, Mode m);
    char matchingOpen(char closeChar);   // ) → (   ] → [   } → {
    void skipString(const std::string& s, int& i);
};
```

### `syntax_checker.cpp`

```cpp
#include "syntax_checker.h"

bool SyntaxChecker::isOpen(char c, Mode m) {
    if (m == Mode::HTML) return false; // HTML handled separately via tag parsing
    return c == '{' || c == '[' || c == '(';
}

bool SyntaxChecker::isClose(char c, Mode m) {
    if (m == Mode::HTML) return false;
    return c == '}' || c == ']' || c == ')';
}

char SyntaxChecker::matchingOpen(char close) {
    if (close == ')') return '(';
    if (close == ']') return '[';
    if (close == '}') return '{';
    return 0;
}

void SyntaxChecker::skipString(const std::string& s, int& i) {
    // move past opening quote
    i++;
    while (i < (int)s.size() && s[i] != '"') {
        if (s[i] == '\\') i++; // skip escaped character
        i++;
    }
    // i now points at the closing quote; outer loop will i++ past it
}

CheckResult SyntaxChecker::check(const std::string& input, Mode mode) {
    std::stack<Frame> stk;
    CheckResult result { true, {} };

    for (int i = 0; i < (int)input.size(); i++) {
        char c = input[i];

        // Skip string contents in JSON mode — brackets inside quotes don't count
        if (c == '"' && mode == Mode::JSON) {
            skipString(input, i);
            continue;
        }

        if (isOpen(c, mode)) {
            stk.push({ c, i });

        } else if (isClose(c, mode)) {

            if (stk.empty()) {
                // Closer fired with nothing open
                result.valid = false;
                result.errors.push_back({ "unexpected", i, c, 0, -1 });

            } else {
                Frame top = stk.top();
                stk.pop();

                if (top.ch != matchingOpen(c)) {
                    // Wrong type of closer
                    char needed = (top.ch == '(' ? ')' :
                                   top.ch == '[' ? ']' : '}');
                    result.valid = false;
                    result.errors.push_back({
                        "mismatch", i, c, needed, top.pos
                    });
                }
                // else: correct closer — do nothing, bracket pair resolved
            }
        }
    }

    // Anything left on the stack was never closed
    while (!stk.empty()) {
        Frame f = stk.top(); stk.pop();
        result.valid = false;
        result.errors.push_back({ "unclosed", f.pos, f.ch, 0, -1 });
    }

    return result;
}
```

### `bindings.cpp` — Emscripten WASM export

```cpp
#include <emscripten/bind.h>
#include "syntax_checker.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(checker_module) {

    enum_<Mode>("Mode")
        .value("JSON", Mode::JSON)
        .value("HTML", Mode::HTML)
        .value("MATH", Mode::MATH);

    value_object<Error>("Error")
        .field("type",      &Error::type)
        .field("pos",       &Error::pos)
        .field("got",       &Error::got)
        .field("expected",  &Error::expected)
        .field("pairedPos", &Error::pairedPos);

    value_object<CheckResult>("CheckResult")
        .field("valid",  &CheckResult::valid)
        .field("errors", &CheckResult::errors);

    register_vector<Error>("VectorError");

    class_<SyntaxChecker>("SyntaxChecker")
        .constructor()
        .function("check", &SyntaxChecker::check);
}
```

---

## 7. WebAssembly Integration

### Compile command (`compile.sh`)

```bash
#!/bin/bash
emcc cpp/syntax_checker.cpp cpp/bindings.cpp \
  -o public/checker.js \
  --bind \
  -O2 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="CheckerModule" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT='web'

echo "Build complete → public/checker.js + public/checker.wasm"
```

Run once after any C++ change:
```bash
chmod +x compile.sh && ./compile.sh
```

### `checker-bridge.js` — JS side of the bridge

```js
// checker-bridge.js
import CheckerModule from '../public/checker.js';

let _module = null;
let _checker = null;

export async function initChecker() {
    _module  = await CheckerModule();
    _checker = new _module.SyntaxChecker();
}

export function check(input, mode = 'JSON') {
    if (!_checker) throw new Error('Checker not initialised — call initChecker() first');
    const modeEnum = _module.Mode[mode];
    const result   = _checker.check(input, modeEnum);

    // Convert to plain JS objects (Emscripten returns WASM memory views)
    return {
        valid: result.valid,
        errors: Array.from({ length: result.errors.size() }, (_, i) => {
            const e = result.errors.get(i);
            return {
                type:      e.type,
                pos:       e.pos,
                got:       e.got,
                expected:  e.expected,
                pairedPos: e.pairedPos,
            };
        })
    };
}
```

### Usage example

```js
import { initChecker, check } from './checker-bridge.js';

await initChecker();

const result = check('{ "name": [ "Ali" }', 'JSON');
// result.valid  → false
// result.errors → [{ type: "mismatch", pos: 18, got: "}", expected: "]", pairedPos: 10 }]
```

---

## 8. Frontend Spec

### `editor.js` — CodeMirror 6 setup

```js
import { EditorView, basicSetup } from 'codemirror';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

// Effects we can dispatch to update highlight state
export const setErrors = StateEffect.define();

// Decoration types
const mismatchMark  = Decoration.mark({ class: 'cm-mismatch' });
const unclosedMark  = Decoration.mark({ class: 'cm-unclosed' });
const unexpectedMark= Decoration.mark({ class: 'cm-unexpected' });
const openMark      = Decoration.mark({ class: 'cm-open-pair' });

export function createEditor(parent, onChange) {
    return new EditorView({
        extensions: [
            basicSetup,
            EditorView.updateListener.of(update => {
                if (update.docChanged) onChange(update.state.doc.toString());
            }),
            errorHighlightField,  // custom StateField that applies decorations
        ],
        parent,
    });
}
```

### `arc-overlay.js` — SVG arc between mismatch pair

```js
// Given two character positions, draw a curved SVG arc underneath
// the editor line connecting the opener and the bad closer.
export function drawArc(editorDom, fromPos, toPos, color = '#E24B4A') {
    const fromCoords = posToPixel(editorDom, fromPos);
    const toCoords   = posToPixel(editorDom, toPos);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const midX = (fromCoords.x + toCoords.x) / 2;
    const midY = fromCoords.y + 20; // arc dips 20px below the line

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d',
        `M ${fromCoords.x} ${fromCoords.y}
         Q ${midX} ${midY}
           ${toCoords.x} ${toCoords.y}`
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '1.2');
    path.setAttribute('stroke-dasharray', '3 2');

    svg.appendChild(path);
    editorDom.appendChild(svg);
    return svg; // caller holds reference to remove it on next check
}
```

### CSS for error highlights

```css
/* editor highlight classes */
.cm-mismatch   { background: #FCEBEB; border-bottom: 1.5px wavy #E24B4A; }
.cm-unclosed   { background: #FAEEDA; border-bottom: 1.5px wavy #EF9F27; }
.cm-unexpected { background: #FAEEDA; border-bottom: 1.5px wavy #EF9F27; }
.cm-open-pair  { background: #E1F5EE; }

/* error panel */
.error-item          { display: flex; gap: 10px; padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; }
.error-item.mismatch { background: #FCEBEB; }
.error-item.unclosed { background: #FAEEDA; }
.error-item code     { font-family: monospace; font-size: 12px; background: rgba(0,0,0,.06); padding: 1px 4px; border-radius: 3px; }
```

---

## 9. Feature List

| # | Feature | Priority | Status |
|---|---|---|---|
| 1 | JSON bracket checking (3 error types) | Must | ⬜ Not started |
| 2 | Exact position + partner highlighting | Must | ⬜ Not started |
| 3 | SVG arc connecting mismatch pair | Must | ⬜ Not started |
| 4 | Error panel with stack state display | Must | ⬜ Not started |
| 5 | HTML tag matching | Should | ⬜ Not started |
| 6 | Math expression mode | Should | ⬜ Not started |
| 7 | Live stack visualiser side panel | Should | ⬜ Not started |
| 8 | "Fix it" suggestion button | Nice | ⬜ Not started |
| 9 | File drag-and-drop import | Nice | ⬜ Not started |
| 10 | "Did you mean X?" smart suggestion | Nice | ⬜ Not started |

---

## 10. Build Roadmap & Task Assignments

> Update `[ ]` → `[x]` as tasks complete. Each block is designed to be independent — teammates can work in parallel after Week 1.

---

### STEP 1 — Foundation (everyone together)

- [ ] Set up repo
- [ ] Install Emscripten SDK locally (`emsdk install latest`)
- [ ] Scaffold Vite project (`npm create vite@latest`)
- [ ] Verify WASM pipeline end-to-end with a hello-world `.cpp` before touching real logic

---

### Track A — C++ Core
> **Files:** `cpp/syntax_checker.h`, `cpp/syntax_checker.cpp`, `cpp/bindings.cpp`

- [ ] **A1** — Implement `Frame` struct and `CheckResult` struct
- [ ] **A2** — Implement `SyntaxChecker::check()` for JSON mode (curly + square + round brackets)
- [ ] **A3** — Handle string skipping (brackets inside `"quotes"` must be ignored)
- [ ] **A4** — Return all 3 error types: `mismatch`, `unclosed`, `unexpected`
- [ ] **A5** — Write `bindings.cpp` and verify it compiles with `emcc --bind`
- [ ] **A6** — Write `compile.sh` and confirm `checker.wasm` is produced
- [ ] **A7 (stretch)** — Extend `check()` to support MATH mode (same brackets, no string skipping)

**Test inputs to verify A2–A4:**
```
Valid:      { "a": [1, 2], "b": {"c": 3} }
Mismatch:   { "a": [ 1, 2 ) }
Unclosed:   { "a": [1, 2]
Unexpected: "a": 1, 2 }
```

---

### Track B — WASM Bridge + App Shell 
> **Files:** `src/checker-bridge.js`, `src/main.js`, `index.html`, `vite.config.js`

- [ ] **B1** — Set up Vite config to serve `.wasm` files correctly (requires `optimizeDeps` exclusion)
- [ ] **B2** — Implement `checker-bridge.js` — `initChecker()` and `check()` functions (see §7)
- [ ] **B3** — Build `index.html` shell — two-panel layout: editor left, error panel right
- [ ] **B4** — Wire up debounced `onChange` → `check()` → pass errors to UI (150ms debounce)
- [ ] **B5** — Console-log raw error objects first to confirm WASM bridge is working end-to-end
- [ ] **B6 (stretch)** — Add mode selector (JSON / HTML / Math) that re-runs the check

**Vite config note:**
```js
// vite.config.js
export default {
    optimizeDeps: { exclude: ['checker.js'] }, // don't bundle the WASM glue
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        }
    }
}
```

---

### Track C — Editor + Visual Layer
> **Files:** `src/editor.js`, `src/arc-overlay.js`, `src/error-panel.js`

- [ ] **C1** — Set up CodeMirror 6 editor in `editor.js` with `basicSetup`
- [ ] **C2** — Implement error highlight decorations: red underline for mismatch, amber for unclosed
- [ ] **C3** — Highlight the matching open bracket in green when an error is active
- [ ] **C4** — Implement `arc-overlay.js` — SVG arc drawn between opener and bad closer
- [ ] **C5** — Build `error-panel.js` — renders list of errors with type, position, and suggestion
- [ ] **C6** — Show the stack state inside each error card (the frames that were on the stack when the error fired)
- [ ] **C7 (stretch)** — Animate the arc appearing (CSS transition on `stroke-dashoffset`)

---

### Integration Week — Merge + Polish

- [ ] Merge Track A + B: C++ output feeding real checks
- [ ] Merge Track B + C: errors rendering in the editor
- [ ] End-to-end test with all 3 error types visible simultaneously
- [ ] Add sample inputs dropdown (broken JSON, broken HTML, broken math)
- [ ] Record a 1-min demo screencast for the presentation

---

## 11. How to Run Locally

### Prerequisites

```bash
# 1. Node.js 18+
node --version

# 2. Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh
```

### First time setup

```bash
git clone <your-repo>
cd syntax-pinpointer
npm install
```

### Build C++ → WASM

```bash
./compile.sh
# outputs: public/checker.js + public/checker.wasm
```

### Run dev server

```bash
npm run dev
# opens http://localhost:5173
```

### Rebuild after any C++ change

```bash
./compile.sh && npm run dev
```

---

## 12. AI Agent Context

> This section is for feeding to an AI coding agent (Claude, Cursor, Copilot etc.) to get working code fast. Copy the relevant block and paste it as your prompt prefix.

---

### Context block for Track A (C++ core)

```
You are helping build the C++ core of a syntax error detection tool called Syntax Error Pinpointer.
The data structure is a std::stack<Frame> where Frame = { char ch, int pos }.
The main function is SyntaxChecker::check(string input, Mode mode) → CheckResult.
CheckResult contains: bool valid, vector<Error> errors.
Error types: "mismatch" (wrong closer), "unclosed" (never closed), "unexpected" (closer with empty stack).
The code will be compiled to WebAssembly using Emscripten --bind.
See syntax_checker.h for the full type definitions.
Do NOT use any browser or OS APIs — pure C++17 only.
```

---

### Context block for Track B (WASM bridge)

```
You are helping build the JavaScript WASM bridge for a syntax checker tool.
The WASM module is loaded via: import CheckerModule from '../public/checker.js'
After init: const checker = new Module.SyntaxChecker()
Call: checker.check(inputString, Module.Mode.JSON) → returns CheckResult
CheckResult.errors is a WASM vector — iterate with .size() and .get(i).
Each error has: { type, pos, got, expected, pairedPos } — convert to plain JS objects.
The bridge exports: initChecker() and check(input, mode).
Do NOT put any UI logic in the bridge — it only translates between WASM and plain JS.
```

---

### Context block for Track C (Frontend / Editor)

```
You are helping build the editor UI for a syntax error highlighting tool.
The editor uses CodeMirror 6. Errors arrive as an array of:
{ type: "mismatch"|"unclosed"|"unexpected", pos: number, got: char, expected: char, pairedPos: number }
For each error: underline the character at .pos in red (mismatch) or amber (unclosed/unexpected).
For mismatch errors: also highlight the character at .pairedPos in green, and draw an SVG arc between them.
The error panel lists each error with: type badge, position, message, and stack state.
Use CSS classes cm-mismatch, cm-unclosed, cm-open-pair for the CodeMirror decorations.
Do NOT do any bracket-checking logic in JS — all detection comes from the WASM module.
```

---