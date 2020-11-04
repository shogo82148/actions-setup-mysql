import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as starter from './starter'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'

// extension of executable files
const binExt = os.platform() === 'win32' ? '.exe' : ''
const sep = path.sep

export async function shutdownMySQL(state: starter.MySQLState) {
  core.group('shutdown MySQL Server', async () => {
    await exec.exec(path.join(state.toolPath, 'bin', `mysqladmin${binExt}`), [
      `--defaults-file=${state.baseDir}${sep}etc${sep}my.cnf`,
      `--user=root`,
      `shutdown`
    ])

    core.info('wait for MySQL shutdown')
    for (let i = 0; i < 100; i++) {
      try {
        fs.statSync(state.pidFile)
        await sleep(0.1)
      } catch {
        break
      }
    }

    await io.rmRF(state.baseDir)
  })
}

function sleep(waitSec: number) {
  return new Promise(function (resolve) {
    setTimeout(() => resolve(), waitSec)
  })
}
