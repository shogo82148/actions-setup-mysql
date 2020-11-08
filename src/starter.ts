import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as child_process from 'child_process'
import * as core from '@actions/core'
import * as io from '@actions/io'
import * as exec from '@actions/exec'
import * as installer from './installer'
import * as mycnf from './mycnf'

const BASEDIR = 'BASEDIR'
const PID = 'PID'
const PID_FILE = 'PID_FILE'
const TOOLPATH = 'TOOLPATH'

// extension of executable files
const binExt = os.platform() === 'win32' ? '.exe' : ''

export interface MySQLState {
  pid: number
  pidFile: string
  baseDir: string
  toolPath: string
}

export function saveState(state: MySQLState) {
  core.saveState(BASEDIR, state.baseDir)
  core.saveState(PID, state.pid)
  core.saveState(PID_FILE, state.pidFile)
  core.saveState(TOOLPATH, state.toolPath)
}

export function getState(): MySQLState | null {
  const baseDir = core.getState(BASEDIR)
  if (!baseDir) {
    return null
  }
  const pid = parseInt(core.getState(PID))
  const pidFile = core.getState(PID_FILE)
  const toolPath = core.getState(TOOLPATH)
  return {
    pid,
    pidFile,
    baseDir,
    toolPath
  }
}

export async function startMySQL(
  mysql: installer.MySQL,
  cnf: string
): Promise<MySQLState> {
  const baseDir = await mkdtemp()
  const sep = path.sep

  const config = mycnf.parse(`[mysqld]\n${cnf}`)
  config['mysqld'] ||= {}
  const pidFile =
    config['mysqld']['pid-file'] || path.join(baseDir, 'tmp', 'mysqld.pid')
  config['mysqld']['lc-messages-dir'] ||= path.join(mysql.toolPath, 'share')
  config['mysqld']['socket'] ||= path.join(baseDir, 'tmp', 'mysql.sock')
  config['mysqld']['datadir'] ||= path.join(baseDir, 'var')
  config['mysqld']['pid-file'] = pidFile
  config['mysqld']['tmpdir'] ||= path.join(baseDir, 'tmp')

  await core.group('setup MySQL Database', async () => {
    core.debug(`basedir: ${baseDir}`)

    // (re)create directory structure
    await io.mkdirP(path.join(baseDir, 'etc'))
    await io.mkdirP(path.join(baseDir, 'var'))
    await io.mkdirP(path.join(baseDir, 'tmp'))

    // configure my.cnf
    core.debug(`writing my.cnf`)
    fs.writeFileSync(
      path.join(baseDir, 'etc', 'my.cnf'),
      mycnf.stringify(config)
    )

    const help = await verboseHelp(mysql)
    const useMysqldInitialize = help.match(/--initialize-insecure/)
    if (
      fs.existsSync(path.join(mysql.toolPath, 'bin', 'mariadb-install-db.exe'))
    ) {
      // MariaDB on Windows has mariadb-install-db.exe utility
      // that is the Windows equivalent of mysql_install_db.
      // https://mariadb.com/kb/en/mysql_install_dbexe/
      await exec.exec(
        path.join(mysql.toolPath, 'bin', 'mariadb-install-db.exe'),
        [`--datadir=${baseDir}${sep}var`]
      )
    } else if (useMysqldInitialize) {
      // `mysql_install_db` command is obsoleted MySQL 5.7.6 or later and
      // `mysqld --initialize-insecure` should be used.
      core.debug(`mysqld has the --initialize-insecure option`)
      await exec.exec(path.join(mysql.toolPath, 'bin', `mysqld${binExt}`), [
        `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
        `--initialize-insecure`
      ])
    } else {
      core.debug(`mysqld doesn't have the --initialize-insecure option`)
      if (
        fs.existsSync(
          path.join(mysql.toolPath, 'scripts', 'mysql_install_db.pl')
        )
      ) {
        // MySQL on Windows has .pl file extension
        await exec.exec('perl', [
          path.join(mysql.toolPath, 'scripts', 'mysql_install_db.pl'),
          `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
          `--basedir=${mysql.toolPath}`
        ])
      } else if (
        fs.existsSync(path.join(mysql.toolPath, 'scripts', 'mysql_install_db'))
      ) {
        // MySQL on Linux and macOS
        const args = [
          `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
          `--basedir=${mysql.toolPath}`
        ]
        const help = await installDbHelp(mysql)
        if (help.match(/--auth-root-authentication-method/)) {
          // in MariaDB until 10.3, mysql_install_db has --auth-root-authentication-method option.
          // and until 10.4, its default value changes from "normal" to "socket".
          // With "socket" option, mysqld accepts only unix socket, and rejects TCP protocol.
          // ref. https://mariadb.com/kb/en/authentication-from-mariadb-104/
          // We set "normal" to revert to the previous authentication method.
          args.push('--auth-root-authentication-method=normal')
        }
        await exec.exec(
          path.join(mysql.toolPath, 'scripts', 'mysql_install_db'),
          args
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
      fs.statSync(pidFile)
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
    pidFile,
    baseDir,
    toolPath: mysql.toolPath
  }
}

// execute "mysqld --verbose --help" and returns its result.
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

// execute "mysql_install_db --help" and return its result
async function installDbHelp(mysql: installer.MySQL): Promise<string> {
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
      path.join(mysql.toolPath, 'scripts', 'mysql_install_db'),
      ['--help'],
      options
    )
  } catch (e) {
    core.error('mysql_install_db')
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
