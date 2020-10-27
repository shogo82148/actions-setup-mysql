import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as child_process from 'child_process'
import * as core from '@actions/core'
import * as io from '@actions/io'
import * as exec from '@actions/exec'

const BASEDIR = 'BASEDIR'
const PID = 'PID'

export interface MySQLState {
  pid: number
  baseDir: string
}

export function saveState(state: MySQLState) {
  core.saveState(BASEDIR, state.baseDir)
  core.saveState(PID, state.pid)
}

export function getState(): MySQLState | null {
  const baseDir = core.getState(BASEDIR)
  if (!baseDir) {
    return null
  }
  const pid = parseInt(core.getState(PID))
  return {
    pid,
    baseDir
  }
}

export async function startMySQL(mysqlPath: string): Promise<MySQLState> {
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
  const pid = subprocess.pid

  core.debug('wait for MySQL ready')
  for (;;) {
    try {
      fs.statSync(`${baseDir}${sep}tmp${sep}mysqld.pid`)
      break
    } catch {
      await sleep(0.1)
    }
    if (subprocess.exitCode !== null) {
      throw new Error('failed to launch MySQL')
    }
  }
  subprocess.unref()

  return {
    pid,
    baseDir
  }
}

function mkdtemp(): Promise<string> {
  const tmp = os.tmpdir()
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
