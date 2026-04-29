# BracketChecker

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-brightgreen?style=for-the-badge&logo=vercel&logoColor=white)](https://ha2077.github.io/BracketChecker/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)](https://webassembly.org/)

**BracketChecker** is a high-performance syntax validator that provides real-time, detailed feedback on bracket, tag, and expression errors directly in your browser. Powered by a C++ core compiled to WebAssembly, it offers lightning-fast analysis for JSON, HTML, and mathematical expressions.

You can try it out now from the **[Live Demo](https://ha2077.github.io/BracketChecker/)**

## Table of Contents

- [BracketChecker](#bracketchecker)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Known Limitations & Future Work](#known-limitations--future-work)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)

## Features
*   **Multi-Mode Validation:** Seamlessly switch between modes for tailored syntax checking:
    *   **JSON/C-style:** Validates `{}`, `[]`, and `()`. Correctly ignores brackets within double-quoted strings.
    *   **HTML/XML:** Checks for proper `<tag>...</tag>` nesting and handles void/self-closing tags like `<br>`, `<meta>`, and `<img/>`.
    *   **Math:** Analyzes `()`, `[]` and validates expression grammar, catching errors like double operators (`1 +* 2`), missing operators (`1(2+3)`), and leading/trailing operators.
*   **C++ Core via WebAssembly:** The core validation logic is written in C++ for performance and compiled to WebAssembly, allowing near-native speed in the browser.
*   **Rich Error Diagnostics:** Goes beyond simple error messages to identify the root cause of syntax problems:
    *   **Mismatch errors:** e.g., `[` closed by `)`. The tool reports both locations.
    *   **Unclosed errors:** An opening bracket or tag that is never closed.
    *   **Unexpected errors:** A closing bracket or tag with no corresponding opener.
*   **Interactive Error Feedback:**
    *   Errors are highlighted with wavy underlines directly in the CodeMirror editor.
    *   An animated SVG arc visually connects mismatched brackets, no matter how far apart they are.
    *   The corresponding opening bracket is highlighted for quick reference.
*   **Stack Snapshot Visualization:** For each error, the side panel displays the state of the parser stack at the moment the error occurred, helping you understand the nesting context and debug complex issues.
*   **Click-to-Navigate:** Click on any error card to jump directly to its location in the editor.
*   **Tab Notification:** Browser tab shows error count so you can see issues at a glance.

## Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend Framework | Vanilla JavaScript (ES6+) |
| Code Editor | CodeMirror 6 |
| Build Tool | Vite |
| Core Language | C++23 |
| WebAssembly | Emscripten |
| Styling | Custom CSS (Dark Theme) |

## Architecture

The application is designed with a clean separation between the user interface and the core validation logic.

1.  **Frontend (JavaScript/HTML/CSS):** The UI is built with vanilla JavaScript and the CodeMirror 6 editor. It is responsible for capturing user input and rendering visual feedback.
2.  **WebAssembly Bridge:** On every input change (debounced for performance), the editor content is passed to the WebAssembly module.
3.  **Core Logic (C++):** The Wasm module, compiled from C++, uses a `std::stack` to perform a single-pass analysis of the input string. It builds a detailed list of any errors found.
4.  **Result Rendering:** The C++ core returns a structured array of error objects to the JavaScript frontend. The frontend then uses this data to render the error panel, editor highlights, and SVG arcs.

This architecture leverages the performance of C++ for the heavy lifting while using the flexibility of JavaScript and the DOM for a rich, interactive user experience.

## Project Structure

```bash
BracketChecker/
├── cpp/                    # C++ core validation logic (stack-based parser)
├── public/                 # Static assets served by Vite
│   ├── checker.wasm            # Compiled WebAssembly module
│   └── checker.js              # JavaScript glue code for Wasm
├── src/                    # Frontend source code
│   ├── main.js                 # Main application entry point
│   ├── editor.js               # CodeMirror setup and editor logic
│   ├── counter.js              # Manages error count and tab notifications
│   ├── error-panel.js          # Renders error details and stack snapshots
│   ├── error-state.js          # Manages error state and tab notifications
│   ├── arc-overlay.js          # SVG arc rendering logic
│   └── style.css               # Custom styles for the application
├── docs/                   # Documentation and design notes
├── Testing/                # Test cases and scripts for validating the C++ core
├── .github/workflows/      # GitHub Actions for deployment to GitHub Pages
├── .gitignore
├── WAcompile.sh            # Script to compile C++ → WebAssembly using Emscripten
├── vite.config.js
├── package.json
├── index.html
└── README.md
```

## Local Development

To run BracketChecker locally, you will need Node.js and the Emscripten SDK.

### Prerequisites
*   **Node.js:** Version 20.x or later.
*   **Emscripten SDK:** Follow the [official installation guide](https://emscripten.org/docs/getting_started/downloads.html) to install and activate the SDK.

### Setup and Execution

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/HA2077/BracketChecker.git
    cd BracketChecker
    ```

2.  **Install frontend dependencies:**
    ```bash
    npm install
    ```

3.  **Compile the C++ Core to WebAssembly:**
    Before running, ensure your Emscripten environment is activated (e.g., by running `source ./emsdk_env.sh` from your Emscripten directory).
    ```bash
    chmod +x ./WAcompile.sh
    ./WAcompile.sh
    ```
    This script compiles the C++ files in `cpp/` into `public/checker.wasm` and its JavaScript glue file `public/checker.js`.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173`. The Vite server provides hot-reloading for frontend changes. If you modify the C++ source code, you must re-run `./WAcompile.sh` to see the changes.

---


## Known Limitations & Future Work

```markdown

### Known Limitations
- Supports basic bracket/tag matching; does not perform full language-specific parsing (e.g., complete JavaScript or complex nested templates).
- Very large inputs (>> 100k characters) may experience minor performance degradation.
- Math mode catches common operator errors but does not evaluate expressions or handle advanced functions.
- HTML mode recognizes standard void tags but may need updates for custom elements or modern frameworks.

### Future Work
- Enhanced math expression support (functions, variables, better precedence).
- Multiple editor themes and accessibility improvements.
- Export error reports (JSON/PDF) and shareable links.
- Programmatic API so other projects can use the checker core.
- Performance optimizations for extremely large files.
- Additional validation modes (e.g., CSS, basic SQL).
```
---

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.
1. Fork the repository and create your branch from `main`.
2. Make your changes and commit them with clear messages.
3. Push to the branch and open a Pull Request.

---


## Acknowledgements
This project was built as part of a Data Structures course. We'd like to thank:
- **Course Instructor** - For the engaging assignment and guidance throughout the semester 
- **Project Teammates** - For collaborating on the C++ core and testing various features
    * Abdallah Ashraf    [GitHub](https://github.com/Abdullah-Ashraf8)
    * Abdelrahman Fathy  [GitHub](https://github.com/Jetstream6)
    * Salam Mahgoub      [GitHub](https://github.com/spider769)
    * Ziad Wael          [GitHub](https://github.com/zyadwael152)
- **Open Source Community** - For the amazing tools that made this possible:
  - [Emscripten](https://emscripten.org/) - C++ to WebAssembly compiler
  - [CodeMirror](https://codemirror.net/) - Excellent code editor component
  - [Vite](https://vitejs.dev/) - Fast build tool and dev server
---

Made with ❤️ and a whole lot of coffee ☕
