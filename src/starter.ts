import * as child_process from "child_process";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import { stat, open, readFile } from "fs/promises";
import * as installer from "./installer";
import * as io from "@actions/io";
import * as mycnf from "./mycnf";
import * as os from "os";
import * as path from "path";

const sep = path.sep;
const BASEDIR = "BASEDIR";
const PID = "PID";
const PID_FILE = "PID_FILE";
const TOOLPATH = "TOOLPATH";
const ROOT_PASSWORD = "ROOT_PASSWORD";

// extension of executable files
const binExt = os.platform() === "win32" ? ".exe" : "";

export interface MySQLState {
  pid: number;
  pidFile: string;
  baseDir: string;
  toolPath: string;
  rootPassword: string;
}

export function saveState(state: MySQLState): void {
  core.saveState(BASEDIR, state.baseDir);
  core.saveState(PID, state.pid);
  core.saveState(PID_FILE, state.pidFile);
  core.saveState(TOOLPATH, state.toolPath);
  core.saveState(ROOT_PASSWORD, state.rootPassword);
}

export function getState(): MySQLState | null {
  const baseDir = core.getState(BASEDIR);
  if (!baseDir) {
    return null;
  }
  const pid = parseInt(core.getState(PID));
  const pidFile = core.getState(PID_FILE);
  const toolPath = core.getState(TOOLPATH);
  const rootPassword = core.getState(ROOT_PASSWORD);
  return {
    pid,
    pidFile,
    baseDir,
    toolPath,
    rootPassword,
  };
}

export async function startMySQL(
  mysql: installer.MySQL,
  cnf: string,
  rootPassword: string,
): Promise<MySQLState> {
  // configure mysqld
  const baseDir = await mkdtemp();
  const config = mycnf.parse(`[mysqld]\n${cnf}`);
  config["mysqld"] ||= {};
  const pidFile = config["mysqld"]["pid-file"] || path.join(baseDir, "tmp", "mysqld.pid");
  config["mysqld"]["lc-messages-dir"] ||= path.join(mysql.toolPath, "share");
  config["mysqld"]["socket"] ||= path.join(baseDir, "tmp", "mysql.sock");
  config["mysqld"]["datadir"] ||= path.join(baseDir, "var");
  config["mysqld"]["pid-file"] = pidFile;
  config["mysqld"]["port"] ||= "3306";
  config["mysqld"]["tmpdir"] ||= path.join(baseDir, "tmp");

  // configure mysql client
  config["client"] ||= {};
  config["client"]["port"] = config["mysqld"]["port"];
  config["client"]["host"] = "127.0.0.1";
  config["client"]["socket"] = config["mysqld"]["socket"];

  await core.group("setup MySQL Database", async () => {
    core.info(`creating the directory structure on ${baseDir}`);

    // (re)create directory structure
    await io.mkdirP(path.join(baseDir, "etc"));
    await io.mkdirP(path.join(baseDir, "var"));
    await io.mkdirP(path.join(baseDir, "tmp"));

    // configure my.cnf
    core.info(`writing my.cnf`);
    core.debug(`my.cnf path is ${path.join(baseDir, "etc", "my.cnf")}`);
    core.debug(mycnf.stringify(config));
    fs.writeFileSync(path.join(baseDir, "etc", "my.cnf"), mycnf.stringify(config));

    const help = await verboseHelp(mysql);
    const useMysqldInitialize = help.match(/--initialize-insecure/);
    if (fs.existsSync(path.join(mysql.toolPath, "bin", "mariadb-install-db.exe"))) {
      // MariaDB on Windows has mariadb-install-db.exe utility
      // that is the Windows equivalent of mysql_install_db.exe
      // https://mariadb.com/kb/en/mysql_install_dbexe/
      await execute(path.join(mysql.toolPath, "bin", "mariadb-install-db.exe"), [
        `--datadir=${baseDir}${sep}var`,
      ]);
    } else if (fs.existsSync(path.join(mysql.toolPath, "bin", "mysql_install_db.exe"))) {
      // mysql_install_db.exe is old name of mariadb-install-db.exe
      // https://mariadb.com/kb/en/mariadb-install-db/
      await execute(path.join(mysql.toolPath, "bin", "mysql_install_db.exe"), [
        `--datadir=${baseDir}${sep}var`,
      ]);
    } else if (useMysqldInitialize) {
      // `mysql_install_db` command is obsoleted MySQL 5.7.6 or later and
      // `mysqld --initialize-insecure` should be used.
      await execute(path.join(mysql.toolPath, "bin", `mysqld${binExt}`), [
        `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
        `--initialize-insecure`,
      ]);
    } else {
      core.debug(`mysqld doesn't have the --initialize-insecure option`);
      let command = path.join(mysql.toolPath, "scripts", "mysql_install_db");
      let args: string[] = [];
      if (fs.existsSync(path.join(mysql.toolPath, "scripts", "mysql_install_db.pl"))) {
        // MySQL on Windows need to execute perl
        command = "perl";
        args = [path.join(mysql.toolPath, "scripts", "mysql_install_db.pl")];
      }
      const installHelp = await installDbHelp(command, args);
      const installArgs = [
        ...args,
        `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
        `--basedir=${mysql.toolPath}`,
      ];

      if (installHelp.match(/--auth-root-authentication-method/)) {
        // in MariaDB until 10.3, mysql_install_db has --auth-root-authentication-method option.
        // and until 10.4, its default value changes from "normal" to "socket".
        // With "socket" option, mysqld accepts only unix socket, and rejects TCP protocol.
        // ref. https://mariadb.com/kb/en/authentication-from-mariadb-104/
        // We set "normal" to revert to the previous authentication method.
        installArgs.push("--auth-root-authentication-method=normal");
      }
      await execute(command, installArgs);
    }
  });

  await core.group("configure TLS/SSL", async () => {
    // add TLS/SSL setting into my.cnf
    config["mysqld"]["ssl_ca"] ||= path.join(baseDir, "var", "ca.pem");
    config["mysqld"]["ssl_cert"] ||= path.join(baseDir, "var", "server-cert.pem");
    config["mysqld"]["ssl_key"] ||= path.join(baseDir, "var", "server-key.pem");
    config["client"] ||= {};
    config["client"]["ssl_ca"] ||= path.join(baseDir, "var", "ca.pem");

    // configure my.cnf
    core.info(`add TLS/SSL setting into my.cnf`);
    core.debug(`my.cnf path is ${path.join(baseDir, "etc", "my.cnf")}`);
    core.debug(mycnf.stringify(config));
    fs.writeFileSync(path.join(baseDir, "etc", "my.cnf"), mycnf.stringify(config));

    // configure TLS
    await setupTls(mysql, baseDir);
  });

  // start MySQL database
  let pid = 0;
  const logFile = path.join(baseDir, "tmp", "mysqld.log");
  await core.group("start MySQL database", async () => {
    const out = await open(logFile, "a");
    const err = await open(logFile, "a");
    try {
      core.info("start MySQL database");
      const subprocess = child_process.spawn(
        path.join(mysql.toolPath, "bin", `mysqld${binExt}`),
        [`--defaults-file=${baseDir}${sep}etc${sep}my.cnf`, "--user=root", "--bind-address=*"],
        {
          detached: true,
          stdio: ["ignore", out.fd, err.fd],
        },
      );
      pid = subprocess.pid || 0;

      core.info("wait for MySQL ready");
      await retry(async () => {
        await stat(pidFile);
      });
      if (subprocess.exitCode !== null) {
        throw new Error("failed to launch MySQL");
      }
      subprocess.unref();
    } finally {
      await out.close();
      await err.close();
    }
    core.info("MySQL Server started");
  });

  if (rootPassword) {
    try {
      await core.group("configure root password", async () => {
        await retry(async () => {
          if (fs.existsSync(path.join(mysql.toolPath, "bin", `mariadb-admin${binExt}`))) {
            await execute(path.join(mysql.toolPath, "bin", `mariadb-admin${binExt}`), [
              `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
              `--skip-ssl`,
              `--user=root`,
              `password`,
              rootPassword,
            ]);
          } else {
            await execute(path.join(mysql.toolPath, "bin", `mysqladmin${binExt}`), [
              `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
              `--user=root`,
              `password`,
              rootPassword,
            ]);
          }
        });
      });
    } catch (error) {
      core.error(`failed to configure root password: ${error}`);
      const log = await readFile(logFile, { encoding: "utf8" });
      core.error(`log of mysqld: ${log}`);
      throw new Error("failed to configure root password");
    }
  }

  core.setOutput("base-dir", baseDir);

  // configure environment variables
  //
  // ref. https://dev.mysql.com/doc/refman/8.0/en/environment-variables.html
  // ref. https://mariadb.com/kb/en/mariadb-environment-variables/
  //
  // MYSQL_HOME: The path to the directory in which the server-specific my.cnf file resides.
  core.exportVariable("MYSQL_HOME", `${baseDir}${sep}etc`);

  // LIBMYSQL_PLUGIN_DIR: Directory in which to look for client plugins.
  core.exportVariable("LIBMYSQL_PLUGIN_DIR", `${mysql.toolPath}${sep}lib${sep}plugin`);

  return {
    pid,
    pidFile,
    baseDir,
    toolPath: mysql.toolPath,
    rootPassword,
  };
}

export async function createUser(state: MySQLState, user: string, password: string): Promise<void> {
  if (fs.existsSync(path.join(state.toolPath, "bin", `mariadb${binExt}`))) {
    const mariadb = path.join(state.toolPath, "bin", `mariadb${binExt}`);
    const env: Record<string, string> = {};
    const args = [
      `--defaults-file=${state.baseDir}${sep}etc${sep}my.cnf`,
      `--skip-ssl`,
      `--user=root`,
    ];
    if (state.rootPassword) {
      env["MYSQL_PWD"] = state.rootPassword;
    }
    if (core.isDebug()) {
      env["MYSQL_DEBUG"] = "1";
    }
    for (const host of ["localhost", "127.0.0.1", "::1"]) {
      await execute(
        mariadb,
        [...args, "-e", `CREATE USER '${user}'@'${host}' IDENTIFIED BY '${password}'`],
        {
          env,
        },
      );
      await execute(
        mariadb,
        [...args, "-e", `GRANT ALL PRIVILEGES ON *.* TO '${user}'@'${host}' WITH GRANT OPTION`],
        {
          env,
        },
      );
    }
  } else {
    const mysql = path.join(state.toolPath, "bin", `mysql${binExt}`);
    const env: Record<string, string> = {};
    const args = [`--defaults-file=${state.baseDir}${sep}etc${sep}my.cnf`, `--user=root`];
    if (state.rootPassword) {
      env["MYSQL_PWD"] = state.rootPassword;
    }
    if (core.isDebug()) {
      env["MYSQL_DEBUG"] = "1";
    }
    for (const host of ["localhost", "127.0.0.1", "::1"]) {
      await execute(
        mysql,
        [...args, "-e", `CREATE USER '${user}'@'${host}' IDENTIFIED BY '${password}'`],
        {
          env,
        },
      );
      await execute(
        mysql,
        [...args, "-e", `GRANT ALL PRIVILEGES ON *.* TO '${user}'@'${host}' WITH GRANT OPTION`],
        {
          env,
        },
      );
    }
  }
}

// execute "mysqld --verbose --help" and returns its result.
async function verboseHelp(mysql: installer.MySQL): Promise<string> {
  let myOutput = "";
  const options = {
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        myOutput += data.toString();
      },
      stderr: (data: Buffer) => {
        myOutput += data.toString();
      },
    },
  };
  try {
    await execute(
      path.join(mysql.toolPath, "bin", `mysqld${binExt}`),
      ["--no-defaults", "--verbose", "--help"],
      options,
    );
  } catch (e) {
    core.error(`fail to get mysqld options: ${e}`);
    core.error(myOutput);
    return "";
  }
  return myOutput;
}

// TypeScript port of mysql_ssl_rsa_setup which is available from MySQL 5.7.6.
// It is for better compatibility.
// based on https://dev.mysql.com/doc/refman/8.0/en/creating-ssl-files-using-openssl.html
async function setupTls(mysql: installer.MySQL, baseDir: string): Promise<void> {
  const datadir = `${baseDir}${sep}var`;
  const openssl = `${mysql.toolPath}${sep}bin${sep}openssl${binExt}`;
  const options: exec.ExecOptions = {};

  process.env["LD_LIBRARY_PATH"] = `${mysql.toolPath}${sep}lib`;
  process.env["DYLD_LIBRARY_PATH"] = `${mysql.toolPath}${sep}lib`;

  // show the version of openssl
  await exec.exec(openssl, ["version"], options);

  // Generate CA Key and Certificate
  await exec.exec(
    openssl,
    [
      "req",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      `${datadir}${sep}ca-key.pem`,
      "-subj",
      "/CN=Actions_Setup_MySQL_Auto_Generated_CA_Certificate",
      "-out",
      `${datadir}${sep}ca-req.pem`,
    ],
    options,
  );
  await exec.exec(
    openssl,
    [
      "x509",
      "-sha256",
      "-req",
      "-in",
      `${datadir}${sep}ca-req.pem`,
      "-extfile",
      `${__dirname}${sep}..${sep}v3_ca.txt`,
      "-days",
      "3650",
      "-set_serial",
      "01",
      "-signkey",
      `${datadir}${sep}ca-key.pem`,
      "-out",
      `${datadir}${sep}ca.pem`,
    ],
    options,
  );

  // Generate Server Key and Certificate
  await exec.exec(openssl, [
    "req",
    "-newkey",
    "rsa:2048",
    "-days",
    "3650",
    "-nodes",
    "-keyout",
    `${datadir}${sep}server-key.pem`,
    "-subj",
    "/CN=127.0.0.1",
    "-out",
    `${datadir}${sep}server-req.pem`,
  ]);
  await exec.exec(
    openssl,
    ["rsa", "-in", `${datadir}${sep}server-key.pem`, "-out", `${datadir}${sep}server-key.pem`],
    options,
  );
  await exec.exec(
    openssl,
    [
      "x509",
      "-sha256",
      "-req",
      "-in",
      `${datadir}${sep}server-req.pem`,
      "-days",
      "3650",
      "-CA",
      `${datadir}${sep}ca.pem`,
      "-CAkey",
      `${datadir}${sep}ca-key.pem`,
      "-set_serial",
      "01",
      "-extfile",
      `${__dirname}${sep}..${sep}subjectnames.txt`,
      "-out",
      `${datadir}${sep}server-cert.pem`,
    ],
    options,
  );
}

// execute "mysql_install_db --help" and return its result
async function installDbHelp(command: string, args: string[]): Promise<string> {
  let myOutput = "";
  const options = {
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        myOutput += data.toString();
      },
      stderr: (data: Buffer) => {
        myOutput += data.toString();
      },
    },
  };
  try {
    await exec.exec(command, [...args, "--help"], options);
  } catch (e) {
    // suppress the exception.
    // "mysql_install_db --help" returns exit code 1.
  }
  return myOutput;
}

async function mkdtemp(): Promise<string> {
  const tmp = os.tmpdir();
  return new Promise(function (resolve, reject) {
    fs.mkdtemp(`${tmp}${sep}actions-setup-mysql-`, (err, dir) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(dir);
    });
  });
}

async function sleep(waitSec: number): Promise<void> {
  return new Promise<void>(function (resolve) {
    setTimeout(() => resolve(), waitSec * 1000);
  });
}

async function execute(
  commandLine: string,
  args?: string[],
  options?: exec.ExecOptions,
): Promise<number> {
  if (args) {
    core.debug(`execute: ${commandLine} ${args.join(" ")}`);
  } else {
    core.debug(`execute: ${commandLine}`);
  }
  return exec.exec(commandLine, args, options);
}

async function retry<T>(func: () => Promise<T>): Promise<T> {
  let waitSec = 0.5;
  for (let i = 0; i < 10; i++) {
    try {
      return await func();
    } catch (error) {
      core.debug(`failed: ${error}`);
    }
    core.debug(`retry in ${waitSec} sec...`);
    await sleep(waitSec);
    waitSec = Math.min(waitSec * 2, 30);
  }
  throw new Error("try harder but give up");
}
