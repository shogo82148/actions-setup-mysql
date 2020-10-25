import * as io from '@actions/io'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

const toolDir = path.join(__dirname, 'runner', 'tools')
const tempDir = path.join(__dirname, 'runner', 'temp')

process.env['RUNNER_TOOL_CACHE'] = toolDir
process.env['RUNNER_TEMP'] = tempDir
import * as installer from '../src/installer'
import * as starter from '../src/starter'

describe('installer tests', () => {
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
    await installer.getMySQL('5.6')
    const mysqlDir = path.join(toolDir, 'mysql', '5.6.50', os.arch())

    expect(fs.existsSync(`${mysqlDir}.complete`)).toBe(true)
    expect(fs.existsSync(path.join(mysqlDir, 'bin', 'mysqld'))).toBe(true)
  }, 1000000)

  it('start and shutdown MySQL', async () => {
    const mysqlDir = await installer.getMySQL('5.6')
    await starter.startMySQL(mysqlDir)
  }, 1000000)
})
