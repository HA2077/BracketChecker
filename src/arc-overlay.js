export function drawArc(editorDom, fromPos, toPos, color = '#E24B4A') {
    const view = editorDom.cmView;
    if (!view || typeof view.coordsAtPos !== 'function')
        return null;

    const fromCoords = view.coordsAtPos(fromPos);
    const toCoords = view.coordsAtPos(toPos);
    
    if (!fromCoords || !toCoords)
        return null;

    const scrollDOM = view.scrollDOM;
    if (!scrollDOM) return null;
    
    if (getComputedStyle(scrollDOM).position === 'static')
        scrollDOM.style.position = 'relative';
    
    const scrollRect = scrollDOM.getBoundingClientRect();

    const fx = fromCoords.left - scrollRect.left + scrollDOM.scrollLeft;
    const fy = fromCoords.top - scrollRect.top + scrollDOM.scrollTop;
    const tx = toCoords.left - scrollRect.left + scrollDOM.scrollLeft;
    const ty = toCoords.top - scrollRect.top + scrollDOM.scrollTop;

    const midX = (fx + tx) / 2;
    
    const dx = Math.abs(tx - fx);
    const midY = Math.max(fy, ty) + Math.max(40, Math.min(dx * 0.05, 5000));

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${fx},${fy} Q${midX},${midY} ${tx},${ty}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '200');
    path.setAttribute('stroke-dashoffset', '200');
    path.classList.add('arc-animated');

    return path;
}

export function drawMultiArcs(editorDom, errors){
    clearArcs(editorDom);
    
    const view = editorDom.cmView;
    if (!view) return;
    
    const scrollDOM = view.scrollDOM;
    if (!scrollDOM) return;
    
    if (getComputedStyle(scrollDOM).position === 'static')
        scrollDOM.style.position = 'relative';
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;pointer-events:none;overflow:visible;z-index:10;';
    svg.style.height = scrollDOM.scrollHeight + 'px';
    svg.dataset.arcOverlay = 'true';
    scrollDOM.appendChild(svg);
    
    for (const err of errors){
        if (err.type === 'mismatch' && err.pairedPos >= 0){
            const path = drawArc(editorDom, err.pairedPos, err.pos);
            if (path)
                svg.appendChild(path);
        }
    }
}

export function clearArcs(editorDom) {
    const view = editorDom.cmView;
    if (view && view.scrollDOM)
        view.scrollDOM.querySelectorAll('[data-arc-overlay]').forEach(el => el.remove());
}