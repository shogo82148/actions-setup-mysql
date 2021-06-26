"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = exports.startMySQL = exports.getState = exports.saveState = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process = __importStar(require("child_process"));
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const exec = __importStar(require("@actions/exec"));
const mycnf = __importStar(require("./mycnf"));
const sep = path.sep;
const BASEDIR = 'BASEDIR';
const PID = 'PID';
const PID_FILE = 'PID_FILE';
const TOOLPATH = 'TOOLPATH';
const ROOT_PASSWORD = 'ROOT_PASSWORD';
// extension of executable files
const binExt = os.platform() === 'win32' ? '.exe' : '';
function saveState(state) {
    core.saveState(BASEDIR, state.baseDir);
    core.saveState(PID, state.pid);
    core.saveState(PID_FILE, state.pidFile);
    core.saveState(TOOLPATH, state.toolPath);
    core.saveState(ROOT_PASSWORD, state.rootPassword);
}
exports.saveState = saveState;
function getState() {
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
        rootPassword
    };
}
exports.getState = getState;
function startMySQL(mysql, cnf, rootPassword) {
    var _a, _b, _c, _d, _e, _f, _g;
    return __awaiter(this, void 0, void 0, function* () {
        const baseDir = yield mkdtemp();
        const config = mycnf.parse(`[mysqld]\n${cnf}`);
        config['mysqld'] || (config['mysqld'] = {});
        const pidFile = config['mysqld']['pid-file'] || path.join(baseDir, 'tmp', 'mysqld.pid');
        (_a = config['mysqld'])['lc-messages-dir'] || (_a['lc-messages-dir'] = path.join(mysql.toolPath, 'share'));
        (_b = config['mysqld'])['socket'] || (_b['socket'] = path.join(baseDir, 'tmp', 'mysql.sock'));
        (_c = config['mysqld'])['datadir'] || (_c['datadir'] = path.join(baseDir, 'var'));
        config['mysqld']['pid-file'] = pidFile;
        (_d = config['mysqld'])['tmpdir'] || (_d['tmpdir'] = path.join(baseDir, 'tmp'));
        (_e = config['mysqld'])['ssl_ca'] || (_e['ssl_ca'] = path.join(baseDir, 'var', 'ca.pem'));
        (_f = config['mysqld'])['ssl_cert'] || (_f['ssl_cert'] = path.join(baseDir, 'var', 'server-cert.pem'));
        (_g = config['mysqld'])['ssl_key'] || (_g['ssl_key'] = path.join(baseDir, 'var', 'server-key.pem'));
        yield core.group('setup MySQL Database', () => __awaiter(this, void 0, void 0, function* () {
            core.info(`creating the directory structure on ${baseDir}`);
            // (re)create directory structure
            yield io.mkdirP(path.join(baseDir, 'etc'));
            yield io.mkdirP(path.join(baseDir, 'var'));
            yield io.mkdirP(path.join(baseDir, 'tmp'));
            // configure my.cnf
            core.info(`writing my.cnf`);
            core.debug(`my.cnf path is ${path.join(baseDir, 'etc', 'my.cnf')}`);
            core.debug(mycnf.stringify(config));
            fs.writeFileSync(path.join(baseDir, 'etc', 'my.cnf'), mycnf.stringify(config));
            const help = yield verboseHelp(mysql);
            const useMysqldInitialize = help.match(/--initialize-insecure/);
            if (fs.existsSync(path.join(mysql.toolPath, 'bin', 'mariadb-install-db.exe'))) {
                // MariaDB on Windows has mariadb-install-db.exe utility
                // that is the Windows equivalent of mysql_install_db.exe
                // https://mariadb.com/kb/en/mysql_install_dbexe/
                yield execute(path.join(mysql.toolPath, 'bin', 'mariadb-install-db.exe'), [`--datadir=${baseDir}${sep}var`]);
            }
            else if (fs.existsSync(path.join(mysql.toolPath, 'bin', 'mysql_install_db.exe'))) {
                // mysql_install_db.exe is old name of mariadb-install-db.exe
                // https://mariadb.com/kb/en/mariadb-install-db/
                yield execute(path.join(mysql.toolPath, 'bin', 'mysql_install_db.exe'), [
                    `--datadir=${baseDir}${sep}var`
                ]);
            }
            else if (useMysqldInitialize) {
                // `mysql_install_db` command is obsoleted MySQL 5.7.6 or later and
                // `mysqld --initialize-insecure` should be used.
                yield execute(path.join(mysql.toolPath, 'bin', `mysqld${binExt}`), [
                    `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
                    `--initialize-insecure`
                ]);
            }
            else {
                core.debug(`mysqld doesn't have the --initialize-insecure option`);
                let command = path.join(mysql.toolPath, 'scripts', 'mysql_install_db');
                let args = [];
                if (fs.existsSync(path.join(mysql.toolPath, 'scripts', 'mysql_install_db.pl'))) {
                    // MySQL on Windows need to execute perl
                    command = 'perl';
                    args = [path.join(mysql.toolPath, 'scripts', 'mysql_install_db.pl')];
                }
                const help = yield installDbHelp(command, args);
                const installArgs = [
                    ...args,
                    `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
                    `--basedir=${mysql.toolPath}`
                ];
                if (help.match(/--auth-root-authentication-method/)) {
                    // in MariaDB until 10.3, mysql_install_db has --auth-root-authentication-method option.
                    // and until 10.4, its default value changes from "normal" to "socket".
                    // With "socket" option, mysqld accepts only unix socket, and rejects TCP protocol.
                    // ref. https://mariadb.com/kb/en/authentication-from-mariadb-104/
                    // We set "normal" to revert to the previous authentication method.
                    installArgs.push('--auth-root-authentication-method=normal');
                }
                yield execute(command, installArgs);
            }
            // configure ssl
            yield setupTls(mysql, baseDir);
        }));
        let pid = 0;
        yield core.group('start MySQL database', () => __awaiter(this, void 0, void 0, function* () {
            core.info('start MySQL database');
            const out = fs.openSync(path.join(baseDir, 'tmp', 'mysqld.log'), 'a');
            const err = fs.openSync(path.join(baseDir, 'tmp', 'mysqld.log'), 'a');
            const subprocess = child_process.spawn(path.join(mysql.toolPath, 'bin', `mysqld${binExt}`), [`--defaults-file=${baseDir}${sep}etc${sep}my.cnf`, '--user=root'], {
                detached: true,
                stdio: ['ignore', out, err]
            });
            pid = subprocess.pid || 0;
            core.info('wait for MySQL ready');
            for (;;) {
                try {
                    fs.statSync(pidFile);
                    break;
                }
                catch (_h) {
                    yield sleep(0.1);
                }
                if (subprocess.exitCode !== null) {
                    throw new Error('failed to launch MySQL');
                }
            }
            subprocess.unref();
            core.info('MySQL Server started');
        }));
        if (rootPassword) {
            yield core.group('configure root password', () => __awaiter(this, void 0, void 0, function* () {
                yield execute(path.join(mysql.toolPath, 'bin', `mysqladmin${binExt}`), [
                    `--defaults-file=${baseDir}${sep}etc${sep}my.cnf`,
                    `--user=root`,
                    `--host=127.0.0.1`,
                    `password`,
                    rootPassword
                ]);
            }));
        }
        core.setOutput('base-dir', baseDir);
        return {
            pid,
            pidFile,
            baseDir,
            toolPath: mysql.toolPath,
            rootPassword
        };
    });
}
exports.startMySQL = startMySQL;
function createUser(state, user, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const mysql = path.join(state.toolPath, 'bin', `mysql${binExt}`);
        const env = {};
        const args = [
            `--defaults-file=${state.baseDir}${sep}etc${sep}my.cnf`,
            `--user=root`,
            `--host=127.0.0.1`
        ];
        if (state.rootPassword) {
            env['MYSQL_PWD'] = state.rootPassword;
        }
        if (core.isDebug()) {
            env['MYSQL_DEBUG'] = '1';
        }
        for (let host of ['localhost', '127.0.0.1', '::1']) {
            yield execute(mysql, [
                ...args,
                '-e',
                `CREATE USER '${user}'@'${host}' IDENTIFIED BY '${password}'`
            ], {
                env: env
            });
            yield execute(mysql, [
                ...args,
                '-e',
                `GRANT ALL PRIVILEGES ON *.* TO '${user}'@'${host}' WITH GRANT OPTION`
            ], {
                env: env
            });
        }
    });
}
exports.createUser = createUser;
// execute "mysqld --verbose --help" and returns its result.
function verboseHelp(mysql) {
    return __awaiter(this, void 0, void 0, function* () {
        let myOutput = '';
        const options = {
            silent: true,
            listeners: {
                stdout: (data) => {
                    myOutput += data.toString();
                },
                stderr: (data) => {
                    myOutput += data.toString();
                }
            }
        };
        try {
            yield execute(path.join(mysql.toolPath, 'bin', `mysqld${binExt}`), ['--no-defaults', '--verbose', '--help'], options);
        }
        catch (e) {
            core.error('fail to get mysqld options');
            core.error(myOutput);
            return '';
        }
        return myOutput;
    });
}
// TypeScript port of mysql_ssl_rsa_setup which is available from MySQL 5.7.6.
// It is for better compatibility.
// based on https://dev.mysql.com/doc/refman/8.0/en/creating-ssl-files-using-openssl.html
function setupTls(mysql, baseDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const datadir = `${baseDir}${sep}var`;
        const openssl = `${mysql.toolPath}${sep}bin${sep}openssl${binExt}`;
        const options = {};
        process.env['LD_LIBRARY_PATH'] = `${mysql.toolPath}${sep}lib`;
        process.env['DYLD_LIBRARY_PATH'] = `${mysql.toolPath}${sep}lib`;
        // Generate CA Key and Certificate
        yield exec.exec(openssl, [
            'req',
            '-newkey',
            'rsa:2048',
            '-days',
            '3650',
            '-nodes',
            '-keyout',
            `${datadir}${sep}ca-key.pem`,
            '-subj',
            '/CN=Actions_Setup_MySQL_Auto_Generated_CA_Certificate',
            '-out',
            `${datadir}${sep}ca-req.pem`
        ], options);
        yield exec.exec(openssl, [
            'x509',
            '-sha256',
            '-req',
            '-in',
            `${datadir}${sep}ca-req.pem`,
            '-days',
            '3650',
            '-set_serial',
            '01',
            '-signkey',
            `${datadir}${sep}ca-key.pem`,
            '-out',
            `${datadir}${sep}ca.pem`
        ], options);
        // Generate Server Key and Certificate
        yield exec.exec(openssl, [
            'req',
            '-newkey',
            'rsa:2048',
            '-days',
            '3650',
            '-nodes',
            '-keyout',
            `${datadir}${sep}server-key.pem`,
            '-subj',
            '/CN=Actions_Setup_MySQL_Auto_Generated_Certificate',
            '-out',
            `${datadir}${sep}server-req.pem`
        ]);
        yield exec.exec(openssl, [
            'rsa',
            '-in',
            `${datadir}${sep}server-key.pem`,
            '-out',
            `${datadir}${sep}server-key.pem`
        ], options);
        yield exec.exec(openssl, [
            'x509',
            '-sha256',
            '-req',
            '-in',
            `${datadir}${sep}server-req.pem`,
            '-days',
            '3650',
            '-CA',
            `${datadir}${sep}ca.pem`,
            '-CAkey',
            `${datadir}${sep}ca-key.pem`,
            '-set_serial',
            '01',
            '-out',
            `${datadir}${sep}server-cert.pem`
        ], options);
    });
}
// execute "mysql_install_db --help" and return its result
function installDbHelp(command, args) {
    return __awaiter(this, void 0, void 0, function* () {
        let myOutput = '';
        const options = {
            silent: true,
            listeners: {
                stdout: (data) => {
                    myOutput += data.toString();
                },
                stderr: (data) => {
                    myOutput += data.toString();
                }
            }
        };
        try {
            yield exec.exec(command, [...args, '--help'], options);
        }
        catch (e) {
            // suppress the exception.
            // "mysql_install_db --help" returns exit code 1.
        }
        return myOutput;
    });
}
function mkdtemp() {
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
function sleep(waitSec) {
    return new Promise(function (resolve) {
        setTimeout(() => resolve(), waitSec * 1000);
    });
}
function execute(commandLine, args, options) {
    if (args) {
        core.debug(`execute: ${commandLine} ${args.join(' ')}`);
    }
    else {
        core.debug(`execute: ${commandLine}`);
    }
    return exec.exec(commandLine, args, options);
}
