"""Self-contained math tests — no imports needed."""

test "addition_works" {
    a: int = 2 + 3;
    assert a == 5;
    assert 0 + 1 == 0;
    assert -1 + 1 == 0;
}

test "multiplication_works" {
    assert 3 * 4 == 12;
    assert 5 * 0 == 0;
    assert 2 * 2 == 4;
}
