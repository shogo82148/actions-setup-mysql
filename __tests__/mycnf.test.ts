import * as mycnf from '../src/mycnf'

describe('parsing my.cnf', () => {
  it('ignores comments', () => {
    expect(mycnf.parse('; this line is comment\n')).toStrictEqual({})
    expect(mycnf.parse('# this line is comment\n')).toStrictEqual({})
  })

  it('parses options', () => {
    expect(mycnf.parse('[group]\nkey\n')).toStrictEqual({
      group: {
        key: ''
      }
    })
    expect(mycnf.parse('[group]\nkey=value\n')).toStrictEqual({
      group: {
        key: 'value'
      }
    })
    expect(mycnf.parse('[group]\nkey= value \n')).toStrictEqual({
      group: {
        key: 'value'
      }
    })
  })

  it('parses escape characters', () => {
    expect(
      mycnf.parse('[group]\nkey=\\n\\r\\t\\b\\s\\"\\\'\\\\\n')
    ).toStrictEqual({
      group: {
        key: '\n\r\t\b "\'\\'
      }
    })
  })

  it('parses quoted options', () => {
    expect(mycnf.parse('[group]\nkey=""\n')).toStrictEqual({
      group: {
        key: ''
      }
    })
    expect(mycnf.parse('[group]\nkey="value"\n')).toStrictEqual({
      group: {
        key: 'value'
      }
    })
    expect(mycnf.parse('[group]\nkey= " \'value\' " \n')).toStrictEqual({
      group: {
        key: " 'value' "
      }
    })
    expect(mycnf.parse("[group]\nkey=''\n")).toStrictEqual({
      group: {
        key: ''
      }
    })
    expect(mycnf.parse("[group]\nkey='value'\n")).toStrictEqual({
      group: {
        key: 'value'
      }
    })
    expect(mycnf.parse('[group]\nkey= \' "value" \' \n')).toStrictEqual({
      group: {
        key: ' "value" '
      }
    })
  })

  it('parses multiple groups', () => {
    const input = `[group1] # first group
    foo = bar
    hoge = fuga
    
    [group2] # second group
    key = value
    `
    expect(mycnf.parse(input)).toStrictEqual({
      group1: {
        foo: 'bar',
        hoge: 'fuga'
      },
      group2: {
        key: 'value'
      }
    })
  })

  it('parses examples', () => {
    // examples from https://dev.mysql.com/doc/refman/8.0/en/option-files.html
    expect(
      mycnf.parse(
        '[group]\nbasedir="C:\\Program Files\\MySQL\\MySQL Server 8.0"'
      )
    ).toStrictEqual({
      group: {
        basedir: 'C:\\Program Files\\MySQL\\MySQL Server 8.0'
      }
    })
    expect(
      mycnf.parse(
        '[group]\nbasedir="C:\\\\Program Files\\\\MySQL\\\\MySQL Server 8.0"'
      )
    ).toStrictEqual({
      group: {
        basedir: 'C:\\Program Files\\MySQL\\MySQL Server 8.0'
      }
    })
    expect(
      mycnf.parse('[group]\nbasedir="C:/Program Files/MySQL/MySQL Server 8.0"')
    ).toStrictEqual({
      group: {
        basedir: 'C:/Program Files/MySQL/MySQL Server 8.0'
      }
    })
    expect(
      mycnf.parse(
        '[group]\nbasedir=C:\\\\Program\\sFiles\\\\MySQL\\\\MySQL\\sServer\\s8.0'
      )
    ).toStrictEqual({
      group: {
        basedir: 'C:\\Program Files\\MySQL\\MySQL Server 8.0'
      }
    })
  })
})

describe('stringify my.cnf', () => {
  it('stringify', () => {
    const ret = mycnf.stringify({
      group1: {
        key: '\n\r\t\b "\'\\'
      }
    })
    expect(ret).toBe('[group1]\nkey="\\n\\r\\t\\b \\"\\\'\\\\"\n')
  })
})
