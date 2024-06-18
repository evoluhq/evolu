describe('Home screen', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('shows "Hi!" after tapping "Click me"', async () => {
    await element(by.text('Show Mnemonic')).tap();
    await expect(element(by.text('Hide Mnemonic'))).toBeVisible();
  });
});
