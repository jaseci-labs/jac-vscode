"""
Sample JAC file for testing
"""

def example(){
    number = 1+2;
    print(f"Calculated {number}");
    if number < 4 {
        print("Small number");
    }
}

# jac's equivalent of main

with entry {
    print("Hello world!");
    example();
}