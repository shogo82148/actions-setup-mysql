import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as exec from '@actions/exec';

export async function startMySQL(mysqlPath: string) {
  const baseDir = await mkdtemp()
  const sep = path.sep

  // (re)create directory structure
  io.mkdirP(path.join(baseDir, "etc"))
  io.mkdirP(path.join(baseDir, "var"))
  io.mkdirP(path.join(baseDir, "tmp"))

  const myCnf = `
[mysqld]
socket=${baseDir}${sep}tmp${sep}mysql.sock
datadir=${baseDir}${sep}var
pid-file=${baseDir}${sep}tmp${sep}mysqld.pid
tmpdir=${baseDir}${sep}tmp
`
  fs.writeFileSync(path.join(baseDir, "etc", "my.cnf"), myCnf)

  core.debug('setup MySQL database');
  await exec.exec(path.join(mysqlPath, "mysql_install_db"), [`--basedir=${baseDir}`])
}

function mkdtemp(): Promise<string> {
  const tmp = process.env['RUNNER_TEMP'] || os.tmpdir()
  const sep = path.sep
  return new Promise(function (resolve, reject) {
    fs.mkdtemp(`${tmp}${sep}`, (err, dir) => {
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
