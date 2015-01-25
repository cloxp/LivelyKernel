module('clojure.SystemNotifier').requires().toRun(function() {

Object.extend(clojure.SystemNotifier, {
  
  informCodeEditorsAboutCapturedState: function(capturedStates) {
    lively.ide.allCodeEditors().forEach(function(editor) {
      var ed = editor.aceEditor;
      if (editor.onClojureCaptureStateUpdate) {
        editor.onClojureCaptureStateUpdate(capturedStates);
        return;
      }
      var mode = ed && ed.session.getMode();
      if (!mode || mode.$id !== "ace/mode/clojure") return;
      mode.onCaptureStateUpdate(ed, capturedStates);
    });
  }

});

}) // end of module
