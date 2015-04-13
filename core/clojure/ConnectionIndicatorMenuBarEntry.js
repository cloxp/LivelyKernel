module('clojure.ConnectionIndicatorMenuBarEntry').requires("lively.morphic.tools.MenuBar").toRun(function() {

lively.BuildSpec("clojure.ClojureConnectionIndicatorMenuBarEntry", lively.BuildSpec("lively.morphic.tools.MenuBarEntry").customize({

  name: "clojureStatusLabel",
  menuBarAlign: "right",
  changeColorForMenu: false,

  style: lively.lang.obj.merge(lively.BuildSpec("lively.morphic.tools.MenuBarEntry").attributeStore.style, {
    extent: lively.pt(130,20),
    textColor: Color.rgb(127,230,127),
    toolTip: "shows the connection status of the currently choosen clojure server and allows to switch between and add clojure servers"
  }),

  quickUpdateFor: function(secs) {
    var self = this;
    self.startStepping(1*1000, "update");
    (function() { self.startStepping(30*1000, "update"); }).delay(secs || 10);
  },

  morphMenuItems: function morphMenuItems() {
    // clojure.Runtime.environments()
    // clojure.Runtime.addEnv
    // clojure.Runtime._defaultEnv
    var self = this,
        cmd = clojure.Runtime.ReplServer.getCurrentServerCommand(),
        items = [
          ["(re)start repl server",   function() { lively.ide.commands.exec("clojure.ide.startReplServer", null, function(err, cmd) {}); }],
          ["stop repl server",    function() { lively.ide.commands.exec("clojure.ide.stopReplServer", null, function(err, cmd) {}); }]
        ].concat(
          cmd ? [["show server process", lively.ide.commands.exec.curry("clojure.ide.showServerProcess")]] : []
        ).concat([
          {isMenuItem: true, isDivider: true},
          ["open nREPL log",      function() { lively.ide.commands.exec("clojure.ide.openREPLLog"); }],
          ["show evaluation queue", function() {
            var cmd = lively.ide.codeeditor.modes.Clojure.commands.detect(function(ea) {
              return ea.name === "clojureShowEvalQueue"; });
            cmd.exec();
          }],
          {isMenuItem: true, isDivider: true},
          ["environments", clojure.Runtime.environments().map(function(ea) {
            return [clojure.Runtime.printEnv(ea), function() {
              clojure.Runtime.change(ea);
              self.update();
            }]
          }).concat([["add", function() { lively.ide.commands.exec("clojure.ide.clojureAddEnv"); }]])]
        ]);
    return items;
  },

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  update: function update() {
    var env = Global.clojure.Runtime.currentEnv() || {port: 7888, host: "127.0.0.1"};
    var self = this;
    Global.clojure.Runtime.lsSessions({env: env}, function(err, answer) {
      if (err) {
        self.applyStyle({
          fill: Global.Color.red,
          textColor: Global.Color.white
        });
        self.textString = "[clj] disconnected";
      } else {
        self.applyStyle({
          fill: Global.Color.green,
          textColor: Global.Color.white
        });
        self.textString = "[clj] " + env.host + ":" + env.port;
      }
    })
  },

  onLoad: function onLoad() {
    (function() { this.update(); }).bind(this).delay(10);
    (function() { this.update(); }).bind(this).delay(0);
    this.startStepping(30*1000, "update");
  }

}));

Object.extend(clojure.ConnectionIndicatorMenuBarEntry, {
  getMenuBarEntries: function() {
    return [lively.BuildSpec("clojure.ClojureConnectionIndicatorMenuBarEntry").createMorph()]
  }
});

}) // end of module
