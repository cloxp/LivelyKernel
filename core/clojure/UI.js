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
  },
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
    "clojure.ToolsMenuBarEntry",
    ]);
}

(function setup() {

  addConfigSettings();
  module("lively.ide.commands.default").runWhenLoaded(addCommands);
  module("lively.morphic.Widgets").runWhenLoaded(addMorphicExtensions);
  
})();

}) // end of module
