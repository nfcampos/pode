// require('babel-register')

const repl = require('repl')
const path = require('path')
const vm = require('vm')
const mkdirp = require('mkdirp')
const replHistory = require('repl.history')
const asyncToGen = require('async-to-gen')
const _ = require('lodash')

function addHistoryAutocomplete(replServer) {
  let words = []
  const wordRe = /\w{2,}/g
  const boundaryRe = /\W/

  function wordsFromHistory() {
    const matches = replServer.history.map(line => line.match(wordRe))
    words = [...new Set(_.flatten(_.compact(matches)))]
    return words.sort((a, b) => a.localeCompare(b))
  }

  setImmediate(wordsFromHistory)

  replServer.completer = function (originalCompleter) {
    return function (line, callback) {
      function completeFromHistoryIfEmpty (e, [completions, completeOn]) {
        if (e != null) {
          throw e
        }

        const lastWordOfLine = line.split(boundaryRe).reverse()[0]

        if (!completions.length || !completeOn.includes(lastWordOfLine)) {
          completions = words.filter(w => w.indexOf(lastWordOfLine) === 0)
          callback(null, [completions, lastWordOfLine])

        } else {
          callback(null, [completions, completeOn])

        }
      }

      return originalCompleter.call(this, line, completeFromHistoryIfEmpty)
    }
  }(replServer.completer)

  replServer.eval = function(originalEval) {
    return function (cmd, context, filename, callback) {
      function refreshWords (e) {
        if (e == null) {
          setImmediate(wordsFromHistory)
        }

        return callback.apply(this, arguments)
      }
      return originalEval.call(this, cmd, context, filename, refreshWords)
    }
  }(replServer.eval)
}

function addAwaitEval(replServer) {
  let re = /^(?:\s*(?:(?:let|var|const)\s)?\s*([^=]+)=\s*|^\s*)(await[\s\S]*)/

  let wrap = (code, binder) => {
    const str = `(async function() {
      let result = (${code});
      ${binder ? `global.${binder} = result` : 'return result'}
    }())`
    return asyncToGen(str).toString()
  }

  replServer.eval = function(originalEval) {
    return function (cmd, context, filename, callback) {
      const match = cmd.match(re)
      if (match) {
        try {
          // because of asyncToGen wrap throws if there is a syntax error
          code = wrap(match[2], match[1])
        } catch (e) {
          return callback(isRecoverableError(e) ? new repl.Recoverable(e) : e)
        }
        vm.runInContext(code, context)
          .then(r => {
            callback(null, r)
          }, callback)

      } else {
        return originalEval.call(this, cmd, context, filename, callback)
      }
    }
  }(replServer.eval)
}

function isRecoverableError(error) {
  if (error.name === 'SyntaxError') {
    return /^(Unexpected end of input|Unexpected token)/.test(error.message);
  }
  return false;
}

function patch({
  paths,
  history = true,
  historyAutocomplete = true,
  importExport = true,
  topLevelAwait = true,
}={}) {
  repl.start = function(originalStart) {
    return function() {
      const replServer = originalStart.apply(this, arguments)

      if (topLevelAwait) {
        // add support for top-level await
        topLevelAwait && addAwaitEval(replServer)
      }

      if (importExport) {
        // add support for import/export
        require('reify/repl')
      }

      if (history) {
        // add history
        mkdirp.sync(paths.data)
        replHistory(replServer, paths.data + '/.history')
      }

      if (historyAutocomplete) {
        // add better autocomplete
        addHistoryAutocomplete(replServer)
      }

      return replServer
    }
  }(repl.start)
}

module.exports = {
  addAwaitEval,
  addHistoryAutocomplete,
  patch
}
