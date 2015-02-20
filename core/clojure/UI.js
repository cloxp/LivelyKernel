module('clojure.UI').requires('clojure.Runtime', 'lively.ide.codeeditor.ace', 'clojure.TraceFrontEnd').toRun(function() {

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
  },

  getMenuBarEntries: function() {
    return [
      lively.BuildSpec('lively.ide.tools.LivelyMenuBarEntry').createMorph(),
      lively.BuildSpec("clojure.UI.ClojureConnectionIndicatorMenuBarEntry").createMorph(),
      lively.BuildSpec("clojure.UI.ClojureToolsMenuBarEntry").createMorph()]
  }

});

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function addMorphicExtensions() {
  
  lively.whenLoaded(function(w) { w.showsMorphMenu = false; });
  
  // no menu buttons
  lively.morphic.Window.addMethods({
    makeTitleBar: function(titleString, width, optSuppressControls) {
        var titleBar = new lively.morphic.TitleBar(titleString, width, this);
        if (optSuppressControls) return titleBar;
  
        this.closeButton = titleBar.addNewButton("X", pt(0,-1));
        this.closeButton.addStyleClassName('close');
        this.collapseButton = titleBar.addNewButton("–", pt(0,1));
  
        connect(this.closeButton, 'fire', this, 'initiateShutdown');
        connect(this.collapseButton, 'fire', this, 'toggleCollapse');
  
        return titleBar;
    }
  });

}

function addCommands() {
  lively.Config.codeSearchGrepExclusions = [".svn",".git","node_modules","combined.js","BootstrapDebugger.js","target"]

  lively.lang.obj.extend(lively.ide.commands.byName, {

    "clojure.ide.openWorkspace": {
      description: "Clojure: Workspace",
      exec: function() {
        $world.addCodeEditor({
          title: "Clojure workspace",
          content: "(+ 3 4)",
          textMode: "clojure"
        }).getWindow().comeForward();
      }
    },

    "clojure.ide.openBrowser": {
      description: "Clojure: Browser",
      exec: function() {
        $world.loadPartItem("ClojureBrowser", "PartsBin/Clojure", function(err, browser) {
            browser.openInWorldCenter().comeForward();
            browser.targetMorph.reload();
        });
      }
    },

    "clojure.ide.openREPLLog": {
      description: "Clojure: nREPL log",
      exec: function() {
        $world.loadPartItem("nREPLLogger", "PartsBin/Clojure", function(err, logger) {
            logger.openInWorldCenter().comeForward();
            logger.targetMorph.startReading();
        });
      }
    },
    "clojure.ide.openClojarsBrowser": {
      description: "Clojure: browse Clojars",
      exec: function() {
        $world.loadPartItem("ClojarsBrowser", "PartsBin/Clojure", function(err, browser) {
            browser.openInWorldCenter().comeForward();
            browser.targetMorph.loadProjectList();
        });
      }
    },

    "clojure.ide.openClojureController": {
      description: "Clojure: ClojureController",
      exec: function() {
        $world.loadPartItem("ClojureController", "PartsBin/Clojure").getWindow().openInWorld($world.hand().getPosition()).comeForward();
      }
    },

    "clojure.ide.openProjectController": {
      description: "open project controller",
      exec: function() {
        $world.loadPartItem("ProjectController", "PartsBin/Clojure").getWindow().openInWorld($world.hand().getPosition()).comeForward();
      }
    },

    "clojure.ide.startReplServer": {
      get description() { return "Clojure: Start a repl server " + clojure.Runtime.printEnv(clojure.Runtime.currentEnv()); },
      exec: function(options, thenDo) {
        options = options || {};
        var env = options.env || clojure.Runtime.currentEnv();
        var indicatorClose;
        lively.lang.fun.composeAsync(
            function(next) { lively.require('lively.morphic.tools.LoadingIndicator').toRun(function() { next(); }) },
            function(next) { lively.require('lively.ide.tools.ShellCommandRunner').toRun(function() { next(); }) },
            function(next) { lively.require('lively.ide.codeeditor.modes.Clojure').toRun(function() { next(); }) },
            function(next) {
                lively.morphic.tools.LoadingIndicator.open("Starting server", function(close) { indicatorClose = close; next(); });
            },
            function(next) { Global.clojure.Runtime.ReplServer.ensure(
              {useLein: true, env: env}, next); },
            function(cmd, next) { lively.ide.tools.ShellCommandRunner.findOrCreateForCommand(cmd).openInWorldCenter().comeForward(); next(null, cmd); },
            function(cmd, next) {
              var status = $morph("clojureStatusLabel");
              status && status.quickUpdateFor(60);
              indicatorClose();
              next(null, cmd);
            }
        )(thenDo);
        return true;
      }
    },

    "clojure.ide.stopReplServer": {
      get description() { return "Clojure: Stop the repl server at " + clojure.Runtime.printEnv(clojure.Runtime.currentEnv()); },
      exec: function(options, thenDo) {
        options = options || {};
        var env = options.env || clojure.Runtime.currentEnv();
        var indicatorClose;
        lively.lang.fun.composeAsync(
            function(next) { lively.require('lively.ide.codeeditor.modes.Clojure').toRun(function() { next(); }) },
            function(next) { lively.require('lively.ide.tools.ShellCommandRunner').toRun(function() { next(); }) },
            function(next) {
                var cmd = Global.clojure.Runtime.ReplServer.getCurrentServerCommand();
                if (cmd) lively.ide.tools.ShellCommandRunner.findOrCreateForCommand(cmd).openInWorldCenter().comeForward();;
                next(null, cmd);
            },
            function(cmd, next) {
              Global.clojure.Runtime.ReplServer.stop(cmd, env, next);
              var status = $morph("clojureStatusLabel");
              status && status.quickUpdateFor(40);
            }
        )(thenDo);
        return true;
      }
    },

  "clojure.ide.restartReplServer": {
      get description() { return "Clojure: Restart the repl server at " + clojure.Runtime.printEnv(clojure.Runtime.currentEnv()); },
      exec: function(options, thenDo) {
        lively.lang.fun.composeAsync(
          lively.ide.commands.exec.curry("clojure.ide.stopReplServer", options),
          lively.ide.commands.exec.curry("clojure.ide.startReplServer", options)
        )(thenDo)
        return true;
      }
    },

    "clojure.ide.changeWorkingDir": {
      description: "Clojure: change clojure server working directory (cwd)",
      exec: function(dir, thenDo) {
        clojure.Runtime.changeWorkingDirectory(dir, thenDo);
        return true;
      }
    },

    "clojure.ide.clojureAddEnv": {
      description: "Clojure: add a new server environment (nrepl host and port)",
      exec: function() {
        $world.prompt("Server name and port of clojure environment?", function(input) {
          if (!input) return;
          var match = input.match(/^([^:]+):([0-9]+)$/);
          var host = match[1].trim(), port = parseInt(match[2]);
          if (!host || !port) { show("not a valid host/port combo: " + input); return; }
          var env = {host: host, port: port};
          clojure.Runtime.addEnv(env);
          clojure.Runtime.change(env)
          var status = $morph("clojureStatusLabel");
          status && status.quickUpdateFor(10);
        }, {input: "0.0.0.0:7889", historyId: "clojure.Runtime.add-environment"});
      }
    }
  });

}

function addConfigSettings() {

  lively.Config.addOption({
    "name": "pareditCorrectionsEnabled",
    "type": "Boolean",
    "doc": "Should paredit guid editing actions?",
    "get": {
        "type": "function",
        "code": "function() { val = lively.LocalStorage.get('pareditCorrectionsEnabled'); return  typeof val === 'boolean' ? val : true; }"
    },
    "set": {"type": "function", "code": "function(v) { lively.LocalStorage.set('pareditCorrectionsEnabled', v); paredit.freeEdits = !v; return v; }"}
  });

  lively.Config.set("pareditCorrectionsEnabled", lively.Config.get("pareditCorrectionsEnabled"));
  
  lively.Config.set("verboseLogging", false);
  lively.Config.set("showMenuBar", true);
  lively.Config.set("menuBarDefaultEntries", 
    ["lively.net.tools.Lively2Lively",
    "lively.morphic.tools.LivelyMenuBarEntry",
    // 'lively.morphic.tools.ActiveWindowMenuBarEntry',
    "clojure.ConnectionIndicatorMenuBarEntry",
    'lively.morphic.tools.LogMenuBarEntry',
    "lively.ide.tools.CurrentDirectoryMenuBarEntry",
    "clojure.ToolsMenuBarEntry"
    ]);
}

(function setup() {
  addConfigSettings();
  module("lively.ide.commands.default").runWhenLoaded(addCommands);
  module("lively.morphic.Widgets").runWhenLoaded(addMorphicExtensions);
  module("lively.ide.CommandLineInterface").runWhenLoaded(function() {
    lively.bindings.connect(lively.shell, 'currentDirectory', clojure.Runtime, 'changeWorkingDirectory');
  });
})();

}) // end of module
