import type { ConfigFiscal } from './fiscalApi';

export const PADRAO_SEFAZ:NonNullable<ConfigFiscal['sefaz']>={codigoMunicipio:'',versaoQrCode:3,pisCst:'07',cofinsCst:'07',aliquotaIcms:0,reducaoBaseIcms:0,aliquotaPis:0,aliquotaCofins:0,aliquotaCreditoSn:0};
export default function SefazConfiguracao({config,onChange}:{config:ConfigFiscal;onChange:(config:ConfigFiscal)=>void}) {
  const o={...PADRAO_SEFAZ,...config.sefaz};
  const set=(campo:keyof typeof o,valor:string|number)=>onChange({...config,sefaz:{...o,[campo]:valor}});
  return <>
    <h4 className="fiscal-secao">Emissão direta à SEFAZ</h4>
    <p className="fiscal-dica">O Distre assina e transmite com o certificado A1 da empresa. O estado determina o autorizador. Comece em homologação e confira a tributação com o responsável fiscal.</p>
    <div className="fiscal-form">
      <label className="fiscal-campo"><span>Código IBGE do município do emitente</span><input className="form-input" inputMode="numeric" maxLength={7} value={o.codigoMunicipio} onChange={e=>set('codigoMunicipio',e.target.value.replace(/\D/g,''))}/></label>
      <label className="fiscal-campo"><span>Versão do QR Code NFC-e</span><select className="form-select" value={o.versaoQrCode} onChange={e=>set('versaoQrCode',Number(e.target.value))}><option value={3}>3 — online sem CSC</option><option value={2}>2 — usa CSC da empresa</option></select></label>
      {(['qrCodeHomologacao','consultaHomologacao','qrCodeProducao','consultaProducao'] as const).map((campo,i)=><label className="fiscal-campo fiscal-campo--full" key={campo}><span>{['URL oficial QR Code — homologação','URL oficial consulta — homologação','URL oficial QR Code — produção','URL oficial consulta — produção'][i]}</span><input className="form-input" type="url" value={o[campo]||''} onChange={e=>set(campo,e.target.value)}/></label>)}
      <label className="fiscal-campo"><span>CST PIS</span><input className="form-input" maxLength={2} value={o.pisCst} onChange={e=>set('pisCst',e.target.value)}/></label>
      <label className="fiscal-campo"><span>CST COFINS</span><input className="form-input" maxLength={2} value={o.cofinsCst} onChange={e=>set('cofinsCst',e.target.value)}/></label>
      {(['aliquotaIcms','reducaoBaseIcms','aliquotaPis','aliquotaCofins','aliquotaCreditoSn'] as const).map((campo,i)=><label className="fiscal-campo" key={campo}><span>{['ICMS %','Redução da base ICMS %','PIS %','COFINS %','Crédito Simples Nacional %'][i]}</span><input className="form-input" type="number" min={0} max={100} step="0.0001" value={o[campo]} onChange={e=>set(campo,Number(e.target.value))}/></label>)}
    </div>
    <h4 className="fiscal-secao">IBS e CBS</h4>
    <p className="fiscal-dica">Informe o enquadramento aplicável à operação. CST 000: tributação integral; CST 410: imunidade ou não incidência. Operações que exigem outros grupos são bloqueadas antes do envio. No Simples, a ausência deste grupo precisa corresponder ao enquadramento da empresa.</p>
    <div className="fiscal-form">
      <label className="fiscal-campo"><span>CST IBS/CBS</span><select className="form-select" value={o.rtcCst||''} onChange={e=>set('rtcCst',e.target.value)}><option value="">Sem grupo IBS/CBS (Simples)</option><option value="000">000 — Tributação integral</option><option value="410">410 — Imunidade / não incidência</option></select></label>
      <label className="fiscal-campo"><span>Classificação tributária</span><input className="form-input" inputMode="numeric" maxLength={6} value={o.rtcClassificacao||''} onChange={e=>set('rtcClassificacao',e.target.value)}/></label>
      {(['aliquotaIbsUf','aliquotaIbsMunicipio','aliquotaCbs'] as const).map((campo,i)=><label className="fiscal-campo" key={campo}><span>{['IBS estadual %','IBS municipal %','CBS %'][i]}</span><input className="form-input" type="number" min={0} max={100} step="0.0001" value={o[campo]??0} onChange={e=>set(campo,Number(e.target.value))}/></label>)}
    </div>
  </>;
}
