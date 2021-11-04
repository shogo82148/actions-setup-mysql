import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as starter from "./starter";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";

// extension of executable files
const binExt = os.platform() === "win32" ? ".exe" : "";
const sep = path.sep;

export async function shutdownMySQL(state: starter.MySQLState) {
  await core.group("shutdown MySQL Server", async () => {
    const env: { [key: string]: string } = {};
    const args = [
      `--defaults-file=${state.baseDir}${sep}etc${sep}my.cnf`,
      `--user=root`,
      `--host=127.0.0.1`,
    ];
    if (state.rootPassword) {
      env["MYSQL_PWD"] = state.rootPassword;
    }
    if (core.isDebug()) {
      env["MYSQL_DEBUG"] = "1";
    }
    await exec.exec(
      path.join(state.toolPath, "bin", `mysqladmin${binExt}`),
      [...args, `shutdown`],
      {
        env: env,
      }
    );

    core.info("wait for MySQL shutdown");
    for (let i = 0; i < 30; i++) {
      try {
        fs.statSync(state.pidFile);
        await sleep(1);
      } catch {
        break;
      }
    }

    await sleep(1);
    await io.rmRF(state.baseDir);
  });
}

async function sleep(waitSec: number) {
  return new Promise<void>(function (resolve) {
    setTimeout(() => resolve(), waitSec * 1000);
  });
}
