import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Cofre das credenciais fiscais (certificado A1, senha, CSC, tokens do provedor).
// Tudo é gravado no banco cifrado com AES-256-GCM; a chave NUNCA vai para o banco:
//  1) FISCAL_CHAVE_CRIPTOGRAFIA no .env (64 caracteres hex), ou
//  2) arquivo backend/.chave-fiscal, gerado automaticamente no primeiro uso.
// Perder a chave = as credenciais salvas ficam ilegíveis (basta reenviá-las no painel).

const ARQUIVO_CHAVE = path.join(__dirname, '..', '..', '.chave-fiscal');
const PREFIXO = 'v1';

let chave: Buffer | null = null;

function obterChave(): Buffer {
  if (chave) return chave;
  const doEnv = (process.env.FISCAL_CHAVE_CRIPTOGRAFIA || '').trim();
  if (doEnv) {
    if (!/^[0-9a-fA-F]{64}$/.test(doEnv)) {
      throw new Error('FISCAL_CHAVE_CRIPTOGRAFIA deve ter 64 caracteres hexadecimais (32 bytes).');
    }
    chave = Buffer.from(doEnv, 'hex');
    return chave;
  }
  if (fs.existsSync(ARQUIVO_CHAVE)) {
    chave = Buffer.from(fs.readFileSync(ARQUIVO_CHAVE, 'utf8').trim(), 'hex');
  } else {
    chave = crypto.randomBytes(32);
    fs.writeFileSync(ARQUIVO_CHAVE, chave.toString('hex'), { encoding: 'utf8', mode: 0o600 });
    console.log(`[Fiscal] Chave de criptografia das credenciais gerada em ${ARQUIVO_CHAVE} — faça backup dela junto com o banco.`);
  }
  if (chave.length !== 32) throw new Error('Chave de criptografia fiscal inválida.');
  return chave;
}

export function cifrar(valor: string | Buffer): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', obterChave(), iv);
  const dados = Buffer.concat([c.update(typeof valor === 'string' ? Buffer.from(valor, 'utf8') : valor), c.final()]);
  return [PREFIXO, iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join(':');
}

export function decifrarBuffer(cifrado: string): Buffer {
  const [prefixo, iv, tag, dados] = cifrado.split(':');
  if (prefixo !== PREFIXO || !iv || !tag || dados === undefined) throw new Error('Credencial fiscal em formato desconhecido.');
  const d = crypto.createDecipheriv('aes-256-gcm', obterChave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]);
}

export function decifrar(cifrado: string): string {
  return decifrarBuffer(cifrado).toString('utf8');
}

/** Para testes: injeta uma chave fixa. */
export function _definirChaveCofre(hex: string | null) {
  chave = hex ? Buffer.from(hex, 'hex') : null;
}
