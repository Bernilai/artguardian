module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
  collectCoverage: false,
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "<rootDir>/src/__tests__/__mocks__/styleMock.js",
    "\\.(gif|ttf|eot|svg|png|jpg|jpeg|webp)$": "<rootDir>/src/__tests__/__mocks__/fileMock.js",
  },
  coverageThreshold: {
    global: {
      lines: 75,
    },
    "./src/contexts/": {
      lines: 88,
    },
    "./src/services/api.ts": {
      lines: 88,
    },
  },
};
