"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.shutdownMySQL = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const io = __importStar(require("@actions/io"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// extension of executable files
const binExt = os.platform() === "win32" ? ".exe" : "";
const sep = path.sep;
async function shutdownMySQL(state) {
    await core.group("shutdown MySQL Server", async () => {
        const env = {};
        const args = [
            `--defaults-file=${state.baseDir}${sep}etc${sep}my.cnf`,
            `--user=root`,
        ];
        if (state.rootPassword) {
            env["MYSQL_PWD"] = state.rootPassword;
        }
        if (core.isDebug()) {
            env["MYSQL_DEBUG"] = "1";
        }
        await exec.exec(path.join(state.toolPath, "bin", `mysqladmin${binExt}`), [...args, `shutdown`], {
            env,
        });
        core.info("wait for MySQL shutdown");
        for (let i = 0; i < 30; i++) {
            try {
                fs.statSync(state.pidFile);
                await sleep(1);
            }
            catch {
                break;
            }
        }
        await sleep(1);
        await io.rmRF(state.baseDir);
    });
}
exports.shutdownMySQL = shutdownMySQL;
async function sleep(waitSec) {
    return new Promise(function (resolve) {
        setTimeout(() => resolve(), waitSec * 1000);
    });
}
