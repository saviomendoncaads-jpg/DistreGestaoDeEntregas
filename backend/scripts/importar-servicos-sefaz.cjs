// Catálogo obtido das páginas oficiais. Não é consultado em tempo de emissão.
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const catalogo = {};
async function main() {
for (const modelo of ['NFE','NFCE']) {
  const response=await fetch(`https://dfe-portal.svrs.rs.gov.br/${modelo}/Servicos`);
  if(!response.ok) throw new Error(`Falha ao obter catálogo oficial: ${response.status}`);
  const doc = new DOMParser({onError:()=>{}}).parseFromString(await response.text(), 'text/html');
  catalogo[modelo] = {};
  for (const table of Array.from(doc.getElementsByTagName('table'))) {
    const nome = table.getElementsByTagName('caption')[0]?.textContent || '';
    const match = nome.match(/\((AM|BA|GO|MG|MS|MT|PE|PR|RS|SP|SVAN|SVRS)\)\s*-\s*(Produção|Homologação)/);
    if (!match) continue;
    const [_, uf, amb] = match;
    const servicos = {};
    for (const row of Array.from(table.getElementsByTagName('tr'))) {
      const cells = Array.from(row.getElementsByTagName('td'));
      if (cells.length >= 4 && cells[2].textContent.trim() === '4.00') servicos[cells[1].textContent.trim()] = cells[3].textContent.trim();
    }
    (catalogo[modelo][uf] ||= {})[amb === 'Produção' ? 'PRODUCAO' : 'HOMOLOGACAO'] = servicos;
  }
}
if(Object.keys(catalogo.NFE).length!==12||Object.keys(catalogo.NFCE).length!==8) throw new Error('Catálogo mudou de formato. Revise antes de atualizar.');
for(const modelo of Object.values(catalogo)) for(const autorizador of Object.values(modelo)) for(const ambiente of Object.values(autorizador)) for(const endpoint of Object.values(ambiente)) {
  const u=new URL(endpoint);if(u.protocol!=='https:'||!u.hostname.endsWith('.gov.br')) throw new Error('Endpoint fora da lista de domínio governamental.');
}
fs.mkdirSync(path.join(__dirname, '../src/fiscal/sefaz'), {recursive:true});
fs.writeFileSync(path.join(__dirname, '../src/fiscal/sefaz/servicos.json'), JSON.stringify(catalogo, null, 2));
console.log(Object.fromEntries(Object.entries(catalogo).map(([m,c])=>[m,Object.keys(c)])));
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
