import { describe, it, expect, vi, beforeEach } from 'vitest';

// O serviço fiscal lê produtos e grava notas no SQL Server: isola os dois.
vi.mock('../src/database', () => ({
  obterProdutos: vi.fn(async () => [
    { id: 'prod-1', nome: 'Pizza Margherita', preco: 42.9, ativo: true },
    { id: 'prod-4', nome: 'Coca-Cola 2L', preco: 11, ativo: true, ncm: '22021000', cest: '0300700', codigoBarras: '7894900011517', unidade: 'GF', icmsSituacao: '500' },
  ]),
}));
vi.mock('../src/fiscal/fiscalRepo', () => ({
  obterConfigFiscal: vi.fn(),
  obterCredenciais: vi.fn(async () => ({})),
  obterNotaAtivaDaVenda: vi.fn(),
  reservarNumero: vi.fn(),
  salvarNota: vi.fn(),
}));

import forge from 'node-forge';
import { chaveValida, digitoVerificador, gerarChaveAcesso } from '../src/fiscal/chaveAcesso';
import { _definirChaveCofre, cifrar, decifrar, decifrarBuffer } from '../src/fiscal/cofre';
import { lerCertificadoA1 } from '../src/fiscal/certificado';
import {
  calcularProntidao, cnpjValido, cpfValido, emitirNotaDaVenda, montarDadosNota, validarEmissao, vendaIdDaEntrega, ErroFiscal,
} from '../src/fiscal/fiscalService';
import * as repo from '../src/fiscal/fiscalRepo';
import { _resetProvedorFiscal } from '../src/fiscal/fiscalFactory';
import { ConfigFiscalLoja } from '../src/fiscal/tipos';
import { Entrega } from '../src/types';

const config: ConfigFiscalLoja = {
  lojaId: 'loja-1', razaoSocial: 'Pizzaria Teste LTDA', cnpj: '11222333000181', inscricaoEstadual: '123456789',
  regimeTributario: 1, logradouro: 'Rua A', numero: '10', bairro: 'Centro', municipio: 'São Paulo', uf: 'SP',
  cep: '01001000', provedor: 'SIMULADO', ambiente: 'HOMOLOGACAO', serieNfce: 1, proximoNumeroNfce: 1, serieNfe: 1, proximoNumeroNfe: 1,
  ncmPadrao: '21069090', cfopPadrao: '5102', icmsSituacaoPadrao: '102', origemPadrao: '0', percentualTributos: 0,
};

/** Gera um .pfx e-CNPJ autoassinado (CN "RAZAO:CNPJ") para testar a leitura do certificado. */
function gerarPfx(senha: string, cn: string, validadeDias: number): Buffer {
  const chaves = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + validadeDias * 86_400_000);
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer([{ name: 'commonName', value: 'AC TESTE' }]);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

function entrega(parcial: Partial<Entrega>): Entrega {
  return {
    id: 'del-1', nomeCliente: 'Cliente', endereco: 'Rua B, 1', itens: [], prioridade: 'media', tipoCarga: 'normal',
    status: 'RECEBIDO', incidentes: [], logsWebhook: [], criadoEm: '', atualizadoEm: '', lojaId: 'loja-1', ...parcial,
  };
}

describe('cofre de credenciais', () => {
  it('cifra e decifra (AES-256-GCM) e detecta adulteração', () => {
    _definirChaveCofre('a'.repeat(64));
    const c = cifrar('token-secreto');
    expect(c).not.toContain('token-secreto');
    expect(decifrar(c)).toBe('token-secreto');
    expect(decifrarBuffer(cifrar(Buffer.from([1, 2, 3])))).toEqual(Buffer.from([1, 2, 3]));
    const partes = c.split(':');
    partes[3] = Buffer.from('outro-valor').toString('base64');
    expect(() => decifrar(partes.join(':'))).toThrow();
    _definirChaveCofre('b'.repeat(64));
    expect(() => decifrar(c)).toThrow(); // chave errada não abre
    _definirChaveCofre(null);
  });
});

describe('certificado A1', () => {
  const pfx = gerarPfx('senha123', 'PIZZARIA TESTE LTDA:11222333000181', 365);

  it('lê titular, CNPJ e validade com a senha correta', () => {
    const info = lerCertificadoA1(pfx, 'senha123');
    expect(info).toMatchObject({ titular: 'PIZZARIA TESTE LTDA', cnpj: '11222333000181' });
    expect(new Date(info.validoAte).getTime()).toBeGreaterThan(Date.now());
  });

  it('recusa senha errada com mensagem clara', () => {
    expect(() => lerCertificadoA1(pfx, 'errada')).toThrow(/Senha do certificado incorreta/);
  });

  it('recusa arquivo que não é certificado', () => {
    expect(() => lerCertificadoA1(Buffer.from('nao sou um pfx'), 'x')).toThrow();
  });
});

describe('prontidão para emitir', () => {
  it('simulado emite em homologação mas nunca em produção', () => {
    expect(calcularProntidao(config, {}).podeEmitir).toBe(true);
    expect(calcularProntidao(config, {}).podeEmitirEmProducao).toBe(false);
  });

  it('Focus em produção exige token de produção; certificado vencido ou de outro CNPJ bloqueia', () => {
    const focus = { ...config, provedor: 'FOCUSNFE' as const };
    expect(calcularProntidao(focus, { focusTokenHomologacao: 'h' }).podeEmitirEmProducao).toBe(false);
    expect(calcularProntidao(focus, { focusTokenHomologacao: 'h', focusTokenProducao: 'p' }).podeEmitirEmProducao).toBe(true);
    const vencido = { focusTokenHomologacao: 'h', certificadoPfx: Buffer.from('x'), certificadoCnpj: '11222333000181', certificadoValidoAte: '2020-01-01T00:00:00Z' };
    expect(calcularProntidao(focus, vencido).podeEmitir).toBe(false);
    const outroCnpj = { focusTokenHomologacao: 'h', certificadoPfx: Buffer.from('x'), certificadoCnpj: '99888777000166', certificadoValidoAte: '2099-01-01T00:00:00Z' };
    expect(calcularProntidao(focus, outroCnpj).podeEmitir).toBe(false);
    // Filial com certificado da matriz (mesma raiz de 8 dígitos) é aceito.
    const matriz = { focusTokenHomologacao: 'h', certificadoPfx: Buffer.from('x'), certificadoCnpj: '11222333000262', certificadoValidoAte: '2099-01-01T00:00:00Z' };
    expect(calcularProntidao(focus, matriz).podeEmitir).toBe(true);
  });
});

describe('chave de acesso', () => {
  it('gera 44 dígitos com DV módulo 11 válido e detecta adulteração', () => {
    const chave = gerarChaveAcesso({
      uf: 'SP', emissao: new Date('2026-10-06T12:00:00Z'), cnpj: config.cnpj, modelo: 'NFCE', serie: 1, numero: 123, codigoNumerico: '12345678',
    });
    expect(chave).toMatch(/^\d{44}$/);
    expect(chave.slice(0, 2)).toBe('35');          // cUF de SP
    expect(chave.slice(2, 6)).toBe('2610');        // AAMM
    expect(chave.slice(20, 22)).toBe('65');        // modelo NFC-e
    expect(chaveValida(chave)).toBe(true);
    const adulterada = chave.slice(0, 30) + ((Number(chave[30]) + 1) % 10) + chave.slice(31);
    expect(chaveValida(adulterada)).toBe(false);
  });

  it('DV é 0 quando o resto da divisão por 11 é 0 ou 1', () => {
    expect(digitoVerificador('0'.repeat(43))).toBe('0');
  });
});

describe('validação de documentos', () => {
  it('aceita CPF/CNPJ válidos e recusa inválidos/repetidos', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
  });
});

describe('montarDadosNota', () => {
  it('usa o preço do cardápio e rateia a taxa de entrega como outras despesas', async () => {
    const d = await montarDadosNota({
      entrega: entrega({ itens: ['2x Pizza Margherita', '1x Coca-Cola 2L'], valor: 104.8, formaPagamento: 'pix' }),
      config, modelo: 'NFCE', vendaId: 'ped-1',
    });
    expect(d.valorProdutos).toBe(96.8);
    expect(d.valorOutros).toBe(8);
    expect(d.valorTotal).toBe(104.8);
    expect(d.itens.map(i => i.valorBruto)).toEqual([85.8, 11]);
    expect(d.itens.reduce((a, i) => a + i.valorOutros, 0)).toBeCloseTo(8, 2);
    expect(d.itens[0].valorUnitario).toBe(42.9);
    expect(d.pagamento).toMatchObject({ codigo: '17', valor: 104.8 });
    expect(JSON.stringify(d.emitente)).not.toContain('tokenProvedor');
  });

  it('ignora a observação do cliente entre parênteses ao casar com o cardápio', async () => {
    const d = await montarDadosNota({
      entrega: entrega({ itens: ['1x Pizza Margherita (sem cebola)'], valor: 42.9 }), config, modelo: 'NFCE', vendaId: 'ped-obs',
    });
    expect(d.itens[0]).toMatchObject({ codigo: 'prod-1', descricao: 'Pizza Margherita', valorBruto: 42.9 });
  });

  it('linha "Taxa de entrega" não vira item: entra como outras despesas', async () => {
    const d = await montarDadosNota({
      entrega: entrega({ itens: ['1x Coca-Cola 2L', '1x Taxa de entrega'], valor: 18 }), config, modelo: 'NFCE', vendaId: 'ped-taxa',
    });
    expect(d.itens).toHaveLength(1);
    expect(d.itens[0]).toMatchObject({ descricao: 'Coca-Cola 2L', valorBruto: 11, valorOutros: 7 });
    expect(d.valorOutros).toBe(7);
  });

  it('usa NCM/CEST/GTIN/unidade/CSOSN do cadastro do produto e o padrão da loja para o resto', async () => {
    const d = await montarDadosNota({
      entrega: entrega({ itens: ['1x Pizza Margherita', '2x Coca-Cola 2L'], valor: 64.9 }), config, modelo: 'NFCE', vendaId: 'ped-ncm',
    });
    expect(d.itens[0]).toMatchObject({ ncm: '21069090', unidade: 'UN', icmsSituacao: '102', cest: undefined, codigoBarras: undefined });
    expect(d.itens[1]).toMatchObject({ ncm: '22021000', cest: '0300700', codigoBarras: '7894900011517', unidade: 'GF', icmsSituacao: '500' });
  });

  it('calcula tributos aproximados (Lei 12.741) pelo percentual da loja', async () => {
    const d = await montarDadosNota({
      entrega: entrega({ itens: ['1x Coca-Cola 2L'], valor: 11 }), config: { ...config, percentualTributos: 30 }, modelo: 'NFCE', vendaId: 'ped-trib',
    });
    expect(d.valorTributos).toBe(3.3);
    expect(d.itens[0].valorTributos).toBe(3.3);
  });

  it('valor menor que o cardápio vira desconto', async () => {
    const d = await montarDadosNota({
      entrega: entrega({ itens: ['2x Pizza Margherita'], valor: 80 }), config, modelo: 'NFCE', vendaId: 'ped-2',
    });
    expect(d.valorDesconto).toBe(5.8);
    expect(d.itens[0].valorDesconto).toBe(5.8);
  });

  it('item fora do cardápio recebe o valor restante da venda', async () => {
    const d = await montarDadosNota({
      entrega: entrega({ itens: ['1x Coca-Cola 2L', '2x Esfiha especial'], valor: 31 }), config, modelo: 'NFCE', vendaId: 'ped-3',
    });
    expect(d.itens[1]).toMatchObject({ descricao: 'Esfiha especial', quantidade: 2, valorBruto: 20, valorUnitario: 10 });
    expect(d.valorTotal).toBe(31);
  });

  it('comanda sem itens vira "Mercadorias diversas" pelo valor total', async () => {
    const d = await montarDadosNota({ entrega: entrega({ valor: 50 }), config, modelo: 'NFCE', vendaId: 'x' });
    expect(d.itens).toHaveLength(1);
    expect(d.itens[0]).toMatchObject({ descricao: 'Mercadorias diversas', valorBruto: 50 });
  });
});

describe('regras de emissão', () => {
  beforeEach(() => {
    vi.mocked(repo.obterConfigFiscal).mockResolvedValue(config);
    vi.mocked(repo.obterNotaAtivaDaVenda).mockResolvedValue(null);
    vi.mocked(repo.reservarNumero).mockResolvedValue(7);
    vi.mocked(repo.salvarNota).mockResolvedValue();
    _resetProvedorFiscal();
  });

  it('NF-e exige destinatário completo', async () => {
    await expect(validarEmissao('loja-1', 'NFE', { nome: 'Fulano' })).rejects.toThrow(/Faltando: CPF\/CNPJ/);
    await expect(validarEmissao('loja-1', 'NFE', {
      nome: 'Fulano', documento: '52998224725', logradouro: 'Rua X', bairro: 'Centro', municipio: 'São Paulo', uf: 'SP', cep: '01001000',
    })).resolves.toBeTruthy();
  });

  it('loja sem dados fiscais recebe 412', async () => {
    vi.mocked(repo.obterConfigFiscal).mockResolvedValue(null);
    await expect(validarEmissao('loja-1', 'NFCE')).rejects.toMatchObject({ httpStatus: 412 });
  });

  it('emite NFC-e simulada autorizada com chave válida e QR Code', async () => {
    const nota = await emitirNotaDaVenda({
      lojaId: 'loja-1', entrega: entrega({ itens: ['1x Coca-Cola 2L'], valor: 11 }), vendaId: 'ped-9', modelo: 'NFCE',
    });
    expect(nota.status).toBe('AUTORIZADA');
    expect(nota.numero).toBe(7);
    expect(chaveValida(nota.chave!)).toBe(true);
    expect(nota.qrcodeUrl).toContain(nota.chave);
    expect(nota.ambiente).toBe('HOMOLOGACAO');
    expect(repo.salvarNota).toHaveBeenCalledTimes(2); // PROCESSANDO antes do provedor + resultado
  });

  it('bloqueia segunda nota ativa para a mesma venda (NFC-e + NF-e = duplicidade)', async () => {
    vi.mocked(repo.obterNotaAtivaDaVenda).mockResolvedValue({ id: 'nf-1', modelo: 'NFCE', numero: 3, status: 'AUTORIZADA' } as any);
    const p = emitirNotaDaVenda({ lojaId: 'loja-1', entrega: entrega({ valor: 10 }), vendaId: 'ped-9', modelo: 'NFCE' });
    await expect(p).rejects.toBeInstanceOf(ErroFiscal);
    await expect(p).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('provedor Focus sem token do ambiente bloqueia a emissão (412)', async () => {
    vi.mocked(repo.obterConfigFiscal).mockResolvedValue({ ...config, provedor: 'FOCUSNFE' });
    await expect(validarEmissao('loja-1', 'NFCE')).rejects.toMatchObject({ httpStatus: 412, message: expect.stringContaining('token de homologação') });
    vi.mocked(repo.obterCredenciais).mockResolvedValueOnce({ focusTokenHomologacao: 'tok' });
    await expect(validarEmissao('loja-1', 'NFCE')).resolves.toBeTruthy();
  });

  it('identifica a venda de origem pela referência da entrega', () => {
    expect(vendaIdDaEntrega(entrega({ id: 'del-2', referencia: 'Origem: Pedido ped-55' }))).toBe('ped-55');
    expect(vendaIdDaEntrega(entrega({ id: 'del-3' }))).toBe('del-3');
  });
});
