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