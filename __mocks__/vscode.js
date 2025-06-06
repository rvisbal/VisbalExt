module.exports = {
  window: {
    createStatusBarItem: () => ({
      name: '',
      show: () => {},
      hide: () => {},
      text: '',
      tooltip: '',
      command: '',
      dispose: () => {},
    }),
  },
  commands: {},
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  workspace: {
    workspaceFolders: [
      { uri: { fsPath: '/mock/path' } }
    ],
    getConfiguration: () => ({
      get: (key, defaultValue) => defaultValue,
    }),
  },
  // Add more mocks as needed for your tests
}; 