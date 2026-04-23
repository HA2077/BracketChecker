import { initChecker, check } from './checker-bridge.js';
import { createEditor }       from './editor.js';
import { renderErrors }       from './error-panel.js';

await initChecker();

let debounceTimer;

createEditor(document.getElementById('editor-pane'), (input) => {
    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
        const mode = document.querySelector('.mode.active').dataset.mode;
        const result = check(input, mode);
        
        console.log("Syntax Errors:", result.errors);
        renderErrors(result.errors);
        updateStatusBadge(result.valid, result.errors.length);
    }, 150);
});

function updateStatusBadge(valid, count) {
    const badge = document.getElementById('status-badge');
    badge.textContent = valid ? '✓ valid' : `${count} error${count > 1 ? 's' : ''}`;
    badge.className   = valid ? 'badge-ok' : 'badge-err';
}