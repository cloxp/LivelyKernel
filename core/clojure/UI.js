module('clojure.UI').requires().requiresLib({url: Config.codeBase + 'lib/ace/ace.ext.lang.paredit.js',loadTest: function() { return lively.lang.Path("ext.lang.paredit").get(ace); }}).toRun(function() {

Object.extend(clojure.UI, {

  showText: function(spec) {
    // $world.addActionText(actionSpec, options)
    var ed = $world.addCodeEditor(spec)
    ed.getWindow().comeForward();
    return ed;
  },

  showSource: function(spec) {
    spec = lively.lang.obj.merge({
      textMode: "clojure",
      extent: pt(600,500)
    }, spec||{});
    return clojure.UI.showText(spec)
  }

});

}) // end of module
