function getLineCol(text, pos) {
    let line = 1;
    let col = 1;
    for (let i = 0; i < pos; i++) {
        if (text[i] === '\n') {
            line++;
            col = 1;
        } else {
            col++;
        }
    }
    return `line ${line}, col ${col}`;
}

function escapeHTML(str) {
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

function formatStackSnapshot(snapshot) {
    if (!snapshot || snapshot.length === 0) {
        return '<span class="stack-empty">empty stack</span>';
    }
    
    return snapshot.map((frame, index) => {
        const isTop = index === snapshot.length - 1;
        const label = `L${frame.pos}`;
        return `<span class="stack-pill ${isTop ? 'top' : ''}">${frame.ch} ${label}${isTop ? ' ← top' : ''}</span>`;
    }).join(' ');
}

function formatTitle(err, locStr) {
    if (err.type === 'mismatch') return `Mismatch at ${locStr}`;
    if (err.type === 'unclosed') return `Unclosed bracket at ${locStr}`;
    return `Unexpected bracket at ${locStr}`;
}

function formatMessage(err, text) {
    const got = escapeHTML(err.got);
    const expected = escapeHTML(err.expected);
    
    if (err.type === 'mismatch') {
        const openerLoc = getLineCol(text, err.pairedPos);
        return `<strong>${got}</strong> cannot close opener from ${openerLoc}.<br>Did you mean <strong>${expected}</strong> ?`;
    }
    if (err.type === 'unclosed') {
        return `Bracket <strong>${got}</strong> opened but never closed.`;
    }
    return `Bracket <strong>${got}</strong> found with nothing open.`;
}

export function renderErrors(errors, input) {
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
 
    errors.forEach(err => {
        const locStr = getLineCol(input, err.pos);
        const stackHtml = formatStackSnapshot(err.stackSnapshot);
        
        const card = document.createElement('div');
        card.className = `error-item ${err.type}`;
        
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
        fragment.appendChild(card);
    });
    
    pane.appendChild(fragment);
}