graph layers {
    layer shared { model; }
    layer service { todos; }
    layer tool { tool.*; }
}

graph spaces {
    """The command line."""
    space api: native { todos; }
    space cli: native { entry tool.show; }

    app api { run api; }
    app cli { run cli, api; }
    package todolib { ship api; }
}

graph spaces split {
    app back { run api; }
}

graph import {
    edge Shared: shared --> service;
    edge Calls: service --> tool;

    model ++> todos { Item }
    todos ++> tool.show { list_items }
}
