module('clojure.Runtime').requires().requiresLib({url: Config.codeBase + 'lib/ace/paredit-bundle.js',loadTest: function() { return !!Global.paredit; }}).toRun(function() {

// "exports"
// lively.ide.codeeditor.modes.Clojure.ReplServer = {};
clojure.Runtime.ReplServer = {};
clojure.StaticAnalyzer;

// FIXME this needs to go into paredit...
Object.extend(paredit, {

  defName: function(node) {
    if (node.type !== "list") return null;
    if (!node.children[0] || !(node.children[0].source || "").match(/^def/)) return null;
    var nameNode = node.children.slice(1).detect(function(ea) { return ea.type !== "list"; })
    return nameNode ? nameNode.source : null;
  }

});

Object.extend(clojure.Runtime, {

    _cache: {},
    _environments: [{port: 7888, host: "127.0.0.1", session: null, doAutoLoadSavedFiles: false}],
    _defaultEnv: 0,

    environments: function() { return this._environments.clone(); },

    reset: function() {
      var runtime = clojure.Runtime;
      runtime._cache = {};
      runtime._environments = [{port: 7888, host: "127.0.0.1", session: null, doAutoLoadSavedFiles: false}];
      runtime._defaultEnv = 0;
    },

    addEnv: function(env) {
      this.removeEnv(env);
      this._environments.push(env);
      return env;
    },

    removeEnv: function(env) {
      var existing = this._environments.filter(function(ea) {
        return lively.lang.obj.equals(ea, env); })
      if (existing.include(this._environments[this._defaultEnv]))
        this._defaultEnv = 0;
      this._environments = this._environments.withoutAll(existing);
      if (!this._environments.length) this.reset();
    },

    resetEditorState: function(ed) {
      var runtime = clojure.Runtime;
      runtime.ensureClojureStateInEditor(ed).env = null;
    },

    currentEnv: function(codeEditor) {
        // clojure.Runtime.currentEnv(that);
        var runtime = clojure.Runtime;

        if (codeEditor) {
          if (codeEditor.clojureEnv) return codeEditor.clojureEnv();
          var st = runtime.ensureClojureStateInEditor(codeEditor);
          if (st.env) return st.env;
        }

        return this.environments()[this._defaultEnv];
    },

    readEnv: function(inputString) {
        if (!Object.isString(inputString)) return null;
        var match = inputString.match(/^([^:]+):([0-9]+)$/);
        var host = match[1].trim(), port = parseInt(match[2]);
        return !host || !port ? null : {host: host, port: port};
    },

    printEnv: function(env) {
        return Strings.format("%s:%s", env.host, env.port);
    },

    ensureClojureStateInEditor: function(editorMorph) {
        var runtime = clojure.Runtime,
            sess = editorMorph.getSession();
        return sess.$livelyClojureState || (sess.$livelyClojureState = {env: null});
    },

    changeInEditor: function(editorMorph, newEnvSpec) {
        var runtime = clojure.Runtime;
        var defaultEnv = runtime.currentEnv();
        var editorEnv = runtime.currentEnv(editorMorph);
        if (defaultEnv === editorEnv) {
          editorEnv = Object.create(defaultEnv);
        }
        Object.keys(newEnvSpec).forEach(function(k) {
          if (newEnvSpec[k] !== editorEnv[k]) editorEnv[k] = newEnvSpec[k];
        });
        return runtime.ensureClojureStateInEditor(editorMorph).env = editorEnv;
    },

    change: function(newDefaultEnv) {
      var e = this.environments().detect(function(ea) {
        return ea.host === newDefaultEnv.host &&
               ea.port === newDefaultEnv.port; });
      if (!e) { this._environments.push(newDefaultEnv); e = newDefaultEnv; }
      Object.extend(e, newDefaultEnv);
      this._defaultEnv = this._environments.indexOf(e);
      return e;
    },

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // helper for editors

    detectNs: function(editorMorph) {
      if (editorMorph.clojureGetNs) return editorMorph.clojureGetNs();
      var nsDef = clojure.StaticAnalyzer.findNsForm(
          editorMorph.getSession().$ast || editorMorph.textString);
      return nsDef ? nsDef.nsName : null;
    },

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // communicating with clojure runtimes via nrepl

    changeWorkingDirectory: function(dir, thenDo) {
      var code = lively.lang.string.format("(rksm.system-files.fs-util/set-cwd! \"%s\")", dir);
      clojure.Runtime.doEval(code,
        {passError: true, requiredModules: ["rksm.system-files.fs-util"]},
        function(err) { if (err) $world.logError(err); thenDo && thenDo(err); });
    },

    doCodeSearch: function(searchTerm, options, thenDo) {
      // options:
      //  - namespaceMatcher: Clojure re for filtering namespaces
      //  - excludeNamespaces: Clojure re for excluding namespaces

      var opts = lively.lang.obj.merge(options || {}, {
        requiredNamespaces: ["rksm.system-navigator.search", "clojure.data.json"],
        passError: true, resultIsJSON: true
      });

      var term = ensureClojureRe(searchTerm);
      var matcher = opts.namespaceMatcher && ensureClojureRe(opts.namespaceMatcher);
      var excludes = opts.excludeNamespaces && ensureClojureRe(opts.excludeNamespaces);

      var code = lively.lang.string.format(
        " (clojure.data.json/write-str\n"
        + "  (rksm.system-navigator.search/code-search %s"
        + "   :match-ns %s :except-ns %s))",
          term, matcher || "nil", excludes || "nil");
  
      clojure.Runtime.doEval(code, opts, thenDo);
    
      // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

      function ensureClojureRe(string) {
          return string.startsWith("#") ?
            string : "#\"(?i)" + string + "\"";
      }

    },

    fetchDoc: function(expr, options, thenDo) {
      options = options || {};
      if (!expr.trim().length) return thenDo(new Error("doc: no input"))
      var self = this;

      lively.lang.fun.composeAsync(
        replDoc,
        function(doc, n) {
          doc = doc.replace(/nil/g, "").trim();
          if (doc) return n(null, doc);
          self.lookupIntern(options.ns, expr, options,
            function(err, result) {
              if (err || !result) return n(err || new Error("Could no lookup " + expr), null);
              if (!result.doc) return replDoc(result.ns + "/" + result.name, n);
              var doc = result.doc,
                  doc = doc.replace(/nil/g, "").trim(),
                  args = result['method-params'] || result.arglists;
              if (args) doc = "(["+args.join("] [") + "])\n\n" + doc;
              doc = result.ns + "/" + result.name + "\n\n" + doc;
              n(err, doc);
          });
        }
      )(expr, thenDo);

      // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

      function replDoc(expr, n) {
          self.doEval(
            lively.lang.string.format("(clojure.repl/doc %s)", expr),
            {
              ns: options.ns || 'user',
              requiredNamespaces: ['clojure.repl'],
              env: options.env,
              prettyPrint: true,
              passError: true
            }, function(err, doc) { n(null, doc); });
      }

    },

    macroexpand: function(expr, opts, thenDo) {
      // clojure.Runtime.macroexpand("#'x", show.curry("%s %s"))
      if (typeof opts === "function") { thenDo = opts; opts = null; }
      opts = opts || {};
      opts.passError = true;
      var macroexpandFull = opts.macroexpandFull;

      var code = lively.lang.string.format("(macroexpand%s '%s)",
        macroexpandFull ? "" : "-1", expr);
      clojure.Runtime.doEval(code, opts, thenDo);
    },

    evalQueue: [],

    runEvalFromQueue: function() {
        var clj = this;
        var evalObject = clj.evalQueue[0];
        if (!evalObject || evalObject.isRunning) return;
        clj.runEval(evalObject, function(err, result) {
            clj.evalQueue.remove(evalObject);
            try { if (evalObject.callback) evalObject.callback(err, result); } catch (e) {
                show("error in clj eval callback: %s", e);
            }
            clj.runEvalFromQueue.bind(clj).delay(0);
        });
    },

    runEval: function(evalObject, thenDo) {
        if (!module('lively.net.SessionTracker').isLoaded() || !lively.net.SessionTracker.isConnected()) {
            thenDo(new Error('Lively2Lively not running, cannot connect to Clojure nREPL server!'));
            return;
        }

        var clj                = clojure.Runtime,
            env                = evalObject.env,
            options            = evalObject.options;

        evalObject.isRunning = true;
        var nreplOptions = {port: env.port || 7888, host: env.host || "127.0.0.1"};
        var nreplMessages = [];
        var message = {
          nreplOptions: nreplOptions,
          session: env.session,
          ignoreMissingSession: true,
          nreplMessage: evalObject.nreplMessage
        };

        lively.net.SessionTracker.getSession().send('nreplSend', message, function(answer) {
            if (Object.isArray(answer.data)) {
                nreplMessages.pushAll(answer.data);
            } else nreplMessages.push(answer.data);

            if (answer.data['eval-id']) {
                evalObject['eval-id'] = answer.data['eval-id'];
                env.session = evalObject.env.session = answer.data.session;
            }

            if (answer.expectMoreResponses) return;
            evalObject.isRunning = false;

            if (answer.data.error) thenDo && thenDo(answer.data.error, null);
            else clj.processNreplEvalAnswers(nreplMessages, options, thenDo); });
    },

    doEval: function(expr, options, thenDo) {
      // options: ns, env, requiredNamespaces, passError, resultIsJSON,
      // warningsAsErrors, onWarning,
      // prettyPrint, printLength, prettyPrintLevel, bindings, file

      if (!thenDo && typeof options === "function") {
        thenDo = options; options = null; };
      options = options || {};

      var pp                 = options.prettyPrint = options.hasOwnProperty("prettyPrint") ? options.prettyPrint : false,
          // Max print depth
          ppLevel            = options.hasOwnProperty("prettyPrintLevel") ? options.prettyPrintLevel : null,
          // Max elems in collections
          printLength        = options.hasOwnProperty("printLength") ? options.printLength : null,
          bindings           = options.bindings || [],
          columnOffset       = options.columnOffset || null,
          lineOffset         = options.lineOffset || null,
          evalMethod         = options.evalMethod || null,
          requiredNamespaces = options.requiredNamespaces || [],
          env                = options.env || clojure.Runtime.currentEnv();

      if (!options.hasOwnProperty("warningsAsErrors")) options.warningsAsErrors = true;

      if (!pp && !printLength) { printLength = 20; }

      if (options.file) {
        // file gets attached to meta data
        bindings.push("clojure.core/*file*");
        bindings.push(options.file);
        // source-path gets attached to stack frames
        bindings.push("clojure.core/*source-path*");
        var fName = options.file.split(".").last();
        bindings.push(fName);
      }

      if (printLength) {
        bindings.push("clojure.core/*print-length*");
        bindings.push(printLength);
      }

      if (ppLevel) {
        bindings.push("clojure.core/*print-level*");
        bindings.push(ppLevel);
      }

      if (columnOffset) {
        bindings.push("rksm.cloxp-repl/*column-offset*");
        bindings.push(columnOffset);
      }

      bindings.push("rksm.cloxp-repl/*line-offset*");
      bindings.push(lineOffset || 0);

      return this.queueNreplMessage({
        env: env,
        options: options,
        expr: expr,
        nreplMessage: {
          // op: "eval",
          op: "cloxp-eval",
          code: expr,
          ns: options.ns || 'user',
          session: env.session || undefined,
          "eval": undefined,
          "required-ns": requiredNamespaces,
          bindings: bindings || [],
          pp: pp ? String(pp) : undefined,
          "pp-level": ppLevel || undefined
        }
      }, thenDo);
    },


    loadFile: function(content, pathToFile, options, thenDo) {
      if (!pathToFile) return thenDo && thenDo(new Error("Cannot load clojure file without a path!"));
      options = options || {};
      options.passError = true;
      return this.queueNreplMessage({
        env: options.env,
        options: options,
        nreplMessage: {
          op: 'load-file',
          "file": content,
          "file-name": pathToFile.split('\\').last(),
          "file-path": pathToFile,
        }
      }, thenDo);
    },

    queueNreplMessage: function(msg, thenDo) {
      msg.env = msg.env || clojure.Runtime.currentEnv();
      msg.isRunning = false;
      msg["eval-id"] = null;
      msg.callback = thenDo;
      this.evalQueue.push(msg);
      this.runEvalFromQueue();
    },

    evalInterrupt: function(env, cmd, thenDo) {
        if (typeof cmd === "function" && !thenDo) {
          thenDo = cmd; cmd = null;
        }

        // FIXME ... eval queue, eval objects should belong to a Clojure runtime env...!
        var clj = this;
        var evalObject = cmd || clj.evalQueue[0];
        if (!evalObject) return thenDo(new Error("no evaluation in progress"));
        var env = evalObject.env || {};
        var nreplOptions = {port: env.port || 7888, host: env.host || "127.0.0.1"};
        var timeout = 1000;

        if (!evalObject) thenDo(new Error("no clj eval running"));
        else if (!evalObject.isRunning || !evalObject['eval-id']) cleanup(thenDo);
        else {
            var either = lively.lang.fun.either(onTimeout, onInterrupted);
            setTimeout(either[0], timeout);
            var sess = lively.net.SessionTracker.getSession();
            sess.send('clojureEvalInterrupt',
                {nreplOptions: nreplOptions, session: evalObject.env.session,
                 "eval-id": evalObject['eval-id']}, function(answer) { either[1](null, answer); });
        }

        function cleanup(whenCleaned) {
            clj.evalQueue.remove(evalObject);
            (function() {
              clj.runEvalFromQueue();
              whenCleaned && whenCleaned();
            }).delay(0);
        }

        function onTimeout(err) { onInterrupted(new Error("interrupt timed out")); }

        function onInterrupted(err, answer) {
            err = err || (answer && (answer.error || answer.data.error));
            cleanup(function() { thenDo(err, answer ? answer.data : null); });
        }
    },

    processNreplEvalAnswers: function(messages, options, thenDo) {
      if (Object.isString(messages) && messages.match(/error/i))
          messages = [{err: messages}];

      if (!Object.isArray(messages) || !messages.length) {
          console.warn("strange clj eval messages: %o", messages);
          return;
      };

      var status = messages.pluck("status").compact().flatten(),
          errOut = messages.pluck("err").concat(messages.pluck("ex")).compact().map(String).invoke('trim').compact(),
          errors = messages.pluck("error").compact().concat(errOut),
          isError = status.include("error") || status.include("eval-error") || (options.warningsAsErrors && !!errors.length),
          value = messages.pluck('value').compact().join('\n'),
          result = messages.pluck('value').concat(messages.pluck('out')).compact().join('\n'),
          err;

      if (status.include("interrupted")) result = result + "[interrupted eval]";

      if (isError) {
          if (status.include("namespace-not-found")) {
            errors.unshift("namespace not found" + (options.ns ? ": " + options.ns : ""))
          } else {
            errors.pushAll(errOut);
            errors.unshift(status.without("done"));
            var cause = messages.pluck('root-ex').flatten().compact();
            if (cause.length) errors.pushAll(["root-cause:"].concat(cause));
          }
          err = errors.flatten().compact().invoke('trim').join('\n');
      }

      // if (!isError && options.prettyPrint) try { result = eval(result); } catch (e) {}
      if (!isError && options.resultIsJSON) try { result = JSON.parse(eval(value)); } catch (e) {
          err = e;
          result = {error: e, type: "json parse error", input: result};
      }

      if (isError && String(result).include("ECONNREFUSED")) {
          result = "No clojure server listening?" + result;
      }

      if (!isError && errOut.length) { // warnings and such
        var errString = errOut.join("\n"),
            s = lively.lang.string.format("nREPL err output:\n%s", errString);
        console.warn(s);
        if (options.onWarning) options.onWarning(errString);
      }

      // "print" error if result is a string anyway
      if (err && (!result || typeof result === 'string')) {
        result = (("" || result) + "\n" + err).trim();
      }
      thenDo && thenDo(options.passError ? err : null, result);
  },

  lookupIntern: function(nsName, symbol, options, thenDo) {
    // options: file
    options = options || {};
    var code, reqNs;

    if (options.file && options.file.match(/\.cljs$/)) {
      code = Strings.format(
          "(rksm.cloxp-cljs.analyzer/var-info->json '%s '%s \"%s\")",
        nsName, symbol, options.file);
      reqNs = ["rksm.cloxp-cljs.analyzer"];
    } else { code = Strings.format(
        "(rksm.system-navigator.ns.internals/symbol-info->json\n %s '%s)\n",
      nsName ? "(find-ns '"+nsName+")" : "*ns*", symbol);
      reqNs = ["rksm.system-navigator"];
    }

    this.doEval(code, lively.lang.obj.merge(
      options||{}, {requiredNamespaces: reqNs, resultIsJSON: true}), thenDo);
  },

  retrieveSourceForNs: function(nsName, options, thenDo) {
    // options: file
    var file = options.file ? '"' + options.file + '"' : 'nil';
    var cmd = lively.lang.string.format(
      "(clojure.data.json/write-str (rksm.system-files/source-for-ns '%s %s #\"\\.clj(x|s|c)?$\"))",
      nsName, file);
    clojure.Runtime.doEval(cmd, {
      requiredNamespaces: ["rksm.system-files", "clojure.data.json"], resultIsJSON: true
    }, function(err, source) {
      err = err
        || ((!source || !source.length) && new Error("Could no retrieve source for namespace " + nsName))
        || null;
      thenDo(err, source);
    });
  },

  retrieveSourceForVar: function(qualifiedVarName, options, thenDo) {
    // options: file
    var file = options.file ? '"' + options.file + '"' : 'nil';
    var cmd = lively.lang.string.format(
      "(clojure.data.json/write-str {:source (rksm.system-navigator.ns.internals/source-for-symbol '%s)})",
      qualifiedVarName);
    clojure.Runtime.doEval(cmd, {
      requiredNamespaces: ["rksm.system-navigator.ns.internals"], resultIsJSON: true,
    }, function(err, result) {
      err = err
        || ((!result || !result.source || result.source === "nil")
          && new Error("Could no retrieve source for var " + qualifiedVarName))
        || null;
      thenDo(err, result.source);
    });
  },

  retrieveDefinition: function(symbol, inns, options, thenDo) {
    // options: file
    lively.lang.fun.composeAsync(
      function(n) { clojure.Runtime.lookupIntern(inns, symbol, options, n); },

      function(intern, n) {
        if (!intern) return n(new Error("Cannot retrieve meta data for " + symbol));
        var file = options.file;
        if (intern.file && file && !file.endsWith(intern.file)) file = null;
        clojure.Runtime.retrieveSourceForNs(
          intern.ns, {file: file},
          function(err, nsSrc) {
            if (err) {
              var varName = symbol;
              if (!varName.include("/")) varName = inns + "/" + varName;
              clojure.Runtime.retrieveSourceForVar(symbol, {file: file},
                function(err, symSource) {
                  if (err) n(err);
                  else {
                    n(null, {
                      intern: intern,
                      nsSource: symSource,
                      defRange: [0, symSource.length]
                    })
                  }
                });
            } else nsRangeForVar(intern, nsSrc || "", n);
          });
      }
    )(thenDo);

    function nsRangeForVar(intern, nsSrc, n) {
      // lively.lang.string.lines(source).length
      intern.line = intern.line && Number(intern.line);
      if (typeof intern.line !== 'number' && intern.protocol) intern.line = Number(intern.protocol.line);
      if (typeof intern.line === 'number') {
        var range = lively.lang.string.lineNumberToIndexesComputer(nsSrc)(intern.line-1),
            ast = paredit.parse(nsSrc),
            rangeDef = range && paredit.navigator.rangeForDefun(ast, range[0]);
      }
      n(null, {intern: intern, nsSource: nsSrc, defRange: rangeDef});
    }
  },

  lsSessions: function(options, thenDo) {
    // clojure.Runtime.lsSessions();
    var sess = lively.net.SessionTracker.getSession();
    var env = options.env || {};
    var nreplOptions = {port: env.port || 7888, host: env.host || "127.0.0.1"};
    if (!sess || !sess.isConnected()) return thenDo && thenDo(new Error("lively2lively not connected"));
    sess.send('clojureLsSessions', {nreplOptions: nreplOptions}, function(answer) {
      var err = answer.data && answer.data.error;
      thenDo && thenDo(err, answer.data);
    });
  },

  fullLastErrorStackTrace: function(options, thenDo) {
    // options: nframes
    options = options || {};
    

    lively.lang.fun.composeAsync(
      function(n) {
        clojure.TraceFrontEnd.StackTrace.fetchExceptionInfo(options, n)
      },
      open
    )(function(err) {
      thenDo && thenDo(err);
    });

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    function open(exInfo, n) {
      if (!options.open) return n(null, exInfo);
      if (!exInfo && exInfo !== "") n(new Error("No exception info"));
      else if (typeof exInfo === "string" || exInfo.printed) {
        $world.addCodeEditor({
          extent: pt(700, 500),
          title: options.title || "clojure stack trace",
          textMode: "text",
          content: exInfo.printed || exInfo
        }).getWindow().comeForward();
      } else if (exInfo.lines) {
        var richText = clojure.TraceFrontEnd.StackTrace.printFrames(exInfo.lines)
        $world.addActionText(richText, {
          extent: pt(700, 500),
          title: options.title || "clojure stack trace",
        });
      }
      n(null, exInfo);
    }

  },

  requireNamespaces: function(nss, options, thenDo) {
    if (typeof options === "function") { thenDo = options; options = null; }

    nss = nss.map(function(ea) { return typeof ea === "string" ? {ns: ea} : ea; });

    options = lively.lang.obj.merge({
       passError: true, ns: 'user', warningsAsErrors: false,
       resultIsJSON: true,
       requiredNamespaces: ["rksm.cloxp-repl", "rksm.cloxp-cljs.analyzer"],
       onWarning: function(warn) { warnings.push("require clj " + nss.pluck("ns").join(',') + ":\n" + warn); }
      },
      options || {});

    var warnings = [];

    var cljsAndCljNss = nss.partition(function(ns) {
      return ns.file && ns.file.endsWith(".cljs"); })

    lively.lang.fun.composeAsync(
      function loadClj(n) {
        var nss = cljsAndCljNss[1];
        if (!nss.length) return n();
        var code = lively.lang.string.format(
          "(clojure.data.json/write-str\n"
          + " (rksm.cloxp-repl/require-namespaces \n"
          + "  [%s])\n"
          + " :value-fn (fn [k v] (cond\n"
          + "                       (instance? Exception v) (with-out-str (binding [*err* *out*] (clojure.repl/pst v 999)))\n"
          + "                       :default v)))",
          nss.map(function(ns) { return "'" + ns.ns || ns; }).join(" "));
        clojure.Runtime.doEval(code, options, function(err, result) {
          n(err || result && result.error ? result.error : null); });
      },

      function loadCljs(n) {
        var nss = cljsAndCljNss[0];
        if (!nss.length) return n();
        var requireCode = "(do " + nss.map(function(ns) {
          var sym = ns.ns, file = ns.file ? '"'+ns.file+'"' : 'nil';
          // ensure ns is analyzed
          return lively.lang.string.format(
              "(rksm.cloxp-cljs.analyzer/namespace-info '%s %s)", sym, file);
        }).join(" ") + ")";
        clojure.Runtime.doEval(requireCode, options, function(err) { n(err); });
      }
    )(function(err) { thenDo(err, nss, warnings); })

  },

  traceCode: function(codeToTrace, traceTargets, options, thenDo) {
    // var traceTargets = ['#"clojure"'];
    // var codeToTrace = '(println (clojure.java.shell/sh "ls" "-l"))';

    var opts = lively.lang.obj.merge(options || {}, {
      requiredNamespaces: ["rksm.cloxp-trace.tracing", "clojure.data.json"],
      passError: true,
      resultIsJSON: true
    });

    traceTargets = traceTargets || [];

    var code = lively.lang.string.format(
      // "(clojure.data.json/write-str (rksm.cloxp-trace.tracing/trace [%s] %s))",
      "(binding [*out* (java.io.PrintWriter. (java.io.StringWriter.))]\n"
    + " (clojure.data.json/write-str\n"
    + "  (rksm.cloxp-trace.tracing/trace [%s] %s)))",
      traceTargets.join(" "),
      codeToTrace)

    clojure.Runtime.doEval(code, opts, thenDo);
  }
});

Object.extend(clojure.Runtime.ReplServer, {

    cloxpLeinProfile:  "; do not modify, this file is auto-generated\n{\n"
                     + " :dependencies [\n"
                     + "                [org.rksm/system-navigator \"0.1.19-SNAPSHOT\"]\n"
                     + "                [org.rksm/system-files \"0.1.7-SNAPSHOT\"]\n"
                     + "                [org.rksm/cloxp-projects \"0.1.10-SNAPSHOT\"]\n"
                     + "                [org.rksm/cloxp-trace \"0.1.10-SNAPSHOT\"]\n"
                     + "                [org.rksm/cloxp-repl \"0.1.8-SNAPSHOT\"]\n"
                     + "                [org.rksm/cloxp-cljs \"0.1.10-SNAPSHOT\"]\n"
                     + "                [org.rksm/cloxp-com \"0.1.9-SNAPSHOT\"]\n"
                     + "                [org.clojure/tools.reader \"0.9.2\"]\n"
                     + '                [pjstadig/humane-test-output "0.6.0"]]\n'
                     + ' :plugins ^:replace []\n'
                     + ' :repl-options {:nrepl-middleware [rksm.cloxp-repl.nrepl/wrap-cloxp-eval]}\n'
                     + " :injections [\n"
                     + "              (require 'rksm.system-navigator)\n"
                     + "              (require 'rksm.cloxp-repl)\n"
                     + "              (require 'rksm.cloxp-cljs.analyzer)\n"
                     + "              (require 'rksm.cloxp-cljs.compilation)\n"
                     + "              (rksm.cloxp-cljs.compilation/patch-cljs-build-reload)\n"
                    // rk 2015-01-31: This tries to auto discover classpath in
                    // cwd. I currently deactivated it since it can lead to
                    // confusing situations in which the runtime meta data (intern
                    // info, line mappings) corresponds to a version of code that
                    // is different from those found inside the added classpath.
                    // Sincethe classpath is used by the system browser to show
                    // code but the runtime information is used to show defs,
                    // weird looking / broken code views might result.
                    // + "              (require 'rksm.system-files)\n"
                    // + "              (rksm.system-files/add-common-project-classpath)\n"
                     + "              (require 'pjstadig.humane-test-output)\n"
                     + "              (pjstadig.humane-test-output/activate!)]}\n",

    ensureCloxpLeinProfile: function(thenDo) {
        var profilesDir, profileFile;
        var  profileCode = this.cloxpLeinProfile;
        lively.lang.fun.composeAsync(
          function(next) {
              lively.shell.run(
                lively.shell.PLATFORM === 'win32' ?
                  "echo %HOMEPATH%" : "echo $HOME", {},
                  function(err, cmd) {
                    if (cmd.getCode()) next(cmd.resultString(true));
                    else {
                        var home = cmd.getStdout().trim()
                        profilesDir = home + "/.lein/profiles.d";
                        profileFile = profilesDir + "/cloxp.clj";
                        next();
                    }
                });
          },
            function(next) {
                lively.shell.run(
                  lively.shell.PLATFORM === 'win32' ?
                  ("mkdir " + profilesDir.replace(/\//g, '\\')) : ("mkdir -p " + profilesDir),
                  {}, function(err, cmd) { next(); });
            },
            function(next) {
                lively.ide.CommandLineInterface.writeFile(
                    profileFile, {content: profileCode}, function() { next(); })
            }
        )(function(err) {
          if (err)
            $world.setStatusMessage("Could not create cloxp leiningen profile\ncloxp functionality will be limited");
          thenDo && thenDo(null)
        });
    },

    ensure: function(options, thenDo) {
        if (typeof options === "function") { thenDo = options; options = {}; }
        thenDo = thenDo || function() {}
        options = options || {};
        var self = this;
        var cmd = clojure.Runtime.ReplServer.getCurrentServerCommand(options);
        if (!cmd) return self.start(options, thenDo);
        lively.lang.fun.composeAsync(
          function(n) {
            lively.lang.fun.waitFor(5000, function() {
              return cmd.getStdout().match(/nREPL server started|nrepl server running on/i);
            }, function() { n(); });
          },
          function(n) {
            lively.shell.run("ps -p " + cmd.getPid(), function(err, cmd) {
              n(cmd.getCode() ? "server not really running" : null);
            });
          }
        )(function(err) {
          if (err) self.start(options, thenDo);
          else thenDo(err, cmd);
        });
    },

    getCurrentServerCommand: function(options) {
        options = options || {};
        var cmdQueueName = "lively.clojure.replServer";
        if (options.env && options.env.port) cmdQueueName += ":"+options.env.port;
        else cmdQueueName = Object.keys(lively.shell.commandQueue)
          .grep(new RegExp(cmdQueueName))
          .detect(function(ea) {
            return !!lively.shell.commandQueue[ea].length; })
        || cmdQueueName;
        var q = lively.shell.commandQueue[cmdQueueName];
        var cmd = q && q[0];
        return cmd && String(cmd.getCommand()).match(/clj-feather-repl|lein with-profile \+cloxp/i) ?
            cmd : null;
    },

    start: function(options, thenDo) {
        if (typeof options === "function") { thenDo = options; options = {}; }
        thenDo = thenDo || function() {}

        var env = options.env || clojure.Runtime.currentEnv(),
            port = env ? env.port : "7888",
            host = env ? env.host : "127.0.0.1",
            cwd = options.cwd,
            useLein = options.useLein,
            useCljFeather = options.useCljFeather || !useLein,
            self = clojure.Runtime.ReplServer,
            cmdQueueName = "lively.clojure.replServer:"+port;

        // FIXME
        if (!["127.0.0.1", "0.0.0.0", "localhost"].include(host)) {
            thenDo(new Error("Cannot start clj server " + host + ":" + port));
            return;
        }

        lively.lang.fun.composeAsync(
            function(next) { lively.require("lively.ide.CommandLineInterface").toRun(function() { next(); }); },
            this.stop.bind(this, null, {port:port, host:host}),
            this.ensureCloxpLeinProfile.bind(this),
            function startServer(next) {
                var cmdString = Strings.format(
                  useLein ? "lein with-profile +cloxp repl :headless :port %s :host %s" : "clj-feather-repl %s", port, host);
                var cmd = lively.shell.run(cmdString, {cwd: cwd, group: cmdQueueName});
                next(null,cmd);
            },
            function waitForServerStart(cmd, next) {
                Functions.waitFor(5000, function() {
                  return cmd.getStdout().match(/nREPL server started|nrepl server running on/i);
                }, function(err) { next(null, cmd); });
            }
        )(thenDo);
    },

    stop: function(cmd, env, thenDo) {
      clojure.Runtime.evalQueue = [];
      env = env || clojure.Runtime.currentEnv();

      // remove session
      var runtimeEnv = clojure.Runtime.environments().detect(function(ea) {
        return ea.host === env.host && ea.port === env.port; });
      if (runtimeEnv) delete runtimeEnv.session;

      // stop server process
      if (cmd && cmd.getCommand().match(new RegExp(/clj-feather-repl|lein with-profile \+cloxp/))) {
        cmd.kill("SIGINT");
        cmd.kill("SIGINT");
        cmd.kill("SIGINT");
        cmd.kill("SIGTERM");
        lively.lang.fun.waitFor(1000,
          function() { return !cmd.isRunning(); },
          function(timeout) {
            if (timeout) {
              show("Forcing repl server shutdown.")
              var port = Number(cmd.getCommand().match(/[0-9]+$/));
              if (port) forceStop("lively.clojure.replServer:"+port, port, thenDo);
            } else thenDo();
          });
      } else {
        // FIXME
        if (env.host && !["127.0.0.1", "0.0.0.0", "localhost"].include(env.host)) {
            thenDo(new Error("Cannot stop clj server " + env.host + ":" + port));
            return;
        }

        var port = env.port || "7888";
        var cmdQueueName = "lively.clojure.replServer:"+port;
        forceStop(cmdQueueName, port, thenDo);
      }

      // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

      function forceStop(cmdQueueName, port, thenDo) {
        Functions.composeAsync(
            function clearLivelyClojureCommands(next) {
                var q = lively.shell.commandQueue[cmdQueueName];
                if (!q || !q[0]) return next();
                delete lively.shell.commandQueue[cmdQueueName];
                q[0].kill("SIGKILL");
                setTimeout(next, 400);
            },
            function stopRunningServer(next) {
                var cmdString = Strings.format(
                    "lsof -i tcp:%s -a -c ^node -a -c ^Google -t | xargs kill -9 ", port);
                lively.shell.run(cmdString, {group: cmdQueueName}, function(err, cmd) { next(); });
            }
        )(thenDo);

      }
    }

});

clojure.StaticAnalyzer = {

  ensureAst: function(astOrSource) {
    return typeof astOrSource === 'string' ?
      paredit.parse(astOrSource) : astOrSource;
  },

  findFuncCallNode: function(parent, funcName) {
    if (!parent.children) return;
    var found;
    parent.children.detect(function(n) {
      return n.type === 'list' && n.children[0]
          && n.children[0].source === "ns"
          && (found = n);
    });
    return found;
  },

  findNsForm: function(astOrSource) {
    // clojure.StaticAnalyzer.findNsForm(that.textString)
    var ast = this.ensureAst(astOrSource);
    var nsForm = this.findFuncCallNode(ast, 'ns');
    if (!nsForm || !nsForm.children) return null;
    var restNodes = nsForm.children.slice(1);
    // ignore meta data
    while (restNodes[0] && restNodes[0].source === "^") { restNodes.shift(); restNodes.shift(); }
    var nsNameNode = restNodes.detect(function(n) { return n.type === 'symbol'; });
    return nsForm ? {
      nsName: nsNameNode ? nsNameNode.source : null,
      node: nsForm
    } : null;
  },

  nodeAtPoint: function(astOrSource, idx) {
    return paredit.walk.sexpsAt(
      this.ensureAst(astOrSource), idx).last();
  },

  nodeAtCursor: function(aceEd) {
    // convenience for ace
    var idx = aceEd.session.doc.positionToIndex(aceEd.getCursorPosition())
    return this.nodeAtPoint(aceEd.session.$ast||aceEd.getValue(), idx);
  },

  sourceForNodeAtCursor: function(aceEd) {
    // convenience for ace
    var node = this.nodeAtCursor(aceEd);
    if (!node) return "";
    return node.source || aceEd.getValue().slice(node.start,node.end);
  },

  sourceForLastSexpBeforeCursor: function(aceEd) {
    var ast = aceEd.session.$ast;
    var lastSexp = aceEd.session.$ast && paredit.walk.prevSexp(ast, aceEd.getCursorIndex());
    if (!lastSexp) return ""
    var start = lastSexp.start, end = lastSexp.end;
    do {
      var directLeftSpecial = paredit.walk.sexpsAt(ast, start, function(n) {
        return n.type === "special" && n.start < start && n.end === start }).last();
      if (directLeftSpecial) start = directLeftSpecial.start;
    } while(directLeftSpecial);
    return aceEd.getValue().slice(start, end);
  },

  createDefinitionQuery: function(astOrSource, idx, optNsName) {
    var ast = this.ensureAst(astOrSource);
    var thing = this.nodeAtPoint(ast, idx);
    if (!thing || !thing.source) return null;
    var ns = !optNsName && this.findNsForm(ast);
    var nsName = optNsName || (ns && ns.nsName) || "user";
    return {
      nsName: nsName,
      ns: ns,
      node: thing,
      source: thing.source.replace(/^'/,"")
    };
  },

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // completion related
  // -=-=-=-=-=-=-=-=-=-

  buildElementCompletionForm: function(astOrSource, src, idx) {
    if (typeof idx === "undefined") {
      idx = src; src = astOrSource;
    }

    var ast = this.ensureAst(astOrSource);
    var parent = paredit.walk.containingSexpsAt(ast, idx, paredit.walk.hasChildren).last();
    if (!parent.type === "list" || !parent.children.length) return null;

    if (!parent.children[0].source) return null;

    var complFunc = "rksm.system-navigator.completions/instance-elements->json"

    // simple dot completion
    if (parent.children[0].source === ".") {
      var expr = paredit.walk.source(src, parent);
      var offs = -parent.start;
      return expr.slice(0,parent.children[0].start+offs)
            + complFunc
            + expr.slice(parent.children[0].end+offs);
    }

    if (parent.children[0].source.include("->")
     && parent.children.last().source === ".") {
      var expr = paredit.walk.source(src, parent);
      var offs = -parent.start;
      return expr.slice(0,parent.children.last().start+offs)
           + complFunc
           + expr.slice(parent.children.last().end+offs);
    }

    return null
  }
}

clojure.Projects = {

  createProjectInteractively: function(options, thenDo) {
    options = options || {};

    options.setCurrentDir = true;

    var cwd = lively.shell.exec('pwd', {sync:true}).resultString(),
        warnings = [],
        projectDir = options.projectDir,
        baseDir = cwd.replace(/\/$/, "").split("/").slice(0,-1).join("/"),
        projectName, cljNamespaces = [], cljsNamespaces = [];

    lively.lang.fun.composeAsync(
      // determine dir
      chooseDir, function(dir, n) {
        if (!dir) return n(new Error("no project dir choosen"));
        projectDir = dir.replace(/\/$/, "");
        projectName = projectDir.split("/").last();
        n();
      },
      createInitialDirs,
      confirmProjectClj,
      createPojectClj,
      function(n) {
        clojure.Projects.loadProjectInteractively({
          projectDir: projectDir,
          informBrowsers: true,
          askToLoadNamespaces: false,
          setCurrentDir: true
        }, n)
      }
    )(thenDo);

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    function chooseDir(n) {
      if (projectDir) return n(null, projectDir);
      $world.prompt("Please choose a directory for the new project", function(input) {
         n(input ? null : new Error("no project dir choosen"), input);
      }, {
        input: baseDir + "/" + "new-project",
        historyId: "clojure.Projects.createProjectInteractively.projectDir"
      });
    }

    function createInitialDirs(n) {
      var cljNsDir = projectName.replace(/-/g, "_")
      var ns = projectName + ".core";
      var cljDir = lively.lang.string.joinPath(projectDir, "src/" + cljNsDir);

      lively.shell.run('mkdir -p ' + cljDir, {}, function(err, cmd) {
        if (err) return n(err);
        var initialFileContent = "(ns " + ns + ")\n";
        lively.shell.writeFile(
          lively.lang.string.joinPath(cljDir, "core.clj"),
          initialFileContent, function(cmd) { n(); });
      });
    }

    function confirmProjectClj(n) {
        var template = "(defproject %s \"0.1.0-SNAPSHOT\"\n"
        + "  :description \"A new project.\"\n"
        + "  :license \"Eclipse Public License 1.0\"\n"
        + "  :url \"http://my-project.com\"\n"
        + "  :dependencies [[org.clojure/clojure \"1.6.0\"]])\n"
        $world.editPrompt("Initial project.clj", function(input) {
          n(input ? null : new Error("no project cljs choosen"), input);
        }, lively.lang.string.format(template, projectName))
    }

    function createPojectClj(projectCljContent, n) {
      lively.shell.writeFile(
        lively.lang.string.joinPath(projectDir, "project.clj"),
        projectCljContent, function() { n(); });
    }
  },

  loadProjectInteractively: function(options, thenDo) {
    // options: projectDir, askToLoadNamespaces, setCurrentDir, informBrowsers
    options = options || {};

    var cwd = lively.shell.exec('pwd', {sync:true}).resultString(),
        warnings = [],
        projectDir = options.projectDir, cljNamespaces = [], cljsNamespaces = [];

    lively.lang.fun.composeAsync(
      // determine dir
      chooseDir, function(dir, n) {
        if (!dir) return n(new Error("no project dir choosen"));
        projectDir = dir; n();
      }, setCwd,

      // load clojure deps
      loadDependencies,
      showWarnings,

      // load clj
      loadProjectAndFetchNamespaces.curry("clj(x|c)?"),
      chooseNamespacesToRequire.curry("Clojure"),
      clojure.Runtime.requireNamespaces,
      function(nss, _warnings, n) {
        cljNamespaces = nss.map(function(ea) {
          return typeof ea !== "string" && ea && ea.ns ? ea.ns : ea; });
        warnings.pushAll(_warnings);
        showWarnings(n);
      },

      // load cljs
      loadProjectAndFetchNamespaces.curry("cljs"),
      chooseNamespacesToRequire.curry("ClojureScript"),
      requireCljsNamespaces,
      function(nss, n) { cljsNamespaces = nss; showWarnings(n); },

      // update
      updateBrowsers,
      function(n) { n(null, {dir: projectDir, cljsNamespaces: cljsNamespaces, cljNamespaces: cljNamespaces}); }
    )(function(err, loadResult) {
      if (err) updateBrowsers(function() {}); // make sure browsers are updated, even in case of errors
      thenDo(err, loadResult);
    });

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    function chooseDir(n) {
      if (projectDir) return n(null, projectDir);
      lively.ide.CommandLineSearch.interactivelyChooseFileSystemItem(
        'choose directory: ', cwd,
        function(files) { return files.filterByKey('isDirectory'); },
        "clojure.addDir.NarrowingList", [
          function loadClojureNamespaceFiles(_dir) { n(null, _dir ? (_dir.path || _dir) : null); }
        ]);
    }

    function setCwd(n) { if (options.setCurrentDir) lively.shell.setWorkingDirectory(projectDir); n(); }

    function loadDependencies(n) {
      var code = lively.lang.string.format(
        '(clojure.data.json/write-str'
      + ' (rksm.cloxp-projects.core/load-deps-from-project-clj-or-pom-in! "%s"))',
        projectDir);
      Global.clojure.Runtime.doEval(code,
        {requiredNamespaces: ['clojure.data.json', 'rksm.cloxp-projects.core'],
         passError: true, resultIsJSON: true,
         warningsAsErrors: false, onWarning: function(warn) { warnings.push("load dependencies:\n" + warn); }},
        function(err, result) { n(err); });
    }

    function loadProjectAndFetchNamespaces(type, n) {
      // type === "clj" || "cljs"
      var code = lively.lang.string.format(
        '(clojure.data.json/write-str'
      + ' (rksm.system-files/add-project-dir "%s"'
      + '  {:source-dirs (rksm.cloxp-projects.core/source-dirs-in-project-conf "%s")'
      + '   :project-file-match #"\\.%s$"}))',
          projectDir, projectDir, type);
      Global.clojure.Runtime.doEval(code,
        {requiredNamespaces: ['clojure.data.json', 'rksm.system-files', 'rksm.cloxp-projects.core'],
         passError: true, resultIsJSON: true,
         warningsAsErrors: false, onWarning: function(warn) { warnings.push("load project:\n" + warn); }
        }, n);
    }

    function chooseNamespacesToRequire(type, nsList, n) {
      if (!nsList || !nsList.length) return n(null, []);
      if (!options.askToLoadNamespaces) return n(null, nsList);
      $world.editPrompt("What " + type + " namespaces to load?", function(textlistOfNs) {
        if (!textlistOfNs) {
          show("requiring no namespaces for\n" + projectDir);
          n(null, []);
        } else {
          var nss = lively.lang.string.lines(textlistOfNs).invoke("trim").compact();
          n(null, nss);
        }
      }, nsList.sortByKey("length").join("\n"));
    }

    function requireCljsNamespaces(nss, n) {
      var code = nss.map(function(ns) { return "(rksm.cloxp-cljs.analyzer/namespace-info '" + ns + ")"; }).join("\n");
      Global.clojure.Runtime.doEval(code, {
        requireNamespaces: ['rksm.cloxp-cljs.analyzer'],
        passError: true, ns: 'user',
        warningsAsErrors: false,
         onWarning: function(warn) { warnings.push("require cljs " + nss.join(',') + ":\n" + warn); }
        }, function(err) { n(err, nss); });
    }

    function updateBrowsers(n) {
      if (!options.informBrowsers) return n();
      var cljBrowser = $world.withAllSubmorphsDetect(function(ea) {
        return ea.isWindow && ea.targetMorph && ea.targetMorph.name === "ClojureBrowser"; });
      var cljsBrowser = $world.withAllSubmorphsDetect(function(ea) {
        return ea.isWindow && ea.targetMorph && ea.targetMorph.name === "ClojureScriptBrowser"; });
      var updates = [];
      if (cljBrowser) updates.push(function(n) {
          cljBrowser.targetMorph.reload({namespaces: cljNamespaces}, n);
      });
      if (cljsBrowser) updates.push(function(n) {
          cljsBrowser.targetMorph.reload({namespaces: cljsNamespaces}, n);
      });
      lively.lang.fun.waitForAll({timeout: 15*1000}, updates, function(err) { n && n(); });
    }

    function showWarnings(thenDo) {
      if (!warnings.length || !options.showWarningFn) thenDo();
      else {
        options.showWarningFn(warnings.join('\n\n').truncate(600));
        warnings = [];
        setTimeout(thenDo, 3*1000);
      }
    }

  }
}

}) // end of module
