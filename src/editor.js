// src/editor.js
import { EditorView, basicSetup } from 'codemirror';

/**
 * Initializes CodeMirror 6 in the specified parent element.
 * @param {HTMLElement} parent - The DOM element to attach the editor to.
 * @param {Function} onChange - Callback that receives the new document text.
 */
export function createEditor(parent, onChange) {
    const view = new EditorView({
        extensions: [
            basicSetup,
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    onChange(update.state.doc.toString());
                }
            }),
        ],
        parent,
    });

    // Seed with a broken JSON example as per acceptance criteria
    view.dispatch({
        changes: { 
            from: 0, 
            insert: '{\n  "name": "Ali",\n  "scores": [ 88, 92 \n}' 
        }
    });

    return view;
}