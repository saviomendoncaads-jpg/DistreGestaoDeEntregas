// Copia só as novas dependências e sua árvore para um runtime isolado de release.
// Não lê .env, certificados ou dados fiscais. Não modifica os módulos em uso.
const fs=require('fs');
const path=require('path');
const origem=path.resolve(__dirname,'..');
const destino=process.argv[2];
if(!destino||!path.isAbsolute(destino)) throw new Error('Informe um diretório absoluto de release.');
const raizOrigem=path.join(origem,'node_modules'),raizDestino=path.join(destino,'node_modules');
const copiados=new Set();
function localizar(nome,aPartirDe){
  let dir=aPartirDe;
  while(true){const p=path.join(dir,'node_modules',nome);if(fs.existsSync(path.join(p,'package.json')))return fs.realpathSync(p);const pai=path.dirname(dir);if(pai===dir)throw new Error(`Dependência não instalada: ${nome}`);dir=pai;}
}
function copiar(nome,aPartirDe=origem){
  const p=localizar(nome,aPartirDe);if(copiados.has(p))return;copiados.add(p);
  const relativo=path.relative(raizOrigem,p);if(relativo.startsWith('..')||path.isAbsolute(relativo))throw new Error('Dependência fora da árvore esperada.');
  const manifest=JSON.parse(fs.readFileSync(path.join(p,'package.json'),'utf8'));
  fs.mkdirSync(path.dirname(path.join(raizDestino,relativo)),{recursive:true});
  fs.cpSync(p,path.join(raizDestino,relativo),{recursive:true});
  for(const dep of Object.keys(manifest.dependencies||{}))copiar(dep,p);
  for(const dep of Object.keys(manifest.optionalDependencies||{})) {try{copiar(dep,p);}catch(err){if(!String(err.message).startsWith('Dependência não instalada'))throw err;}}
}
for(const nome of ['@xmldom/xmldom','bwip-js','pdfkit','xml-crypto','xmllint-wasm'])copiar(nome);
console.log(`Runtime fiscal preparado: ${copiados.size} pacotes.`);
