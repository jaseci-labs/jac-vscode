# Function names after override modifier should get entity.name.function scope
obj Shape {
    can area() -> float;
    can perimeter() -> float;
}

obj Circle(Shape) {
    has radius: float;

    override can area() -> float {
        return 3.14 * self.radius * self.radius;
    }

    override can perimeter() -> float {
        return 2.0 * 3.14 * self.radius;
    }
}

obj Rect(Shape) {
    has w: float;
    has h: float;

    override can area() -> float {
        return self.w * self.h;
    }
}
