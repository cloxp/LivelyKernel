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
            ns = clojure.Runtime.detectNs(ed.$morph),
            file = ed.$morph.getTargetFilePath();
        clojure.Runtime.fetchDoc(string, {passError: true, env: env, ns: ns, file: file}, function(err, docString) {
          // ed.$morph.printObject(ed, err ? err : docString);
          if (!docString || !(docString.trim()) && !err) err = new Error("Cannot retrieve documentation for\n" + string);
          if (err) return ed.$morph.setStatusMessage(String(err), Color.red);

          docString = docString.replace(/"?nil"?/,"").replace(/[-]+\n/m,"").trim()
          clojure.UI.showText({
            title: "clojure doc",
            content: err ? String(err) : docString,
            extent: pt(560,250),
            textMode: "text"
          });
        });
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureFindDefinition",
      exec: function(ed, args) {
        args = args || {};
        var openInNewWindow = args.hasOwnProperty("count");
        lively.ide.commands.exec('clojureFindDefinition', {
          openInNewWindow: openInNewWindow, codeEditor: ed.$morph});
        return true;
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureEvalInterrupt",
      exec: function(ed, args) {
        args = args || {};
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
      name: "clojureShowEvalQueue",
      exec: function(_) {
        var env = clojure.Runtime.currentEnv();
        var ed = $world.addActionText([]);
        ed.getWindow().setTitle("Clojure evaluation queue")
        ed.getWindow().openInWorld();
        (function() { ed.onLoad(); }).delay(0);

        ed.addScript(function killAllInEnv(env, thenDo) {
          var q = Global.clojure.Runtime.evalQueue;
          if (q[0].isRunning) var cmd = q.shift();
          q.forEach(function(evalSpec) {
            try {
              evalSpec.callback && evalSpec.callback(new Error("Eval interrupted"));
            } catch (e) {}
          });
          q.length = 0;
          if (cmd) { this.killCommand(cmd, thenDo); }
          else thenDo && thenDo();
        });

        ed.addScript(function killCommand(cmd, thenDo) {
          var self = this;
          Global.clojure.Runtime.evalInterrupt(cmd.env, cmd, function(err) {
            self.setStatusMessage(
              err ? ["Error interrupting eval:\n"+err] : "Eval interrupted",
              err ? Global.Color.red : undefined, err ? null : 3);
            self.update();
            thenDo && thenDo(err);
          })
        });

        ed.addScript(function setAttributedText(textSpec) {
            // textSpec like [["string", {type: "tokenType", onClick: ..., commands: ...}}]]
            return this.withAceDo(function(ed) {
              var m = ed.session.getMode();
              return m.set(ed, textSpec);
            });
          });

        ed.addScript(function update() {
          // show(this)
          // this.getWindow().openInWorld()
          var q = Global.clojure.Runtime.evalQueue,
              env = Global.clojure.Runtime.currentEnv(),
              self = this;

          self.saveExcursion(function(reset) {
            self.setAttributedText(
              Array.prototype.concat.apply(
                [printEnv(env), ['\n'], printStopAll(env), [' '], printUpdate(), ['\n']],
                q.map(function(cmd) {
                  return [printEvalCommand(cmd), ['\n'], printStop(cmd), ['\n']]; })));
            (function() { reset(); }).delay(0);
          });

          function printUpdate() {
            return ['[update]', {type: "action", onClick: self.update.bind(self)}];
          }

          function printEnv(env) {
            return [lively.lang.string.format(
              "eval queue of %s:%s", env.host, env.port)];
          }

          function printStopAll(env) {
            return ["[stop all]", {type: 'action', onClick: self.killAllInEnv.bind(self, env)}];
          }

          function printEvalCommand(cmd) {
            return [lively.lang.string.format(
              "\neval: %s\nnamespace: %s\nid:%s\nis running: %s",
                cmd.expr.replace(/\n/g, ""), cmd.ns || "user",
                cmd["eval-id"], cmd.isRunning || "false")];
          }

          function printStop(cmd) {
            return ["[stop]", {type: 'action', onClick: self.killCommand.bind(self, cmd)}];
          }
        });

        ed.addScript(function onLoad() { $super(); this.startStepping(1000, "update"); });

        return true;
      }
    },

    {
      name: "clojureShowResultOrError",
      exec: function(ed, args) {
        args = args || {};

        var env = args.env || clojure.Runtime.currentEnv(ed.$morph),
            ns = args.ns || clojure.Runtime.detectNs(ed.$morph),
            err = args.err,
            msg = args.msg ? args.msg : "",
            warn = args.warnings ? "\n\n" + args.warnings : "",
            options = args,
            text;

        if (err) {
          msg = (msg ? msg + ":\n" : "") + err;
          text = [
            ["open full stack trace\n", {doit: {context: {isClojureError: true, env: env, ns: ns, err: err}, code: errorRetrieval}}],
            [msg],
            warn ? [warn, {color: Color.orange}] : [""]];
        } else if (args.offerInsertAndOpen) {
          var insertion = ed.$morph.ensureStatusMessageMorph().insertion = msg + warn;
          text = [
            ["open", {color: Color.white, textAlign: "right", fontSize: 9,
                      doit: {context: {ed: ed, content: insertion},
                             code: 'this.ed.execCommand("clojureOpenEvalResult", {insert: false, content: this.content});'}}],
            [" ", {color: Color.white, textAlign: "right", fontSize: 9}],
            ["insert", {color: Color.white, textAlign: "right", fontSize: 9, doit: {context: {ed: ed, content: insertion}, code: 'this.ed.execCommand("clojureOpenEvalResult", {insert: true, content: this.content}); this.ed.focus();'}}]
          ]
          .concat(warn ?
            [[" "],
             ["open full stack trace\n", {color: Color.white, doit: {context: {env: env, ns: ns, err: warn}, code: errorRetrieval}}]] :
            [])
          .concat([
            ["\n", {fontSize: 9, textAlign: "right"}],
            [msg],
            warn ? [warn, {color: Color.orange}] : [""]]);
        } else {
          ed.$morph.ensureStatusMessageMorph().insertion = msg + warn;
          text = String(msg) + warn;
        }

        ed.$morph.setStatusMessage(text, err ? Color.red : null);
        args.thenDo && args.thenDo(err, msg);

        return true;

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

        function errorRetrieval() {
          // simply printing what we have
          // lively.ide.codeeditor.modes.Clojure.update()
          clojure.Runtime.fullLastErrorStackTrace(
            {env: this.env, ns: this.ns, open: true, nframes: 999});
        }

      }
    },

    {
      name: "clojureRefreshClasspathDirs",
      exec: function(ed, args) {
        args = args || {};
        clojure.Runtime.doEval(
          "(rksm.system-files/refresh-classpath-dirs)",
          {env: Global.clojure.Runtime.currentEnv(ed.$morph),
           requiredNamespaces: ["rksm.system-files"],
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
          ed.$morph.setStatusMessage((err ? String(err) : result), err ? Color.red : null);
        })
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureEvalSelectionOrLastSexp",
      exec: function(ed, args) {
        // var ed = that.aceEditor
        var code = !ed.selection.isEmpty() ?
          ed.session.getTextRange() :
          clojure.StaticAnalyzer.sourceForLastSexpBeforeCursor(ed),
          lineOffset = (ed.$morph.clojureBaseLineOffset ? ed.$morph.clojureBaseLineOffset() : 0)
                     + ed.selection.getRange().end.row
                     - (lively.lang.string.lines(code).length-1);

        var options = lively.lang.obj.merge(
          {code: code, offerInsertAndOpen: true, lineOffset: lineOffset},
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
          prettyPrintLevel: (args && args.count) || 9,
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

        // lively.ide.codeeditor.modes.Clojure.update()

        lively.lang.fun.composeAsync(
          retrieveContent, open
        )(function(err) { err && console.error(err); })

        return true;

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

        function retrieveContent(next) {
          if (content) return next(null, content);

          var msgMorph = ed.$morph.ensureStatusMessageMorph();
          msgMorph = msgMorph && msgMorph.world() ? msgMorph : null;
          if (!msgMorph) return next(null);

          var ctx = lively.PropertyPath("textChunks.0.style.doit.context").get(msgMorph);
          if (ctx && ctx.isClojureError) {
            clojure.Runtime.fullLastErrorStackTrace(
              {open: true, nframes: 999}, next);
            return;
          }

          content = (ctx && ctx.content) || msgMorph.insertion || msgMorph.textString;
          delete msgMorph.insertion;
          msgMorph.remove();

          next(null, content);
        }

        function open(content, next) {
          if (!content) content = "no exception info received";
          if (typeof content !== "string") content = JSON.stringify(content, null, 2);
          if (!content.trim()) return next();
          if (insert) {
            if (!ed.selection.isEmpty()) ed.selection.clearSelection();
            ed.insert(content);
            return next();
          }

          $world.addCodeEditor({
            title: 'clojure inspect',
            extent: pt(600, 300),
            content: content,
            textMode: 'clojure',
            lineWrapping: true
          }).getWindow().comeForward();
          next();
        }

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
                  ns:ns, env: env, passError: true, resultIsJSON: true}, options || {});
            clojure.Runtime.doEval(code, options, thenDo);
          }
      }
    },

    {
      name: "clojureEvalDefun",
      exec: function(ed, args) {
        var defun = ed.session.$ast
         && paredit.navigator.rangeForDefun(ed.session.$ast,ed.getCursorIndex());
        return defun && ed.execCommand("clojureEval", {
              from: defun[0], to: defun[1],
              lineOffset: ed.idxToPos(defun[0]).row+(ed.$morph.clojureBaseLineOffset ? ed.$morph.clojureBaseLineOffset() : 0)
            });
      },
      // lively.ide.codeeditor.modes.Clojure.update()
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureEval",
      exec: function(ed, args) {
        args = args || {};

        var env = clojure.Runtime.currentEnv(ed.$morph),
            ns = clojure.Runtime.detectNs(ed.$morph),
            useCustomEvalMethod = true,
            warnings;

        // Note: we pretty print by default but printed output will be
        // truncated by print level and print length (print depth + max elems
        // in lists). When doing an "inspect" print we will try to print
        // everything

        var options = {
              file: ed.$morph.getTargetFilePath() || "<doit>",
              env: env, ns: ns, passError: true,
              prettyPrint: args.hasOwnProperty("prettyPrint") ? args.prettyPrint : true,
              prettyPrintLevel: args.prettyPrintLevel || (args.hasOwnProperty("prettyPrint") ? null : 10),
              printLength: args.printLength || (args.hasOwnProperty("prettyPrint") ? null : 20),
              lineOffset: args.lineOffset,
              columnOffset: args.columnOffset,
              bindings: [],
              resultIsJSON: !!useCustomEvalMethod,
              requiredNamespaces: useCustomEvalMethod ? ["rksm.cloxp-repl", "clojure.data.json"] :[],
              warningsAsErrors: false,
              onWarning: function onWarning(warn) { warnings = warn; }
            }

        lively.lang.fun.composeAsync(
          getCode, prepareCode,
          function(code, n) { clojure.Runtime.doEval(code, options, n); }
        )(function(err, result) {
          if (useCustomEvalMethod && result && Object.isArray(result)) {
            result = result[0].trim() + "\n\n" + result[1].trim();
          }
          ed.execCommand("clojureShowResultOrError", {
            err: err,
            warnings: warnings,
            msg: result,
            offerInsertAndOpen: args.hasOwnProperty("offerInsertAndOpen") ?
              args.offerInsertAndOpen : true
          });
          args.thenDo && args.thenDo(err, result);
        });

        return true;

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

        function prepareCode(code, next) {
          if (!useCustomEvalMethod) return next(null, code);
          options.bindings.pushAll(["rksm.cloxp-repl/*repl-source*", code]);
          options.requiredNamespaces.pushAll(["rksm.cloxp-repl", "clojure.data.json"])
          next(null, lively.lang.string.format(
            "(->> (rksm.cloxp-repl/eval-string rksm.cloxp-repl/*repl-source* '%s {:file \"%s\" :throw-errors? true})\n"
          + "  ((juxt #(->> % (map (comp %s :value)) (clojure.string/join \"\n\"))\n"
          + "         #(->> % (map :out) (clojure.string/join \"\n\"))))\n"
          + "  clojure.data.json/write-str)",
            options.ns || "user", options.file, options.prettyPrint ? "(fn [x] (with-out-str (clojure.pprint/pprint x)))" : "pr-str"));
        }

        function getCode(next) {
          if (args.code) return next(null, args.code);

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
            reset();
            next(null, code);
          });
        }

      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureMacroexpand",
      exec: function(ed, args) {
        var code = !ed.selection.isEmpty() ?
              ed.session.getTextRange() :
              clojure.StaticAnalyzer.sourceForLastSexpBeforeCursor(ed),
            expandFull = args.hasOwnProperty("count"),
            env = clojure.Runtime.currentEnv(ed.$morph),
            ns = clojure.Runtime.detectNs(ed.$morph),
            options = {
              file: ed.$morph.getTargetFilePath(),
              env: env, ns: ns, passError: true,
              prettyPrint: true,
              macroexpandFull: expandFull
            }
        clojure.Runtime.macroexpand(code, options, function(err, result) {
          ed.execCommand("clojureShowResultOrError", {
            err: err,
            msg: result,
            offerInsertAndOpen: true
          });
          args.thenDo && args.thenDo(err, result);
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
        lively.ide.commands.exec("clojureCaptureSelection", {codeEditor: ed.$morph});
        return true;
      },
      multiSelectAction: 'forEach'
    },

    {
      name: "clojureCaptureShowAll",
      exec: function(ed, args) {
        lively.ide.commands.exec("clojureCaptureShowAll", {});
        return true;
      }
    },

    {
      name: "clojureCaptureInspectOne",
      exec: function(ed, args) {
        lively.ide.commands.exec("clojureCaptureInspectOne", {});
        return true;
      }
    },

    {
      name: "clojureCaptureReset",
      exec: function(ed, args) {
        lively.ide.commands.exec("clojureCaptureReset", {codeEditor: ed.$morph});
        return true;
      }
    },

    {
      name: "clojureSetLiveEvalEnabled",
      exec: function(ed, args) {
        args = args || {};
        var cljState = ed.session.$livelyClojureState || (ed.session.$livelyClojureState = {});
        var val = "value" in args ? args.value : !ed.session.getMode().isLiveEvalEnabled(ed);
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
            cljState = ed.session.$livelyClojureState || (ed.session.$livelyClojureState = {}),
            file = ed.$morph.clojureGetRelativeFilePath && ed.$morph.clojureGetRelativeFilePath();

        cljState.evalInProgress = true;

        lively.lang.fun.composeAsync(
          doEval,
          addOverlay
        )(function(err, result) {
          cljState.evalInProgress = false;
              // {error: e, type: "json parse error", input: result}
          err = err || result && result.error;
          if (err) ed.execCommand("clojureShowResultOrError", {err: err});
          thenDo && thenDo(err, result);
        })

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

        function doEval(thenDo) {
          var template = "(let [code rksm.cloxp-repl/*repl-source*\n"
                       + "      res (rksm.cloxp-repl.live-eval/live-eval-code-keeping-env\n"
                       + "           code :ns '%s :file %s :id '%s :reset-timeout 60000)\n"
                       + "      for-ed  (map (fn [{o :out, p :printed, {:keys [line column]} :parsed}]\n"
                       + "                     {:printed p, :out o, :pos {:line line, :column column}}) res)]\n"
                       + "  (clojure.data.json/write-str for-ed))\n"
          var code = lively.lang.string.format(template,
            ns, file ? lively.lang.string.print(file) : 'nil', ns);

      // lively.ide.codeeditor.modes.Clojure.update()
          var opts = {
            bindings: ["rksm.cloxp-repl/*repl-source*", rawCode],
            ns: ns, resultIsJSON: true,
            env: Global.clojure.Runtime.currentEnv(editor), passError: true,
            requiredNamespaces: ["rksm.cloxp-repl", "rksm.cloxp-repl.live-eval", "clojure.data.json"]};
          clojure.Runtime.doEval(code, opts, thenDo);
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

          // var rowOffsets = {};
          var charW = ed.renderer.layerConfig.characterWidth;

          var overlays = evalResults.map(function(r) {
            if (!r.pos || !r.printed) return;

            var acePos = {column: 0, row: r.pos.line-1};
            var rowEnd = ed.session.getLine(acePos.row).length;

            var text = String(r.printed);
            if (r.out.trim().length) {
              if (r.printed === "nil") text = "";
              text += " " + r.out.trim();
            }
            text = text.truncate(100).replace(/\n/g, "");

            var overlay = {
              atLineEnd: true,
              start: {column: 0, row: acePos.row},
              text: text,
              classNames: ["clojure-live-eval-value"],
              offset: {x: 15, y: 0},
              data: {"clojure-live-eval-value": r}
            }
            editor.addTextOverlay(overlay);
            return overlay;
          });

          thenDo && thenDo(null, result);
        }

        return true;
      }
    },

    {
      name: "clojureOpenLineAnnotation",
      exec: function(ed, args) {
        var pos = ed.getCursorPosition();

        lively.lang.fun.composeAsync(
          findCaptureAt.curry(pos),
          openAnnotations
        )(function(err) {
          if (err) ed.$morph.setStatusMessage("Cannot find line annotation");
        });

        function findCaptureAt(acePos, next) {
          clojure.TraceFrontEnd.retrieveCaptures({}, function(err, captures) {
            var capturesAtRow = !err && clojure.TraceFrontEnd
              .filterCapturesForEditor(ed.$morph, captures)
              .map(function(ea) { ea.type = "capture"; return ea; })
              .filter(function(ea) { return ea.acePos.row === acePos.row; })
            next(err, capturesAtRow);
          });
        }

        function openAnnotations(annotations, next) {
          if (!annotations || !annotations.length) return next(new Error("No annotations found"));
          annotations.forEach(function(ea) {
            if (ea.type === "capture") {
              lively.ide.commands.exec("clojureCaptureInspectOne", {id: ea.id});
            }
          });
          next();
        }
      }
    },

    {
      name: "clojureUndef",
      exec: function(ed, args) {
        args = args || {};
        var name = args.name;
        if (!name) {
          var ast = ed.session.$ast;
          var idx = ed.getCursorIndex()
          var node = paredit.walk.sexpsAt(ast, idx, function(n) { return n.type === 'symbol'; }).last();
          name = node && node.source;
        }
        if (name) {
          var ns = clojure.Runtime.detectNs(ed.$morph) || "user";
          var code = lively.lang.string.format("(do (ns-unmap '%s '%s) (ns-unalias '%s '%s))", ns, name, ns, name);
          var opts = {env: clojure.Runtime.currentEnv(ed.$morph), passError: true};
          clojure.Runtime.doEval(code, opts, function(err) {
            if (err) onError(err);
            else ed.$morph.setStatusMessage("undefined " + name);
          });
        } else {
          onError(new Error("No symbol to undefine at point"));
        }
        function onError(err) {
          ed.$morph.setStatusMessage(
            "Error undefining " + (name || "unknown entity") + ":\n" + err)
        }

        return true;

      }
    },

    {
      name: "clojureTraceCode",
      exec: function(ed, args) {
        args = args || {};
        var code = !ed.selection.isEmpty() ?
            ed.session.getTextRange() :
            clojure.StaticAnalyzer.sourceForLastSexpBeforeCursor(ed),
          // expandFull = args.hasOwnProperty("count"),
          env = clojure.Runtime.currentEnv(ed.$morph),
          ns = clojure.Runtime.detectNs(ed.$morph),
          options = {
            file: ed.$morph.getTargetFilePath(),
            env: env, ns: ns, passError: true,
            code: code
          }

        lively.lang.fun.composeAsync(
          function(n) {
            var id = "clojure.trace-targets-input";
            var prevInput = lively.LocalStorage.get(id) || "'user\n#\"clojure.*\"";
            $world.editPrompt(
              "Enter targets to trace. Can be namespace and var symbols or Clojure regexps,",
              function(input) {
                if (!input) return n(new Error("Invalid input"));
                lively.LocalStorage.set(id, input);
                var traceTargets = input.split(/\s\n/).invoke("trim").compact();
                options.traceTargets = traceTargets;
                n(null);
              }, {input: prevInput, historyId: id});
          },
          function(n) {
  // lively.ide.codeeditor.modes.Clojure.update()
            lively.ide.commands.exec("clojureTraceCode", options, n)
          }
        )(function(err, viewer) {
          err && ed.$morph.setStatusMessage(String(err), Color.red);
        })

        return true;

      }
    }
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
        "Command-Shift-\/|Alt-Shift-?|Alt-Shift-\/|¿":         "clojurePrintDoc",
        "Command-Shift-p|Alt-Shift-p":             "clojureListCompletions",
        "Command-Shift-f|Ctrl-Shift-f":            "global:clojure.ide.codeSearch",
        "Escape|Ctrl-x Ctrl-b":                    "clojureEvalInterrupt",
        "Command-e":                               "clojureChangeEnv",
        "Alt-.":                                   "clojureFindDefinition",
        "Ctrl-x Ctrl-e|Command-d|Alt-Enter":       "clojureEvalSelectionOrLastSexp",
        "Command-p|Alt-p":                         "null",
        "Ctrl-x Ctrl-a":                           "clojureLoadFile",
        "Ctrl-x Ctrl-n":                           "clojureEvalNsForm",
        "Command-i|Ctrl-x Ctrl-i|Alt-Shift-Enter": "clojureEvalAndInspect",
        "Alt-m|Alt-Shift-m":                       "clojureMacroexpand",
        "Ctrl-x Ctrl-f|Alt-Shift-Space":           "clojureEvalDefun",
        "Ctrl-x Ctrl-t":                           "clojureTraceCode",
        "Alt-o|Command-o":                         "clojureOpenEvalResult",
        "Tab":                                     "pareditExpandSnippetOrIndent",
        "Ctrl-x Ctrl-r":                           "clojureRefreshClasspathDirs",
        "Alt-Shift-u":                             "clojureUndef",
        // emacs                                   compat
        "Ctrl-x Ctrl-x":                           "exchangePointAndMark",
        "Ctrl-x r":                                "selectRectangularRegion",
        "Command-k|Alt-k":                         "clojureOpenWorkspace",
        // capturing
        "Alt-Shift-w":                             "clojureCaptureSelection"
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
            ["clojure.onContentChange",
            "clojure.onMouseDown",
            "clojure.onSelectionChange",
            "$livelyClojureState"].forEach(function(ea) { delete ed.session[ea]; });
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
          settings = items.detect(function(ea) { return ea[0] === "settings"}),
          canSave = ((editor.clojureGetMyBrowser && editor.clojureGetMyBrowser())
                    || editor.owner && editor.owner.owner && editor.owner.owner.isTextEditor);

      settings[1].splice(2, 0, [lively.lang.string.format("[%s] use paredit", lively.Config.pareditCorrectionsEnabled ? "X" : " "), function() { lively.Config.toggle("pareditCorrectionsEnabled"); }]);

      return [].concat([
        ['eval selection or last expr (Alt-Enter)',         function() { editor.aceEditor.execCommand("clojureEvalSelectionOrLastSexp"); }],
        ]).concat(
          canSave ? [['save (Cmd-s)', function() { editor.doSave(); }]] : []
        ).concat([
          ['indent selection (Tab)',                     function() { editor.aceEditor.execCommand("paredit-indent"); }],
          {isMenuItem: true, isDivider: true},
          ['eval and debug...', ([
              ['interrupt eval (Esc)',                       function() { editor.aceEditor.execCommand("clojureEvalInterrupt"); }],
              ['macroexpand (Alt-m)',                        function() { editor.aceEditor.execCommand("clojureMacroexpand"); }],
              ['eval and pretty print (Alt-Shift-Enter)', function() { editor.aceEditor.execCommand("clojureEvalAndInspect"); }],
              ['eval top level entity (Alt-Shift-Space)', function() { editor.aceEditor.execCommand("clojureEvalDefun"); }],
              ['undefine entity (Alt-Shift-u)', function() { editor.aceEditor.execCommand("clojureUndef"); }],
            ]).concat(fn ? [
              ['load entire file ' + fn + ' (Ctrl-x Ctrl-a)',            function() { editor.aceEditor.execCommand("clojureLoadFile"); }]] : []
            ).concat(sexp && sexp.source === 'let' ? [
              ['load let bindings as defs',            function() { editor.aceEditor.execCommand("clojureEvalLetBindingsAsDefs"); }]] : []
            ).concat([
              [lively.lang.string.format('[%s] live eval',
                editor.getSession().getMode().isLiveEvalEnabled(editor.aceEditor) ? "X" : " "),
                function() { editor.aceEditor.execCommand("clojureSetLiveEvalEnabled"); }],
            ])
          ],
          ["trace...", [
            ['trace selected code or last sexp (Ctrl-x Ctrl-t)', function() { editor.aceEditor.execCommand("clojureTraceCode"); }]
          ]],
          ["capture...", [
            ['capture values of selection (Alt-Shift-w)', function() { editor.aceEditor.execCommand("clojureCaptureSelection"); }],
            ['show all captures', function() { editor.aceEditor.execCommand("clojureCaptureShowAll"); }],
            ['uninstall all captures', function() { editor.aceEditor.execCommand("clojureCaptureReset"); }]]],
          ["doc...", [
            ['help for thing at point (Alt-?)',            function() { editor.aceEditor.execCommand("clojurePrintDoc"); }],
            ['find definition for thing at point (Alt-.)', function() { editor.aceEditor.execCommand("clojureFindDefinition"); }],
            ['Completion for thing at point (Cmd-Shift-p)', function() { editor.aceEditor.execCommand("list protocol"); }]]],
          {isMenuItem: true, isDivider: true},
          settings
      ]).map(function(ea) {
        if (isMac) return ea;
        else if (typeof ea[0] === "string") ea[0] = ea[0].replace(/Cmd-/g, "Ctrl-");
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
        lively.lang.fun.debounceNamed(ed.$morph.id+"-clojureDoLiveEval", 400, function() {
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
        clojure.TraceFrontEnd.showEditorMenuForCapture(ed.$morph, captureId);
      }
    },

    onCaptureStateUpdate: function(ed, captures) {
      // module('lively.ide.codeeditor.TextOverlay').load()
      var m = ed.$morph;
      var ns = clojure.Runtime.detectNs(m) || "user";
      m.removeTextOverlay({className: "clojure-capture"});
      var rowOffsets = {};
      var captures = clojure.TraceFrontEnd.filterCapturesForEditor(m, captures);
      var w = ed.renderer.layerConfig.characterWidth;
      if (!captures.length) m.hideTextOverlays();
      else captures.forEach(function(c) {
          var rowEnd = ed.session.getLine(c.acePos.row).length;
          var offs = rowOffsets[c.acePos.row] || 0;
          rowOffsets[c.acePos.row] = offs + (c.string.length * w) + 5;
          m.addTextOverlay({
            start: {column: rowEnd, row: c.acePos.row},
            text: c.string,
            classNames: ["clojure-capture"],
            offset: {x: 5+offs, y: 0},
            data: {"clojure-capture": c.id}
          });
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
                        + "}\n"
                        + ".clojure-highlight { position: absolute; background-color: #abf !important; }\n"
                        + "@import url(http://fonts.googleapis.com/css?family=Lora:400,700,400italic,700italic);\n"
                        , id);
  });
})();

}) // end of module
