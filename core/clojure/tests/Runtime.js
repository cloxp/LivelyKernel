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

}) // end of module
