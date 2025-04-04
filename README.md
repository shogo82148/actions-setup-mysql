# actions-setup-mysql

This action sets up a MySQL database for use in actions by:

- download a version of MySQL or MariaDB
- start mysqld

## Motivation

- GitHub-Hosted Runners have MySQL Server, but only Linux.
- GitHub Actions supports Docker services, and there is the official [MySQL image](https://hub.docker.com/_/mysql). But it works on only Linux.
- Some utils for MySQL (such as [MySQL::Partition](https://metacpan.org/pod/MySQL::Partition), [App::Prove::Plugin::MySQLPool](https://metacpan.org/pod/App::Prove::Plugin::MySQLPool), [Test::mysqld](https://metacpan.org/pod/Test::mysqld)) requires MySQL installed on the local host.

## Usage

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: shogo82148/actions-setup-mysql@v1
    with:
      mysql-version: "8.0"
  - run: mysql -uroot -e 'SELECT version()'
```

## Configuration

### `mysql-version`

The version of MySQL or MariaDB.

Available Versions are:

- MySQL
  - `9.0`
  - `8.4`
  - `8.3`
  - `8.2`
  - `8.1`
  - `8.0`
  - `5.7`
  - `5.6`
- MariaDB
  - `11.7`
  - `11.6`
  - `11.5`
  - `11.4`
  - `11.3`
  - `11.2`
  - `11.1`
  - `11.0`
  - `10.11`
  - `10.10`
  - `10.9`
  - `10.8`
  - `10.7`
  - `10.6`
  - `10.5`
  - `10.4`
  - `10.3`
  - `10.2`

### `distribution`

The distribution. The valid values are `mysql` or `mariadb`.
The default value is `mysql`.

You can use `mysql-` and `mariadb-` prefixes in `mysql-version` instead of the `distribution` input.
For example, the following two workflows install MariaDB 10.6.

```yaml
- uses: shogo82148/actions-setup-mysql@v1
  with:
    distribution: "mariadb"
    mysql-version: "10.6"
```

```yaml
- uses: shogo82148/actions-setup-mysql@v1
  with:
    mysql-version: "mariadb-10.6"
```

### `auto-start`

If it is `true`, the action starts the MySQL server.
If it is `false`, the action doesn't start the MySQL sever.
You need to execute the `mysqld` command yourself.

The default value is `true`.

### `my-cnf`

`my.cnf` settings for mysqld.
It uses the same syntax as `my.cnf`.

Example:

```yaml
- uses: shogo82148/actions-setup-mysql@v1
  with:
    mysql-version: "8.0"
    my-cnf: |
      innodb_log_file_size=256MB
      innodb_buffer_pool_size=512MB
      max_allowed_packet=16MB
      max_connections=50
      local_infile=1
```

### `root-password`

The password for the root user.

### `user`

The name of the new user.

### `password`

The password for the new user.

## Outputs

### `base-dir`

The directory under which the mysql database is being created.

It contains:

- `etc/my.cnf`
- `tmp/mysqld.log`
- `tmp/mysqld.pid`
- `tmp/mysql.sock`
- `var`: The default path of `datadir`
- `var/ca.pem`: The root certificate of the certification authority for SSL/TLS
- `var/server-cert.pem`: The server certificate for SSL/TLS
- `var/server-key.pem`: The server key for SSL/TLS

Here are some examples:

```yaml
- id: setup-mysql
  uses: shogo82148/actions-setup-mysql@v1
  with:
    mysql-version: "8.0"

- name: connect via unix domain socket
  run: mysql -uroot \
    --protocol=SOCKET \
    --socket=${{ steps.setup-mysql.outputs.base-dir }}/tmp/mysql.sock
    -e 'SELECT version()'

- name: configure the root certificate for connecting via SSL/TLS.
  run: mysql -uroot \
    --ssl --ssl-mode=REQUIRED \
    --ssl-ca=${{ steps.setup-mysql.outputs.base-dir }}/var/ca.pem \
    -e 'SELECT version()'
```

## Environment Values

### `MYSQL_HOME`

The path to the directory in which the server-specific my.cnf file resides.

### `LIBMYSQL_PLUGIN_DIR`

Directory in which to look for client plugins.
