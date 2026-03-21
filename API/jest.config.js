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
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
