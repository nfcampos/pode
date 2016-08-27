// require('babel-register')

const repl = require('repl')
const path = require('path')
const vm = require('vm')

function addHistoryAutocomplete(replServer) {
  const {flatten, compact} = require('lodash')

  let words = []
  const wordRe = /\w{2,}/g
  const boundaryRe = /\W/

  function wordsFromHistory() {
    const matches = replServer.history.map(line => line.match(wordRe))
    words = [...new Set(flatten(compact(matches)))]
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
          // TODO: should the last arg be completeOn, lastWordOfLine, line ?
          callback(null, [completions, completeOn])
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
  const asyncToGen = require('async-to-gen')

  /*
  - allow whitespace before everything else
  - optionally capture `<varname> = `
    - varname only matches if it starts with a-Z or _ or $
      and if contains only those chars or numbers
    - this is overly restrictive but is easier to maintain
  - capture `await <anything that follows it>`
  */
  let re = /^\s*(?:([a-zA-Z_$][0-9a-zA-Z_$]*)\s*=\s*)?(await[\s\S]*)/

  const wrap = (code, binder) => {
    const str = `(async function() {
      let result = (${code.trim()});
      ${binder ? `global.${binder} = result` : 'return result'}
    }())`
    return asyncToGen(str, {
      fastSkip: false, includeHelper: false }).toString().trim()
  }

  const isRecoverableError = (error) => {
    if (error.name === 'SyntaxError') {
      return /^(Unexpected end of input|Unexpected token)/.test(error.message)
    }
    return false
  }

  replServer.context.__async = new Function(
    'return ' + asyncToGen.asyncHelper)()

  replServer.eval = function(originalEval) {
    return function (cmd, context, filename, callback) {
      const match = cmd.match(re)
      if (match) {
        try {
          // wrap() throws if there is a syntax error
          code = wrap(match[2], match[1])
        } catch (e) {
          return callback(isRecoverableError(e) ? new repl.Recoverable(e) : e)
        }

        vm.runInContext(code, vm.createContext(context))
          .then(r => callback(null, r), callback)
      } else {
        return originalEval.call(this, cmd, context, filename, callback)
      }
    }
  }(replServer.eval)
}

function patchRepl({
  appPaths,
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
        addAwaitEval(replServer)
      }

      if (importExport) {
        // add support for import/export
        require('reify/repl')
      }

      if (history) {
        const mkdirp = require('mkdirp')
        const replHistory = require('repl.history')
        // add history
        mkdirp.sync(appPaths.data)
        replHistory(replServer, appPaths.data + '/.history')
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
  patchRepl,
}
