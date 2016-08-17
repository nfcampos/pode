#! /usr/bin/env node

require('loud-rejection/register')

const path = require('path')
const repl = require('repl')
const meow = require('meow')
const chalk = require('chalk')
const envPaths = require('env-paths')
const loadPackages = require('trymodule')
const {last, compact, isEqual} = require('lodash')

const {patchRepl} = require('.')

// https://github.com/nodejs/node/blob/master/lib/repl.js#L53
// hack to get relative requires to work as expected
module.filename = path.resolve('repl')

const appPaths = envPaths('pode')

const cli = meow(`
  Usage
    $ pode <module> <module> ...

  Options
    --clear, Clear module cache (not implemented yet)

  Examples
    $ pode babel-require lodash/map
`)

const varName = str => {
  if (str.includes('/'))
    str = last(compact(str.split('/')))

  return str.replace(/\.js$/, '').replace(/-|\.|\//g, '_')
}

function start () {
  return Promise.all(cli.input.map(str => {
    try {
      return [str, require(str)]
    } catch (e) {
      try {
        return [str, require('./' + str)]
      } catch (e) {
        if (e.message.includes('Cannot find module'))
          return loadPackages({ [str]: null }, appPaths.cache)
            .then(([pkg]) => [str, pkg.package])
        else
          throw e
      }
    }
  })).then(packages => {
    const bindings = packages.reduce((b, [str, pkg]) => {
      if (!Object.keys(pkg).length && typeof pkg !== 'function') {
        console.log(chalk.blue(`require('${str}')`))
      } else {
        let onlyDefaultExport = pkg.__esModule
          && isEqual(Object.keys(pkg), ['default'])
        b[varName(str)] = onlyDefaultExport ? pkg.default : pkg
        console.log(chalk.blue(`${varName(str)} = require('${str}')`))
      }
      return b
    }, {})

    patchRepl({appPaths, historyAutocomplete: false, importExport: false})

    const replServer = repl.start({ignoreUndefined: true, useColors: true})

    Object.assign(replServer.context, bindings)
  })
}

if (cli.flags.clear) {
  // TODO: clear the cache
} else {
  start()
}
