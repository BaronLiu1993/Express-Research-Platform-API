export default {
  testEnvironment: "node",
  transform: {},
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/setup/globalSetup.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/silenceConsole.js"],
  coverageDirectory: "<rootDir>/coverage",
  collectCoverageFrom: [
    "services/**/*.js",
    "router/**/*.js",
    "schema/**/*.js",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 65,
      lines: 65,
      statements: 65,
    },
  },
};
