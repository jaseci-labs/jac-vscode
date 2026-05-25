obj ItemView {
    has id: str,
        name: str;
}

obj CollectionView {
    has items: list[ItemView];
}

# Node with complex method bodies (mirrors Profile node in test.jac)
node ComplexNode {
    has username: str = "",
        bio: str = "";

    def to_simple_view -> ItemView {
        return ItemView(id=jid(self), name=self.username);
    }

    def to_complex_view -> CollectionView {
        items = [p.to_simple_view() for p in [self-->[?:ComplexNode]]];
        items.sort(key=lambda t: ItemView : t.name, reverse=True);
        return CollectionView(
            items=items
        );
    }
}

# This node's -> should NOT be red — but fails if context leaks from above
node ProblemNode {
    has content: str = "",
        likes: list[str] = [],
        comments: list[dict[str, str]] = [];

    def to_view -> ItemView {
        return ItemView(id=jid(self), name=self.content);
    }
}

# Graph traversal -> operators — these should NOT be red either
node TraversalNode {
    has value: str = "";

    def connected_count -> int {
        # -> inside len([edge ...]) is a graph operator, not an annotation
        is_linked: bool = len([self]) > 0 and len([edge self->[?:TraversalNode]]) > 0;
        return len([self-->[?:TraversalNode]]);
    }
}
