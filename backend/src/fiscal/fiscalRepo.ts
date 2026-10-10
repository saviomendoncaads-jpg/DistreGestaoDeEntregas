import mssql from '../db';
import { pool } from '../database';
import { cifrar, decifrar, decifrarBuffer } from './cofre';
import { ConfigFiscalLoja, CredenciaisFiscais, ModeloNota, NotaFiscal } from './tipos';

// Persistência do Módulo Fiscal. As tabelas são aditivas (não tocam em ENTREGAS)
// e criadas sob demanda no primeiro uso — mesmo padrão "IF NOT EXISTS" do database.ts.

let tabelasProntas: Promise<void> | null = null;

export function garantirTabelasFiscais(): Promise<void> {
  if (!tabelasProntas) {
    tabelasProntas = criarTabelas().catch(err => {
      tabelasProntas = null; // permite nova tentativa (ex.: banco ainda subindo)
      throw err;
    });
  }
  return tabelasProntas;
}

async function criarTabelas() {
  if (!pool) throw new Error('Banco de dados indisponível.');
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CONFIG_FISCAL_LOJA' AND xtype='U')
    CREATE TABLE CONFIG_FISCAL_LOJA (
      LOJA_ID VARCHAR(50) PRIMARY KEY,
      RAZAO_SOCIAL NVARCHAR(200) NOT NULL,
      NOME_FANTASIA NVARCHAR(200) NULL,
      CNPJ VARCHAR(14) NOT NULL,
      INSCRICAO_ESTADUAL VARCHAR(20) NOT NULL,
      REGIME_TRIBUTARIO INT NOT NULL,
      LOGRADOURO NVARCHAR(200) NOT NULL,
      NUMERO NVARCHAR(20) NOT NULL,
      BAIRRO NVARCHAR(120) NOT NULL,
      MUNICIPIO NVARCHAR(120) NOT NULL,
      UF CHAR(2) NOT NULL,
      CEP VARCHAR(8) NOT NULL,
      TELEFONE VARCHAR(20) NULL,
      AMBIENTE VARCHAR(12) NOT NULL,
      SERIE_NFCE INT NOT NULL,
      PROXIMO_NUMERO_NFCE INT NOT NULL,
      SERIE_NFE INT NOT NULL,
      PROXIMO_NUMERO_NFE INT NOT NULL,
      NCM_PADRAO VARCHAR(8) NOT NULL,
      CFOP_PADRAO VARCHAR(4) NOT NULL,
      ICMS_SITUACAO_PADRAO VARCHAR(4) NOT NULL,
      ORIGEM_PADRAO VARCHAR(1) NOT NULL,
      TOKEN_PROVEDOR NVARCHAR(200) NULL,
      ATUALIZADO_EM VARCHAR(100) NOT NULL
    );

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NOTAS_FISCAIS' AND xtype='U')
    CREATE TABLE NOTAS_FISCAIS (
      ID VARCHAR(50) PRIMARY KEY,
      LOJA_ID VARCHAR(50) NOT NULL,
      ENTREGA_ID VARCHAR(50) NULL,
      PEDIDO_ID VARCHAR(50) NULL,
      MODELO VARCHAR(4) NOT NULL,
      NUMERO INT NULL,
      SERIE INT NULL,
      CHAVE VARCHAR(44) NULL,
      PROTOCOLO VARCHAR(30) NULL,
      STATUS VARCHAR(12) NOT NULL,
      AMBIENTE VARCHAR(12) NOT NULL,
      PROVEDOR VARCHAR(20) NOT NULL,
      REF_PROVEDOR VARCHAR(60) NOT NULL,
      VALOR_TOTAL DECIMAL(12,2) NOT NULL,
      DANFE_URL NVARCHAR(600) NULL,
      XML_URL NVARCHAR(600) NULL,
      QRCODE_URL NVARCHAR(1000) NULL,
      URL_CONSULTA NVARCHAR(600) NULL,
      MENSAGEM NVARCHAR(1000) NULL,
      DADOS NVARCHAR(MAX) NOT NULL,
      EMITIDA_EM VARCHAR(100) NULL,
      CRIADO_EM VARCHAR(100) NOT NULL,
      ATUALIZADO_EM VARCHAR(100) NOT NULL
    );

    -- Evolução da config: provedor por loja, e-mail e tributos aproximados (Lei 12.741).
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CONFIG_FISCAL_LOJA') AND name = 'PROVEDOR')
      ALTER TABLE CONFIG_FISCAL_LOJA ADD PROVEDOR VARCHAR(12) NOT NULL CONSTRAINT DF_CFL_PROVEDOR DEFAULT 'SIMULADO';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CONFIG_FISCAL_LOJA') AND name = 'PERCENTUAL_TRIBUTOS')
      ALTER TABLE CONFIG_FISCAL_LOJA ADD PERCENTUAL_TRIBUTOS DECIMAL(5,2) NOT NULL CONSTRAINT DF_CFL_TRIBUTOS DEFAULT 0;
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CONFIG_FISCAL_LOJA') AND name = 'EMAIL')
      ALTER TABLE CONFIG_FISCAL_LOJA ADD EMAIL NVARCHAR(120) NULL;

    -- Segredos fiscais da loja, todos CIFRADOS (AES-256-GCM, chave fora do banco — fiscal/cofre.ts).
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CREDENCIAIS_FISCAIS' AND xtype='U')
    CREATE TABLE CREDENCIAIS_FISCAIS (
      LOJA_ID VARCHAR(50) PRIMARY KEY,
      CERT_PFX NVARCHAR(MAX) NULL,
      CERT_SENHA NVARCHAR(400) NULL,
      CERT_TITULAR NVARCHAR(200) NULL,
      CERT_CNPJ VARCHAR(14) NULL,
      CERT_VALIDO_ATE VARCHAR(40) NULL,
      CSC_ID_HOMOLOGACAO VARCHAR(10) NULL,
      CSC_HOMOLOGACAO NVARCHAR(400) NULL,
      CSC_ID_PRODUCAO VARCHAR(10) NULL,
      CSC_PRODUCAO NVARCHAR(400) NULL,
      FOCUS_TOKEN_HOMOLOGACAO NVARCHAR(400) NULL,
      FOCUS_TOKEN_PRODUCAO NVARCHAR(400) NULL,
      FOCUS_TOKEN_PRINCIPAL NVARCHAR(400) NULL,
      SINCRONIZADO_EM VARCHAR(100) NULL,
      ATUALIZADO_EM VARCHAR(100) NOT NULL
    );

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_NOTAS_FISCAIS_LOJA')
      CREATE INDEX IX_NOTAS_FISCAIS_LOJA ON NOTAS_FISCAIS (LOJA_ID, CRIADO_EM);
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_NOTAS_FISCAIS_PEDIDO')
      CREATE INDEX IX_NOTAS_FISCAIS_PEDIDO ON NOTAS_FISCAIS (PEDIDO_ID);
  `);
}

// ─── Configuração fiscal da loja ─────────────────────────────────────────────

function linhaParaConfig(r: any): ConfigFiscalLoja {
  return {
    lojaId: r.LOJA_ID,
    razaoSocial: r.RAZAO_SOCIAL,
    nomeFantasia: r.NOME_FANTASIA || undefined,
    cnpj: r.CNPJ,
    inscricaoEstadual: r.INSCRICAO_ESTADUAL,
    regimeTributario: Number(r.REGIME_TRIBUTARIO) as 1 | 2 | 3,
    logradouro: r.LOGRADOURO,
    numero: r.NUMERO,
    bairro: r.BAIRRO,
    municipio: r.MUNICIPIO,
    uf: r.UF,
    cep: r.CEP,
    telefone: r.TELEFONE || undefined,
    email: r.EMAIL || undefined,
    provedor: r.PROVEDOR === 'FOCUSNFE' ? 'FOCUSNFE' : 'SIMULADO',
    ambiente: r.AMBIENTE,
    serieNfce: Number(r.SERIE_NFCE),
    proximoNumeroNfce: Number(r.PROXIMO_NUMERO_NFCE),
    serieNfe: Number(r.SERIE_NFE),
    proximoNumeroNfe: Number(r.PROXIMO_NUMERO_NFE),
    ncmPadrao: r.NCM_PADRAO,
    cfopPadrao: r.CFOP_PADRAO,
    icmsSituacaoPadrao: r.ICMS_SITUACAO_PADRAO,
    origemPadrao: r.ORIGEM_PADRAO,
    percentualTributos: Number(r.PERCENTUAL_TRIBUTOS ?? 0),
    atualizadoEm: r.ATUALIZADO_EM,
  };
}

export async function obterConfigFiscal(lojaId: string): Promise<ConfigFiscalLoja | null> {
  await garantirTabelasFiscais();
  const r = await pool.request()
    .input('lojaId', mssql.VarChar, lojaId)
    .query('SELECT * FROM CONFIG_FISCAL_LOJA WHERE LOJA_ID = @lojaId');
  return r.recordset[0] ? linhaParaConfig(r.recordset[0]) : null;
}

/** Upsert da configuração (os segredos ficam em CREDENCIAIS_FISCAIS). */
export async function salvarConfigFiscal(c: ConfigFiscalLoja): Promise<void> {
  await garantirTabelasFiscais();
  const req = pool.request()
    .input('lojaId', mssql.VarChar, c.lojaId)
    .input('razao', mssql.NVarChar, c.razaoSocial)
    .input('fantasia', mssql.NVarChar, c.nomeFantasia ?? null)
    .input('cnpj', mssql.VarChar, c.cnpj)
    .input('ie', mssql.VarChar, c.inscricaoEstadual)
    .input('regime', mssql.Int, c.regimeTributario)
    .input('logradouro', mssql.NVarChar, c.logradouro)
    .input('numero', mssql.NVarChar, c.numero)
    .input('bairro', mssql.NVarChar, c.bairro)
    .input('municipio', mssql.NVarChar, c.municipio)
    .input('uf', mssql.Char(2), c.uf)
    .input('cep', mssql.VarChar, c.cep)
    .input('telefone', mssql.VarChar, c.telefone ?? null)
    .input('email', mssql.NVarChar, c.email ?? null)
    .input('provedor', mssql.VarChar, c.provedor)
    .input('tributos', mssql.Decimal(5, 2), c.percentualTributos)
    .input('ambiente', mssql.VarChar, c.ambiente)
    .input('serieNfce', mssql.Int, c.serieNfce)
    .input('proxNfce', mssql.Int, c.proximoNumeroNfce)
    .input('serieNfe', mssql.Int, c.serieNfe)
    .input('proxNfe', mssql.Int, c.proximoNumeroNfe)
    .input('ncm', mssql.VarChar, c.ncmPadrao)
    .input('cfop', mssql.VarChar, c.cfopPadrao)
    .input('icms', mssql.VarChar, c.icmsSituacaoPadrao)
    .input('origem', mssql.VarChar, c.origemPadrao)
    .input('agora', mssql.VarChar, new Date().toISOString());
  await req.query(`
    MERGE INTO CONFIG_FISCAL_LOJA AS t
    USING (SELECT @lojaId AS LOJA_ID) AS s ON t.LOJA_ID = s.LOJA_ID
    WHEN MATCHED THEN UPDATE SET
      RAZAO_SOCIAL=@razao, NOME_FANTASIA=@fantasia, CNPJ=@cnpj, INSCRICAO_ESTADUAL=@ie,
      REGIME_TRIBUTARIO=@regime, LOGRADOURO=@logradouro, NUMERO=@numero, BAIRRO=@bairro,
      MUNICIPIO=@municipio, UF=@uf, CEP=@cep, TELEFONE=@telefone, EMAIL=@email, PROVEDOR=@provedor,
      AMBIENTE=@ambiente, PERCENTUAL_TRIBUTOS=@tributos,
      SERIE_NFCE=@serieNfce, PROXIMO_NUMERO_NFCE=@proxNfce, SERIE_NFE=@serieNfe, PROXIMO_NUMERO_NFE=@proxNfe,
      NCM_PADRAO=@ncm, CFOP_PADRAO=@cfop, ICMS_SITUACAO_PADRAO=@icms, ORIGEM_PADRAO=@origem,
      ATUALIZADO_EM=@agora
    WHEN NOT MATCHED THEN INSERT (
      LOJA_ID, RAZAO_SOCIAL, NOME_FANTASIA, CNPJ, INSCRICAO_ESTADUAL, REGIME_TRIBUTARIO, LOGRADOURO,
      NUMERO, BAIRRO, MUNICIPIO, UF, CEP, TELEFONE, EMAIL, PROVEDOR, AMBIENTE, PERCENTUAL_TRIBUTOS,
      SERIE_NFCE, PROXIMO_NUMERO_NFCE, SERIE_NFE, PROXIMO_NUMERO_NFE, NCM_PADRAO, CFOP_PADRAO,
      ICMS_SITUACAO_PADRAO, ORIGEM_PADRAO, ATUALIZADO_EM
    ) VALUES (
      @lojaId, @razao, @fantasia, @cnpj, @ie, @regime, @logradouro, @numero, @bairro, @municipio, @uf,
      @cep, @telefone, @email, @provedor, @ambiente, @tributos, @serieNfce, @proxNfce, @serieNfe, @proxNfe,
      @ncm, @cfop, @icms, @origem, @agora
    );
  `);
}

// ─── Credenciais (cifradas) ───────────────────────────────────────────────────

const COLUNAS_CIFRADAS: Array<[keyof CredenciaisFiscais, string]> = [
  ['certificadoSenha', 'CERT_SENHA'],
  ['cscHomologacao', 'CSC_HOMOLOGACAO'],
  ['cscProducao', 'CSC_PRODUCAO'],
  ['focusTokenHomologacao', 'FOCUS_TOKEN_HOMOLOGACAO'],
  ['focusTokenProducao', 'FOCUS_TOKEN_PRODUCAO'],
  ['focusTokenPrincipal', 'FOCUS_TOKEN_PRINCIPAL'],
];
const COLUNAS_ABERTAS: Array<[keyof CredenciaisFiscais, string]> = [
  ['certificadoTitular', 'CERT_TITULAR'],
  ['certificadoCnpj', 'CERT_CNPJ'],
  ['certificadoValidoAte', 'CERT_VALIDO_ATE'],
  ['cscIdHomologacao', 'CSC_ID_HOMOLOGACAO'],
  ['cscIdProducao', 'CSC_ID_PRODUCAO'],
  ['sincronizadoEm', 'SINCRONIZADO_EM'],
];

export async function obterCredenciais(lojaId: string): Promise<CredenciaisFiscais> {
  await garantirTabelasFiscais();
  const r = await pool.request()
    .input('lojaId', mssql.VarChar, lojaId)
    .query('SELECT * FROM CREDENCIAIS_FISCAIS WHERE LOJA_ID = @lojaId');
  const row = r.recordset[0];
  if (!row) return {};
  const out: CredenciaisFiscais = { atualizadoEm: row.ATUALIZADO_EM };
  try {
    if (row.CERT_PFX) out.certificadoPfx = decifrarBuffer(row.CERT_PFX);
    for (const [campo, col] of COLUNAS_CIFRADAS) if (row[col]) (out as any)[campo] = decifrar(row[col]);
  } catch (err) {
    // Chave do cofre trocada/perdida: trata como não configurado (loja reenvia no painel).
    console.error(`[Fiscal] Não foi possível decifrar as credenciais da loja ${lojaId}:`, (err as Error).message);
    return { atualizadoEm: row.ATUALIZADO_EM };
  }
  for (const [campo, col] of COLUNAS_ABERTAS) if (row[col]) (out as any)[campo] = row[col];
  return out;
}

/**
 * Atualiza só os campos presentes em `parcial`: undefined = mantém, null = apaga.
 * Os segredos são cifrados aqui, antes de qualquer contato com o banco.
 */
export async function salvarCredenciais(lojaId: string, parcial: { [K in keyof CredenciaisFiscais]?: CredenciaisFiscais[K] | null }): Promise<void> {
  await garantirTabelasFiscais();
  const req = pool.request()
    .input('lojaId', mssql.VarChar, lojaId)
    .input('agora', mssql.VarChar, new Date().toISOString());
  const sets: string[] = [];
  const colunasInsert: string[] = ['LOJA_ID', 'ATUALIZADO_EM'];
  const valoresInsert: string[] = ['@lojaId', '@agora'];
  const adicionar = (col: string, valor: string | null) => {
    req.input(col, mssql.NVarChar, valor);
    sets.push(`${col} = @${col}`);
    colunasInsert.push(col);
    valoresInsert.push(`@${col}`);
  };
  if (parcial.certificadoPfx !== undefined) adicionar('CERT_PFX', parcial.certificadoPfx ? cifrar(parcial.certificadoPfx) : null);
  for (const [campo, col] of COLUNAS_CIFRADAS) {
    const v = parcial[campo];
    if (v !== undefined) adicionar(col, v ? cifrar(String(v)) : null);
  }
  for (const [campo, col] of COLUNAS_ABERTAS) {
    const v = parcial[campo];
    if (v !== undefined) adicionar(col, v ? String(v) : null);
  }
  await req.query(`
    MERGE INTO CREDENCIAIS_FISCAIS AS t
    USING (SELECT @lojaId AS LOJA_ID) AS s ON t.LOJA_ID = s.LOJA_ID
    WHEN MATCHED THEN UPDATE SET ${[...sets, 'ATUALIZADO_EM = @agora'].join(', ')}
    WHEN NOT MATCHED THEN INSERT (${colunasInsert.join(', ')}) VALUES (${valoresInsert.join(', ')});
  `);
}

/** Reserva o próximo número da série de forma atômica (sem corrida entre caixas). */
export async function reservarNumero(lojaId: string, modelo: ModeloNota): Promise<number> {
  await garantirTabelasFiscais();
  const col = modelo === 'NFCE' ? 'PROXIMO_NUMERO_NFCE' : 'PROXIMO_NUMERO_NFE';
  const r = await pool.request()
    .input('lojaId', mssql.VarChar, lojaId)
    .query(`UPDATE CONFIG_FISCAL_LOJA SET ${col} = ${col} + 1 OUTPUT DELETED.${col} AS NUMERO WHERE LOJA_ID = @lojaId`);
  if (!r.recordset[0]) throw new Error('Configuração fiscal da loja não encontrada.');
  return Number(r.recordset[0].NUMERO);
}

// ─── Notas fiscais ────────────────────────────────────────────────────────────

function linhaParaNota(r: any): NotaFiscal {
  return {
    id: r.ID,
    lojaId: r.LOJA_ID,
    entregaId: r.ENTREGA_ID || undefined,
    pedidoId: r.PEDIDO_ID || undefined,
    modelo: r.MODELO,
    numero: r.NUMERO ?? undefined,
    serie: r.SERIE ?? undefined,
    chave: r.CHAVE || undefined,
    protocolo: r.PROTOCOLO || undefined,
    status: r.STATUS,
    ambiente: r.AMBIENTE,
    provedor: r.PROVEDOR,
    refProvedor: r.REF_PROVEDOR,
    valorTotal: Number(r.VALOR_TOTAL),
    danfeUrl: r.DANFE_URL || undefined,
    xmlUrl: r.XML_URL || undefined,
    qrcodeUrl: r.QRCODE_URL || undefined,
    urlConsulta: r.URL_CONSULTA || undefined,
    mensagem: r.MENSAGEM || undefined,
    dados: JSON.parse(r.DADOS),
    emitidaEm: r.EMITIDA_EM || undefined,
    criadoEm: r.CRIADO_EM,
    atualizadoEm: r.ATUALIZADO_EM,
  };
}

export async function salvarNota(n: NotaFiscal): Promise<void> {
  await garantirTabelasFiscais();
  await pool.request()
    .input('id', mssql.VarChar, n.id)
    .input('lojaId', mssql.VarChar, n.lojaId)
    .input('entregaId', mssql.VarChar, n.entregaId ?? null)
    .input('pedidoId', mssql.VarChar, n.pedidoId ?? null)
    .input('modelo', mssql.VarChar, n.modelo)
    .input('numero', mssql.Int, n.numero ?? null)
    .input('serie', mssql.Int, n.serie ?? null)
    .input('chave', mssql.VarChar, n.chave ?? null)
    .input('protocolo', mssql.VarChar, n.protocolo ?? null)
    .input('status', mssql.VarChar, n.status)
    .input('ambiente', mssql.VarChar, n.ambiente)
    .input('provedor', mssql.VarChar, n.provedor)
    .input('ref', mssql.VarChar, n.refProvedor)
    .input('valor', mssql.Decimal(12, 2), n.valorTotal)
    .input('danfe', mssql.NVarChar, n.danfeUrl ?? null)
    .input('xml', mssql.NVarChar, n.xmlUrl ?? null)
    .input('qrcode', mssql.NVarChar, n.qrcodeUrl ?? null)
    .input('consulta', mssql.NVarChar, n.urlConsulta ?? null)
    .input('mensagem', mssql.NVarChar, n.mensagem ? n.mensagem.slice(0, 1000) : null)
    .input('dados', mssql.NVarChar, JSON.stringify(n.dados))
    .input('emitidaEm', mssql.VarChar, n.emitidaEm ?? null)
    .input('criadoEm', mssql.VarChar, n.criadoEm)
    .input('atualizadoEm', mssql.VarChar, n.atualizadoEm)
    .query(`
      MERGE INTO NOTAS_FISCAIS AS t
      USING (SELECT @id AS ID) AS s ON t.ID = s.ID
      WHEN MATCHED THEN UPDATE SET
        ENTREGA_ID=@entregaId, NUMERO=@numero, SERIE=@serie, CHAVE=@chave, PROTOCOLO=@protocolo,
        STATUS=@status, DANFE_URL=@danfe, XML_URL=@xml, QRCODE_URL=@qrcode, URL_CONSULTA=@consulta,
        MENSAGEM=@mensagem, DADOS=@dados, EMITIDA_EM=@emitidaEm, ATUALIZADO_EM=@atualizadoEm
      WHEN NOT MATCHED THEN INSERT (
        ID, LOJA_ID, ENTREGA_ID, PEDIDO_ID, MODELO, NUMERO, SERIE, CHAVE, PROTOCOLO, STATUS, AMBIENTE,
        PROVEDOR, REF_PROVEDOR, VALOR_TOTAL, DANFE_URL, XML_URL, QRCODE_URL, URL_CONSULTA, MENSAGEM,
        DADOS, EMITIDA_EM, CRIADO_EM, ATUALIZADO_EM
      ) VALUES (
        @id, @lojaId, @entregaId, @pedidoId, @modelo, @numero, @serie, @chave, @protocolo, @status,
        @ambiente, @provedor, @ref, @valor, @danfe, @xml, @qrcode, @consulta, @mensagem, @dados,
        @emitidaEm, @criadoEm, @atualizadoEm
      );
    `);
}

export async function obterNota(id: string): Promise<NotaFiscal | null> {
  await garantirTabelasFiscais();
  const r = await pool.request().input('id', mssql.VarChar, id).query('SELECT * FROM NOTAS_FISCAIS WHERE ID = @id');
  return r.recordset[0] ? linhaParaNota(r.recordset[0]) : null;
}

/** Notas da loja criadas desde `desde` (ISO), mais recentes primeiro. */
export async function listarNotasDaLoja(lojaId: string, desde: string): Promise<NotaFiscal[]> {
  await garantirTabelasFiscais();
  const r = await pool.request()
    .input('lojaId', mssql.VarChar, lojaId)
    .input('desde', mssql.VarChar, desde)
    .query('SELECT TOP 500 * FROM NOTAS_FISCAIS WHERE LOJA_ID = @lojaId AND CRIADO_EM >= @desde ORDER BY CRIADO_EM DESC');
  return r.recordset.map(linhaParaNota);
}

/** Nota ainda válida (autorizada ou em processamento) para a venda — impede emissão em duplicidade. */
export async function obterNotaAtivaDaVenda(pedidoId: string): Promise<NotaFiscal | null> {
  await garantirTabelasFiscais();
  const r = await pool.request()
    .input('pedidoId', mssql.VarChar, pedidoId)
    .query(`SELECT TOP 1 * FROM NOTAS_FISCAIS WHERE PEDIDO_ID = @pedidoId AND STATUS IN ('AUTORIZADA','PROCESSANDO') ORDER BY CRIADO_EM DESC`);
  return r.recordset[0] ? linhaParaNota(r.recordset[0]) : null;
}
