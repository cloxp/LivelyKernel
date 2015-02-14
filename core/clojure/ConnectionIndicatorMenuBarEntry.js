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
  
  actions: function actions() {
    var self = this;

    return {
      startServer: function() {
          var indicatorClose;
          Functions.composeAsync(
              function(next) { lively.require('lively.morphic.tools.LoadingIndicator').toRun(function() { next(); }) },
              function(next) { lively.require('lively.ide.tools.ShellCommandRunner').toRun(function() { next(); }) },
              function(next) { lively.require('lively.ide.codeeditor.modes.Clojure').toRun(function() { next(); }) },
              function(next) {
                  lively.morphic.tools.LoadingIndicator.open("Starting server", function(close) { indicatorClose = close; next(); });
              },
              function(next) { Global.clojure.Runtime.ReplServer.ensure(
                {useLein: true, env: Global.clojure.Runtime.currentEnv()}, next); },
              function(cmd, next) { lively.ide.tools.ShellCommandRunner.findOrCreateForCommand(cmd).openInWorldCenter(); next(null, cmd); },
              function(cmd, next) { indicatorClose(); next(null, cmd); }
          )(function(err, cmd) {
            self.startStepping(1*1000, "update");
            (function() { self.startStepping(30*1000, "update"); }).delay(60);
          });
      },
      
      stopServer: function() {
          Functions.composeAsync(
              function(next) { lively.require('lively.ide.codeeditor.modes.Clojure').toRun(function() { next(); }) },
              function(next) { lively.require('lively.ide.tools.ShellCommandRunner').toRun(function() { next(); }) },
              function(next) {
                  var cmd = Global.clojure.Runtime.ReplServer.getCurrentServerCommand();
                  if (cmd) lively.ide.tools.ShellCommandRunner.findOrCreateForCommand(cmd).openInWorldCenter();
                  next(null, cmd);
              },
              function(cmd, next) {
                Global.clojure.Runtime.ReplServer.stop(
                  cmd, Global.clojure.Runtime.currentEnv(), next); }
          )(function(err) {
            // show("Clojure repl server stopped");
            (function() { self.update(); }).delay(.2);
          });
      },
      
      openNreplLog: function() { lively.ide.commands.exec("clojure.ide.openREPLLog"); },

      addEnvInteractively: function() {
          $world.prompt("Server name and port of clojure environment?", function(input) {
              if (!input) return;
              var match = input.match(/^([^:]+):([0-9]+)$/);
              var host = match[1].trim(), port = parseInt(match[2]);
              if (!host || !port) {
                  show("not a valid host/port combo: " + input);
                  return;
              }
              
              var env = {host: host, port: port};
              clojure.Runtime.addEnv(env);
              self.update();
          }, {input: "0.0.0.0:7889", historyId: "clojure.Runtime.add-environment"});
      }
    }
  },

  morphMenuItems: function morphMenuItems() {
    // clojure.Runtime.environments()
    // clojure.Runtime.addEnv
    // clojure.Runtime._defaultEnv
    var self = this,
        actions = this.actions(),
        items = [
          ["start repl server", actions.startServer],
          ["stop repl server", actions.stopServer],
          ["open nREPL log", actions.openNreplLog],
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
          }).concat([["add", actions.addEnvInteractively]])]
        ];
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
