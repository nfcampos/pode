#! /usr/bin/env node

const repl = require('repl')
const meow = require('meow')
const chalk = require('chalk')
const envPaths = require('env-paths')
const loadPackages = require('trymodule')

const {patch} = require('.')

const paths = envPaths('pode')

const cli = meow(`
  Usage
    $ pode <module> <module> ...

  Options
    --clear, Clear module cache

  Examples
    $ pode babel-require lodash.map
`)

const makeVariableFriendly = str => str.replace(/-|\.|\//g, '_')

function start () {
  const packages = cli.input.map(str => {
    const pkg = {}
    if (str.includes('.')) {
      const [pkgName, importName] = str.split('.')
      pkg.require = pkgName
      pkg.import = importName
    } else {
      pkg.require = str
    }

    return pkg
  })

  return Promise.all(packages.map(p => {
    try {
      return [p, require(p.require)]
    } catch (e) {
      return loadPackages({ [p.require]: null }, paths.cache)
        .then(([package]) => [p, package])
    }
  })).then(packages => {
    const bindings = packages.reduce((b, [p, package]) => {
      if (p.import) {
        b[p.import] = package[p.import]
        console.log(chalk.blue(
          `${p.import} = require('${p.require}').${p.import}`))
      } else {
        b[makeVariableFriendly(p.require)] = package
        console.log(chalk.blue(
          `${makeVariableFriendly(p.require)} = require('${p.require}')`))
      }
      return b
    }, {})

    patch({paths})
    const replServer = repl.start()

    Object.assign(replServer.context, bindings)
  })
}

if (cli.flags.clear) {
  // clear the cache
} else {
  start()
}
