def init_cache() -> dict {
    return {};
}

with entry {
    process = lambda x: int -> int {
        doubled = x * 2;
        result = doubled + 1;
        return result;
    };
}

na def priority_score(title: str) -> int;

na { def bytes_search_na() -> dict[str, any] { return {}; } }

def categorize(title: str) -> Category by llm();

def:pub add_todo(title: str) -> Todo {
    try {
        result = categorize(title);
        category = str(result).split(".")[-1].lower();
    } except Exception {
        category = "other (setup AI key)";
    }
    todo = Todo(title=title, category=category, priority=priority_score(title));
    root() ++> todo;
    return todo;
}
