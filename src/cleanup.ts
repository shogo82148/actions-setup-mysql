import * as path from 'path'
import * as starter from './starter'
import * as exec from '@actions/exec'
import * as io from '@actions/io'

export async function shutdownMySQL(state: starter.MySQLState) {
  const shutdown = path.join(__dirname, '..', 'scripts', 'shutdown.sh')
  await exec.exec(shutdown, [`${state.pid}`])
  await io.rmRF(state.baseDir)
}
