import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as child_process from 'child_process'
import * as core from '@actions/core'
import * as io from '@actions/io'
import * as exec from '@actions/exec'

export async function startMySQL(mysqlPath: string) {
  const baseDir = await mkdtemp()
  const sep = path.sep

  // (re)create directory structure
  await io.mkdirP(path.join(baseDir, 'etc'))
  await io.mkdirP(path.join(baseDir, 'var'))
  await io.mkdirP(path.join(baseDir, 'tmp'))

  const myCnf = `
[mysqld]
lc-messages-dir=${mysqlPath}${sep}share
socket=${baseDir}${sep}tmp${sep}mysql.sock
datadir=${baseDir}${sep}var
pid-file=${baseDir}${sep}tmp${sep}mysqld.pid
tmpdir=${baseDir}${sep}tmp
`
  fs.writeFileSync(path.join(baseDir, 'etc', 'my.cnf'), myCnf)

  core.debug('setup MySQL database')
  await exec.exec(path.join(mysqlPath, 'scripts', 'mysql_install_db'), [
    `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
    `--basedir=${mysqlPath}`
  ])

  core.debug('start MySQL database')
  const out = fs.openSync(path.join(baseDir, 'tmp', 'mysqld.log'), 'a')
  const err = fs.openSync(path.join(baseDir, 'tmp', 'mysqld.log'), 'a')
  const subprocess = child_process.spawn(
    path.join(mysqlPath, 'bin', 'mysqld'),
    [`--defaults-file=${baseDir}${sep}etc${sep}my.cnf`, '--user=root'],
    {
      detached: true,
      stdio: ['ignore', out, err]
    }
  )
  subprocess.unref()
}

function mkdtemp(): Promise<string> {
  const tmp = process.env['RUNNER_TEMP'] || os.tmpdir()
  const sep = path.sep
  return new Promise(function (resolve, reject) {
    fs.mkdtemp(`${tmp}${sep}actions-setup-mysql-`, (err, dir) => {
      if (err) {
        reject(err)
        return
      }
      resolve(dir)
    })
  })
}

function sleep(waitSec: number) {
  return new Promise(function (resolve) {
    setTimeout(() => resolve(), waitSec)
  })
}
