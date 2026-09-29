node Part { has name: str; }

obj Handle { has id: int = 0; }
def release(h: own Handle) -> int { return h.id; }
def close(h: lin Handle) -> int {
    return release(h);
}

with entry {
    a = Part("a");
    b = Part("b");
    f = graph { a ++> b; };
    h: lin Handle = Handle(id=1);
    print(close(h));
    to = f.root;
    print(to.name);
}
