require('babel-register')

const repl = require('repl')
const vm = require('vm')

const replHistory = require('repl.history')
const asyncToGen = require('async-to-gen')

function addAwaitEval(repl) {
  let re = /^(?:\s*(?:(?:let|var|const)\s)?\s*([^=]+)=\s*|^\s*)(await[\s\S]*)/

  let wrapper = (code, binder) => {
    const str = `(async function() {
      let result = (${code});
      ${binder ? `global.${binder} = result` : 'return result'}
    }())`
    return asyncToGen(str).toString()
  }

  repl.eval = function(evalEverythingElse) {
    return function (cmd, context, filename, callback) {
      const match = cmd.match(re)
      if (match)
        vm.runInContext(wrapper(match[2], match[1]), context)
          .then(r => callback(null, r), callback)
      else
        return evalEverythingElse(cmd, context, filename, callback)
    }
  }(repl.eval)
}

function start() {
  const replServer = repl.start({useColors: true})
  // add history
  replHistory(replServer, process.env.HOME + '/.node_history')
  // add parsing of await expressions
  addAwaitEval(replServer)
}

start()
