cl import from react { useState }

cl {
    def app() -> JsxElement {
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

cl {
    def app() -> JsxElement {
        has count: int = 0;
        useEffect(lambda -> None { console.log("Count: ", count); }, [count]);
        return <h1>Count is {count}</h1>;
    }
}

cl {
    def:pub TestComponent() -> JsxElement {
        return <div>
            <h2>This is a test component</h2>
            <p>It demonstrates component creation in Jac.</p>
        </div>;
    }
}

def app {
    return (
        <EmailBuddyLayout />
    );
}

cl {
    def:pub app() -> JsxElement {
        has count: int = 0;
        return <div>
            <button onClick={lambda -> None { count = count + 1; }}>
                Increment
            </button>
        </div>;
    }
}
