"""JSX-slot keywords: `skip;` (KW_SKIP) and `try {} awaiting {}` (KW_AWAITING)."""

obj UserCard {
    has name: str;
}

def:pub Skeleton -> JsxElement {
    return <p>Loading…</p>;
}

def:pub CardView(user: UserCard) -> JsxElement {
    return <h2>{user.name}</h2>;
}

cl {
    def:pub TasksPanel(tasks: list, loading: bool) -> JsxElement {
        return
            <div>
                {if loading {
                    <p>Loading...</p>
                    skip;
                }if len(tasks) == 0 {
                    <p>Empty</p>
                    skip;
                }for t in tasks {
                    <TaskItem task={t}/>
                }}
            </div>;
    }

    def:pub UserPanel(user: UserCard) -> JsxElement {
        return
            <section>
                {try {
                    <CardView user={user}/>
                } awaiting {
                    <Skeleton/>
                }}
            </section>;
    }
}
