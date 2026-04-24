# Comment outside JSX - highlighted as comment
cl {
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
