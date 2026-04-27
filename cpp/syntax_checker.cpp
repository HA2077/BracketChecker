#include "syntax_checker.h"
#include <algorithm>
#include <cctype>
#include <stack>
#include <vector>

bool SyntaxChecker::isOpen(char c, Mode m){
    if (m == Mode::HTML)
        return false;
    return c == '{' || c == '[' || c == '(';
}

bool SyntaxChecker::isClose(char c, Mode m){
    if (m == Mode::HTML)
        return false;
    return c == '}' || c == ']' || c == ')';
}

char SyntaxChecker::matchingOpen(char close){
    if (close == ')') return '(';
    if (close == ']') return '[';
    if (close == '}') return '{';
    return 0;
}

char SyntaxChecker::matchingClose(char open){
    if (open == '(') return ')';
    if (open == '[') return ']';
    if (open == '{') return '}';
    return 0;
}

void SyntaxChecker::skipString(const std::string &s, int &i){
    i++;  // move past opening quote
    while (i < (int)s.size()){
        if (s[i] == '\\'){
            i += 2;
            if (i > (int)s.size()) i = s.size();  // bounds check
            continue;
        }
        if (s[i] == '"')
            break; 
        i++;
    }
}

TokenType SyntaxChecker::classifyMathToken(char c) {
    if (isdigit(c) || c == '.')                          return TokenType::NUMBER;
    if (c == '+' || c == '-' || c == '*' || c == '/' || c == '^')
        return TokenType::OPERATOR;
    if (c == '(' || c == '[')                            return TokenType::OPEN;
    if (c == ')' || c == ']')                            return TokenType::CLOSE;
    if (isalpha(c) || c == '_')                          return TokenType::NUMBER;  // variables are operands
    return TokenType::INVALID;
}

std::vector<Error> SyntaxChecker::checkMathSyntax(const std::string& input) {
    std::vector<Error> errors;

    TokenType prev = TokenType::OPEN;
    int       lastPos = -1;

    for (int i = 0; i < (int)input.size(); i++) {
        if (isspace(input[i])) continue;

        TokenType cur = classifyMathToken(input[i]);
        lastPos = i;

        // You know i'm bad i'm bad
        bool bad = false;

        switch (cur) {
            case TokenType::OPERATOR:
                if (prev == TokenType::OPERATOR || prev == TokenType::OPEN)
                    bad = true;
                break;

            case TokenType::NUMBER:
                if (prev == TokenType::CLOSE)
                    bad = true;
                break;

            case TokenType::OPEN:
                if (prev == TokenType::NUMBER || prev == TokenType::CLOSE)
                    bad = true;
                break;

            case TokenType::CLOSE:
                if (prev == TokenType::OPERATOR || prev == TokenType::OPEN)
                    bad = true;
                break;

            case TokenType::INVALID:
                break;
        }

        if (bad)
            errors.push_back({ "syntax", i, std::string(1, input[i]), "", -1, {} });

        if (cur != TokenType::INVALID) prev = cur;
    }

    if (prev == TokenType::OPERATOR && lastPos != -1)
        errors.push_back({ "syntax", lastPos, std::string(1, input[lastPos]), "", -1, {} });

    return errors;
}

bool SyntaxChecker::isHtmlTagOpen(const std::string &s, int i, std::string &outTagName){
    if (s[i] != '<') return false;
    int j = i + 1;
    if (j >= (int)s.size()) return false;
    if (s[j] == '/') return false;
    if (!std::isalpha(s[j]) && s[j] != '_') return false;
    int nameStart = j;
    while (j < (int)s.size() && (std::isalnum(s[j]) || s[j] == '_' || s[j] == '-')){
        j++;
    }
    outTagName = s.substr(nameStart, j - nameStart);
    return !outTagName.empty();
}

bool SyntaxChecker::isHtmlTagClose(const std::string &s, int i, std::string &outTagName){
    if (s[i] != '<') return false;
    int j = i + 1;
    if (j >= (int)s.size() || s[j] != '/') return false;
    j++;
    if (j >= (int)s.size()) return false;
    if (!std::isalpha(s[j]) && s[j] != '_') return false;
    int nameStart = j;
    while (j < (int)s.size() && (std::isalnum(s[j]) || s[j] == '_' || s[j] == '-')){
        j++;
    }
    outTagName = s.substr(nameStart, j - nameStart);
    return !outTagName.empty();
}

bool SyntaxChecker::isHtmlVoidTag(const std::string &tagName){
    static const std::string voids[] = {
        "meta","link","br","hr","img","input","area","base",
        "col","embed","param","source","track","wbr","!DOCTYPE"
    };
    for (const auto &v : voids){
        if (tagName == v) return true;
    }
    return false;
}

bool SyntaxChecker::isHtmlSelfClose(const std::string &s, int i){
    int j = i + 1;
    while (j < (int)s.size() && s[j] != '>'){
        if (s[j] == '/') return j + 1 < (int)s.size() && s[j + 1] == '>';
        j++;
    }
    return false;
}

std::vector<Frame> stackToVector(const std::stack<Frame> &stk){
    std::vector<Frame> frames;
    std::stack<Frame> temp = stk;
    while (!temp.empty()){
        frames.push_back(temp.top());
        temp.pop();
    }
    return frames;
}

CheckResult SyntaxChecker::check(const std::string &input, Mode mode){
    std::stack<Frame> stck;
    CheckResult result{true, {}};

    for (int i = 0; i < (int)input.size(); ++i){
        char c = input[i];

        if (c == '"' && mode == Mode::JSON){
            skipString(input, i);
            continue;
        }

        if (mode == Mode::HTML){
            std::string tagName;
            if (isHtmlTagClose(input, i, tagName)){
                if (stck.empty()){
                    result.valid = false;
                    Error err{"unexpected", i, "</" + tagName + ">", "", -1, {}};
                    result.errors.push_back(err);
                } 
                else {
                    Frame top = stck.top();
                    if (top.ch != tagName){
                        result.valid = false;
                        Error err{"mismatch", i, "</" + tagName + ">", "<" + top.ch + ">", top.pos, stackToVector(stck)};
                        result.errors.push_back(err);
                        stck.pop();
                    } 
                    else
                        stck.pop();
                }
                continue;
            }
            if (isHtmlTagOpen(input, i, tagName)){
                if (isHtmlVoidTag(tagName) || isHtmlSelfClose(input, i))
                    continue;
                stck.push({tagName, i});
                continue;
            }
        }

        if (isOpen(c, mode))
            stck.push({std::string(1, c), i});
        else if (isClose(c, mode)){
            if (stck.empty()){
                result.valid = false;
                Error err{"unexpected", i, std::string(1, c), "", -1, {}};
                result.errors.push_back(err);
            } else {
                Frame top = stck.top();
                if (top.ch != std::string(1, matchingOpen(c))){
                    result.valid = false;
                    char needClose = matchingClose(top.ch[0]);
                    std::string expectedStr = needClose ? std::string(1, needClose) : "";
                    Error err{"mismatch", i, std::string(1, c), expectedStr, top.pos, stackToVector(stck)};
                    result.errors.push_back(err);
                    stck.pop();
                } 
                else
                    stck.pop();
            }
        }
    }

    while (!stck.empty()){
        Frame f = stck.top();
        stck.pop();
        Error err{"unclosed", f.pos, "<" + f.ch + ">", "", -1, stackToVector(stck)};
        result.valid = false;
        result.errors.push_back(err);
    }

    if (mode == Mode::MATH){
        std::vector<Error> syntaxErrors = checkMathSyntax(input);
        // Avoid duplicate errors at same position
        for (auto& se : syntaxErrors) {
            bool dup = false;
            for (auto& be : result.errors)
                if (be.pos == se.pos) { dup = true; break; }
            if (!dup) {
                result.valid = false;
                result.errors.push_back(se);
            }
        }
        std::sort(result.errors.begin(), result.errors.end(),
            [](const Error& a, const Error& b) { return a.pos < b.pos; });
    }

    return result;
}
