#include <emscripten/bind.h>
#include "syntax_checker.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(checker_module){
    enum_<Mode>("Mode")
        .value("JSON", Mode::JSON)
        .value("HTML", Mode::HTML)
        .value("MATH", Mode::MATH);

    value_object<Frame>("Frame")
        .field("ch",  &Frame::ch)
        .field("pos", &Frame::pos);

    value_object<Error>("Error")
        .field("type",        &Error::type)
        .field("pos",         &Error::pos)
        .field("got",         &Error::got)
        .field("expected",    &Error::expected)
        .field("pairedPos",   &Error::pairedPos)
        .field("stackSnapshot", &Error::stackSnapshot);

    value_object<CheckResult>("CheckResult")
        .field("valid",  &CheckResult::valid)
        .field("errors", &CheckResult::errors);

    register_vector<Frame>("VectorFrame");
    register_vector<Error>("VectorError");

    class_<SyntaxChecker>("SyntaxChecker")
        .constructor()
        .function("check", &SyntaxChecker::check);
}