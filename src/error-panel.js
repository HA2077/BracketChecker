export function renderErrors(errors) {
    const pane = document.getElementById('error-pane'); 
    
    if (!errors || errors.length === 0) {
        pane.innerHTML = '<span style="color: green;">✓ No syntax errors found.</span>';
        return;
    }

    let html = '<ul>';
    errors.forEach(err => {
        html += `<li style="color: red;">
            <strong>Error at position ${err.pos}:</strong> 
            Got '${err.got}', expected '${err.expected || 'matching pair'}'.
        </li>`;
    });
    html += '</ul>';
    
    pane.innerHTML = html;
}