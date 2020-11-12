# actions-setup-mysql

This action sets by MySQL database for use in actions by:

- optionally downloading and caching a version of MySQL
- start mysqld

## Motivation

- GitHub-Hosted Runners have MySQL Server, but only Linux.
- GitHub Actions supports Docker services, and there is the official [MySQL image](). but it works on only Linux.
- Some utils for MySQL (such as [MySQL::Partition](https://metacpan.org/pod/MySQL::Partition), [App::Prove::Plugin::MySQLPool](https://metacpan.org/pod/App::Prove::Plugin::MySQLPool), [Test::mysqld](https://metacpan.org/pod/Test::mysqld)) requires MySQL installed on the local host.

## Usage

```yaml
steps:
- uses: actions/checkout@v2
- uses: shogo82148/actions-setup-mysql@v1
  with:
    mysql-version: '8.0'
- run: mysql -uroot -h127.0.0.1 -e 'SELECT version()'
```

## Configuration

| Name | Description |
| --- | --- |
| `mysql-version` | The version of MySQL and MariaDB |
| `distribution` | The distribution. valid values are mysql or mariadb. |
| `auto-start` | Start MySQL server if it is true. |
| `my-cnf` | my.cnf settings for mysqld |
| `root-password` | password for the root user |
| `user` | name of a new user |
| `password` | password for the new user |

## Available Versions

- MySQL
    - 8.0
    - 5.7
    - 5.6
- MariaDB
    - 10.5
    - 10.4
    - 10.3
