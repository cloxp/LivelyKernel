/*global Buffer, module, require, setTimeout*/

var debug = false;
var exec  = require("child_process").exec;
var async = require("async");
var path  = require("path");
var util  = require("util");
var fs    = require("fs");
var nreplClient = require("nrepl-client");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

/*

require("./ClojureServer").clientConnectionState["7888"].lsSessions(function(err, sessions) { console.log(JSON.stringify(sessions)); })

delete require.cache[require.resolve("nrepl-client")]
var ports = require("./ClojureServer").clientConnectionState
Object.keys(ports).forEach(function(port) { ports[port] && ports[port].end(); });
delete require("./ClojureServer").clientConnectionState;

con.interrupt("36B0531A-DDA0-4498-85A8-A7E414BD2B90", function() { console.log(arguments); })
con.interrupt(undefined, function() { console.log(arguments); })
con.address()
con.end()


Strings.newUUID()
con.eval("E1599EDF-2B44-4E4A-BB31-EB00D8F04AE6", "(+ 2 3)", function(err, result) { console.log(err || result); })
con.eval("", function(err, result) { console.log(err || result); })
Global.nreplConnection = con;

b=require("/home/lively/clojure-om/node-nrepl-client/node_modules/bencode")
b.
*/

var clientConnectionState = module.exports.clientConnectionState || {};

function ensureNreplConnection(options, thenDo) {
    options = options || {};
    var port = options.port || 7888,
        host = options.host || "0.0.0.0",
        name = host + ":" + port;

    if (clientConnectionState[name]) {
        thenDo(null, clientConnectionState[name]);
        return;
    }

    debug && console.log("ClojureServer has no nREPL connection yet. Looking for nREPL server");
    async.waterfall([
        function(next) {
            var nreplOpts = {host: host, port: port, verbose: debug};
            var c = clientConnectionState[name] = nreplClient.connect(nreplOpts);
            c.on("error", function(err) { next(err); });
            c.once("connect", function() { next(null, c); });
            c.once("close", function() { clientConnectionState[name] = null; });
        }
    ], function(err, con) {
        if (err) console.error("Error in ensureNreplConnection: ", err);
        thenDo(err, con);
    });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// Lively2Lively clojure interface
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function l2lAnswer(conn, msg, more, data) {
    conn.send({expectMoreResponses: more,
        action: msg.action + 'Result',
        inResponseTo: msg.messageId, data: data});
}

function l2lActionWithNREPLConnection(l2lConnection, msg, nreplConFunc) {
    var nreplOptions = msg.data.nreplOptions || {};
    async.waterfall(
        [ensureNreplConnection.bind(null, nreplOptions), nreplConFunc],
        function(err, result) {
            var data = err ? {error: String(err)} : result;
            l2lAnswer(l2lConnection, msg, false, data);
        });
}

var services = require("./LivelyServices").services;

util._extend(services, {

    clojureClone: function(sessionServer, c, msg) {
        l2lActionWithNREPLConnection(c, msg, function(con, whenDone) { con.clone(msg.data.session, whenDone); });
    },

    clojureClose: function(sessionServer, c, msg) {
        l2lActionWithNREPLConnection(c, msg, function(con, whenDone) { con.close(msg.data.session, whenDone); });
    },

    clojureDescribe: function(sessionServer, c, msg) {
        l2lActionWithNREPLConnection(c, msg, function(con, whenDone) { con.describe(msg.data.session, msg.data.verbose, whenDone); });
    },

    clojureEval: function(sessionServer, c, msg) {

        var nreplMessage;
        if (!!msg.data["file-content"]) {
          nreplMessage = {
            op: 'load-file',
            "file": msg.data["file-content"],
            "file-name": msg.data["file-name"],
            "file-path": msg.data["file-path"]
          };
        } else {
          nreplMessage = {
            op: msg.data.evalOp || 'eval',
            code: msg.data.code,
            ns: msg.data.ns || 'user',
            session: msg.data.session,
            id: undefined,
            "eval": undefined,
            "required-ns": msg.data["required-ns"],
            bindings: msg.data.bindings,
            pp: msg.data.pp,
            "pp-level": msg.data["pp-level"]
          }
        }

        msg.data.nreplMessage = nreplMessage;
        services.nreplSend(sessionServer, c, msg);
    },

    nreplSend: function(sessionServer, c, msg) {
        var nreplMessage = msg.data.nreplMessage;
        var session = msg.data.session;
        var ignoreMissingSession = msg.data.ignoreMissingSession;
        var sendResult, nreplCon;

        addManualLogMessage(nreplMessage);

        async.waterfall([
            function(next) {
                l2lActionWithNREPLConnection(c, msg, function(_nreplCon, _sendResult) {
                    nreplCon = _nreplCon; sendResult = _sendResult;
                    next(null);
                });
            },
            function findSession(next) {
                if (!session || nreplCon.sessions.indexOf(session) > -1) next(null, nreplCon.sessions);
                else nreplCon.lsSessions(function(err, result) {
                    if (err) next(err, null);
                    else next(null, (result && result[0] && result[0].sessions) || []);
                });
            },
            function testIfSessionIsAvailable(sessions, next) {
                if (!session || sessions.indexOf(session) > -1) next(null);
                else if (ignoreMissingSession) { session = null; next(null); }
                else next(new Error("No session " + session));
            },

            function createSessionIfNeeded(next) {
                if (session) return next(null);
                nreplCon.clone(function(err, msg) {
                    if (err || !msg[0]['new-session']) next(err || new Error("Could not create new nREPL session"));
                    else { session = msg[0]['new-session']; next(null); }
                });
            },

            function send(next) {
              var evalMsg = nreplCon.send(nreplMessage),
                  id = evalMsg.id,
                  messageSequenceListenerName = "messageSequence-" + evalMsg.id;
                l2lAnswer(c, msg, true, {"eval-id": evalMsg.id, session: session});
                nreplCon.messageStream.once("error", onError);
                nreplCon.messageStream.on(messageSequenceListenerName, onMessageSequence);
                // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

                function cleanup() {
                    nreplCon.messageStream.removeListener(messageSequenceListenerName, onMessageSequence);
                    delete nreplCon.messageStream._events[messageSequenceListenerName];
                    nreplCon.messageStream.removeListener("error", onError);
                }

                function onMessageSequence(messages) {
                    var done = util.isArray(messages) && messages.any(function(msg) {
                        return msg.status && msg.status.indexOf("done") > -1; });
                    if (!done) l2lAnswer(c, msg, true, messages);
                    else { cleanup(); next(null, messages); }
                }
                function onError(err) {
                  cleanup(); nreplCon.end(); next(err, null); }
            }
        ], function(err, result) {
            if (err) console.error("Error in clojureEval l2l handler: ", err);
            if (!sendResult) sendResult = function(err, result) {
                l2lAnswer(c, msg, false, err ? {error: String(err)} : result); };
            sendResult(err, result);
        });
    },

    clojureEvalInterrupt: function(sessionServer, c, msg) {
        debug && console.log("Clojure interrupt: ", msg.data['eval-id']);
        l2lActionWithNREPLConnection(c, msg, function(con, whenDone) {
            con.interrupt(msg.data.session, msg.data['eval-id'], whenDone);
        });
    },

    clojureLoadFile: function(sessionServer, c, msg) {
      services.clojureEval(sessionServer, c, msg);
    },

    clojureLsSessions: function(sessionServer, c, msg) {
        l2lActionWithNREPLConnection(c, msg, function(con, whenDone) { con.lsSessions(whenDone); });
    },

    clojureStdin: function(sessionServer, c, msg) { l2lAnswer(c, msg, false, {"error": "clojureStdin not yet implemented"}); },
    
    nreplLogStartReading: function(sessionServer, c, msg) {
      addLogConsumer(c.id, function(data, expectMore) { l2lAnswer(c, msg, expectMore, data); })
      // when l2l ends:
      c.once("close", function() { removeLogConsumer(c.id); });
      // when nrepl ends:
      l2lActionWithNREPLConnection(c, msg, function(nreplCon) {
        nreplCon.once("end", function() {
          removeLogConsumer(c.id); 
          l2lAnswer(c, msg, false, {status: "nrepl connection closed"});
        });
      });
    },
    
    nreplLogStopReading: function(sessionServer, c, msg) {
      removeLogConsumer(c.id);      
      l2lAnswer(c, msg, false, {status: "OK"});
    }
});


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// logging
// -=-=-=-=-
var howManyMessagesToKeep = 100;
var logQueue = [];
nreplClient.log.currentLogger = {
  log: function(response, length) {
    if (logQueue.length > howManyMessagesToKeep) logQueue.shift();
    logQueue.push({
      time: Date.now(),
      message: nreplClient.log.messageLogPrinter(response, length),
      length: length
    });
  }
}

function readAndClearLog(nMsgs, tail) {
  var n = nMsgs || howManyMessagesToKeep;
  var tail = typeof tail === "undefined" || tail;
  
  var data = n === howManyMessagesToKeep ?
    logQueue : (tail ? logQueue.slice(-n) : logQueue.slice(0, n));
  logQueue = [];
  return data;  
}

var logConsumers = {};
var readLogProcess = 0;
function removeLogConsumer(id) {
  if (!logConsumers[id]);
  try {
    logConsumers[id]([], false);
  } catch (e) {}
  delete logConsumers[id];
}

function addLogConsumer(id, consumer) {
  if (logConsumers[id]) {
    debug && console.log("nrepl log consumer %s already exists", id);
    return;
  }
  logConsumers[id] = consumer;
  ensureReadProcess();
}

function ensureReadProcess() {
  if (!readLogProcess) readLogContinuously();
  
  function readLogContinuously() {
    var data = readAndClearLog();
    readLogProcess = setTimeout(readLogContinuously, 1000);
    if (!data || !data.length) return;
    Object.keys(logConsumers).forEach(function(id) {
      var cons = logConsumers[id];
      try {
        cons(data, true);
      } catch(e) {
        console.error("Error calling nrepl log consumer: ", e);
      }
    });
  }
}

function addManualLogMessage(message) {
  if (!readLogProcess) return;
  logQueue.push({
    time: Date.now(),
    message: message
  });
}
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// HTTP
// -=-=-

module.exports = function(route, app) {

    app.post(route + "reset", function(req, res) {
        var ports = clientConnectionState.ports || {};
        Object.keys(ports).forEach(function(hostname) {
            ports[hostname].end();
            ports[hostname] = null;
        });
        delete require.cache[require.resolve("nrepl-client")];
        res.end("OK");
    });

    app.get(route+"log", function(req, res) {
      var q = require("url").parse(req.url, true).query,
          n = q.n || howManyMessagesToKeep,
          tail = q.hasOwnProperty("tail") ? q.tail : true;
      res.json(readAndClearLog(n, tail));
    });

    app.get(route, function(req, res) {
        res.end("ClojureServer is running!");
    });
}

module.exports.clientConnectionState = clientConnectionState;
module.exports.ensureNreplConnection = ensureNreplConnection;
