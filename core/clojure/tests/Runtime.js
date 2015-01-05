module('clojure.tests.Runtime').requires('lively.MochaTests', 'clojure.Runtime').toRun(function() {

describe("Clojure runtime environments", function() {
  
  var sut = clojure.Runtime;
  beforeEach(function() { sut.reset(); });

  it("creates default environment", function() {
    expect(sut.currentEnv()).to.containSubset({host: "0.0.0.0", port: 7888, session: null});
    sut.change({host: "0.0.0.0", port: 7889, session: null});
    expect(sut.currentEnv()).to.containSubset({host: "0.0.0.0", port: 7889, session: null});
  });

  describe("for editors", function() {

    var editor;
    beforeEach(function() {
      editor = {session: {}, getSession: function() { return this.session; }};
    });

    it("sets environment in editor", function() {
      expect(sut.currentEnv(editor)).to.containSubset({host: "0.0.0.0", port: 7888, session: null});
      sut.changeInEditor(editor, {host: "0.0.0.0", port: 7889, session: null});
      expect(sut.currentEnv()).to.containSubset({host: "0.0.0.0", port: 7888, session: null});
      expect(sut.currentEnv(editor)).to.containSubset({host: "0.0.0.0", port: 7889, session: null});
    });

    it("editor env inherits global", function() {
      sut.changeInEditor(editor, {host: "0.0.0.0", port: 7889, session: null});
      sut.currentEnv().session = "session(FOOO123)";
      expect(sut.currentEnv(editor)).to.containSubset({host: "0.0.0.0", port: 7889, session: "session(FOOO123)"});
    });

  });

});


describe("Clojure static analyzer", function() {

  describe("ns", function() {

    it("finds and analyzes ns form", function() {
      expect(clojure.StaticAnalyzer.findNsForm("(ns foo)\n(+ x y)"))
      .to.containSubset({nsName: "foo"});
    });

   it("finds ns form with annotation", function() {
      expect(clojure.StaticAnalyzer.findNsForm("(ns ^{:author \"foo\"} foo)\n(+ x y)"))
      .to.containSubset({nsName: "foo"});
    });

  });

  it("generates a find definition request for thing at point", function() {
    expect(clojure.StaticAnalyzer.createDefinitionQuery("(ns foo)\n(map x y)", 10/*|map*/))
          .to.containSubset({ns: {nsName: "foo"}, source: 'map'});
  });

})

describe("Element completion", function() {

  it("constructs a form to send to the completer for simple . expr", function() {
    expect(clojure.StaticAnalyzer.buildElementCompletionForm("(. foo)", 2))
    .to.equal("(do (require \'[rksm.system-navigator.completions]) (rksm.system-navigator.completions/instance-elements->json foo))");
  });

  it("constructs a form to send to the completer for more complex . expr", function() {
    expect(clojure.StaticAnalyzer.buildElementCompletionForm("(. (foo 34 \\x))", 2))
    .to.equal("(do (require \'[rksm.system-navigator.completions]) (rksm.system-navigator.completions/instance-elements->json (foo 34 \\x)))");
  });

  it("constructs a form to send to the completer for threaded expr", function() {
    expect(clojure.StaticAnalyzer.buildElementCompletionForm("(->>\nbla barf\n.)", 2))
    .to.equal("(do (require \'[rksm.system-navigator.completions]) (->>\nbla barf\nrksm.system-navigator.completions/instance-elements->json))");
  });

})

}) // end of module
