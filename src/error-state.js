let _view = null;
let _errors = [];

export function setEditorView(view) {
    _view = view;
}

export function getEditorView() {
    return _view;
}

export function setCurrentErrors(errors) {
    _errors = errors;
}

export function getCurrentErrors() {
    return _errors;
}