cl {

    def app() -> any {
        [count, setCount] = useState(0);
        return <div>
            <h1>Hello, World!</h1>
            <p>Count: {count}</p>
            <button onClick={lambda e: any -> None { setCount(count + 1); }}>
                Increment
            </button>
            <ButtonComponent label="Click Me" />
            <NavLink to="/about">About Page</NavLink>
        </div>;
    }
}
cl{

def app{
    a = <>esc;

        fragment = (
            <>
                <div>
                    First
                </div>
                <div>
                    Second
                </div>
            </>
        );
    }
}




with entry{
    print("Hello, Jac!");
}

cl import from react {useState}


cl {

    def app() -> any {
        let [count, setCount] = useState(0);
        return <div>
            <h1>Hello, World!</h1>
            <p>Count: {count}</p>
            <button onClick={lambda e: any -> None { setCount(count + 1); }}>
                Increment
            </button>
            <ButtonComponent label="Click Me" />
            <NavLink to="/about">About Page</NavLink>
        </div>;
    }
}


cl {
    def app()  -> any {
        has count: int = 0;
        useEffect(lambda   -> None{ console.log("Count: ", count);} , [count]);
        return <h1>Count is {count}</h1>;
    }
}

cl{
    def:pub TestComponent() -> any {
        return <div>
            <h2>This is a test component</h2>
            <p>It demonstrates component creation in Jac.</p>
        </div>;
    }
}

def app{
    return (
            <EmailBuddyLayout
            />
    );
}

def _static_bash(commands: list, exe: str) -> str;
impl _static_bash{}

sem word.cost = "it is a expense";

impl semantic{}

cl {
    def:pub app() -> any {
        has count: int = 0;

        return <div>
            # No parameters
            <button onClick={lambda -> None { count = count + 1; }}>
                Increment
            </button>
        </div>;
    }
}

with entry{
    process = lambda x: int -> int {
    doubled = x * 2;
    result = doubled + 1;
    return result;
};
}

glob enum_semstr = [
    member.semstr
    for member in enum_info_to_use.members
    if member.semstr
];

"""Implementation of analysis scheduler."""

import from typing { Optional, Callable, Any }


impl SchedulerConfig.default -> SchedulerConfig {
    return SchedulerConfig();
}


impl PendingAnalysis.postinit -> None {
    if self.timestamp == 0 {
        self.timestamp = time.time();
    }
}

sem word.cost =
impl semantic{}

check

def init_cache() -> dict:
    return {}

# Test: JSX text with # should NOT be highlighted as comment
cl{
    def app() -> Any {
        return <div>
            <span>{ "*" }</span> # this is not a comment; html Content <--
            <p>
                # this is not a comment
                #this is not # a comment
                {#* This is the valid comment inside jsx *# }
            </p>
        </div>;
    }
}