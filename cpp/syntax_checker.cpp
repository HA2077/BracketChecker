#include "syntax_checker.h"
#include <stack>

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
    if (close == ')')
        return '(';
    if (close == ']')
        return '[';
    if (close == '}')
        return '{';
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

CheckResult SyntaxChecker::check(const std::string &input, Mode mode){
    std::stack<Frame> stck;
    CheckResult result{true, {}};

    for (int i = 0; i < (int)input.size(); ++i){
        char c = input[i];

        if (c == '"' && mode == Mode::JSON){
            skipString(input, i);
            continue;
        }

        if (isOpen(c, mode))
            stck.push({c, i});
        else if (isClose(c, mode)){
            if (stck.empty())
            {
                result.valid = false;
                result.errors.push_back({"unexpected", i, c, 0, -1});
            }
            else
            {
                Frame top = stck.top();
                stck.pop();

                if (top.ch != matchingOpen(c))
                {
                    char needed = (top.ch == '(' ? ')' : (top.ch == '[' ? ']' : '}'));
                    result.valid = false;
                    result.errors.push_back({"mismatch", i, c, needed, top.pos});
                }
            }
        }
    }

    while (!stck.empty()){
        Frame f = stck.top();
        stck.pop();
        result.valid = false;
        result.errors.push_back({"unclosed", f.pos, f.ch, 0, -1});
    }

    return result;
}
