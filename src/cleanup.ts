import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as io from "@actions/io";
import * as os from "os";
import * as path from "path";
import * as starter from "./starter";

// extension of executable files
const binExt = os.platform() === "win32" ? ".exe" : "";
const sep = path.sep;

export async function shutdownMySQL(state: starter.MySQLState): Promise<void> {
  await core.group("shutdown MySQL Server", async () => {
    const env: Record<string, string> = {};
    const args = [`--defaults-file=${state.baseDir}${sep}etc${sep}my.cnf`, `--user=root`];
    if (state.rootPassword) {
      env["MYSQL_PWD"] = state.rootPassword;
    }
    if (core.isDebug()) {
      env["MYSQL_DEBUG"] = "1";
    }
    if (fs.existsSync(path.join(state.toolPath, "bin", `mariadb-admin${binExt}`))) {
      await exec.exec(
        path.join(state.toolPath, "bin", `mariadb-admin${binExt}`),
        [...args, "--skip-ssl", "shutdown"],
        {
          env,
        },
      );
    } else {
      await exec.exec(
        path.join(state.toolPath, "bin", `mysqladmin${binExt}`),
        [...args, "shutdown"],
        {
          env,
        },
      );
    }

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

async function sleep(waitSec: number): Promise<void> {
  return new Promise<void>(function (resolve) {
    setTimeout(() => resolve(), waitSec * 1000);
  });
}
