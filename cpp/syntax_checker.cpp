#include "syntax_checker.h"
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

void SyntaxChecker::skipString(const std::string &s, int &i){
    i++;
    while (i < (int)s.size()){
        if (s[i] == '\\'){
            i += 2;
            continue;
        }
        if (s[i] == '"'){
            i++;
            break;
        }
        i++;
    }
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
                } else {
                    Frame top = stck.top();
                    if (top.ch != tagName){
                        result.valid = false;
                        Error err{"mismatch", i, "</" + tagName + ">", "<" + top.ch + ">", top.pos, stackToVector(stck)};
                        result.errors.push_back(err);
                        stck.pop();
                    } else {
                        stck.pop();
                    }
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
                    Error err{"mismatch", i, std::string(1, c), std::string(1, matchingOpen(c)), top.pos, stackToVector(stck)};
                    result.errors.push_back(err);
                    stck.pop();
                } else {
                    stck.pop();
                }
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

    return result;
}