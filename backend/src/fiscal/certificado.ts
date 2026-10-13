import forge from 'node-forge';

// Leitura do certificado digital A1 (arquivo .pfx/.p12 do e-CNPJ ICP-Brasil):
// valida a senha e extrai titular, CNPJ e validade para conferência no painel.

export interface InfoCertificado {
  titular: string;
  cnpj?: string;
  emissor: string;
  validoDe: string;
  validoAte: string;
}

export class ErroCertificado extends Error {}

export function materialCertificadoA1(pfx: Buffer, senha: string): InfoCertificado & { chavePem: string; certPem: string; cadeiaPem: string } {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/password|MAC|Invalid/i.test(msg)) throw new ErroCertificado('Senha do certificado incorreta (ou arquivo não é um certificado A1 .pfx/.p12).');
    throw new ErroCertificado('Arquivo de certificado inválido. Envie o certificado A1 no formato .pfx ou .p12.');
  }

  const bolsas = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  if (chaves.length === 0) throw new ErroCertificado('O arquivo não contém a chave privada — exporte o certificado A1 COM a chave privada.');

  // O certificado do titular é o que não é autoridade certificadora.
  const certs = bolsas.map(b => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  const chave = chaves.map(b => b.key).find(k => k && certs.some(c => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey;
    return 'n' in k && pub.n?.equals((k as forge.pki.rsa.PrivateKey).n);
  })) as forge.pki.rsa.PrivateKey | undefined;
  if (!chave) throw new ErroCertificado('Chave privada não corresponde ao certificado.');
  const cert = certs.find(c => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey;
    const bc = c.getExtension('basicConstraints') as { cA?: boolean } | undefined;
    return !bc?.cA && pub.n?.equals(chave.n);
  });
  if (!cert) throw new ErroCertificado('Nenhum certificado encontrado no arquivo.');

  const cn = String(cert.subject.getField('CN')?.value || '');
  const emissor = String(cert.issuer.getField('CN')?.value || cert.issuer.getField('O')?.value || '');
  // e-CNPJ ICP-Brasil: CN = "RAZAO SOCIAL:12345678000199".
  const cnpj = (cn.match(/:(\d{14})\s*$/) || cn.match(/(\d{14})/) || [])[1];

  return {
    titular: cn.replace(/:\d{14}\s*$/, '').trim() || cn,
    cnpj,
    emissor,
    validoDe: cert.validity.notBefore.toISOString(),
    validoAte: cert.validity.notAfter.toISOString(),
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(cert),
    cadeiaPem: [cert,...certs.filter(c=>c!==cert)].map(c=>forge.pki.certificateToPem(c)).join('\n'),
  };
}

export function lerCertificadoA1(pfx: Buffer, senha: string): InfoCertificado {
  const {chavePem: _k, certPem: _c, cadeiaPem: _chain, ...info} = materialCertificadoA1(pfx,senha);
  return info;
}
