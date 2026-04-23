import { initChecker, check } from './checker-bridge.js';
import { createEditor, applyErrorDecorations } from './editor.js';
import { renderErrors } from './error-panel.js';

await initChecker();

let debounceTimer;
let editorView = createEditor(document.getElementById('editor-pane'), (input) => {
    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
        const mode = document.querySelector('.mode.active').dataset.mode;
        const result = check(input, mode);
        
        console.log("Syntax Errors:", result.errors);
        renderErrors(result.errors);
        
        if (editorView)
            applyErrorDecorations(editorView, result.errors);
        
        updateStatusBadge(result.valid, result.errors.length);
    }, 150);
});

function updateStatusBadge(valid, count) {
    const badge = document.getElementById('status-badge');
    badge.textContent = valid ? '✓ valid' : `${count} error${count > 1 ? 's' : ''}`;
    badge.className   = valid ? 'badge-ok' : 'badge-err';
}