const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8');
const start = source.indexOf('function companyContactDetails(');
const end = source.indexOf('\nfunction companyProfileValue(', start);
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
for (const separator of [' e ', '; ', ', ', '\n', ' ']) {
  context.contacts = `primeiro@example.com${separator}segundo@example.org`;
  assert.equal(vm.runInContext('companyContactDetails({contacts}).email', context), 'primeiro@example.com; segundo@example.org');
}
assert.equal(vm.runInContext('companyContactDetails({contacts:"contato@example.com"}).email', context), 'contato@example.com');
assert.equal(vm.runInContext('companyContactDetails({}).email', context), '');
assert.equal(vm.runInContext('companyContactDetails({contacts:"(11) 99999-8888; contato@example.com"}).whatsappNumber', context), '5511999998888');
console.log('Múltiplos e-mails, separadores, contato único e telefone: OK');
