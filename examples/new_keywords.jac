comptime MAX = 8;

abst obj Base {
    has own data: mut int;
}

def widen(a: i32, b: u64) -> f64 {
    return a;
}

with entry {
    comptime if MAX > 4 { print(MAX); }
    forever {
        wait task;
        flow compute();
    }
    print(props);
}
