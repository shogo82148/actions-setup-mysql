import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as child_process from 'child_process'
import * as core from '@actions/core'
import * as io from '@actions/io'
import * as exec from '@actions/exec'
import * as installer from './installer'

const BASEDIR = 'BASEDIR'
const PID = 'PID'

// extension of executable files
const binExt = os.platform() === 'win32' ? '.exe' : ''

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

export async function startMySQL(mysql: installer.MySQL): Promise<MySQLState> {
  const baseDir = await mkdtemp()
  const sep = path.sep

  core.debug(`basedir: ${baseDir}`)

  // (re)create directory structure
  await io.mkdirP(path.join(baseDir, 'etc'))
  await io.mkdirP(path.join(baseDir, 'var'))
  await io.mkdirP(path.join(baseDir, 'tmp'))

  const myCnf = `
[mysqld]
lc-messages-dir=${mysql.toolPath}${sep}share
socket=${baseDir}${sep}tmp${sep}mysql.sock
datadir=${baseDir}${sep}var
pid-file=${baseDir}${sep}tmp${sep}mysqld.pid
tmpdir=${baseDir}${sep}tmp
`
  core.debug(`writing my.cnf`)
  fs.writeFileSync(path.join(baseDir, 'etc', 'my.cnf'), myCnf)

  await core.group('setup MySQL Database', async () => {
    const help = await verboseHelp(mysql)
    const useMysqldInitialize = help.match(/--initialize-insecure/)
    if (useMysqldInitialize) {
      core.debug(`mysqld has the --initialize-insecure option`)
      await exec.exec(path.join(mysql.toolPath, 'bin', `mysqld${binExt}`), [
        `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
        `--initialize-insecure`
      ])
    } else {
      core.debug(`mysqld doesn't have the --initialize-insecure option`)
      if (os.platform() === 'win32') {
        await exec.exec(
          "perl",
          [
            path.join(mysql.toolPath, 'scripts', 'mysql_install_db.pl'),
            `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
            `--basedir=${mysql.toolPath}`
          ]
        )  
      } else {
        await exec.exec(
          path.join(mysql.toolPath, 'scripts', 'mysql_install_db'),
          [
            `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
            `--basedir=${mysql.toolPath}`
          ]
        )  
      }
    }
  })

  core.info('start MySQL database')
  const out = fs.openSync(path.join(baseDir, 'tmp', 'mysqld.log'), 'a')
  const err = fs.openSync(path.join(baseDir, 'tmp', 'mysqld.log'), 'a')
  const subprocess = child_process.spawn(
    path.join(mysql.toolPath, 'bin', `mysqld${binExt}`),
    [`--defaults-file=${baseDir}${sep}etc${sep}my.cnf`, '--user=root'],
    {
      detached: true,
      stdio: ['ignore', out, err]
    }
  )
  const pid = subprocess.pid

  core.info('wait for MySQL ready')
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
  core.info('MySQL Server started')

  return {
    pid,
    baseDir
  }
}

async function verboseHelp(mysql: installer.MySQL): Promise<string> {
  let myOutput = ''
  const options = {
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        myOutput += data.toString()
      },
      stderr: (data: Buffer) => {
        myOutput += data.toString()
      }
    }
  }
  try {
    await exec.exec(
      path.join(mysql.toolPath, 'bin', `mysqld${binExt}`),
      ['--verbose', `--help`],
      options
    )
  } catch (e) {
    core.error('fail to exec mysqld')
    core.error(myOutput)
    throw e
  }
  return myOutput
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
