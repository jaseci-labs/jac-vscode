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