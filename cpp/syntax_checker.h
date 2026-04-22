#pragma once
#include <string>
#include <vector>
#include <stack>

enum class Mode
{
    JSON,
    HTML,
    MATH
};

struct Frame
{
    char ch;
    int pos;
};

struct Error
{
    std::string type;
    int pos;
    char got;      // الحرف اللي لقيناه
    char expected; // الحرف اللي كان المفروض نلاقيه
    int pairedPos; // مكان قوس الفتح المتعلق بالمشكلة
};

struct CheckResult
{
    bool valid;
    std::vector<Error> errors;
};

class SyntaxChecker
{
public:
    CheckResult check(const std::string &input, Mode mode);

private:
    bool isOpen(char c, Mode m);
    bool isClose(char c, Mode m);
    char matchingOpen(char closeChar);
    void skipString(const std::string &s, int &i);
};
