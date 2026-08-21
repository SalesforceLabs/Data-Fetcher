export function installImmediateAnimationFrames() {
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: jest.fn((callback) => {
      callback(0);
      return 1;
    })
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    writable: true,
    value: jest.fn()
  });
}
