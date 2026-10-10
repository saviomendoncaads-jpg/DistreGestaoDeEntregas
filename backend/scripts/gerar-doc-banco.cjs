// Gera a documentação do banco A PARTIR DO BANCO REAL:
//   - backend/docs/schema-completo.sql  (recria todas as tabelas, chaves, índices e trigger)
//   - seção "Banco de Dados" do README.md (entre os marcadores BANCO:INICIO / BANCO:FIM)
// Uso (Windows, Autenticação Integrada):  node backend/scripts/gerar-doc-banco.cjs [NOME_DO_BANCO]
const fs = require('fs');
const path = require('path');
const mssql = require('mssql/msnodesqlv8');
const { tabelas: DESC_TAB, colunas: DESC_COL } = require('./descricoes-banco.cjs');

const BANCO = process.argv[2] || 'DISTRE_PROD';
const RAIZ = path.join(__dirname, '..', '..');

const tipoSql = c => {
  const t = c.DATA_TYPE.toUpperCase();
  if (['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR'].includes(t)) return `${t}(${c.LEN === -1 ? 'MAX' : c.LEN})`;
  if (t === 'DECIMAL' || t === 'NUMERIC') return `${t}(${c.PREC}, ${c.ESC})`;
  return t;
};

(async () => {
  const pool = await new mssql.ConnectionPool({
    server: 'localhost\\SQLEXPRESS', database: BANCO, driver: 'msnodesqlv8',
    options: { trustedConnection: true, trustServerCertificate: true },
  }).connect();
  const q = async s => (await pool.request().query(s)).recordset;

  const cols = await q(`
    SELECT t.name AS TABELA, c.column_id AS POS, c.name AS COLUNA, ty.name AS DATA_TYPE,
      CASE WHEN ty.name IN ('nvarchar','nchar') AND c.max_length > 0 THEN c.max_length / 2 ELSE c.max_length END AS LEN,
      c.precision AS PREC, c.scale AS ESC, c.is_nullable AS NULO, c.is_identity AS IDENT,
      dc.name AS DEF_NOME, dc.definition AS DEF
    FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
    ORDER BY t.name, c.column_id`);
  const chaves = await q(`
    SELECT t.name AS TABELA, kc.name AS NOME, kc.type AS TIPO,
      STUFF((SELECT ', ' + col.name FROM sys.index_columns ic JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
             WHERE ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS COLUNAS
    FROM sys.key_constraints kc JOIN sys.tables t ON t.object_id = kc.parent_object_id`);
  const indices = await q(`
    SELECT t.name AS TABELA, i.name AS NOME, i.is_unique AS UNICO, i.filter_definition AS FILTRO,
      STUFF((SELECT ', ' + col.name FROM sys.index_columns ic JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
             WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS COLUNAS
    FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id
    WHERE i.name IS NOT NULL AND i.is_primary_key = 0 AND i.is_unique_constraint = 0`);
  const fks = await q(`
    SELECT OBJECT_NAME(fk.parent_object_id) AS TABELA, pc.name AS COLUNA, OBJECT_NAME(fk.referenced_object_id) AS REF_TABELA, rc.name AS REF_COLUNA
    FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
    JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id`);
  const triggers = await q(`SELECT OBJECT_NAME(parent_id) AS TABELA, name AS NOME, OBJECT_DEFINITION(object_id) AS DEF FROM sys.triggers WHERE parent_class = 1`);
  await pool.close();

  // Aviso: tabela/coluna nova sem descrição em descricoes-banco.cjs sai em branco no README.
  const semDesc = [
    ...new Set(cols.map(c => c.TABELA)).values()].filter(t => !DESC_TAB[t]).map(t => `tabela ${t}`)
    .concat(cols.filter(c => !DESC_COL[`${c.TABELA}.${c.COLUNA}`]).map(c => `${c.TABELA}.${c.COLUNA}`));
  if (semDesc.length) console.warn(`ATENÇÃO: ${semDesc.length} item(ns) sem descrição em scripts/descricoes-banco.cjs:\n  - ${semDesc.join('\n  - ')}`);

  // Ordem: tabelas referenciadas por FK primeiro.
  const nomes = [...new Set(cols.map(c => c.TABELA))].sort();
  const pais = new Set(fks.map(f => f.REF_TABELA));
  nomes.sort((a, b) => Number(pais.has(b)) - Number(pais.has(a)) || a.localeCompare(b));

  // ─── schema-completo.sql ───────────────────────────────────────────────────
  const sql = [];
  sql.push(`-- ============================================================================
-- Distre — estrutura completa do banco (gerado de ${BANCO} em ${new Date().toISOString().slice(0, 10)})
-- Gerado por backend/scripts/gerar-doc-banco.cjs — NÃO editar à mão; rode o script de novo.
--
-- Recriar do zero:  sqlcmd -S localhost\\SQLEXPRESS -E -i backend\\docs\\schema-completo.sql
-- (troque o nome do banco abaixo se quiser outro). Contém só ESTRUTURA, sem dados.
-- Observação: o backend também cria/ajusta essas tabelas sozinho ao subir
-- (database.ts e fiscal/fiscalRepo.ts) — este script é a cópia de segurança em texto.
-- ============================================================================
-- Índices filtrados (ex.: CNPJ único das lojas) exigem estas opções; o sqlcmd vem com elas desligadas.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO
IF DB_ID('${BANCO}') IS NULL CREATE DATABASE [${BANCO}];
GO
USE [${BANCO}];
GO`);
  for (const t of nomes) {
    const cs = cols.filter(c => c.TABELA === t);
    const linhas = cs.map(c => {
      let l = `  [${c.COLUNA}] ${tipoSql(c)}`;
      if (c.IDENT) l += ' IDENTITY(1,1)';
      l += c.NULO ? ' NULL' : ' NOT NULL';
      if (c.DEF) l += ` CONSTRAINT [${c.DEF_NOME}] DEFAULT ${c.DEF}`;
      return l;
    });
    for (const k of chaves.filter(k => k.TABELA === t)) {
      linhas.push(`  CONSTRAINT [${k.NOME}] ${k.TIPO === 'PK' ? 'PRIMARY KEY' : 'UNIQUE'} (${k.COLUNAS.split(', ').map(c => `[${c}]`).join(', ')})`);
    }
    sql.push(`\n-- ${DESC_TAB[t] || ''}\nIF OBJECT_ID('${t}') IS NULL\nCREATE TABLE [${t}] (\n${linhas.join(',\n')}\n);\nGO`);
  }
  sql.push('\n-- Chaves estrangeiras');
  for (const f of fks) {
    sql.push(`IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('${f.TABELA}') AND referenced_object_id = OBJECT_ID('${f.REF_TABELA}'))
  ALTER TABLE [${f.TABELA}] ADD FOREIGN KEY ([${f.COLUNA}]) REFERENCES [${f.REF_TABELA}] ([${f.REF_COLUNA}]);\nGO`);
  }
  sql.push('\n-- Índices');
  for (const i of indices) {
    sql.push(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '${i.NOME}')
  CREATE ${i.UNICO ? 'UNIQUE ' : ''}INDEX [${i.NOME}] ON [${i.TABELA}] (${i.COLUNAS.split(', ').map(c => `[${c}]`).join(', ')})${i.FILTRO ? ` WHERE ${i.FILTRO}` : ''};\nGO`);
  }
  sql.push('\n-- Triggers');
  for (const tr of triggers) {
    sql.push(`IF OBJECT_ID('${tr.NOME}', 'TR') IS NOT NULL DROP TRIGGER [${tr.NOME}];\nGO\n${tr.DEF.trim()}\nGO`);
  }
  fs.mkdirSync(path.join(RAIZ, 'backend', 'docs'), { recursive: true });
  // BOM UTF-8: o sqlcmd do Windows só lê os acentos corretamente com ele.
  fs.writeFileSync(path.join(RAIZ, 'backend', 'docs', 'schema-completo.sql'), '﻿' + sql.join('\n') + '\n');

  // ─── Seção do README ──────────────────────────────────────────────────────
  const md = [];
  md.push(`> Gerado a partir do banco \`${BANCO}\` em ${new Date().toISOString().slice(0, 10)} por \`backend/scripts/gerar-doc-banco.cjs\`.
> Para recriar a estrutura vazia: \`sqlcmd -S localhost\\SQLEXPRESS -E -i backend\\docs\\schema-completo.sql\`.

| Tabela | Para que serve |
|---|---|
${nomes.map(t => `| [\`${t}\`](#tabela-${t.toLowerCase().replace(/_/g, '_')}) | ${DESC_TAB[t] || ''} |`).join('\n')}
`);
  for (const t of nomes) {
    const cs = cols.filter(c => c.TABELA === t);
    md.push(`\n<a id="tabela-${t.toLowerCase()}"></a>\n### Tabela: \`${t}\`\n\n${DESC_TAB[t] || ''}\n`);
    md.push('| Coluna | Tipo | Nulo | Padrão | Descrição |\n|---|---|---|---|---|');
    for (const c of cs) {
      const def = c.DEF ? `\`${c.DEF.replace(/^\(+|\)+$/g, '')}\`` : (c.IDENT ? 'auto-incremento' : '');
      md.push(`| \`${c.COLUNA}\` | ${tipoSql(c)} | ${c.NULO ? 'sim' : 'não'} | ${def} | ${(DESC_COL[`${t}.${c.COLUNA}`] || '').replace(/\|/g, '\\|')} |`);
    }
    const extras = [];
    for (const k of chaves.filter(k => k.TABELA === t)) extras.push(`${k.TIPO === 'PK' ? '**Chave primária**' : '**Único**'}: ${k.COLUNAS}`);
    for (const i of indices.filter(i => i.TABELA === t)) extras.push(`**Índice${i.UNICO ? ' único' : ''}** \`${i.NOME}\`: ${i.COLUNAS}${i.FILTRO ? ` (filtro ${i.FILTRO})` : ''}`);
    for (const f of fks.filter(f => f.TABELA === t)) extras.push(`**FK**: ${f.COLUNA} → ${f.REF_TABELA}.${f.REF_COLUNA}`);
    for (const tr of triggers.filter(tr => tr.TABELA === t)) extras.push(`**Trigger** \`${tr.NOME}\`: bloqueia UPDATE/DELETE (tabela somente-inclusão)`);
    if (extras.length) md.push('\n' + extras.map(e => `- ${e}`).join('\n'));
  }
  const readme = path.join(RAIZ, 'README.md');
  let texto = fs.readFileSync(readme, 'utf8');
  const ini = '<!-- BANCO:INICIO -->', fim = '<!-- BANCO:FIM -->';
  if (!texto.includes(ini)) throw new Error('Marcadores BANCO:INICIO/BANCO:FIM não encontrados no README.');
  texto = texto.slice(0, texto.indexOf(ini) + ini.length) + '\n' + md.join('\n') + '\n' + texto.slice(texto.indexOf(fim));
  fs.writeFileSync(readme, texto);
  console.log(`OK: ${nomes.length} tabelas, ${cols.length} colunas, ${indices.length} índices, ${fks.length} FKs, ${triggers.length} trigger(s).`);
})().catch(e => { console.error(e); process.exit(1); });
