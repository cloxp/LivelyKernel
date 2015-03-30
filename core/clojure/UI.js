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

    "clojurescript.ide.openBrowser": {
      description: "ClojureScript: Browser",
      exec: function() {
        $world.loadPartItem("ClojureScriptBrowser", "PartsBin/Clojure", function(err, browser) {
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

    "clojure.ide.openClojureCaptures": {
      description: "open capture browser",
      exec: function(options) {
        options = options || {};
        var browser = $world.loadPartItem("CaptureBrowser", "PartsBin/Clojure")
        browser.getWindow().openInWorld($world.hand().getPosition()).comeForward();
        browser.targetMorph.fetchCapturesAndUpdate(options.id);
        return true;
      }
    },

    "clojure.ide.openProjectController": {
      description: "open project controller",
      exec: function() {
        $world.loadPartItem("ProjectController", "PartsBin/Clojure").getWindow().openInWorld($world.hand().getPosition()).comeForward();
      }
    },

    "clojure.ide.startReplServer": {
      get description() { return "Clojure: Start/Restart a repl server " + clojure.Runtime.printEnv(clojure.Runtime.currentEnv()); },
      exec: function(options, thenDo) {
        options = options || {};
        var env = options.env || clojure.Runtime.currentEnv();
        var indicatorClose;
        lively.lang.fun.composeAsync(
            lively.ide.commands.exec.curry("clojure.ide.stopReplServer", options),
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
    },


    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // definition / browsing
    // -=-=-=-=-=-=-=-=-=-=-=-

    "clojureFindDefinition": {
      description: "Clojure: capture selection",
      exec: function(options) {
        options = options || {};

        var forceNewWin = !!options.openInNewWindow;
        var codeEditor = options.codeEditor;

        // 1. get static information for the node at point
        if (codeEditor) {
          var ed = codeEditor.aceEditor;

          if (!forceNewWin && codeEditor.clojureFindDefinition) {
            codeEditor.clojureFindDefinition();
            return true;
          }

          var query = clojure.StaticAnalyzer.createDefinitionQuery(
            ed.session.$ast || ed.getValue(),ed.getCursorIndex(),
            codeEditor.clojureGetNs ? codeEditor.clojureGetNs() : null);
          if (!query) {
            codeEditor.setStatusMessage("Cannot extract code entity.");
            return;
          }

          if (query.source.match(/^:/)) { codeEditor.setStatusMessage("It's a keyword, no definition for it."); return; }
          var opts = {
            env: clojure.Runtime.currentEnv(codeEditor),
            ns: query.nsName,
            name: query.source
          }
        } else {
          var opts = {
            env: options.env || clojure.Runtime.currentEnv(),
            ns: options.ns || "user",
            name: options.name
          }
        }

        // 2. get the associated intern data and source of the ns the i is defined in
        clojure.Runtime.retrieveDefinition(opts.name, opts.ns, opts, function(err, data) {
          if (err) {
            var msg = "Error retrieving definition for " + opts.name + "\n" + err;
            if (codeEditor) codeEditor.setStatusMessage(msg);
            if (options.thenDo) options.thenDo(err);
            return;
          }

          try {
            if (!codeEditor || data.intern.ns !== opts.ns
             || !data.defRange || !scrollToAndSelect(codeEditor, data.defRange, data.intern.name)) {
              var editor = clojure.UI.showSource({
                title: data.intern.ns + "/" + data.intern.name,
                content: data.nsSource
              });
              if (data.defRange) scrollToAndSelect(editor, data.defRange, data.intern.name);
            }
          } catch (e) {
            if (codeEditor) codeEditor.setStatusMessage(
              "Error preparing definition for " + opts.name + "n" + e);
            if (options.thenDo) options.thenDo(err);
            return;
          }

          if (options.thenDo) options.thenDo();

          // show(data.nsSource.slice(data.defRange[0],data.defRange[1]))
          // debugger;
          // show(err?String(err):data)
        });

        function scrollToAndSelect(editMorph, defRange, name) {
          return editMorph.withAceDo(function(ed) {
            var range = {start: ed.idxToPos(defRange[0]), end: ed.idxToPos(defRange[1])};
            var found = ed.$morph.saveExcursion(function(reset) {
              ed.selection.setRange(range, true);
              if (!name) return true;
              // test if it looks like we found definition
              var found = !!ed.session.getTextRange(range).match(new RegExp("def[^/]+"+name, "m"));
              if (!found) reset();
              return found;
            });
            if (found) setTimeout(function() { ed.centerSelection(); }, 100);
            return found;
          });

        }
      }
    },

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // capture
    // -=-=-=-=-

    "clojureCaptureSelection": {
      description: "Clojure: capture selection",
      exec: function(options) {
        if (!options || !options.codeEditor)
          throw new Error("clojureCaptureSelection needs codeEditor option!");

        var codeEditor = options.codeEditor;
        var ed = codeEditor.aceEditor;
        var src = ed.getValue();
        var ast = ed.session.$ast;

        var defNode = paredit.walk.sexpsAt(ast, ed.getCursorIndex(), function(n) {
          return n.type !== "toplevel" && paredit.walk.hasChildren(n); })[0];

        var name = defNode && paredit.defName(defNode);
        if (!name) {
          codeEditor.setStatusMessage("Cannot install capture: no def node found at cursor position");
          return true;
        }

        var pos = ed.getCursorPosition();
        var startPos = ed.idxToPos(defNode.start)
        var localPosClj = {column: pos.column+1, line: pos.row+1-startPos.row}
        var ns = clojure.Runtime.detectNs(codeEditor) || "user";
        var opts = {
          env: clojure.Runtime.currentEnv(codeEditor),
          ns: ns,
          passError: true, resultIsJSON: true,
          bindings: ["rksm.cloxp-repl/*repl-source*", paredit.walk.source(src, defNode)],
          requiredNamespaces: ["rksm.cloxp-trace", "clojure.data.json"]};

        var code = lively.lang.string.format(
          "(let [spec (rksm.cloxp-trace/install-capture!\n"
          + "            rksm.cloxp-repl/*repl-source*\n"
          + "            :ns (find-ns '%s)\n"
          + "            :name \"%s\"\n"
          + "            :pos {:column %s, :line %s})\n"
          + "      spec (-> spec\n"
          + "             (update-in [:ns] str)\n"
          + "             (select-keys [:ns :name :id :ast-idx :pos :loc]))]\n"
          + "  (clojure.data.json/write-str spec))\n",
              ns, name, localPosClj.column, localPosClj.line);

        clojure.TraceFrontEnd.ensureUpdateProc();
        clojure.Runtime.doEval(code, opts, function(err, result) {

          if (err) codeEditor.setStatusMessage("error installing tracer:\n"+ String(err).truncate(1000), Color.red);
          else codeEditor.setStatusMessage("installed tracer into "+ result.ns + "/" + result.name);

          var pos = result.pos;
          if (pos) {
            var defNode = paredit.walk.sexpsAt(ed.session.$ast, ed.getCursorIndex())[1],
                nodePos = ed.idxToPos(defNode.start),
                range = clojure.TraceFrontEnd.SourceMapper.mapClojurePosToAceRange(pos);
            range.moveBy(nodePos.row, 0);

            var m = ace.ext.lang.codemarker.ensureIn(ed.session, "clojure-highlight"),
                // mark = {start: ed.posToIdx(range.start), end: ed.posToIdx(range.end), cssClassName: "clojure-highlight"};
                mark = {startPos: range.start, endPos: range.end, cssClassName: "clojure-highlight"};
            m.markerRanges.push(mark);
            m.redraw(ed.session);

            (function() {
              m.markerRanges.remove(mark);
              m.redraw(ed.session);
            }).delay(.8);
          }
        });

        return true;
      }
    },

    "clojureCaptureShowAll": {
      description: "Clojure: show all captures",
      exec: function() {
        // var ed = clojure.TraceFrontEnd.createCaptureOverview();
        // ed.getWindow().comeForward();
        lively.ide.commands.exec("clojure.ide.openClojureCaptures", {});
        return true;
      }
    },

    "clojureCaptureInspectOne": {
      description: "Clojure: inspect capture",
      exec: function(options) {
        options = options || {};

        lively.ide.commands.exec("clojure.ide.openClojureCaptures", options.id ? {id: options.id} : {});
        return true;

        // lively.lang.fun.composeAsync(
        //   options.id ? function(n) { n(null, options.id, options.all); } : chooseCapture,
        //   function(id, all, n) { fetchAndShow({id: id, all: !!all}, n); }
        // )(function(err, result) { })

        // function fetchAndShow(options, thenDo) {
        //   clojure.TraceFrontEnd.inspectCapturesValuesWithId(options, function(err, result) {
        //     var pre = lively.lang.string.format('(@rksm.cloxp-trace/storage "%s")\n', options.id);
        //     $world.addCodeEditor({
        //       title: "values captured for " + options.id,
        //       content: pre + (err || result),
        //       textMode: "clojure",
        //       extent: pt(600, 500)
        //     }).getWindow().comeForward();
        //     thenDo && thenDo(err);
        //   });

        // }

        // function chooseCapture(n) {
        //   clojure.TraceFrontEnd.retrieveCaptures({}, function(err, captures) {
        //     if (err) return n(err);
        //     var candidates = captures.map(function(ea) {
        //       return {string: ea.id, value: ea, isListItem: true}; });
        //     lively.ide.tools.SelectionNarrowing.chooseOne(candidates,
        //       function(err, c) { n(err, c && c.id, true); });
        //   })
        // }

        // return true;
      }
    },

    "clojureCaptureReset": {
      description: "Clojure: reset all captures",
      exec: function(options) {
        if (!options || !options.codeEditor)
          throw new Error("clojureCaptureSelection needs codeEditor option!");

        var codeEditor = options.codeEditor;
        var ed = codeEditor.aceEditor;
        var code = "(rksm.cloxp-trace/reset-captures!)";
        var opts = {
          env: clojure.Runtime.currentEnv(codeEditor), passError: true,
          requiredNamespaces: ["rksm.cloxp-trace"]};
        clojure.Runtime.doEval(code, opts, function(err) {
          if (err) codeEditor.setStatusMessage("error reseting captures:\n"+ err.truncate(1000));
          else codeEditor.setStatusMessage("capture rest");
          clojure.TraceFrontEnd.ensureUpdateProc();
        });

        return true;
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
