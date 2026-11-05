import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, checkPublic } from './public-host.mjs';

test('addresses on this machine or a home or carrier network are private; public ones are not', () => {
  for (const ip of ['127.0.0.1', '127.8.9.1', '10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.4', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:192.168.1.1', '::ffff:7f00:1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('a name is public only when every address it leads to is public', async () => {
  const lookup = async (host) => ({ 'studio.example': [{ address: '93.184.216.34' }], 'sneaky.example': [{ address: '93.184.216.34' }, { address: '10.0.0.5' }], 'rebind.example': [{ address: '127.0.0.1' }] })[host] || Promise.reject(new Error('ENOTFOUND'));
  assert.equal(await checkPublic('https://studio.example/a', lookup), true);
  assert.equal(await checkPublic('https://sneaky.example/', lookup), false);
  assert.equal(await checkPublic('https://rebind.example/', lookup), false);
  assert.equal(await checkPublic('https://nowhere.example/', lookup), false, 'a name that does not resolve is refused');
  assert.equal(await checkPublic('http://192.168.0.1/', lookup), false, 'an address typed as numbers is checked too');
  assert.equal(await checkPublic('file:///etc/passwd', lookup), false);
});
