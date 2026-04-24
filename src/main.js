import { initChecker, check } from './checker-bridge.js';
import { createEditor, applyErrorDecorations } from './editor.js';
import { renderErrors } from './error-panel.js';
import { drawMultiArcs, clearArcs } from './arc-overlay.js';

await initChecker();

let debounceTimer;
let currentInput = '';
let editorView = null;

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
            if (mode === 'HTML') return;

            const result = check(input, mode);
            
            renderErrors(result.errors, input);
            
            if (editorView && result.errors.length > 0) {
                applyErrorDecorations(editorView, result.errors);
                drawMultiArcs(editorView.dom, result.errors);
            } else if (editorView) {
                clearArcs(editorView.dom);
            }
            
            updateStatusBadge(result.valid, result.errors.length);
        }, 150);
    });
}

initEditor();

function getActiveMode() {
    const activeBtn = document.querySelector('.mode-btn.active');
    return activeBtn ? activeBtn.dataset.mode : 'JSON';
}

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

function runCheck() {
    const input = editorView ? editorView.state.doc.toString() : '';
    const mode = getActiveMode();
    const appMain = document.querySelector('.app-main');
    if (mode === 'HTML') {
        appMain.classList.add('html-mode');
        renderHtmlComingSoon();
        clearArcs(document.getElementById('editor-pane'));
        updateStatusBadge(false, 0);
        document.getElementById('status-badge').textContent = '';
        document.getElementById('status-badge').className = 'status-badge';
        return;
    }
    appMain.classList.remove('html-mode');
    if (input) {
        const result = check(input, mode);
        
        renderErrors(result.errors, input);
        
        if (editorView) {
            if (result.errors.length > 0) {
                applyErrorDecorations(editorView, result.errors);
                drawMultiArcs(editorView.dom, result.errors);
            } else {
                clearArcs(editorView.dom);
            }
        }
        
        updateStatusBadge(result.valid, result.errors.length);
    }else {
        renderErrors([], '');
        if (editorView) clearArcs(editorView.dom);
        document.getElementById('status-badge').textContent = '';
        document.getElementById('status-badge').className = 'status-badge';
    }
}

function renderHtmlComingSoon() {
    const pane = document.getElementById('error-pane');
    pane.innerHTML = `
        <div class="coming-soon">
            <div class="coming-soon-icon">🚧</div>
            <h2>HTML Mode Coming Soon</h2>
            <p>For now, try JSON or Math mode!</p>
        </div>
    `;
}

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById('sample-selector').value = '';
        const mode = e.target.dataset.mode;
        
        if (mode === 'JSON' || mode === 'MATH') {
            editorView.dispatch({
                changes: { from: 0, to: editorView.state.doc.length, insert: '' }
            });
            editorView.focus();
        }
        
        runCheck();
    });
});

editorView.focus();
// ========================================
// Sample Loader Logic 
// ========================================
const SAMPLES = {
    'valid_json': { mode: 'JSON', text: '{ "user": { "name": "Ali", \n"scores": [88, 92, 100] } }' },
    'mismatch': { mode: 'JSON', text: '{ "scores": [ 88, 92 ) }' },
    'unclosed': { mode: 'JSON', text: '{ "name": "Ali", "scores": [88, 92' },
    'unexpected': { mode: 'JSON', text: '"name": "Ali" }' },
    'multiple': { mode: 'JSON', text: '{ [ ( ] ) }' },
    'valid_math': { mode: 'MATH', text: '(3 + [2 * (1 + 4)])' },
    'broken_math': { mode: 'MATH', text: '(3 * [2 + 1 )' }
};

document.getElementById('sample-selector').addEventListener('change', (e) => {
    const sampleKey = e.target.value;
    if (!sampleKey || !SAMPLES[sampleKey]) return;
    
    const sample = SAMPLES[sampleKey];
    
    // Switch to the correct mode button automatically
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[data-mode="${sample.mode}"]`).classList.add('active');
    
    // Inject the code into CodeMirror
    if (editorView) {
        editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: sample.text }
        });
        editorView.focus();
    }
    
    // Force a check immediately
    runCheck();
    
});
// Welcome Screen Logic
// ========================================
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

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', hideWelcome);
});

document.getElementById('sample-selector').addEventListener('change', hideWelcome);