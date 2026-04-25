function getLineCol(text, pos) {
    let line = 1;
    let col = 1;
    for (let i = 0; i < pos;++i){
        if (text[i] === '\n') {
            line++;
            col = 1;
        } 
        else
            col++;
    }
    return `line ${line}, col ${col}`;
}

function escapeHTML(str){
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function tagDisplayName(tagStr) {
    if (!tagStr) return '';
    return tagStr.replace(/^<\/?/, '').replace(/>$/, '');
}

function formatStackSnapshot(snapshot) {
    if (!snapshot || snapshot.length === 0)
        return '<span class="stack-empty">empty stack</span>';
    
    return snapshot.map((frame, index) => {
        const isTop = index === snapshot.length - 1;
        const label = `L${frame.pos}`;
        return `<span class="stack-pill ${isTop ? 'top' : ''}">&lt;${tagDisplayName(frame.ch)}&gt; ${label}${isTop ? ' ← top' : ''}</span>`;
    }).join(' ');
}

function formatTitle(err, locStr) {
    if (err.type === 'mismatch') return `Mismatch at ${locStr}`;
    if (err.type === 'unclosed') return `Unclosed tag at ${locStr}`;
    return `Unexpected tag at ${locStr}`;
}

function formatMessage(err, text) {
    const got = tagDisplayName(err.got);
    const expected = tagDisplayName(err.expected);
    
    if (err.type === 'mismatch') {
        const openerLoc = getLineCol(text, err.pairedPos);
        return `&lt;${escapeHTML(got)}&gt; cannot close opener from ${openerLoc}.<br>Did you mean &lt;<strong>${escapeHTML(expected)}</strong>&gt; ?`;
    }
    if (err.type === 'unclosed')
        return `&lt;<strong>${escapeHTML(got)}</strong>&gt; opened but never closed.`;
    return `&lt;<strong>${escapeHTML(got)}</strong>&gt; found with nothing open.`;
}

import { getEditorView } from './error-state.js';

let _currentErrors = [];
let _editorInput = '';

export function renderErrors(errors, input) {
    _currentErrors = errors;
    _editorInput = input;
    
    const pane = document.getElementById('error-pane');
    pane.innerHTML = '';
 
    if (!input || input.trim() === '') {
        pane.innerHTML = `
            <div class="coming-soon">
                <div class="coming-soon-icon" style="font-size: 2.5rem; opacity: 0.5;">⌨️</div>
                <p style="font-size: 1.05rem; color: var(--text-muted); margin-top: 10px;">Waiting for input... Start typing!</p>
            </div>
        `;
        return;
    }

    if (!errors || errors.length === 0) {
        pane.innerHTML = '<p class="no-errors">✓ No errors found</p>';
        return;
    }
 
    const fragment = document.createDocumentFragment();
 
    errors.forEach((err, index) => {
        const locStr = getLineCol(input, err.pos);
        const stackHtml = formatStackSnapshot(err.stackSnapshot);
        
        const card = document.createElement('div');
        card.className = `error-item ${err.type}`;
        card.dataset.index = index;
        
        card.innerHTML = `
            <div class="err-icon">${err.type === 'mismatch' ? '!' : '~'}</div>
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