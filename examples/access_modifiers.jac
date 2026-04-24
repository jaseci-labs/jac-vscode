node:pub PublicNode { has x: int; }
node:priv PrivateNode { has x: int; }
node:protect ProtectedNode { has x: int; }
obj:pub PublicObj { has x: int; }
walker:pub PublicWalker { can run with `root` entry { visit --> ; } }
edge:pub PublicEdge { has w: float; }
