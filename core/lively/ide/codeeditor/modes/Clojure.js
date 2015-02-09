module('lively.ide.codeeditor.modes.Clojure').requires('lively.ide.codeeditor.ace', 'clojure.Runtime', 'clojure.UI').toRun(function() {

Object.extend(lively.ide.codeeditor.modes.Clojure, {

  commands: [{
      name: "clojureOpenWorkspace",
      exec: function(ed) {
        $world.addCodeEditor({
            title: "Clojure workspace",
            content: "(+ 3 4)",
            textMode: "clojure",
            extent: pt(550, 280)
        }).getWindow().comeForward();
      }
    },

    {
      name: "clojurePrintDoc",
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

    {
      name: "clojureFindDefinition",
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
            "Error retrieving definition for " + query.source + "\n" + err);

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

    {
      name: "clojureEvalInterrupt",
      exec: function(ed) {
        // Actually this is a general "Escape" action that will do various things...
        // 1. close the status morph if one is open
        if (ed.$morph._statusMorph && ed.$morph._statusMorph.world())
          return ed.$morph._statusMorph.remove();

        // 2. clear the seelction
        if (ed.inMultiSelectMode) return ed.exitMultiSelectMode();
        else if (!ed.selection.isEmpty()) return ed.execCommand("clearSelection");

        // if nothing else applies really do interrupt
        ed.$morph.setStatusMessage("Interrupting eval...");
        var env = clojure.Runtime.currentEnv(ed.$morph);
        clojure.Runtime.evalInterrupt(env, function(err, answer) {
          if (err && String(err).include("no evaluation in progress")) {
            // lively.ide.codeeditor.modes.Clojure.update();
          } else console.log("Clojure eval interrupt: ", Objects.inspect(err || answer));
          // ed.$morph.setStatusMessage(Objects.inspect(err || answer), err ? Color.red : null);
        });
      }
    },
    
    {
      name: "clojureRefreshClasspathDirs",
      exec: function(ed, args) {
        args = args || {};
        clojure.Runtime.doEval(
          "(rksm.system-navigator.ns.filemapping/refresh-classpath-dirs)",
          {env: Global.clojure.Runtime.currentEnv(ed.$morph),
           requiredNamespaces: ["rksm.system-navigator.ns.filemapping"],
           passError: true},
          function(err) {
            if (args.thenDo) args.thenDo(err);
            else ed.$morph.setStatusMessage(
              err ? "Error refreshing namespaces: " + err : "Namespaces refreshed! Ahhhh",
              err ? Color.red : null);
          });
      }
    },

    {
      name: "clojureChangeEnv",
      exec: function(ed) {
        var runtime = clojure.Runtime;
        var env = runtime.currentEnv(ed.$morph);
        $world.prompt("Change clojure runtime environment:", function(input) {
          var env = runtime.readEnv(input);
          if (!env) show("not a valid host/port combo: " + input);
          else runtime.changeInEditor(ed.$morph, env);
        },

        {input: runtime.printEnv(env)})
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureLoadFile",
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
              ed.$morph.setStatusMessage(msg, err ? Color.red : Color.green)
            }, 1000);
          });
        }
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureToggleAutoLoadSavedFiles",
      exec: function(ed) {
        var runtime = clojure.Runtime,
          env = runtime.currentEnv(ed.$morph);
        runtime.changeInEditor(ed.$morph, {doAutoLoadSavedFiles: !env.doAutoLoadSavedFiles});
        $world.alertOK("Auto load clj files " + (env.doAutoLoadSavedFiles ? "enabled" : "disabled"));
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureResetLocalState",
      exec: function(ed) {
        var runtime = clojure.Runtime;
        runtime.resetEditorState(ed.$morph);
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureEvalLetBindingsAsDefs",
      exec: function(ed, args) {
        // var ed = that.aceEditor
        var ast = ed.session.$ast;
        var pos = ed.getCursorIndex()
        var sexps = ed.session.$ast && paredit.walk.sexpsAt(ast,pos);
        var code = ed.getValue();

        var letSexp;
        if (sexps.length && sexps.last().source === 'let') {
          letSexp = sexps.last();
        } else {
          var letParent = sexps.reverse().detect(function(ea) {
            return ea.type === "list" && ea.children[0] && ea.children[0].source === 'let';
          });
          if (letParent) letSexp = letParent.children[0];
        }

        if (!letSexp) {
          ed.$morph.setStatusMessage("No let binding at cursor!");
          return;
        }
        var bindings = paredit.walk.nextSexp(ast, letSexp.end);


// lively.ide.codeeditor.modes.Clojure.update();
        var bindingNames = [];
        // note: there might be more than one paredit node on the val side of one binding
        var src = bindings.children.reduce(function(tuples, ea) {
          if (ea.type === "comment") return tuples;
          var tuple = tuples.last();
          if (tuple.length === 0
           || (ea.source === "#" || ea.source === "'")) {
             tuple.push(ea); return tuples;
          }
          tuple.push(ea);
          tuples.push([]);
          return tuples;
        }, [[]]).map(function(ea) {
          if (!ea.length) return "";
          bindingNames.push(ea[0].source);
          return "(def " + (ea[0].source + " " + code.slice(ea[1].start, ea.last().end)) + ")";
        }).join("\n");

        var env = clojure.Runtime.currentEnv(ed.$morph);
        var ns = clojure.Runtime.detectNs(ed.$morph);
        clojure.Runtime.doEval(src,
            {env: env, ns: ns, passError: true},
            function(err, result) {
              if (!err) ed.$morph.setStatusMessage("Defined " + bindingNames.join(", "));
              else ed.$morph.setStatusMessage(String(err), Color.red)
            });
      },
      multiSelectAction: 'forEach'
    },
    
    {
      name: "clojureEvalSelectionOrLine",
      exec: function(ed, args) {
        ed.session.getMode().evalAndPrint(ed.$morph, false, false, null, function(err, result) {
          ed.$morph.setStatusMessage((err ? String(err) : result).truncate(300), err ? Color.red : null);
        })
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureEvalSelectionOrLastSexp",
      exec: function(ed, args) {
        // var ed = that.aceEditor
        var range = [0,0];
        if (!ed.selection.isEmpty()) range = ed.$morph.getSelectionRange();
        else {
          var ast = ed.session.$ast;
          var lastSexp = ed.session.$ast && paredit.walk.prevSexp(ast,ed.getCursorIndex());
          if (lastSexp) {
            range = [lastSexp.start, lastSexp.end]
            do {
              var directLeftSpecial = paredit.walk.sexpsAt(ast, range[0], function(n) {
                return n.type === "special" && n.start < range[0] && n.end === range[0] }).last();
              if (directLeftSpecial) range[0] = directLeftSpecial.start;
            } while(directLeftSpecial);
          };
        }
        var options = lively.lang.obj.merge(
          {from: range[0], to: range[1], offerInsertAndOpen: true},
          args || {});
        return ed.execCommand("clojureEval", options);
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureEvalAndInspect",
      exec: function(ed, args) {
        // If we already show a status morph than insert its contents. This
        // allows to insert when "inspecting" twice

        var msgMorph = ed.$morph.ensureStatusMessageMorph();
        if (msgMorph.world() && msgMorph.insertion) {
          ed.execCommand("clojureOpenEvalResult", {insert: true})
          return;
        }

        var options = {
          prettyPrint: true,
          prettyPrintLevel: (args && args.count) || 6,
          offerInsertAndOpen: true
        }
        return ed.execCommand("clojureEvalSelectionOrLastSexp", options);
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureOpenEvalResult",
      exec: function(ed, args) {
        args = args || {};
        var insert = args.insert; // either insert into current editor or open in window
        var content = args.content;

        if (!content) {
          var msgMorph = ed.$morph.ensureStatusMessageMorph();
          content = msgMorph.world() && msgMorph.insertion;
          if (content) {
            ed.$morph._statusMorph.remove();
            var insertion = msgMorph.insertion;
            delete msgMorph.insertion;
          }
        }

        if (content) {
          if (insert) {
            if (!ed.selection.isEmpty()) ed.selection.clearSelection();
            ed.insert(content);
          } else {
            $world.addCodeEditor({
              title: 'clojure inspect',
              content: content,
              textMode: 'clojure',
              lineWrapping: true
            }).getWindow().comeForward();
          }
          return;
        } else {
          ed.$morph.setStatusMessage("nothing to " + (insert ? "insert" : "open"));
        }
        return true;
      },
      multiSelectAction: 'forEach'
    },
    
    {
      name: "clojureEvalNsForm",
      exec: function(ed, args) {
        show("clojureEvalNsForm no yet implemented")
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureEvalBuffer",
      exec: function(ed, args) {
        ed.execCommand("clojureEval",
          lively.lang.obj.merge(args || {}, {from: 0, to: ed.getValue().length}));
        return true;
      }
    },

    {
      name: "clojureListCompletions",
      exec: function(ed, args) {
          // codeEditor=that
          // First try to do a "member" completion
          var src = ed.getValue();
          var ast = ed.session.$ast || src;
          var pos = ed.getCursorIndex();
    
          // // if this does not work let the system-nav figure out the rest...
          
          var term = ed.session.getMode().helper.identfierBeforeCursor(ed.$morph);
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

          return true;
          // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    
          function handlerError(err) {
            if (err) {
              var msg = "Completion error: " + String(err);
              ed.$morph.setStatusMessage(msg, Color.red);
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
                    ed.$morph.collapseSelection("end");
                    ed.$morph.insertAtCursor(slice, false);
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
            var env = clojure.Runtime.currentEnv(ed.$morph),
                ns = clojure.Runtime.detectNs(ed.$morph),
                options = lively.lang.obj.merge({
                  ns:ns, env: env, catchError: false,
                  passError: true, resultIsJSON: true}, options || {});
            clojure.Runtime.doEval(code, options, thenDo);
          }
      }
    },

    {
      name: "clojureEvalDefun",
      exec: function(ed, args) {
        var defun = ed.session.$ast && paredit.navigator.rangeForDefun(ed.session.$ast,ed.getCursorIndex());
        return defun && ed.execCommand("clojureEval", {from: defun[0], to: defun[1]})
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureEval",
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

          var code = ed.session.getTextRange();
          var env = clojure.Runtime.currentEnv(ed.$morph);
          var ns = clojure.Runtime.detectNs(ed.$morph);
          var errorRetrieval = lively.lang.fun.extractBody(function() {
            // simply printing what we have
            // lively.ide.codeeditor.modes.Clojure.update()
            var ed = $world.addCodeEditor({
              extent: pt(700, 500),
              title: "clojure stack trace",
              textMode: "text",
              content: String(this.err)
            }).getWindow().comeForward();
          });

          var options = {
            env: env, ns: ns, passError: true,
            prettyPrint: args.prettyPrint,
            prettyPrintLevel: args.prettyPrintLevel
          }
          clojure.Runtime.doEval(code, options, function(err, result) {
            reset();
            var msg;
            if (err) {
              msg = [
                ["open full stack trace\n", {doit: {context: {env: env, ns: ns, err: err}, code: errorRetrieval}}],
                [String(err).truncate(300)]];
            } else if (args.offerInsertAndOpen) {
              ed.$morph.ensureStatusMessageMorph().insertion = result;
              msg = [
                ["open", {textAlign: "right", fontSize: 9, doit: {context: {ed: ed, content: result}, code: 'this.ed.execCommand("clojureOpenEvalResult", {insert: false, content: this.content});'}}],
                [" ", {textAlign: "right", fontSize: 9}],
                ["insert", {textAlign: "right", fontSize: 9, doit: {context: {ed: ed, content: result}, code: 'this.ed.execCommand("clojureOpenEvalResult", {insert: true, content: this.content}); this.ed.focus();'}}],
                ["\n", {fontSize: 9, textAlign: "right"}],
                [result.truncate(300)]]
            } else {
              ed.$morph.ensureStatusMessageMorph().insertion = null;
              msg = String(result).truncate(300);
            }
            ed.$morph.setStatusMessage(msg, err ? Color.red : null);
            args.thenDo && args.thenDo(err,result);
          });
        });
        return true;
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "pareditExpandSnippetOrIndent",
      exec: function(ed, args) {
        var success = ed.$morph.getSnippets()
          .getSnippetManager().expandWithTab(ed);
        if (!success) {
          if (ed.tabstopManager) ed.tabstopManager.tabNext(1)
          else ed.session.getMode().getCodeNavigator().indent(ed,args);
        }
        return true;
      },
      multiSelectAction: 'forEach'
    },
    
    {
      name: "clojureCaptureSelection",
      exec: function(ed, args) {
        var src = ed.getValue();
        var ast = ed.session.$ast;

        var defNode = paredit.walk.sexpsAt(ast, ed.getCursorIndex(), function(n) {
          return n.type !== "toplevel" && paredit.walk.hasChildren(n); })[0];
          
        var name = defNode && paredit.defName(defNode);
        if (!name) {
          ed.$morph.setStatusMessage("Cannot install capture: no def node found at cursor position");
          return true;
        }

        var pos = ed.getCursorPosition();
        var startPos = ed.idxToPos(defNode.start)
        var localPosClj = {column: pos.column+1, line: pos.row+1-startPos.row}
        var ns = clojure.Runtime.detectNs(ed.$morph) || "user";
        var opts = {
          env: clojure.Runtime.currentEnv(ed.$morph),
          ns: ns,
          passError: true, resultIsJSON: true,
          requiredNamespaces: ["rksm.cloxp-trace", "clojure.data.json"]};

        var code = lively.lang.string.format(
          "(let [spec (rksm.cloxp-trace/install-capture!\n"
          + "            \"%s\"\n"
          + "            :ns (find-ns '%s)\n"
          + "            :name \"%s\"\n"
          + "            :pos {:column %s, :line %s})\n"
          + "      spec (-> spec\n"
          + "             (update-in [:ns] str)\n"
          + "             (select-keys [:ns :name :id :ast-idx :pos :loc]))]\n"
          + "  (clojure.data.json/write-str spec))\n",
            paredit.walk.source(src, defNode)
              .replace(/\\([^"])/g, '\\\\$1')
              .replace(/\\"/g, '\\\\\\"')
              .replace(/""/g, '\\"\\"')
              .replace(/([^\\])"/g, '$1\\"'),
              ns, name, localPosClj.column, localPosClj.line);

        clojure.TraceFrontEnd.ensureUpdateProc();
        clojure.Runtime.doEval(code, opts, function(err, result) {

          if (err) ed.$morph.setStatusMessage("error installing tracer:\n"+ String(err).truncate(1000), Color.red);
          else ed.$morph.setStatusMessage("installed tracer into "+ result.ns + "/" + result.name);

          var pos = result.pos;
          if (pos) {
            var defNode = paredit.walk.sexpsAt(ed.session.$ast, ed.getCursorIndex())[1]
            var nodePos = ed.idxToPos(defNode.start)
            var range = clojure.TraceFrontEnd.SourceMapper.mapClojurePosToAceRange(pos);
            range.moveBy(nodePos.row, 0);

  // lively.ide.codeeditor.modes.Clojure.update()

            ed.saveExcursion(function(reset) {
              ed.selection.setRange(range);
              setTimeout(reset, 800);
            });
          }


        });
        return true;
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureCaptureShowAll",
      exec: function(ed, args) {
        var ed = clojure.TraceFrontEnd.createCaptureOverview();
        ed.getWindow().comeForward();
        return true;
      }
    },
    
    {
      name: "clojureCaptureInspectOne",
      exec: function(ed, args) {
        args = args || {};
        lively.lang.fun.composeAsync(
          args.id ? function(n) { n(null, args.id, args.all); } : chooseCapture,
          function(id, all, n) { fetchAndShow({id: id, all: !!all}, n); }
        )(function(err, result) { })

        function fetchAndShow(options, thenDo) {
    // lively.ide.codeeditor.modes.Clojure.update()
          clojure.TraceFrontEnd.inspectCapturesValuesWithId(options, function(err, result) {
            var pre = lively.lang.string.format('(@rksm.cloxp-trace/storage "%s")\n', options.id);
            $world.addCodeEditor({
              title: "values captured for " + options.id,
              content: pre + (err || result),
              textMode: "clojure",
              extent: pt(600, 300)
            }).getWindow().comeForward();
            thenDo && thenDo(err);
          });
  
        }

        function chooseCapture(n) {
          clojure.TraceFrontEnd.retrieveCaptures({}, function(err, captures) {
            if (err) return n(err);
            var candidates = captures.map(function(ea) {
              return {string: ea.id, value: ea, isListItem: true}; });
            lively.ide.tools.SelectionNarrowing.chooseOne(candidates,
              function(err, c) { n(err, c && c.id, true); });
          })
        }

        return true;
      }
    },

    {
      name: "clojureCaptureReset",
      exec: function(ed, args) {
        args = args || {};
        var code = "(rksm.cloxp-trace/reset-captures!)";
        var opts = {
          env: clojure.Runtime.currentEnv(ed.$morph), passError: true,
          requiredNamespaces: ["rksm.cloxp-trace"]};
        clojure.Runtime.doEval(code, opts, function(err) {
          if (err) ed.$morph.setStatusMessage("error reseting captures:\n"+ err.truncate(1000));
          else ed.$morph.setStatusMessage("capture rest");
          clojure.TraceFrontEnd.ensureUpdateProc();
        });

        return true;

      }
    },

    {
      name: "clojureSetLiveEvalEnabled",
      exec: function(ed, args) {
        args = args || {};
        var cljState = ed.session.$livelyClojureState || (ed.session.$livelyClojureState = {});
        var val = args.value || !ed.session.getMode().isLiveEvalEnabled(ed);
        cljState.liveEvalEnabled = val;
        if (val) ed.execCommand("clojureDoLiveEval")
        else ed.$morph.removeTextOverlay({className: "clojure-live-eval-value"});
        ed.$morph.setStatusMessage("Clojure live eval " + (val ? "enabled" : "disabled"));
        return true;
      }
    },

    {
      name: "clojureDoLiveEval",
      exec: function(ed, args) {
        args = args || {};
      
        var thenDo = args.thenDo,
            editor = ed.$morph,
            rawCode = ed.getValue(), result,
            ns = Global.clojure.Runtime.detectNs(editor) || "user",
            cljState = ed.session.$livelyClojureState || (ed.session.$livelyClojureState = {})

        cljState.evalInProgress = true;
      
        lively.lang.fun.composeAsync(
          doEval,
          addOverlay
        )(function(err, result) {
          cljState.evalInProgress = false;
              // {error: e, type: "json parse error", input: result}
          if (result && result.error) editor.setStatusMessage((result.input||result.error).truncate(300))
          else if (err) editor.setStatusMessage("Error " + (err.stack || err).truncate(300))
          thenDo && thenDo(err, result);
        })
      
        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
      
        function doEval(thenDo) {
      
          var template = "(let [code \"%s\"\n"
                       + "      eval-result (rksm.cloxp-trace.live-eval/live-eval-code code :ns '%s)]\n"
                       + "    (clojure.data.json/write-str eval-result))";
      
          var code = lively.lang.string.format(template,
            rawCode
              .replace(/\\([^"])/g, '\\\\$1')
              .replace(/\\"/g, '\\\\\\"')
              .replace(/""/g, '\\"\\"')
              .replace(/([^\\])"/g, '$1\\"'),
            ns);
      
          var opts = {
            ns: ns, resultIsJSON: true,
            env: Global.clojure.Runtime.currentEnv(editor), passError: false,
            requiredNamespaces: ["rksm.cloxp-trace.live-eval", "clojure.data.json"]};
      
          Global.clojure.Runtime.doEval(code, opts, thenDo);
        }
        
        
        
        function addOverlay(result, thenDo) {
          // module('lively.ide.codeeditor.TextOverlay').load()
          editor.removeTextOverlay({className: "clojure-live-eval-value"});
      
          var evalResults;
          if (result.error) {
            var input = result.input;
            if (!input) return thenDo(null, result);
            var lines = lively.lang.string.lines(input);
            try { evalResults = JSON.parse(eval(lines[0])); } catch (e) {
              return thenDo(null, result);
            }
            result.input = lines.slice(1).join("\n");
          } else if (!Array.isArray(result)) {
            thenDo(result);
          } else evalResults = result;
      
          var rowOffsets = {};
          var overlays = evalResults.forEach(function(r) {
            if (!r.pos || !r.value) return;
      
            var acePos = {column: r.pos.column-1, row: r.pos.line-1};
            var rowEnd = ed.session.getLine(acePos.row).length;
            
            var text = String(r.value);
            if (r.out.trim().length) {
              if (r.value === "nil") text = "";
              text += " " + r.out.trim();
            }
            text = text.truncate(100).replace(/\n/g, "");
      
            var offs = rowOffsets[acePos.row] || 0;
            rowOffsets[acePos.row] = offs + 8 + text.length*6;
            var overlay = {
              start: {column: rowEnd, row: acePos.row},
              text: text,
              classNames: ["clojure-live-eval-value"],
              offset: {x: 15+offs, y: 0},
              data: {"clojure-live-eval-value": r}
            }
            editor.addTextOverlay(overlay);
          });
      
          thenDo && thenDo(null, result);
        }
      
        return true;
      
      }
    },
    
  ],

  addCustomCommands: function(cmds) {
    var oldCmds = lively.ide.codeeditor.modes.Clojure.commands.filter(function(existingCmd) {
      return cmds.every(function(newCmd) { return newCmd.name !== existingCmd.name; });
    });
    lively.ide.codeeditor.modes.Clojure.commands = oldCmds.concat(cmds);
    lively.ide.codeeditor.modes.Clojure.update();
  },

  defineKeyBindings: function() {
    // lively.ide.codeeditor.modes.Clojure.update();
    ace.ext.keys.addKeyCustomizationLayer("clojure-keys", {
      modes: ["ace/mode/clojure"],
      commandKeyBinding: {
        "Command-Shift-\/|Alt-Shift-\/|¿":         "clojurePrintDoc",
        "Command-Shift-p|Alt-Shift-p":             "clojureListCompletions",
        "Escape|Ctrl-x Ctrl-b":                    "clojureEvalInterrupt",
        "Command-e":                               "clojureChangeEnv",
        "Alt-.":                                   "clojureFindDefinition",
        "Ctrl-x Ctrl-e|Command-d|Alt-Enter":       "clojureEvalSelectionOrLastSexp",
        "Command-p|Alt-p":                         "null",
        "Ctrl-x Ctrl-a":                           "clojureLoadFile",
        "Ctrl-x Ctrl-n":                           "clojureEvalNsForm",
        "Command-i|Ctrl-x Ctrl-i|Alt-Shift-Enter": "clojureEvalAndInspect",
        "Ctrl-x Ctrl-f|Alt-Shift-Space":           "clojureEvalDefun",
        "Alt-o|Command-o":                         "clojureOpenEvalResult",
        "Tab":                                     "pareditExpandSnippetOrIndent",
        "Ctrl-x Ctrl-r":                           "clojureRefreshClasspathDirs",
        // emacs                                   compat
        "Ctrl-x Ctrl-x":                           "exchangePointAndMark",
        "Ctrl-x r":                                "selectRectangularRegion",
        "Command-k|Alt-k":                         "clojureOpenWorkspace",
        // capturing
        "Alt-Shift-w":                         "clojureCaptureSelection"
      }
    });
  },

  updateRuntime: function() {
    lively.whenLoaded(function(w) {
      // FIXME we are piggiebacking the modeChange handler of paredit to inject the clojure commands
      ace.ext.lang.paredit.commands = lively.ide.codeeditor.modes.Clojure.commands.concat(
        ace.ext.lang.paredit.commands).uniqBy(function(a, b) { return a.name === b.name; });
      var cljEds = lively.ide.allCodeEditors()
        .filter(function(ea) { return ea.getTextMode() === 'clojure'; });
      // cljEds.length
      (function() {
        cljEds.forEach(function(editor) {
          editor.withAceDo(function(ed) {
            ed.onChangeMode();
            this.aceEditor.saveExcursion(function(reset) {
              ed.setValue(ed.getValue()); // trigger doc change + paredit reparse
              reset();
            })
          });
        });
      }).delay(.5);
      $world.alertOK("updated clojure editors");
    });
  },

  update: function() {
    // updates the clojure ide setup, keybindings, commands, etc
    lively.ide.codeeditor.modes.Clojure.defineKeyBindings();
    lively.ide.codeeditor.modes.Clojure.updateRuntime();
  }

});

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
        var termStart = ["(", " ", "'", ",", "[", "{"].map(function(ea) {
            return codeEditor.find({preventScroll: true, backwards: true, needle: ea}); })
          .filter(function(ea) { return !!ea && ea.end.row === pos.row; })
          .max(function(ea) { return ea.end.column; });

        if (termStart) termStart = termStart.end;
        else termStart = {row: pos.row, column: 0};

        return codeEditor.getTextRange({start: termStart, end: pos}).trim();
      }
    },

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // attaching event handlers for clojure specific stuff
    attach: lively.ide.codeeditor.modes.Clojure.Mode.prototype.attach.getOriginal().wrap(function(proceed, ed) {
      var self = this;
      ed.setDisplayIndentGuides(false);

      // react to changes
      if (!ed.session["clojure.onContentChange"]) {
        ed.session["clojure.onContentChange"] = function(evt) { self.onDocChange(evt, ed); }
        ed.session.on('change', ed.session["clojure.onContentChange"]);
        ed.once("changeMode", function() { ed.session.off("change", ed.session["clojure.onContentChange"]); });
      }
      if (!ed.session["clojure.onSelectionChange"]) {
        ed.session["clojure.onSelectionChange"] = function(evt) { self.onSelectionChange(evt); }
        ed.on('changeSelection', ed.session["clojure.onSelectionChange"]);
        ed.once("changeMode", function() { ed.off("change", ed.session["clojure.onSelectionChange"]); });
      }
      if (!ed.session["clojure.onMouseDown"]) {
        ed.session["clojure.onMouseDown"] = function(evt) { self.onMouseDown(evt); }
        ed.on('mousedown', ed.session["clojure.onMouseDown"]);
        ed.once("changeMode", function() { ed.off("change", ed.session["clojure.onMouseDown"]); });
      }

      return proceed(ed);
    }),

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    morphMenuItems: function(items, editor) {
      var platform = editor.aceEditor.getKeyboardHandler().platform,
          isMac = platform == 'mac',
          file = editor.getTargetFilePath && editor.getTargetFilePath(),
          fn = file && file.split(/\\|\//).last(),
          ast = editor.aceEditor.session.$ast,
          pos = editor.aceEditor.getCursorIndex(),
          sexp = editor.aceEditor.session.$ast && paredit.walk.sexpsAt(ast,pos).last(),
          ns = clojure.Runtime.detectNs(editor),
          settings = items.detect(function(ea) { return ea[0] === "settings"});

      settings[1].splice(2, 0, [lively.lang.string.format("[%s] use paredit", lively.Config.pareditCorrectionsEnabled ? "X" : " "), function() { lively.Config.toggle("pareditCorrectionsEnabled"); }]);
      
      return [].concat([
        ['eval selection or last expr (Alt-Enter)',         function() { editor.aceEditor.execCommand("clojureEvalSelectionOrLine"); }],
        ['save (Cmd-s)', function() { editor.doSave(); }],
        ['indent selection (Tab)',                     function() { editor.aceEditor.execCommand("paredit-indent"); }],
        {isMenuItem: true, isDivider: true},
        ['eval and debug...', ([
            ['interrupt eval (Esc)',                       function() { editor.aceEditor.execCommand("clojureEvalInterrupt"); }],
            ['eval and pretty print (Alt-Shift-Enter)', function() { editor.aceEditor.execCommand("clojureEvalAndInspect"); }],
            ['eval top level entity (Alt-Shift-Space)', function() { editor.aceEditor.execCommand("clojureEvalDefun"); }],
          ]).concat(fn ? [
            ['load entire file ' + fn + ' (Ctrl-x Ctrl-a)',            function() { editor.aceEditor.execCommand("clojureLoadFile"); }]] : []
          ).concat(sexp && sexp.source === 'let' ? [
            ['load let bindings as defs',            function() { editor.aceEditor.execCommand("clojureEvalLetBindingsAsDefs"); }]] : []
          ).concat([
            [lively.lang.string.format('[%s] live eval',
              editor.getSession().getMode().isLiveEvalEnabled(editor.aceEditor) ? "X" : " "),
              function() { editor.aceEditor.execCommand("clojureSetLiveEvalEnabled"); }],
            {isMenuItem: true, isDivider: true},
            ['capture values of selection (Alt-Shift-w)', function() { editor.aceEditor.execCommand("clojureCaptureSelection"); }],
            ['show all captures', function() { editor.aceEditor.execCommand("clojureCaptureShowAll"); }],

          ])
        ],
        ["doc...", [
          ['help for thing at point (Alt-?)',            function() { editor.aceEditor.execCommand("clojurePrintDoc"); }],
          ['find definition for thing at point (Alt-.)', function() { editor.aceEditor.execCommand("clojureFindDefinition"); }],
          ['Completion for thing at point (Cmd-Shift-p)', function() { editor.aceEditor.execCommand("list protocol"); }]]],
        {isMenuItem: true, isDivider: true},
        settings
      ]).map(function(ea) {
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
      codeEditor.withAceDo(function(ed) {
        ed.execCommand("clojureEvalAndInspect");
      });
      // return this.evalAndPrint(codeEditor, true, true, options.depth || 4);
    },

    doListProtocol: function(codeEditor) {
      codeEditor.withAceDo(function(ed) { ed.execCommand("clojureListCompletions"); });
    },

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // tracing / live eval related
    isLiveEvalEnabled: function(ed) {
      var cljState = ed.session.$livelyClojureState || (ed.session.$livelyClojureState = {});
      return cljState.liveEvalEnabled;
    },

    onDocChange: function(evt, ed) {
      if (!this.isLiveEvalEnabled(ed)) return;
      var cljState = ed.session.$livelyClojureState;
      clojureDoLiveEvalDebounced();

      function clojureDoLiveEvalDebounced() {
        lively.lang.fun.debounceNamed(ed.$morph.id+"-clojureDoLiveEval", 200, function() {
          if (cljState && cljState.evalInProgress) return clojureDoLiveEvalDebounced();
          ed.execCommand("clojureDoLiveEval");
        })();
      }
      
    },

    onSelectionChange: function(evt) {
      clojure.TraceFrontEnd.updateEarly();
    },

    onMouseDown: function(evt) {
      var t = evt.domEvent.target;
      var captureId = t && t.dataset.clojureCapture;
      if (!captureId) return false;
      var ed = evt.editor;
      document.addEventListener("mouseup", onup);
      evt.stopPropagation(); evt.preventDefault();
      return true;

      function onup() {
        document.removeEventListener("mouseup", onup);
        lively.morphic.Menu.openAtHand(null, [
          ["inspect last value", ed.execCommand.bind(ed, "clojureCaptureInspectOne", {id: captureId})],
          ["inspect all values", ed.execCommand.bind(ed, "clojureCaptureInspectOne", {id: captureId, all: true})],
          ["empty", function() { clojure.TraceFrontEnd.emptyCapture(captureId, function() {}); }],
          ["uninstall", function() { clojure.TraceFrontEnd.uninstallCapture(captureId, function() {}); }],
          {isMenuItem: true, isDivider: true},
          ["show all captures", ed.execCommand.bind(ed, "clojureCaptureShowAll")],
        ])
      }
      
    },

    onCaptureStateUpdate: function(ed, captures) {
      // module('lively.ide.codeeditor.TextOverlay').load()

      var m = ed.$morph;
      var ns = clojure.Runtime.detectNs(m) || "user";
      m.removeTextOverlay({className: "clojure-capture"});

      var rowOffsets = {};
      var overlays = captures.forEach(function(c) {
        if (c.ns !== ns) return null;
        var found = ed.session.$ast.children.detect(function(ea) {
          return paredit.defName(ea) === c.name; });
        if (!found) return null;
        var acePos = clojure.TraceFrontEnd.SourceMapper.mapClojurePosToAcePos(c.pos)
        acePos.row += ed.idxToPos(found.start).row;
        var rowEnd = ed.session.getLine(acePos.row).length;
        var text = c['last-val'].truncate(70);
        var offs = rowOffsets[acePos.row] || 0;
        rowOffsets[acePos.row] = offs + (text.length * 9);
        var overlay = {
          start: {column: rowEnd, row: acePos.row},
          text: text,
          classNames: ["clojure-capture"],
          offset: {x: 5+offs, y: 0},
          data: {"clojure-capture": c.id}
        }
        ed.$morph.addTextOverlay(overlay);
      });

    }

});


(function pareditSetup() {
  lively.ide.codeeditor.modes.Clojure.update();

  lively.whenLoaded(function() {
          
      var id = "clojure-ide-styles";
      var el = document.getElementById(id);
      if (el) el.parentNode.removeChild(el);
      XHTMLNS.addCSSDef(".text-overlay.clojure-live-eval-value {\n"
                          + "	background-color: #999;\n"
                          + "	border-color: #999;\n"
                          + "}\n", id);
  });
})();

}) // end of module
