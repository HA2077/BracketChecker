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
            const mode = getActiveMode();
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
    
    if (mode === 'HTML') {
        renderHtmlComingSoon();
        clearArcs(document.getElementById('editor-pane'));
        updateStatusBadge(false, 0);
        document.getElementById('status-badge').textContent = '';
        document.getElementById('status-badge').className = 'status-badge';
        return;
    }
    
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
    } else {
        renderErrors([], '');
        if (editorView) clearArcs(editorView.dom);
        updateStatusBadge(true, 0);
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