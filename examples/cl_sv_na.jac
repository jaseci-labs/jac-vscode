cl import from react { useState }
sv import from endpoints { AddTodo, GetTodos }
sv import from auth { login, logout }

cl {
    def:pub app() -> JsxElement {
        has count: int = 0;
        return <div>
            <button onClick={lambda -> None { count = count + 1; }}>
                Increment
            </button>
        </div>;
    }
}

sv {
    def:pub get_todos() -> list[Todo] {
        return root.todos;
    }
}

na def priority_score(title: str) -> int;

na { def bytes_search_na() -> dict[str, any] { return {}; } }
