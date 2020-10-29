import * as path from 'path'
import * as starter from './starter'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'

export async function shutdownMySQL(state: starter.MySQLState) {
  core.group('shutdown MySQL Server', async () => {
    const shutdown = path.join(__dirname, '..', 'scripts', 'shutdown.sh')
    await exec.exec(shutdown, [`${state.pid}`])
    await io.rmRF(state.baseDir)  
  })
}
