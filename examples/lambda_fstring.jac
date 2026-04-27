# Lambda with f-string body inside function call — same-line vs split-line paren
# Both versions should produce identical highlighting (no premature lambda exit at '{')

test "lambda fstring same line paren" {
    # sorted( on same line: lambda must not exit at { inside f-string
    ordered_classes = sorted(
        items, key=lambda cls : source.find(f"class {cls.__name__}"),
    );
}

test "lambda fstring split line paren" {
    # ( on new line: reference case that was already correct
    ordered_classes = sorted
    (
        items, key=lambda cls : source.find(f"class {cls.__name__}"),
    );
}

test "lambda plain string in call" {
    result = sorted(items, key=lambda x : x.find("hello {world}"));
}

test "lambda nested call in body" {
    result = map(lambda x : str(x), items);
}
