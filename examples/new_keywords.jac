comptime MAX = 8;

obj Base {
    has data: own int = 0;

    def area -> f64 abst;
}

def compute -> int {
    return MAX;
}

def widen(_a: &mut i32, _b: imm u64) -> f64 {
    return 1.0;
}

with entry {
    comptime if MAX > 4 { print(MAX); }
    forever {
        t = flow compute();
        wait t;
        break;
    }
    print(props);
}
