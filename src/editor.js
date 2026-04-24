// src/editor.js
import { EditorView, basicSetup } from 'codemirror';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

/**
 * Initializes CodeMirror 6 in the specified parent element.
 * @param {HTMLElement} parent - The DOM element to attach the editor to.
 * @param {Function} onChange - Callback that receives the new document text.
 */

export const setErrors = StateEffect.define();

const mismatchMark = Decoration.mark({ class: 'cm-mismatch' });
const unclosedMark = Decoration.mark({ class: 'cm-unclosed' });
const unexpectedMark = Decoration.mark({ class: 'cm-unexpected' });
const openMark = Decoration.mark({ class: 'cm-open-pair' });

function posToRange(doc, charPos){
    if (charPos < 0) return null;
    if (charPos >= doc.length) charPos = doc.length - 1;
    return { from: charPos, to: charPos + 1 };
}

function getDecorations(errors, doc) {
    const decorations = [];
    
    for (const err of errors) {
        const range = posToRange(doc, err.pos);
        if (!range) continue;
        
        if (err.type === 'mismatch') {
            decorations.push(mismatchMark.range(range.from, range.to));
            if (err.pairedPos >= 0) {
                const openRange = posToRange(doc, err.pairedPos);
                if (openRange)
                    decorations.push(openMark.range(openRange.from, openRange.to));
            }
        } 
        else if (err.type === 'unclosed')
            decorations.push(unclosedMark.range(range.from, range.to));
        else if (err.type === 'unexpected')
            decorations.push(unexpectedMark.range(range.from, range.to));
    }
    
    return Decoration.set(decorations, true);
}

const errorHighlightField = StateField.define({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        for (const e of tr.effects){
            if (e.is(setErrors))
                return getDecorations(e.value, tr.state.doc);
        }
        return decorations.map(tr.changes);
    },
    provide: field => EditorView.decorations.from(field),
});

export function applyErrorDecorations(view, errors) {
    view.dispatch({
        effects: setErrors.of(errors)
    });
}

export function createEditor(parent, onChange) {
    const view = new EditorView({
        extensions: [
            basicSetup,
            errorHighlightField,
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    onChange(update.state.doc.toString());
                }
            }),
        ],
        parent,
    });

    view.dom.cmView = view;

view.dispatch({
        changes: { 
            from: 0, 
            insert: '' 
        }
    });

    return view;
}