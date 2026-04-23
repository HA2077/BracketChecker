export function drawArc(editorDom, fromPos, toPos, color = '#E24B4A') {
    clearArcs(editorDom);

    const view = editorDom.cmView;
    if (!view || typeof view.coordsAtPos !== 'function') {
        return;
    }

    const fromCoords = view.coordsAtPos(fromPos);
    const toCoords = view.coordsAtPos(toPos);
    
    if (!fromCoords || !toCoords) {
        return;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    const editorRect = editorDom.getBoundingClientRect();
    
    const fx = fromCoords.left - editorRect.left;
    const fy = fromCoords.top - editorRect.top;
    const tx = toCoords.left - editorRect.left;
    const ty = toCoords.top - editorRect.top;

    const midX = (fx + tx) / 2;
    const midY = Math.max(fy, ty) + 18;

    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible';
    svg.dataset.arcOverlay = 'true';

    path.setAttribute('d', `M${fx},${fy} Q${midX},${midY} ${tx},${ty}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '1.2');
    path.setAttribute('stroke-dasharray', '3 2');

    svg.appendChild(path);
    editorDom.style.position = 'relative';
    editorDom.appendChild(svg);
}

export function clearArcs(editorDom) {
    editorDom.querySelectorAll('[data-arc-overlay]').forEach(el => el.remove());
}