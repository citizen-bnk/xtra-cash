const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), Module = require('node:module'), path = require('node:path');
const file = path.resolve(__dirname, '../../web/src/lib/loan-conversation.ts');
const mod = new Module(file); mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { conversationalMoney: money, conversationalTerm: term } = mod.exports;
assert.equal(money('R3,000'), 300000); assert.equal(money('I earn R12000 per month'), 1200000); assert.equal(money('3k'), 300000); assert.equal(money('1,5k'), 150000); assert.equal(money('R3 000'), 300000); assert.equal(money('0'), 0);
assert.equal(money('between 2000 and 5000'), null); assert.equal(money('1,2,3'), null); assert.equal(money('-100'), null); assert.equal(money('R1.2345'), null); assert.equal(money('maybe 3k or 5k'), null);
assert.equal(term('for 6 months please'), 6); assert.equal(term('24'), 24); assert.equal(term('25'), null); assert.equal(term('6 or 12 months'), null);
console.log('PASS: conversational currency/decimal parsing, common replies, bounded periods and rejection of ambiguous financial answers.');
