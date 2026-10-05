const assert = require('node:assert/strict');
const { loadAiSdk, loadJose } = require('../dist/common/esm.js');
(async () => {
  assert.throws(() => require('ai'), { code: 'ERR_REQUIRE_ESM' });
  const [ai, jose] = await Promise.all([loadAiSdk(), loadJose()]);
  assert.equal(typeof ai.generateText, 'function');
  assert.equal(typeof ai.gateway, 'function');
  assert.equal(typeof ai.Output.object, 'function');
  assert.equal(typeof jose.jwtVerify, 'function');
  assert.equal(typeof jose.createRemoteJWKSet, 'function');
  console.log('ESM dependencies load with CommonJS require(ESM) disabled.');
})().catch(error => { console.error(error); process.exitCode = 1; });
