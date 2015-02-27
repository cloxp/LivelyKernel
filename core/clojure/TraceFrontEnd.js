module('clojure.TraceFrontEnd').requires('clojure.SystemNotifier').toRun(function() {

// Using the rksm.cloxp-trace clojure package

Object.extend(clojure.TraceFrontEnd, {

  state: clojure.TraceFrontEnd.state || {lastUpdate: 0, updateTimeout: 2000, captureUpdateProc: null},

  ensureUpdateProc: function() {
    // clojure.Runtime.evalQueue
    clojure.TraceFrontEnd.state
    // self=clojure.TraceFrontEnd
    // clojure.TraceFrontEnd.ensureUpdateProc();
    // clojure.TraceFrontEnd.stopUpdateProc();
    var self = this;
    if (self.state.captureUpdateProc) return;
    self.state.captureUpdateProc = setTimeout(function() {
      self.retrieveCapturesAndInformEditors({}, function(err, captures) {
        self.state.lastUpdate = Date.now();
        delete self.state.captureUpdateProc;
        if (err) show("Error in retrieveCaptures: \n" + err)
        if (!err && captures.length) self.ensureUpdateProc();
      });
    }, self.state.updateTimeout);
  },

  stopUpdateProc: function() {
    if (this.state.captureUpdateProc) {
      clearTimeout(this.state.captureUpdateProc);
      delete this.state.captureUpdateProc;
    }
  },

  updateEarly: function(force) {
    var self = this;
    if (!force && !self.state.captureUpdateProc) return;
    self.state.lastUpdate = 0;
    lively.lang.fun.debounceNamed("clojure.TraceFrontEndUpdateCapture", 300, function() {
      self.retrieveCapturesAndInformEditors({}, function(err) {
        if (err) show("Error in retrieveCaptures: \n" + err);
      });
    })();
  },

  createCaptureOverview: function(thenDo) {
    clojure.TraceFrontEnd.ensureUpdateProc();
    var ed = $morph(/clojure-captures/) || $world.addActionText(
      [],
      {extent: pt(620, 280), title: "active captures", name: "clojure-captures"});

    ed.setInputAllowed(false);
    ed.addScript(function onClojureCaptureStateUpdate(captures) {
      this.captures = captures;
      this.update();
    });
    ed.addScript(function update(err) {
      if (err) { this.setAttributedText([["Error: " + err]]); return; }

      var self = this;
      var attr = [
        ["[uninstall all]", {type: 'action', onClick: uninstall.curry(self.captures.pluck("id"))}],
        ["\n"]
      ].concat(this.captures.reduce(function(attr, c) {
        var n = c.ns + "/" + c.name;
        var val = (c['last-val'] || "no value").truncate(60);
        return attr.concat([
          ["[x]", {type: 'action', onClick: uninstall.curry([c.id])}],
          ["[∅]", {type: 'action', onClick: empty.curry([c.id])}],
          ["[show] ", {type: 'action', capture: c, onClick: inspect.curry(c.id)}],
          [n + ": " + val + " "],
          ["\n"]]);
      }, []));
      this.setAttributedText(attr);
      function uninstall(ids) {
        lively.lang.arr.mapAsyncSeries(ids,
          function(ea, _, n) { clojure.TraceFrontEnd.uninstallCapture(ea, n); },
          function(err) {
            self.setStatusMessage(err ? "Error uninstalling capture" + err.stack :
              "Uninstalled " + ids.join(", ")); });
      }
      function empty(id) {
        clojure.TraceFrontEnd.emptyCapture(id, function(err) {
            self.setStatusMessage(err ? "Error emptying capture" + err.stack : "Emptied " + id); });
      }

      function inspect(id) {
        var cmd = lively.ide.codeeditor.modes.Clojure.commands.detect(function(ea) {
          return ea.name === "clojureCaptureInspectOne"; })
        cmd.exec(self.aceEditor, {id: id, all: true});
      }
    });

    ed.addScript(function onFocus() { clojure.TraceFrontEnd.updateEarly(true); });

    return ed;
  },

  showEditorMenuForCapture: function(codeEditor, captureId) {
    var ed = codeEditor.aceEditor;
    lively.morphic.Menu.openAtHand(null, [
      ["inspect last value", function() { lively.ide.commands.exec("clojureCaptureInspectOne", {id: captureId}); }],
      ["inspect all values", function() { lively.ide.commands.exec("clojureCaptureInspectOne", {id: captureId, all: true}); }],
      ["empty",              function() { clojure.TraceFrontEnd.emptyCapture(captureId, function() {}); }],
      ["uninstall",          function() { clojure.TraceFrontEnd.uninstallCapture(captureId, function() {}); }],
      {isMenuItem: true, isDivider: true},
      ["show all captures",  function() { lively.ide.commands.exec("clojureCaptureShowAll", {}); }]
    ]);
  },

  retrieveCapturesAndInformEditors: function(options, thenDo) {
    lively.lang.fun.composeAsync(
      this.retrieveCaptures.bind(this, options),
      function(captures, n) {
        clojure.SystemNotifier.informCodeEditorsAboutCapturedState(captures);
        n(null, captures);
      }
    )(thenDo);
  },

  filterCapturesForEditor: function(codeEditor, captures) {
    // module('lively.ide.codeeditor.TextOverlay').load()
    var ed = codeEditor.aceEditor;
    var ns = clojure.Runtime.detectNs(codeEditor) || "user";
    return captures.filter(function(c) {
      if (c.ns !== ns) return null;
      if (c.type === "defmethod") {
        var matches = c["defmethod-matches"];
        var found = ed.session.$ast.children.detect(function(ea) {
          if (paredit.defName(ea) !== c.name) return false;
          return ea.children.slice(2, 2+matches.length).every(function(expr, i) {
            return new RegExp(matches[i]).test(expr.source || ""); });
        });
      } else {
        var found = ed.session.$ast.children.detect(function(ea) {
          return paredit.defName(ea) === c.name; });
      }
      if (!found) return null;
      var acePos = clojure.TraceFrontEnd.SourceMapper.mapClojurePosToAcePos(c.pos)
      acePos.row += ed.idxToPos(found.start).row;
      c.acePos = acePos;
      c.string = c['last-val'].truncate(70);
      return c;
    }).compact();
  },

  retrieveCaptures: function(options, thenDo) {
    options = options || {};
    var lastEval = clojure.TraceFrontEnd.state.lastEval;

    lively.lang.fun.composeAsync(
      removeExistingEvals,
      scheduleRetrieval
    )(thenDo);

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    function removeExistingEvals(n) {

      var evals = clojure.Runtime.evalQueue
        .filter(function(ea) { return ea.expr.startsWith("(rksm.cloxp-trace/captures->json"); })
        .groupByKey("isRunning");
        clojure.Runtime.evalQueue = clojure.Runtime.evalQueue.withoutAll(evals["false"] || []);

      if (!evals["true"] || evals["true"].length) n();
      else evals["true"]
        .mapAsyncSeries(function(ea, _, n) {
          clojure.Runtime.evalInterrupt(ea.env, function(err) { n(); });
        }, function(err) { n(); })
    }

    function scheduleRetrieval(n) {
      var nextOnce = lively.lang.fun.once(n);
      setTimeout(function() { nextOnce(new Error("rksm.cloxp-trace/captures->json timed out")); }, 1000);
      clojure.Runtime.doEval(
        lively.lang.string.format("(rksm.cloxp-trace/captures->json :nss %s)",
          options.namespaces ? lively.lang.string.print(options.namespaces) : ":all"),
        {resultIsJSON: true, passError: true}, nextOnce);
    }
  },

  inspectCapturesValuesWithId: function(options, thenDo) {
    var code = lively.lang.string.format('(-> (rksm.cloxp-trace/captures) (get "%s") %s)',
      options.id, options.all ? "" : "first");
    clojure.Runtime.doEval(code, {prettyPrint: true}, thenDo)
  },

  uninstallCapture: function(id, thenDo) {
    var self = this;
    clojure.Runtime.doEval(
      lively.lang.string.format("(rksm.cloxp-trace/uninstall-capture! \"%s\")", id),
      {resultIsJSON: false, passError: true}, function(err) {
        self. updateEarly(true);
        thenDo && thenDo(err);
      });
  },

  emptyCapture: function(id, thenDo) {
    var self = this;
    clojure.Runtime.doEval(
      lively.lang.string.format("(rksm.cloxp-trace/empty-capture! \"%s\")",
        id),
      {resultIsJSON: false, passError: true}, function(err) {
        self. updateEarly(true);
        thenDo && thenDo(err);
      });
  }

});


// maps source indexes to ast nodes / ast indexes
// Currently this is solely done on the clojure side to be able to deal with
// reader expansion
clojure.TraceFrontEnd.SourceMapper = {

  astIdxToSourceIdx: function(node, i) {
    // 3. Find the ast index (linear, prewalk enumeration) of targetNode
    var idx = 0;
    var found = lively.lang.tree.detect(node,
      function(n) { if (idx === i) return true; idx++; return false; },
      function(n) {
        // ignore [] and {} for now
        return n.type === 'list' && ['(', '[', '{'].include(n.open) && n.children;
      });
    return found ? found.start : undefined;
  },
  
  findSelectedNode: function(ast, pos, endPos) {
    // given a start and end position in the source used to produce ast, find
    // the s-expression that is selected (contained by the range) of start and end
    // pos

    // 1. Find the parent list
    var parents = paredit.walk.containingSexpsAt(ast, pos);
    var parent = parents.last();

    if (!parent) return undefined;
    // 2. Find the child node right of pos
    var targetNode = parent.children.detect(function(ea) { return pos <= ea.start; });
    if (!targetNode || (endPos !== undefined) && endPos < targetNode.end) return undefined;
    
    if (parent.type === "toplevel") return {idx: 0, node: targetNode, topLevelNode: parent};

    // 3.1 Find if the code can be traced...
    var unsupported = lively.lang.tree.detect(
      ast.type === "toplevel" ? parents[1] : ast,
      function(n) { return n.source === "#"; }, childGetter)
    if (unsupported) {
      return {error: "currently cannot trace code with reader expressions, sorry!"};
    }

    // 3.2 Find the ast index (linear, prewalk enumeration) of targetNode
    var idx = 0;
    var found = lively.lang.tree.detect(ast.type === "toplevel" ? parents[1] : ast,
      function(n) {
        if (targetNode === n) return true;
        idx++;
        if (n.source === "@") idx++; // counts as [1 @x] [2 clojure.core/deref] [3 x]
        return false;
      }, childGetter);

    return found ? {
      idx: idx, node: targetNode,
      topLevelNode: ast.type === "toplevel" ? parents[1] : ast
    } : undefined;
    
    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    
    function childGetter(n) {
      // ignore [] and {} for now
      return n.type === 'list' && ['(', '[', '{'].include(n.open) && n.children;
    }
  },

  printEnumeratedNodes: function(ast, src) {
    var idx = 0;
    return lively.lang.tree.map(ast,
      function(n) { idx++; return (idx-1) + ": " + src.slice(n.start,n.end); },
      function(n) {
        // ignore [] and {} for now
        return n.type === 'list' && ['(', '[', '{'].include(n.open) && n.children;
      });
  },

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  installTraceCode: function(ast, src, pos, posEnd) {
    var sel = this.findSelectedNode(ast, pos, posEnd);
    if (!sel) return null;
    if (sel.error) return sel;
    return lively.lang.obj.merge(sel, {
      topLevelSource: src.slice(sel.topLevelNode.start, sel.topLevelNode.end),
      annotatedSource: src.slice(sel.topLevelNode.start, sel.node.start)
        + "->" + src.slice(sel.node.start, sel.topLevelNode.end)
    });
  },

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  mapClojurePosToAcePos: function(pos) {
    return {column: pos.column-1, row: pos.line-1};
  },

  mapClojurePosToAceRange: function(pos) {
    var start = {column: pos.column-1, row: pos.line-1};
    
    var end = {
      column: pos.hasOwnProperty("end-column") ? pos["end-column"]-1 : start.column,
      row: pos.hasOwnProperty("end-line") ? pos["end-line"]-1 : start.row};
      
    return ace.require("ace/range").Range.fromPoints(start, end);
  }

}


}) // end of module
