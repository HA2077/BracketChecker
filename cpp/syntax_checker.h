#pragma once
#include <string>
#include <vector>
#include <stack>

enum class Mode{
    JSON,
    HTML,
    MATH
};

enum class TokenType {
    NUMBER,
    OPERATOR,
    OPEN,
    CLOSE,
    INVALID
};

struct Frame{
    std::string ch;
    int pos;
};

struct Error{
    std::string type;
    int pos;
    std::string got;
    std::string expected;
    int pairedPos;
    std::vector<Frame> stackSnapshot;
};

struct CheckResult{
    bool valid;
    std::vector<Error> errors;
};

class SyntaxChecker{
public:
    CheckResult check(const std::string &input, Mode mode);
    std::vector<Error> checkMathSyntax(const std::string& input);

private:
    bool isOpen(char c, Mode m);
    bool isClose(char c, Mode m);
    char matchingOpen(char closeChar);
    void skipString(const std::string &s, int &i);
    TokenType classifyMathToken(char c);

    bool isHtmlTagOpen(const std::string &s, int i, std::string &outTagName);
    bool isHtmlTagClose(const std::string &s, int i, std::string &outTagName);
    bool isHtmlVoidTag(const std::string &tagName);
    bool isHtmlSelfClose(const std::string &s, int i);
};