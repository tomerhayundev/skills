import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, checkPublic } from './public-host.mjs';

test('addresses on this machine or a home or carrier network are private; public ones are not', () => {
  for (const ip of ['127.0.0.1', '127.8.9.1', '10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.4', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:192.168.1.1', '::ffff:7f00:1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('IPv6 forms that carry an IPv4 address inside are judged by it, and only the public IPv6 range passes', () => {
  // ::a.b.c.d (IPv4-compatible), NAT64 64:ff9b::/96 and 6to4 2002::/16 carry an IPv4 address.
  for (const ip of ['::7f00:1', '::127.0.0.1', '64:ff9b::a00:5', '64:ff9b::192.168.1.1', '2002:c0a8:0101::1', '2002:7f00:1::', 'fec0::1', '2001:db8::1', '2001:0:4136:e378::1', 'ff02::1', '100::1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['64:ff9b::808:808', '2002:0808:0808::1', '2a00:1450:4001:80b::200e']) assert.equal(isPrivateAddress(ip), false, ip);
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

test('the gate answers each host with one checked address, the same one every time, or refuses it', async () => {
  const { hostGate } = await import('./public-host.mjs');
  let asked = 0;
  const gate = hostGate(async (host) => { asked++; return host === 'cdn.example' ? [{ address: '151.101.1.1' }, { address: '151.101.65.1' }] : host === 'mixed.example' ? [{ address: '151.101.1.1' }, { address: '10.0.0.1' }] : [{ address: '192.168.0.9' }]; });
  for (let i = 0; i < 5; i++) assert.equal(await gate('cdn.example'), '151.101.1.1');
  assert.equal(asked, 1, 'resolved once, then pinned');
  assert.equal(await gate('router.example'), null);
  assert.equal(await gate('mixed.example'), null, 'one private answer refuses the name');
  assert.equal(await gate('10.0.0.1'), null);
  assert.equal(await gate('93.184.216.34'), '93.184.216.34');
  assert.equal(await gate('localhost'), null);
});
