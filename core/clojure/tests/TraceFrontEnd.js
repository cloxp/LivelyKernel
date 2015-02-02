module('clojure.tests.TraceFrontEnd').requires('lively.MochaTests', 'clojure.TraceFrontEnd').toRun(function() {
/*global describe, it, expect, paredit, clojure*/

describe("Clojure trace front end", function() {

  var testCode = "(defn foo\n"
               + "  [x]\n"
               + "  (+ 23 x)\n  [{:x 3, :y 5}])\n",
      ast = paredit.parse(testCode),
      sut = clojure.TraceFrontEnd.SourceMapper;

  describe("source pos to ast index mapping", function() {
    it("|(+ 23 x)|",   function() { expect(sut.findSelectedNode(ast, 18, 26).idx)            .equals(5); });
    it("|  (+ 23 x)|", function() { expect(sut.findSelectedNode(ast, 16, 26).idx)            .equals(5); });
    it("|  (+ 23 x)",  function() { expect(sut.findSelectedNode(ast, 16).idx)                .equals(5); });
    it("  (+| 23 x)",  function() { expect(sut.findSelectedNode(ast, 20).idx)                .equals(7); });
    it("  (+| 23 x|)", function() { expect(sut.findSelectedNode(ast, 20, 25).idx)            .equals(7); });
    it("|(defn ...)|", function() { expect(sut.findSelectedNode(ast, 0, testCode.length).idx).equals(0); });
    it("|(+ 23 x)|",   function() { expect(sut.findSelectedNode(ast, 29).idx)                .equals(9); });
    
    describe("derefs", function() {
      it("(foo |@bar)", function() { expect(sut.findSelectedNode(paredit.parse("(foo @bar)"), 5).idx).equals(2); });
      it("(foo @|bar)", function() { expect(sut.findSelectedNode(paredit.parse("(foo @bar)"), 6).idx).equals(4); });
      it("(foo @bar |baz)", function() { expect(sut.findSelectedNode(paredit.parse("(foo @bar baz)"), 9).idx).equals(5); });
    });

    describe("quoting", function() {
      it("('foo |bar)", function() { expect(sut.findSelectedNode(paredit.parse("('foo |bar)"), 6).idx).equals(4); });
      it("(`foo |bar)", function() { expect(sut.findSelectedNode(paredit.parse("(`foo |bar)"), 6).idx).equals(4); });
    });
  });

  describe("ast index to source pos", function() {
    it("|(+ 23 x)",   function() { expect(sut.astIdxToSourceIdx(ast.children[0], 5)).equals(18); });
    it("  (+| 23 x)",  function() { expect(sut.astIdxToSourceIdx(ast.children[0], 7)).equals(21); });
    it("|(defn ...)|", function() { expect(sut.astIdxToSourceIdx(ast.children[0], 0)).equals(0); });
  });

  it("creates trace install code from editor", function() {
    
    var expected = "(defn foo\n  [x]\n  ->(+ 23 x)\n  [{:x 3, :y 5}])"
    expect(sut.installTraceCode(ast, testCode, 18).annotatedSource).eq(expected);
  });


})

}) // end of module
