import { initChecker, check } from './checker-bridge.js';
import { createEditor, applyErrorDecorations } from './editor.js';
import { renderErrors } from './error-panel.js';
import { drawMultiArcs, clearArcs } from './arc-overlay.js';

await initChecker();

let debounceTimer;
let currentInput = '';

const editorView = createEditor(document.getElementById('editor-pane'), (input) => {
    currentInput = input;
    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
        const mode = getActiveMode();
        const result = check(input, mode);
        
        renderErrors(result.errors, input);
        
        if (editorView) {
            applyErrorDecorations(editorView, result.errors);
            drawMultiArcs(editorView.dom, result.errors);
        }
        
        updateStatusBadge(result.valid, result.errors.length);
    }, 150);
});

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
    if (editorView && currentInput) {
        const mode = getActiveMode();
        const result = check(currentInput, mode);
        
        renderErrors(result.errors, currentInput);
        
        if (editorView) {
            applyErrorDecorations(editorView, result.errors);
            drawMultiArcs(editorView.dom, result.errors);
        }
        
        updateStatusBadge(result.valid, result.errors.length);
    }
}

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        runCheck();
    });
});

editorView.focus();