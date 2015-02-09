module('clojure.ToolsMenuBarEntry').requires("lively.morphic.tools.MenuBar").toRun(function() {

lively.BuildSpec("clojure.ClojureToolsMenuBarEntry", lively.BuildSpec("lively.morphic.tools.MenuBarEntry").customize({

  name: "clojureToolsLabel",
  menuBarAlign: "left",
  textString: "open",

  style: lively.lang.obj.merge(lively.BuildSpec("lively.morphic.tools.MenuBarEntry").attributeStore.style, {
    align: "center",
    extent: lively.pt(60,20),
    toolTip: "Open programming tools."
    // textColor: Color.rgb(127,230,127)
  }),
  
  morphMenuItems: function morphMenuItems() {
    function cmd(name) { return function() { lively.ide.commands.exec(name); }; }
    var self = this;
    return [
          ["open workspace", cmd("clojure.ide.openWorkspace")],
          ["open browser", cmd("clojure.ide.openBrowser")],
          ["open clojars", cmd("clojure.ide.openClojarsBrowser")],
          ["js", [
            ['JavaScript Workspace', cmd('lively.ide.openWorkspace')],
            ['JavaScript Browser', cmd('lively.ide.openSystemCodeBrowser')],
            ['PartsBin', cmd('lively.PartsBin.open')],
            ['Subserver Viewer', cmd('lively.ide.openSubserverViewer')],
          ]]
    ];
  },

  update: function update() {},
}));


Object.extend(clojure.ToolsMenuBarEntry, {
  getMenuBarEntries: function() {
    return [lively.BuildSpec("clojure.ClojureToolsMenuBarEntry").createMorph()]
  }
});

}) // end of module
