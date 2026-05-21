"""Property accessors — getter / setter / deleter syntax fixture.

Covers the shapes the highlighter needs to handle:
  1. Inline accessor block on `has` with typed getter + typed setter.
  2. Read-only computed property (getter only, no backing).
  3. Signature-only accessors terminated by `;` (bodies live in an impl file).
  4. Full inline bodies on both getter and setter.
"""

obj Circle {
    has _color: str = "black",
        _radius: float = 1.0;

    # (1) inline accessors — typed getter + typed setter with bodies
    has color: str {
        getter -> str { return self._color; }
        setter(value: str) { self._color = value; }
    }

    # (2) read-only computed — bare getter (no return annotation), with body
    has diameter: float {
        getter { return self._radius * 2.0; }
    }

    # (3) signature-only accessors — bodies live in the impl file below
    has radius: float {
        getter -> float;
        setter(value: float);
        deleter;
    }

    # (4) typed getter + typed setter, both with inline bodies
    has area: float {
        getter -> float { return self._radius * self._radius * 3.14159; }
        setter(value: float) { self._radius = (value / 3.14159) ** 0.5; }
    }
}

def foo(a:int) -> int {
    return a * 2;
}
