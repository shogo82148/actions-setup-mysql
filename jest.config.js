// See: https://jestjs.io/docs/configuration

/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  clearMocks: true,
  extensionsToTreatAsEsm: [".ts"],
  moduleFileExtensions: ["ts", "js"],
  preset: "ts-jest",
  resolver: "ts-jest-resolver",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.eslint.json",
        useESM: true,
        isolatedModules: true,
      },
    ],
  },
  verbose: true,
};
