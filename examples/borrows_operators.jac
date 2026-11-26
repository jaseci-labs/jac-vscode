obj Res {
    has n: int = 0;
}

def steps(log: list[str], fail: bool) -> int {
    defer {
        log.append("first");
    }
    if fail {
        raise ValueError("failed");
    }
    return 0;
}

def count(n: int, acc: int) -> int {
    if n == 0 {
        return acc;
    }
    return tail count(n - 1, acc + n);
}

def named -> int {
    r: own Region = Region();
    in r {
        a = Res(n=3);
        return a.n;
    }
}

def squares(out: &mut list[int], seen: &list[int]) -> int {
    total = 0;
    flow for i in range(len(out)) {
        out[i] = i * i;
        total += out[i];
    }
    return total + len(seen);
}

def lend -> int {
    a: own Res = Res(n=1);
    b = &mut a;
    b.n = 3;
    return a.n;
}

def math(a: u8, b: u8, c: int | None) -> int {
    w = a +% b;
    s = a *| b;
    t = a -% b;
    a +%= 1;
    d = c ?? 0;
    return int(w) + int(s) + int(t) + d;
}

def double(x: int) -> int {
    return x * 2;
}

def piped -> int {
    a = 3 |> double;
    b = double <| 3;
    c = 3 :> double;
    d = double <: 3;
    return a + b + c + d;
}

def gen -> list[int] {
    out: list[int] = [];
    for i = 0 while i < 3 with i += 1 {
        out.append(i);
    }
    forever {
        break;
    }
    switch len(out) {
        case 3:
            print("three");
        default:
            print("other");
    }
    return out;
}

with entry {
    print(math(1, 2, None), piped(), gen(), count(3, 0), named());
}
