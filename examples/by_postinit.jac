obj Foo {
    has msg: str by postinit;
    def postinit {
        self.msg = "hello";
    }
}

obj Bar {
    has msg: str by postinit,
        msg2: str by postinit,
        msg3: int = 90;
    def postinit;
}

obj Baz;

impl Baz {
    has msg: str by postinit;
    def postinit;
}
