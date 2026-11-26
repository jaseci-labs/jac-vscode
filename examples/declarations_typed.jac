"""Declarations."""
import os;
import type json;
comptime import from jaclang.comptime { target }

type Id = int;
type Pair[T] = tuple[T, T];

glob:prot LIMIT: int = 10;
comptime WIDTH: int = 64;

obj:priv Shape {
    def area -> float abst;
}

obj Square {
    has side: float = 1.0;
    has:prot label: str = "";
    has total: float postinit;

    def postinit {
        self.total = self.side * 4.0;
    }

    def area -> float {
        return self.side * self.side;
    }

    static async def load -> int {
        return 1;
    }

    class def make -> Square {
        return Square();
    }
}

struct Point {
    has x: i128 = 0, y: u128 = 0;
}

union Bits {
    has i: u32, f: f32;
}

node City {
    has name: str = "";
}

edge Road: City --> City {
    has km: int = 0;
}

def largest[T: Shape](shapes: list[T]) -> float {
    best: float = 0.0;
    for s in shapes {
        best = max(best, s.area());
    }
    return best;
}

def doubled[comptime N: int](x: int) -> int where N >= 0, "N counts doublings" {
    r = x;
    comptime for _ in range(N) {
        r = r * 2;
    }
    return r;
}

def:pub where -> str {
    return "here";
}

def total(comptime n: int, *values: int) -> int {
    return sum(values) + n;
}

def shapes_of(s: dyn Shape) -> float {
    return s.area();
}

enum Color {
    RED = 1,
    GREEN = 2,
}

comptime if target().os == "linux" {
    glob WORD: u64 = 0;
} else {
    glob WORD: u32 = 0;
}

test "square area" {
    assert Square(side=2.0).area() == 4.0;
}
