import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

const toolDir = path.join(__dirname, 'runner', 'tools')
const tempDir = path.join(__dirname, 'runner', 'temp')

process.env['RUNNER_TOOL_CACHE'] = toolDir
process.env['RUNNER_TEMP'] = tempDir

import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as installer from '../src/installer'
import * as starter from '../src/starter'
import * as cleanup from '../src/cleanup'

describe('installer tests', async () => {
  beforeAll(async () => {
    await io.rmRF(toolDir)
    await io.rmRF(tempDir)
  }, 100000)

  afterAll(async () => {
    try {
      await io.rmRF(toolDir)
      await io.rmRF(tempDir)
    } catch {
      console.log('Failed to remove test directories')
    }
  }, 100000)

  it('Acquires version of MySQL if no matching version is installed', async () => {
    await installer.getMySQL('mysql', '5.6')
    const mysqlDir = path.join(toolDir, 'mysql', '5.6.50', os.arch())

    expect(fs.existsSync(`${mysqlDir}.complete`)).toBe(true)
    expect(fs.existsSync(path.join(mysqlDir, 'bin', 'mysqld'))).toBe(true)
  }, 1000000)

  it('start and shutdown MySQL 5.6', async () => {
    const mysqlDir = await installer.getMySQL('','mysql-5.6')
    const sep = path.sep
    const state = await starter.startMySQL(mysqlDir)
    await exec.exec(`${mysqlDir}${sep}bin${sep}mysql`, [
      '--host=127.0.0.1',
      '--user=root',
      '--port=3306',
      '-e',
      'select 1'
    ])
    await cleanup.shutdownMySQL(state)
  }, 1000000)

  it('start and shutdown MySQL 5.7', async () => {
    const mysqlDir = await installer.getMySQL('', 'mysql-5.7')
    const sep = path.sep
    const state = await starter.startMySQL(mysqlDir)
    await exec.exec(`${mysqlDir}${sep}bin${sep}mysql`, [
      '--host=127.0.0.1',
      '--user=root',
      '--port=3306',
      '-e',
      'select 1'
    ])
    await cleanup.shutdownMySQL(state)
  }, 1000000)
})
