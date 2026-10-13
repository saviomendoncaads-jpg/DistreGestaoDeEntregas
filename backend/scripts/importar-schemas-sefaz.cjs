const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const root = path.join(os.tmpdir(), 'distre-010f');
const schemas = {};
function ler(dir) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full = path.join(dir,entry.name);
    if(entry.isDirectory()) ler(full);
    else if(entry.name.endsWith('.xsd')) schemas[entry.name] = fs.readFileSync(full,'utf8');
  }
}
for(const dir of ['distre-servicos4','distre-eventos','distre-010f']) ler(path.join(os.tmpdir(),dir));
fs.writeFileSync(path.join(__dirname,'../src/fiscal/sefaz/schemas.json'), JSON.stringify(schemas));
console.log({pacote:'PL_010f_v1.04', arquivos:Object.keys(schemas), sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(os.tmpdir(),'distre-010f.zip'))).digest('hex')});
