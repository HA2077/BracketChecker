import { initChecker, check } from './checker-bridge.js';
import { createEditor, applyErrorDecorations } from './editor.js';
import { renderErrors } from './error-panel.js';
import { drawArc, clearArcs } from './arc-overlay.js';

await initChecker();

let debounceTimer;
let editorView = createEditor(document.getElementById('editor-pane'), (input) => {
    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
        const mode = document.querySelector('.mode.active').dataset.mode;
        const result = check(input, mode);
        
        console.log("Syntax Errors:", result.errors);
        renderErrors(result.errors);
        
        if (editorView) {
            applyErrorDecorations(editorView, result.errors);
            drawArcsForErrors(editorView, result.errors);
        }
        
        updateStatusBadge(result.valid, result.errors.length);
    }, 150);
});

function drawArcsForErrors(view, errors) {
    const editorDom = view.dom;
    clearArcs(editorDom);
    
    for (const err of errors) {
        if (err.type === 'mismatch' && err.pairedPos >= 0) {
            drawArc(editorDom, err.pairedPos, err.pos);
        }
    }
}

function updateStatusBadge(valid, count) {
    const badge = document.getElementById('status-badge');
    badge.textContent = valid ? '✓ valid' : `${count} error${count > 1 ? 's' : ''}`;
    badge.className   = valid ? 'badge-ok' : 'badge-err';
}