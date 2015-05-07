module('clojure.UI').requires('clojure.Runtime', 'lively.ide.codeeditor.ace', 'clojure.TraceFrontEnd').toRun(function() {

Object.extend(clojure.UI, {

  showText: function(spec) {
    // $world.addActionText(actionSpec, options)
    var ed = $world.addCodeEditor(spec);
    ed.getWindow().comeForward();
    return ed;
  },

  showSource: function(spec) {
    spec = lively.lang.obj.merge({
      textMode: "clojure",
      gutter: true,
      extent: pt(600,600)
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
  // command line
  lively.Config.codeSearchGrepExclusions = [".svn",".git","node_modules","combined.js","BootstrapDebugger.js","target"];

  // keys
  (function setupKeys() {
    var bnds = lively.ide.commands.defaultBindings;

    // rebind Command-B
    delete bnds["lively.ide.openSystemCodeBrowser"];
    bnds["clojure.ide.openBrowser"] = {mac: "Command-B", win: "Control-B"};
    bnds["clojurescript.ide.openBrowser"] = {mac: "Command-Shift-B", win: "Control-Shift-B"};

    // rebind Command-K
    delete bnds["lively.ide.openWorkspace"]
    bnds["clojure.ide.openWorkspace"] = {mac: "Command-K", win: "Control-K"}

    // delete bnds["lively.ide.codeSearch"]
    bnds["clojure.ide.codeSearch"] = {mac: "Command-Shift-F", win: "Control-Shift-F"}

    bnds["clojureShowLastError"] = {mac:"Command-Shift-c e r r", win:"Control-Shift-c e r r"};
  })();

  // commands
  lively.lang.obj.extend(lively.ide.commands.byName, {

    "clojure.ide.openWorkspace": {
      description: "Clojure: Workspace",
      exec: function() {
        $world.addCodeEditor({
          title: "Clojure workspace",
          content: "(+ 3 4)",
          textMode: "clojure",
          extent: pt(600,300)
        }).getWindow().comeForward();
      }
    },

    "clojurescript.ide.openWorkspace": {
      description: "ClojureScript: Workspace",
      exec: function() {
        $world.openPartItem("ClojureScriptWorkspace", "PartsBin/Clojure");
        return true;
      }
    },

    "clojure.ide.openBrowser": {
      description: "Clojure: Browser",
      exec: function(options) {
        options = options || {};
        $world.loadPartItem("ClojureBrowser", "PartsBin/Clojure", function(err, browser) {
            browser.openInWorldCenter().comeForward();
            var browser = browser.targetMorph;
            browser.reload({}, function(err) { options.thenDo && options.thenDo(err, browser); });
        });
      }
    },

    "clojurescript.ide.openBrowser": {
      description: "ClojureScript: Browser",
      exec: function(options) {
        options = options || {};
        $world.loadPartItem("ClojureScriptBrowser", "PartsBin/Clojure", function(err, browser) {
            browser.openInWorldCenter().comeForward();
            var browser = browser.targetMorph;
            browser.reload({}, function(err) { options.thenDo && options.thenDo(err, browser); });
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
        var win = browser.getWindow();
        win.openInWorld($world.positionForNewMorph(win)).comeForward();
        browser.targetMorph.fetchCapturesAndUpdate(options.id);
        return true;
      }
    },

    "clojure.ide.openProjectController": {
      description: "open project controller",
      exec: function() {
        $world.loadPartItem("ProjectManager", "PartsBin/Clojure").getWindow().openInWorld($world.hand().getPosition()).comeForward();
      }
    },

    "clojure.ide.showServerProcess": {
      description: "Clojure: show server process",
      exec: function(options, thenDo) {
        options = options || {};
        var env = options.env = options.env || clojure.Runtime.currentEnv();
        var cmd = clojure.Runtime.ReplServer.getCurrentServerCommand(options);
        if (!options.hasOwnProperty("interactive")) options.interactive = true;

        if (!cmd) {
          if (options.interactive) $world.inform("No Clojure repl server running!");
          thenDo && thenDo(new Error("No Clojure repl server running!"));
          return true;
        }

        lively.lang.fun.composeAsync(
            function(next) { lively.require('lively.ide.tools.ShellCommandRunner').toRun(function() { next(); }) },
            function(next) { lively.require('lively.ide.codeeditor.modes.Clojure').toRun(function() { next(); }) },
            function(next) {
              var runner = lively.ide.tools.ShellCommandRunner.findOrCreateForCommand(cmd);
              if (options.interactive && runner) {
                !runner.world() && runner.openInWorldCenter()
                runner.comeForward();
              }
              next(null, runner);
            }
        )(thenDo);

        return true;
      }
    },

    "clojure.ide.startReplServer": {
      get description() { return "Clojure: Start/Restart a repl server " + clojure.Runtime.printEnv(clojure.Runtime.currentEnv()); },
      exec: function(options, thenDo) {
        options = options || {};
        var env = options.env || clojure.Runtime.currentEnv(), indicatorClose, prevRunner;

        lively.lang.fun.composeAsync(
            function(next) { lively.require('lively.ide.codeeditor.modes.Clojure').toRun(function() { next(); }) },
            function(next) { lively.require('lively.ide.tools.ShellCommandRunner').toRun(function() { next(); }) },
            function(next) { lively.require('lively.morphic.tools.LoadingIndicator').toRun(function() { next(); }) },
            function(next) {
              lively.morphic.tools.LoadingIndicator.open("Starting server", function(close) { indicatorClose = close; next(); });
            },
            function(next) {
              var opts = lively.lang.obj.merge(options, {interactive: false});
              lively.ide.commands.exec("clojure.ide.showServerProcess", opts, function(err, runner) { next(null, runner); });
            },
            function(runner, next) {
              prevRunner = runner;
              lively.ide.commands.exec("clojure.ide.stopReplServer", options, function(err) { next(err); })
            },
            function(next) { setTimeout(next, 600); },
            function(next) {
              Global.clojure.Runtime.ReplServer.ensure({useLein: true, env: env}, function(err, cmd) { next(err, cmd); });
            },
            function(cmd, next) {
              var runner;
              if (prevRunner) {
                prevRunner.get("output").textString = "";
                prevRunner.attachTo(cmd);
                runner = prevRunner;
              } else {
                runner = lively.ide.tools.ShellCommandRunner.findOrCreateForCommand(cmd);
              }
              if (!runner.world()) runner.openInWorldCenter().comeForward();
              next(null, cmd);
            },
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
            function(next) {
              var opts = lively.lang.obj.merge(options, {interactive: false});
              lively.ide.commands.exec("clojure.ide.showServerProcess", opts, function(err, runner) { next(null, runner); });
            },
            function(runner, next) {
              if (options.showServerCommand && runner) {
                if (!runner.world()) runner.openInWorldCenter().comeForward();
                var cmd = runner.targetMorph.currentCommand;
                var status = $morph("clojureStatusLabel");
                status && status.quickUpdateFor(40);
                clojure.Runtime.ReplServer.stop(cmd, env, next);
              } else {
                clojure.Runtime.ReplServer.stop(null, env, next);
              }
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

    "clojureUserSearchForNamespaceInClasspath": {
      description: "Clojure: search for namespaces in classpath",
      exec: function(options, thenDo) {
        // lively.ide.commands.exec("clojureUserSearchForNamespaceInClasspath")
        options = options || {};

        var browser = options.browser,
            nsRe = options.nsRe || /clj(x)?$/,
            lastSearchTime;

        openNarrower(function(err, n) {
          if (err) show(String(err));
          thenDo && thenDo(err);
        });

        function ensureBrowser(n) {
          if (browser) return n(null);
          lively.ide.commands.exec("clojure.ide.openBrowser", {
            thenDo: function(err, b) {
              if (err) return n(err);
              browser = b; n()
            }
          });
        }

        function openNarrower(n) {
          var narrower = lively.ide.tools.SelectionNarrowing.getNarrower({
            name: 'cloxp.narrowAllNamespaces.clojure.NarrowingList',
            // reactivateWithoutInit: true,
            spec: {
              prompt: 'search for namespace: ',
              candidatesUpdaterMinLength: 3,
              candidates: [],
              maxItems: 25,
              candidatesUpdater: searchForNamespace,
              keepInputOnReactivate: true,
              actions: [select]
            },
          });

          n(null, narrower);
        }

        function searchForNamespace(term, n) {
          lastSearchTime = Date.now();
          n(['searching for ' + term + "..."]);
          var terms = term.split(" "),
              realTerm = terms[0];
          lively.lang.fun.debounceNamed("clojure.namespace-search", 200, function(t) {
            if (t < lastSearchTime) return;
            var code = lively.lang.string.format(
             '(rksm.cloxp-projects.core/search-for-namespaces-in-local-repo->json #"%s" {:newest true})', realTerm);
            var opts = {
              passError: true, resultIsJSON: true,
              requiredNamespaces: ["rksm.cloxp-projects.core"]
            };
            Global.clojure.Runtime.doEval(code, opts, function(err, result) {
              try {
                var list = !err && namespacelist(terms, result);
              } catch (e) { err = e; }
              n(err ? [String(err)] : (result.length ? list : ["nothing"]))
            });
          })(lastSearchTime);
        }

        function namespacelist(terms, projects) {
          return namespaceMatches(terms, projects)
            .uniqBy(function(a,b) {
              return a.namespace === b.namespace
                  && a.name      === b.name
                  && a.version   === b.version; })
            .map(function(ea) {
              return {
                isListItem: true, value: ea,
                string: lively.lang.string.format("%s [%s %s]%s",
                  ea.namespace, ea.name, ea.version,
                  ea.description && ea.description.trim() ?
                    " -- " + ea.description.trim().replace(/\n/g, "").truncate(100) : "")
              }
            });
        }

        function namespaceMatches(terms, projects) {
          return lively.lang.arr.flatmap(projects, function(project) {
            return lively.lang.arr.flatmap(Object.keys(project.versions).sort().reverse(), function(v) {
              var proto = {
                name: (project["group-id"] ? (project["group-id"] + "/") : "") + project["artifact-id"],
                description: project.description,
                version: v, namespace: null, namespaceFile: null
              };
              return project.versions[v].namespaces
                .filter(function(ns) { return (ns.file || "").match(nsRe) && terms.every(function(term) { return (ns.ns || ns).match(term); }); })
                .map(function(ns) { var o = lively.lang.obj.clone(proto); o.namespace = (ns.ns || ns); o.namespaceFile = ns.file; return o; })
            });
          })
        }

        function select(c, n) {

          lively.lang.fun.composeAsync(
            ensureBrowser,
            function(n) {
              n(!c || !c.namespace ? n(new Error("Nothing to select")) : null, c);
            },
            function(c, n) {
              // return n(null, c.namespace);

              var code = lively.lang.string.format(
                "(if-not (find-ns '%s) (rksm.cloxp-projects.core/install ['%s %s]))",
                c.namespace, c.name, c.version ? '"'+c.version+'"' : "");
              var opts = {
                passError: true, resultIsJSON: false,
                requiredNamespaces: ["rksm.cloxp-projects.core"]
              };
              Global.clojure.Runtime.doEval(code, opts, function(err, result) {
                n(null, c.namespace, c.namespaceFile); });
            },
            function(ns, nsFile, n) {
              Global.clojure.Runtime.requireNamespaces(
                [{ns: ns, file: nsFile}], function(err) { n(err, ns); });
            },
            function(namespace, n) {
              browser.reload({namespaces: [namespace]},
                function(err) { n(err, namespace); }); },
            function(ns, n) { browser.saveScheduleSelection(ns, null); }
          )(function(err) {
            if (err) browser.showClojureError(null, "Load error", {warnings: String(err), offerInsertAndOpen: true});
          });

        }

        return true;
      }
    },

    "clojureUserSearchForNamespaceOrVarInRuntime": {
      description: "Clojure: search for namespaces and vars in runtime",
      exec: function(options, thenDo) {
        // lively.ide.commands.exec("clojureUserSearchForNamespaceInClasspath")
        options = options || {};

        var browser = options.browser;

        lively.lang.fun.composeAsync(
            ensureBrowser,
            prepareCandidates,
            openNarrower
        )(thenDo || function() {});

        function ensureBrowser(n) {
          if (browser) return n(null);
          lively.ide.commands.exec("clojure.ide.openBrowser", {
            thenDo: function(err, b) {
              if (err) return n(err);
              browser = b; n()
            }
          });
        }

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

        function prepareCandidates(next) {
          // this.namespaceData["cheshire.factory"].interns[3].arglists
            var candidates = Object.values(browser.namespaceData).reduce(function(candidates, ns) {
                var name = (ns.name && ns.name.ns) || ns.name;
                return candidates
                  .concat([{isListItem: true, string: name, value: ns}])
                  .concat((ns.interns||[]).map(function(intern) {
                    return {
                        isListItem: true,
                        string: Strings.format("%s/%s %s %s",
                            intern.ns, intern.name,
                            intern.arglists ? intern.arglists
                              .map(printArgList).join(', ') : "",
                            intern.tag ? "(" + intern.tag + ")" : ""),
                        value: intern
                    }
                }));
            }, []);
            next(null, candidates);
        }

        function printArgList(argList) {
          return "[" + argList.map(function(arg) {
           return typeof arg === "object" ?
            JSON.stringify(arg).replace(/"/g, "").replace(/,/g, " ") :
               String(arg);
          }).join(" ") + "]";
        }

        function openNarrower(candidates, next) {
          lively.ide.tools.SelectionNarrowing.getNarrower({
              name: "clojure.namespace.Browser",
              spec: {
                candidates: candidates,
                actions: [
                  function select(c) {
                    if (c.interns || !c.ns) { browser.saveScheduleSelection(c.name); }
                    else browser.saveScheduleSelection(c.ns.trim(), c.name.trim());
                    if (c.private && !browser.get("privateCheckBox").checked)
                      (function() {
                        browser.get("CodeEditor").setStatusMessage(c.name + " is private. Enable private access to see the def.");
                      }).delay(.1);
                  }]
              },
              reactivateWithoutInit: false,
              keepInputOnReactivate: true,
          });
          next();
        }

        return true;
      }
    },

    "clojure.ide.codeSearch": {
      description: "code search",
      exec: function (opts) {
        opts = opts || {};
        if (!opts.hasOwnProperty("showTitle")) opts.showTitle = true;

        var win = $world.getActiveWindow();
        var browser = opts.browser || (win && win.targetMorph && String(win.targetMorph.name).match(/^Clojure.*Browser$/)) ?
          (opts.browser || win.targetMorph) : null;

        var choices = [
          ["clojure code search", function() { lively.ide.commands.exec("clojureCodeSearch", {browser: browser}); }],
          ["search for clojure symbols", function() { lively.ide.commands.exec("clojureUserSearchForNamespaceOrVarInRuntime", {browser: browser}); }],
          ["search for clojure namespaces", function() { lively.ide.commands.exec("clojureUserSearchForNamespaceInClasspath", {browser: browser}); }],
          ["JavaScript code search", function() { lively.ide.commands.exec("lively.ide.codeSearch"); }]
        ];

        var M = lively.morphic.Menu;
        var open = opts.position ? M.openAt.bind(M, opts.position) : M.openAtHand.bind(M);
        var m = open(opts.showTitle ? "search..." : null, choices);
        return m;
      }
    },

    "clojureCodeSearch": {
      description: "Clojure: search for code in loaded namespaces",
      exec: function(options, thenDo) {

        options = options || {};
        var env = options.env || {};

        // var namespaceMatcher = options.namespaceMatcher || "rksm.system-navigator.search";
        var narrower,
            searchRunning = false,
            m = $world.topMorph(),
            lastSearchTerm, lastCandidates,
            browser = m && m.targetMorph
                   && m.targetMorph.name === "ClojureBrowser"
                   && m.targetMorph;

        lively.lang.fun.composeAsync(
          promptForNsMatch,
          function(nsMatch, n) { n(null, nsMatch, startSearch.curry(nsMatch)); },
          openNarrower
        )(function(err) { if (err) show(err); thenDo && thenDo(err); });

        function promptForNsMatch(n) {
          var id = "clojure.ide.codeSearch.matchingRe";
          var hist = lively.ide.tools.CommandLine.getHistory(id);
          $world.prompt("Do search in namespaces matching (clojure regexp):", function(input) {
            show(input);
            if (typeof input !== "string") n(new Error("Search canceled"));
            else n(null, input);
          }, {input:hist.items.last() || "", historyId: id});
        }

        function startSearch(namespaceMatcher, input, callback) {
          if (searchRunning) {
            clojure.Runtime.evalInterrupt(env, function() {
              searchRunning = false;
              startSearch(namespaceMatcher, input, callback);
            });
            return;
          }

          searchRunning = true;
          var parts = input.split(" ").invoke("trim");

          if (lastSearchTerm === parts[0] && lastCandidates) {
            callback(filterUsingSearchTerms(lastCandidates, parts.slice(1)));
            return;
          }

          lastSearchTerm = parts[0];

          callback(['searching...']);
          clojure.Runtime.doCodeSearch(lastSearchTerm,
            {namespaceMatcher: namespaceMatcher},
            function(err, results) {
              searchRunning = false;
              if (err) return callback(["error: " + err]);
              var candidates = results.reduce(function(all, nsResult) {
                return all.concat(nsResult.finds.map(function(find) {
                  find.ns = nsResult.ns;
                  return {isListItem: true, string: printFind(find), value: find};
                }));
              }, []);

              if (candidates.length === 0) candidates = ['nothing found'];
              lastCandidates = candidates;
              callback(filterUsingSearchTerms(candidates, parts.slice(1)));
            });
        }

        function filterUsingSearchTerms(candidates, searchTerms) {
          return candidates.filter(function(c) {
            return searchTerms.every(function(t) { return c.string.include(t); })
          });
        }

        function openNarrower(nsMatch, startSearchFunc, n) {
          var searchProc = Functions.debounce(600, startSearchFunc);
          var narrower = lively.ide.tools.SelectionNarrowing.getNarrower({
              name: 'clojure.ide.doCodeSearch.NarrowingList.' + nsMatch,
              reactivateWithoutInit: true,
              spec: {
                  prompt: 'search for: ',
                  candidatesUpdaterMinLength: 3,
                  candidates: [],
                  maxItems: 25,
                  candidatesUpdater: candidateBuilder.curry(searchProc),
                  keepInputOnReactivate: true,
                  actions: [{name: 'open', exec: showFind}]
              }
          });
          setTimeout(function() { narrower.get("inputLine").focus(); }, 0);
        }

        function printFind(find) {
          return lively.lang.string.format(
            "%s:%s %s", find.ns, find.line-1, find.source);
        }

        function candidateBuilder(searchProc, input, callback) {
          searchProc(input, callback);
        };

        function showFind(find, thenDo) {
          if (!find) thenDo(new Error("Nothing found"));
          else if (!browser) showFindInNewEditor(find, thenDo);
          else showFindInBrowser(find, thenDo);
        }

        function showFindInBrowser(find, thenDo) {
          browser.getWindow().comeForward();
          browser.saveScheduleSelection(find.ns, null, false, function(err) {
            scrollToFind(browser.get("CodeEditor"), find);
          });
        }

        function showFindInNewEditor(find, thenDo) {
          var editor;
          var editor = Global.clojure.UI.showSource({title: find.ns + " " + find.match});
          lively.lang.fun.composeAsync(
            clojure.Runtime.retrieveSourceForNs.bind(clojure.Runtime, find.ns, {env: env}),
            function(source, n) {
              editor.textString = source;
              scrollToFind(editor, find);
              n();
            }
          )(function(err) {
            err && editor.setStatusMessage(String(err));
            thenDo && thenDo(err);
          });
        }

        function scrollToFind(editor, find) {
          editor.withAceDo(function(ed) {
            ed.gotoLine(find.line-1, 1, false);
            ed.centerSelection();
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
          requiredNamespaces: ["rksm.cloxp-trace.capturing", "clojure.data.json"]};

        var code = lively.lang.string.format(
          "(let [spec (rksm.cloxp-trace.capturing/install-capture!\n"
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
        //     var pre = lively.lang.string.format('(@rksm.cloxp-trace.capturing/storage "%s")\n', options.id);
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
        var code = "(rksm.cloxp-trace.capturing/reset-captures!)";
        var opts = {
          env: clojure.Runtime.currentEnv(codeEditor), passError: true,
          requiredNamespaces: ["rksm.cloxp-trace.capturing"]};
        clojure.Runtime.doEval(code, opts, function(err) {
          if (err) codeEditor.setStatusMessage("error reseting captures:\n"+ err.truncate(1000));
          else codeEditor.setStatusMessage("capture rest");
          clojure.TraceFrontEnd.ensureUpdateProc();
        });

        return true;
      }
    },

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // tracing
    // -=-=-=-=-
    "clojureTraceCode": {
      description: "Clojure: Trace code",
      exec: function(options) {
        options = options || {};
        if (!options.code) return options.thenDo && options.thenDo(new Error("No code specified"));

        clojure.Runtime.traceCode(
          options.code, options.traceTargets || [], options,
          function(err, traced) {

            if (err) {
              show(err);
              if (options.thenDo) options.thenDo(err);
              return;
            }

            $world.loadPartItem("ClojureTraceViewer", "PartsBin/Clojure", function(err, viewer) {
                viewer.openInWorldCenter().comeForward();
                viewer.openInWorld($world.positionForNewMorph(viewer)).getWindow().comeForward();
                viewer.openOn(options.code, traced);
                if (options.thenDo) options.thenDo(null, viewer);
            });
          });
      },
    },

    "clojureShowLastError": {
      description: "Clojure: Show last error",
      exec: function(options) {
        clojure.Runtime.fullLastErrorStackTrace(
          {open: true, nframes: 999}, function(err) {});
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

;(function setupDialogs() {

  function test() {
    new clojure.CreateNamespaceDialog("foooo?", function(input) {
      show(input)
    }, {input: "test", historyId: "bar"}).open();
  }

  // test();

  module("lively.morphic.Widgets").runWhenLoaded(function() {

    lively.morphic.PromptDialog.subclass('clojure.CreateNamespaceDialog',
    'initializing', {

      initialize: function($super, label, callback, defaultInputOrOptions) {
        // additional options: fileTypes + defaultFileType
        $super(label, callback, defaultInputOrOptions);
        this.options.fileTypes = this.options.hasOwnProperty("fileTypes")
          ? this.options.fileTypes : ["clj", "cljx"];
      },

      buildFileTypeInput: function(bounds) {
        var self = this;
        var labelBounds = bounds.withWidth(bounds.width/2);
        var dlBounds = labelBounds.withX(labelBounds.left() + labelBounds.width);

        this.panel.addMorph(lively.morphic.Text.makeLabel("file type:", {
          align: "right",
          position: labelBounds.topLeft(), extent: labelBounds.extent()
        }));
        var dl = new lively.morphic.DropDownList(dlBounds, this.options.fileTypes);
        dl.setName("fileTypeDropDownList");
        this.panel.addMorph(dl);
        dl.selection = this.options.defautFileType || this.options.fileTypes[0];
        return dl;
      },

      buildView: function($super, extent) {
        var panel = $super(extent);
        this.buildFileTypeInput(lively.rect(5,this.okButton.bounds().top(), 110, 20));
        return panel;
      }
    },
    "callbacks", {
      triggerCallback: function($super, result) {
        // result is input text
        var dl = this.panel.get("fileTypeDropDownList");
        return $super({text: result, fileType: dl ? dl.selection : null});
      }
    });
  });

})();

}) // end of module
