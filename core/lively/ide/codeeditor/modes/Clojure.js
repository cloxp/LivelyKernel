module('lively.ide.codeeditor.modes.Clojure').requires('lively.ide.codeeditor.ace', 'clojure.Runtime', 'clojure.UI').toRun(function() {

Object.extend(lively.ide.codeeditor.modes.Clojure, {
  updateRuntime: function() {
    lively.whenLoaded(function(w) {
      var cljEds = lively.ide.allCodeEditors()
        .filter(function(ea) { return ea.getTextMode() === 'clojure'; });
      // cljEds.length
      (function() {
        cljEds.forEach(function(editor) {
          editor.withAceDo(function(ed) {
            ed.setValue(ed.getValue()); // trigger doc change + paredit reparse
            ed.commands.addCommands(lively.ide.codeeditor.modes.Clojure.Commands);
          });
        });
      }).delay(.5);
      $world.alertOK("updated clojure editors");
    })
  }
});

lively.ide.codeeditor.modes.Clojure.Commands = {

  clojurePrintDoc: {
    exec: function(ed) {
      var string = clojure.StaticAnalyzer.sourceForNodeAtCursor(ed),
          runtime = clojure.Runtime,
          env = runtime.currentEnv(ed.$morph),
          ns = clojure.Runtime.detectNs(ed.$morph);
      clojure.Runtime.fetchDoc(env, ns, string, function(err, docString) {
        // ed.$morph.printObject(ed, err ? err : docString);
        if (err) return ed.$morph.setStatusMessage(String(err), Color.red);

        docString = docString.replace(/"?nil"?/,"").replace(/[-]+\n/m,"").trim()
        if (!docString.trim().length) ed.$morph.setStatusMessage("no doc found");
        else clojure.UI.showText({
          title: "clojure doc",
          content: err ? String(err).truncate(300) : docString,
          extent: pt(560,250),
          textMode: "text"
        });
      });
    },
    multiSelectAction: 'forEach'
  },

  clojureFindDefinition: {
    exec: function(ed) {
      if (ed.$morph.clojureFindDefinition)
        return ed.$morph.clojureFindDefinition();

      var query = clojure.StaticAnalyzer.createDefinitionQuery(
        ed.session.$ast||ed.getValue(),ed.getCursorIndex());
      if (!query) {
        ed.$morph.setStatusMessage("Cannot extract code entity.");
        return;
      }

      if (query.source.match(/^:/)) { ed.$morph.setStatusMessage("It's a keyword, no definition for it."); return; }
      var opts = {
        env: clojure.Runtime.currentEnv(ed.$morph),
        ns: query.nsName
      }

      // 1. get static information for the node at point

      // 2. get the associated intern data and source of the ns the i is defined in
      clojure.Runtime.retrieveDefinition(query.source, query.nsName, opts, function(err, data) {
        if (err) return ed.$morph.setStatusMessage(
          "Error retrieving definition for " + query.source + "n" + err);

        try {
          if (data.intern.ns !== query.nsName) {
            var editor = clojure.UI.showSource({
              title: data.intern.ns + "/" + data.intern.name,
              content: data.nsSource
            });
            if (data.defRange) scrollToAndSelect(editor, data.defRange);
          } else {
            if (data.defRange) scrollToAndSelect(ed.$morph, data.defRange);
          }

          } catch (e) {
            return ed.$morph.setStatusMessage(
              "Error preparing definition for " + query.source + "n" + err);
          }
        // show(data.nsSource.slice(data.defRange[0],data.defRange[1]))
        // debugger;
        // show(err?String(err):data)
      });

      function scrollToAndSelect(editMorph, defRange) {
        editMorph.withAceDo(function(ed) {
          ed.selection.setRange({
            start: ed.idxToPos(defRange[0]),
            end: ed.idxToPos(defRange[1])}, true);
          setTimeout(function() { ed.centerSelection(); }, 100);
        });

      }
    },
    multiSelectAction: 'forEach'
  },

  clojureEvalInterrupt: {
    exec: function(ed) {
      ed.$morph.setStatusMessage("Interrupting eval...");
      var env = clojure.Runtime.currentEnv(ed.$morph);
      clojure.Runtime.evalInterrupt(env, function(err, answer) {
        console.log("Clojure eval interrupt: ", Objects.inspect(err || answer));
        // ed.$morph.setStatusMessage(Objects.inspect(err || answer), err ? Color.red : null);
      });
    },
    multiSelectAction: 'forEach'
  },

  clojureChangeEnv: {
    exec: function(ed) {
      var runtime = clojure.Runtime;
      var env = runtime.currentEnv(ed.$morph);
      $world.prompt("Change clojure runtime environment:", function(input) {
        var env = runtime.readEnv(input);
        if (!env) show("not a valid host/port combo: " + input);
        else runtime.changeInEditor(ed.$morph, env);
      }, {input: runtime.printEnv(env)})
    },
    multiSelectAction: 'forEach'
  },

  clojureLoadFile: {
    exec: function(ed) {
      var runtime = clojure.Runtime;
      var env = runtime.currentEnv(ed.$morph);
      var fn = ed.$morph.getTargetFilePath && ed.$morph.getTargetFilePath();
      if (!fn) {
        // return;
        var win = ed.$morph.getWindow();
        if (win) fn = win.getTitle().replace(/\s/g, "_");
        else fn = "clojure-workspace";
        fn += "-" + lively.lang.date.format(new Date, "yy-mm-dd_HH-MM-ss");
      }

      doLoad(fn, ed.$morph.textString);

      function doLoad(filePath, content) {
        clojure.Runtime.loadFile(content, filePath, {env: env}, function(err, answer) {
          var msg = err ?
          "Error loading file " + filePath + ":\n" + err : filePath + " loaded";
          setTimeout(function() {
            ed.$morph.setStatusMessage(msg, err ? Color.red : Color.green, err ? 8 : 3)
          }, 1000);
        });
      }
    },
    multiSelectAction: 'forEach'
  },

  clojureToggleAutoLoadSavedFiles: {
    exec: function(ed) {
      var runtime = clojure.Runtime,
        env = runtime.currentEnv(ed.$morph);
      runtime.changeInEditor(ed.$morph, {doAutoLoadSavedFiles: !env.doAutoLoadSavedFiles});
      $world.alertOK("Auto load clj files " + (env.doAutoLoadSavedFiles ? "enabled" : "disabled"));
    },
    multiSelectAction: 'forEach'
  },

  clojureResetLocalState: {
    exec: function(ed) {
      var runtime = clojure.Runtime;
      runtime.resetEditorState(ed.$morph);
    },
    multiSelectAction: 'forEach'
  },

  clojureEvalSelectionOrLine: {
    exec: function(ed, args) {
      ed.session.getMode().evalAndPrint(ed.$morph, false, false, null, function(err, result) {
        ed.$morph.setStatusMessage((err ? String(err) : result).truncate(300), err ? Color.red : null);
      })
    },
    multiSelectAction: 'forEach'
  },

  clojureEvalLastSexp: {
    exec: function(ed, args) {
      var lastSexp = ed.session.$ast && paredit.walk.prevSexp(ed.session.$ast,ed.getCursorIndex());
      lastSexp && ed.execCommand("clojureEval", {from: lastSexp.start, to: lastSexp.end})
    },
    multiSelectAction: 'forEach'
  },

  clojureEvalPrintLastSexp: {
    exec: function(ed, args) {
      var lastSexp = ed.session.$ast && paredit.walk.prevSexp(ed.session.$ast,ed.getCursorIndex());
      lastSexp && ed.execCommand("clojureEval", {print: true, from: lastSexp.start, to: lastSexp.end})
    },
    multiSelectAction: 'forEach'
  },

  clojureEvalNsForm: {
    exec: function(ed, args) {
      show("clojureEvalNsForm no yet implemented")
    },
    multiSelectAction: 'forEach'
  },

  clojureEvalBuffer: {
    exec: function(ed, args) {
      show("clojureEvalBuffer no yet implemented")
    },
    multiSelectAction: 'forEach'
  },

  clojureEvalDefun: {
    exec: function(ed, args) {
      var defun = ed.session.$ast && paredit.navigator.rangeForDefun(ed.session.$ast,ed.getCursorIndex());
      defun && ed.execCommand("clojureEval", {from: defun[0], to: defun[1]})
    },
    multiSelectAction: 'forEach'
  },

  clojureEvalLastSexpAndReplace: {
    exec: function(ed, args) {
      var lastSexp = ed.session.$ast && paredit.walk.prevSexp(ed.session.$ast,ed.getCursorIndex());
      lastSexp && ed.execCommand("clojureEval", {
        print: false, from: lastSexp.start, to: lastSexp.end,
        thenDo: function(err, result) {
          ed.session.replace({
            start: ed.idxToPos(lastSexp.start),
            end: ed.idxToPos(lastSexp.end)}, err ? String(err) : result)
        }
      })
    },
    multiSelectAction: 'forEach'
  },

  clojureEval: {
    exec: function(ed, args) {
      // var ed = that.aceEditor
      args = args || {};
      if (typeof args.from !== 'number' || typeof args.to !== 'number') {
        console.warn("clojureEval needs from/to args");
        show("clojureEval needs from/to args")
        return;
      }

      ed.saveExcursion(function(reset) {
        ed.selection.setRange({
          start: ed.idxToPos(args.from),
          end: ed.idxToPos(args.to)});
        ed.session.getMode().doEval(ed.$morph, !!args.print, function(err, result) {
          ed.$morph.setStatusMessage((err ? String(err) : result||"").truncate(300), err ? Color.red : null);
          args.thenDo && args.thenDo(err,result);
        });
      });
    },
    multiSelectAction: 'forEach'
  },

  pareditExpandSnippetOrIndent: {
    exec: function(ed, args) {
      var success = ed.$morph.getSnippets()
        .getSnippetManager().expandWithTab(ed);
      if (!success)
        ed.session.getMode().getCodeNavigator().indent(ed,args);
    },
    multiSelectAction: 'forEach'
  }

};

lively.ide.codeeditor.modes.Clojure.Mode = lively.ide.ace.require('ace/mode/clojure').Mode;

lively.ide.codeeditor.modes.Clojure.Mode.addMethods({

    helper: {
      clojureThingAtPoint: function(aceEd) {
        var pos = aceEd.getCursorPosition(),
            sess = aceEd.session,
            peekLeft = aceEd.find(/ |\(/g, {preventScroll: true, backwards: true}),
            peekRight = aceEd.find(/ |\(/g, {preventScroll: true, backwards: false}),
            start = !peekLeft || peekLeft.end.row !== pos.row ?
              {row: pos.row, column: 0} :
              lively.lang.obj.clone(peekLeft.end),
            end = !peekRight || peekRight.end.row !== pos.row ?
              {row: pos.row, column: sess.getLine(pos.row).length} :
              lively.lang.obj.clone(peekRight.start);
        return sess.getTextRange({start: start, end: end});
      },

      identfierBeforeCursor: function(codeEditor) {
        var pos = codeEditor.getCursorPositionAce()
        var termStart = ["(", " ", "'", ","].map(function(ea) {
            return codeEditor.find({preventScroll: true, backwards: true, needle: ea}); })
          .filter(function(ea) { return !!ea && ea.end.row === pos.row; })
          .max(function(ea) { return ea.end.column; });

        if (termStart) termStart = termStart.end;
        else termStart = {row: pos.row, column: 0};

        return codeEditor.getTextRange({start: termStart, end: pos}).trim();
      }
    },

    morphMenuItems: function(items, editor) {
      var platform = editor.aceEditor.getKeyboardHandler().platform;
      var isMac = platform == 'mac';
      return [
        ['evaluate selection or line (Cmd-d)',         function() { editor.aceEditor.execCommand("clojureEvalSelectionOrLine"); }],
        ['help for thing at point (Alt-?)',            function() { editor.aceEditor.execCommand("clojurePrintDoc"); }],
        ['find definition for thing at point (Alt-.)', function() { editor.aceEditor.execCommand("clojureFindDefinition"); }],
        ['Completion for thing at point (Cmd-Shift-p)', function() { editor.aceEditor.execCommand("list protocol"); }],
        ['interrupt eval (Esc)',                       function() { editor.aceEditor.execCommand("clojureEvalInterrupt"); }],
        ['indent selection (Tab)',                     function() { editor.aceEditor.execCommand("paredit-indent"); }],
        items.detect(function(ea) { return ea[0] === "settings"})
      ].map(function(ea) {
        if (isMac) return ea;
        ea[0] = ea[0].replace(/Cmd-/g, "Ctrl-");
        return ea;
      });
    },

    evalAndPrint: function(codeEditor, insertResult, prettyPrint, prettyPrintLevel, thenDo) {
        var sourceString = codeEditor.getSelectionOrLineString(),
            env = clojure.Runtime.currentEnv(codeEditor),
            ns = clojure.Runtime.detectNs(codeEditor),
            options = {
              env: env, ns: ns,
              prettyPrint: prettyPrint,
              prettyPrintLevel: prettyPrintLevel,
              catchError: false
            };

        return clojure.Runtime.doEval(sourceString, options, printResult);

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
        function printResult(err, result) {
          thenDo && thenDo(err, result);
          if (err && !Object.isString(err)) err = lively.lang.obj.inspect(err, {maxDepth: 3});
          if (!insertResult && err) { codeEditor.world().alert(err); return; }
          if (result && !Object.isString(result)) result = lively.lang.obj.inspect(result, {maxDepth: 3});
          if (insertResult) codeEditor.printObject(codeEditor.aceEditor, err ? err : result);
          else codeEditor.collapseSelection("end");
        }
    },

    doEval: function(codeEditor, insertResult, thenDo) {
        return this.evalAndPrint(codeEditor, insertResult, false, null, thenDo);
    },

    printInspect: function(codeEditor, options) {
        return this.evalAndPrint(codeEditor, true, true, options.depth || 4);
    },

    doListProtocol: function(codeEditor) {
      // codeEditor=that
      // First try to do a "member" completion
      var ed = codeEditor.aceEditor;
      var src = codeEditor.textString;
      var ast = ed.session.$ast || src;
      var pos = ed.getCursorIndex();

      // // if this does not work let the system-nav figure out the rest...
      var term = this.helper.identfierBeforeCursor(codeEditor);
      var memberComplForm = clojure.StaticAnalyzer.buildElementCompletionForm(ast,src, pos);

      if (memberComplForm) {
        lively.lang.fun.composeAsync(
          callClojure.curry(memberComplForm, {requiredNamespaces: ["rksm.system-navigator.completions"]}),
          processMemberCompletions,
          createCandidates,
          openNarrower
        )(handlerError)
      } else {
        lively.lang.fun.composeAsync(
          fetchGenericCompletions.curry(term),
          processGenericCompletions,
          createCandidates,
          openNarrower
        )(handlerError)
      }

      // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

      function handlerError(err) {
        if (err) {
          var msg = "Completion error: " + String(err);
          codeEditor.setStatusMessage(msg, Color.red);
          return;
        }
      }

      function processMemberCompletions(result, thenDo) {
        thenDo(null, result.map(function(ea) {
          return [ea.name, lively.lang.string.format("%s\n[(%s)] -> %s",
              ea.name, ea.params.join(","), ea.type)];
        }));
      }

      function fetchGenericCompletions(term, thenDo) {
        var src = '(rksm.system-navigator.completions/get-completions->json "%s")';
        var sourceString = lively.lang.string.format(src, term);
        callClojure(sourceString, {requiredNamespaces: ["rksm.system-navigator.completions"]}, function(err, result) {
          if (!result || !lively.lang.obj.isObject(result))
            err = "No completion for \'" + term + "'";
          thenDo(err, result);
        });
      }

      function processGenericCompletions(result, thenDo) {
        var namesAndDoc = Object.keys(result).reduce(function(namesAndDoc, name) {
          return namesAndDoc.concat([[name, result[name]]])
        }, []);
        thenDo(null, namesAndDoc);
      }

      function createCandidates(namesAndInfo, thenDo) {
        // namesAndInfo = [[nameOfThing, docString]]
        var maxNameLength = 0;
        var displaySpec = namesAndInfo.map(function(ni) {
          var name = ni[0], docString = ni[1];
          var doc = docString.trim() || "",
              docLines = doc.length ? lively.lang.string.lines(doc) : [name];
          maxNameLength = Math.max(maxNameLength, docLines[0].length);
          return {
            insertion: name,
            doc: docString,
            docFirst: docLines.shift(),
            docRest: docLines.join("\ ").truncate(120),
          }
        });

        var candidates = displaySpec.map(function(ea) {
          var string = lively.lang.string.pad(ea.docFirst, maxNameLength+1 - ea.docFirst.length)
                     + ea.docRest;
          return {isListItem: true, string: string, value: ea};
        });

        thenDo(null, candidates)
      }

      function openNarrower(candidates, thenDo) {
        var n = lively.ide.tools.SelectionNarrowing.getNarrower({
          name: "lively.ide.codeEditor.modes.Clojure.Completer",
          spec: {
            candidates: candidates,
            actions: [
              function insert(candidate) {
                var slice = candidate.insertion.slice(candidate.insertion.indexOf(term)+term.length);
                codeEditor.collapseSelection("end");
                codeEditor.insertAtCursor(slice, false);
              },
              function openDoc(candidate) {
                $world.addCodeEditor({
                  title: "Clojure doc for " + candidate.insertion,
                  textMode: "text",
                  content: candidate.doc
                }).getWindow().openInWorld().comeForward();
              }
            ]
          }
        });
        thenDo && thenDo(null, n);
      }

      function callClojure(code, options, thenDo) {
        var env = clojure.Runtime.currentEnv(codeEditor),
            ns = clojure.Runtime.detectNs(codeEditor),
            options = lively.lang.obj.merge({
              ns:ns, env: env, catchError: false,
              passError: true, resultIsJSON: true}, options || {});
        clojure.Runtime.doEval(code, options, thenDo);
      }
    }
});


(function pareditSetup() {
  ace.ext.keys.addKeyCustomizationLayer("clojure-keys", {
    modes: ["ace/mode/clojure"],
    commandKeyBinding: {
      "clojurePrintDoc":               "Command-Shift-\/",
      "clojurePrintDoc":               "Alt-Shift-\/",
      "clojurePrintDoc":               "¿",
      "clojureEvalInterrupt":          "Escape|Ctrl-x Ctrl-b",
      "clojureChangeEnv":              "Command-e",
      "clojureFindDefinition":         "Alt-.",
      "clojureEvalLastSexp":           "Ctrl-x Ctrl-e",
      "clojureLoadFile":               "Ctrl-x Ctrl-a",
      "clojureEvalNsForm":             "Ctrl-x Ctrl-n",
      "clojureEvalPrintLastSexp":      "Ctrl-x Ctrl-p",
      "clojureEvalLastSexpAndReplace": "Ctrl-x Ctrl-w",
      "clojureEvalDefun":              "Ctrl-x Ctrl-f|Alt-Shift-Space",
      "pareditExpandSnippetOrIndent":  "Tab"
    }
  });
  var cmdNames = Object.keys(lively.ide.codeeditor.modes.Clojure.Commands);
  ace.ext.lang.paredit.commands = cmdNames.reduce(function(cmds, cmdName) {
    cmds = cmds.filter(function(cmd2) { return cmdName !== cmd2.name; });
    var cmd = lively.ide.codeeditor.modes.Clojure.Commands[cmdName];
    cmd.name = cmdName;
    return cmds.concat([cmd]);
  }, ace.ext.lang.paredit.commands);
  lively.ide.codeeditor.modes.Clojure.updateRuntime();
})();

}) // end of module
