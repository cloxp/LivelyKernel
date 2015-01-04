/*global expect,it,describe,beforeEach*/
module('lively.ide.codeeditor.modes.tests.Clojure').requires('lively.ide.codeeditor.modes.Clojure', 'lively.MochaTests').toRun(function() {

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

}) // end of module
