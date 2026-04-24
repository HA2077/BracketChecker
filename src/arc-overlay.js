export function drawArc(editorDom, fromPos, toPos, color = '#E24B4A') {
    const view = editorDom.cmView;
    if (!view || typeof view.coordsAtPos !== 'function') {
        return null;
    }

    const fromCoords = view.coordsAtPos(fromPos);
    const toCoords = view.coordsAtPos(toPos);
    
    if (!fromCoords || !toCoords) {
        return null;
    }

    const editorRect = editorDom.getBoundingClientRect();
    
    const fx = fromCoords.left - editorRect.left;
    const fy = fromCoords.top - editorRect.top;
    const tx = toCoords.left - editorRect.left;
    const ty = toCoords.top - editorRect.top;

    const midX = (fx + tx) / 2;
    const midY = Math.max(fy, ty) + 30;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${fx},${fy} Q${midX},${midY} ${tx},${ty}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '4 3');

    return path;
}

export function drawMultiArcs(editorDom, errors) {
    clearArcs(editorDom);
    
    let svg = null;
    
    for (const err of errors) {
        if (err.type === 'mismatch' && err.pairedPos >= 0) {
            const path = drawArc(editorDom, err.pairedPos, err.pos);
            if (path) {
                if (!svg) {
                    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible';
                    svg.dataset.arcOverlay = 'true';
                    editorDom.style.position = 'relative';
                    editorDom.appendChild(svg);
                }
                svg.appendChild(path);
            }
        }
    }
}

export function clearArcs(editorDom) {
    editorDom.querySelectorAll('[data-arc-overlay]').forEach(el => el.remove());
}