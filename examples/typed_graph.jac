import from accel { tensor }

node Stop {
    has name: str = "";
}

edge Ride: Stop --> Stop {
    has km: int = 0;
}

walker Bus {
    has seen: list[str] = [];

    can arrive with Stop entry {
        self.seen.append(here.name);
        report here.name;
        if here.name == "c" {
            disengage;
        }
        if here.name == "x" {
            skip;
        }
        visit :0: [here ->:Ride:->];
    }
}

def half(x: f16, y: bf16, big: i128, ubig: u128) -> float {
    return float(x) + float(y) + float(big) + float(ubig);
}

def quantize(x: tensor[f32, _], q: tensor[f8e4m3fn, _], r: tensor[f8e5m2, _], t: tensor[f4e2m1fn, _]) {
    q[0] = f8e4m3fn(x[0]);
}

def maybe(s: Stop | None) -> str | None {
    return s?.name;
}

def work(n: int) -> int {
    return n * 2;
}

with entry:__main__ {
    a = Stop(name="a");
    b = Stop(name="b");
    c = Stop(name="c");
    a +>:Ride(km=3):+> b;
    b +>:Ride:+> c;
    a <++> c;
    near = [a ->:Ride:km > 1:->];
    stops = [a --> [?:Stop, name == "b"]];
    a del --> c;
    w = root spawn Bus();
    print(w.reports, near, stops, maybe(None));
    h = flow work(3);
    print(wait h);
    f = lambda (x: int) -> int { return x * 2; };
    k = lambda (x: int) { x * 3 };
    print(f(1), k(2), True, False, None);
}
