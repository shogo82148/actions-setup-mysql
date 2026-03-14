// See: https://rollupjs.org/introduction/

import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const config = [
  {
    input: "src/setup-mysql.ts",
    output: {
      esModule: true,
      file: "dist/setup-mysql.js",
      format: "es",
      sourcemap: true,
    },
    plugins: [json(), typescript(), nodeResolve({ preferBuiltins: true }), commonjs()],
  },
  {
    input: "src/cleanup-mysql.ts",
    output: {
      esModule: true,
      file: "dist/cleanup-mysql.js",
      format: "es",
      sourcemap: true,
    },
    plugins: [json(), typescript(), nodeResolve({ preferBuiltins: true }), commonjs()],
  },
];

export default config;
