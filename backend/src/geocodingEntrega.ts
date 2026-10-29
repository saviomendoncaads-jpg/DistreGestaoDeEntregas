import { enriquecerComViaCep, geocodificarEndereco, type EnderecoParaGeocodificar } from './geocoding';

interface Coordenada { latitude: number; longitude: number; precisao?: 'logradouro' }
interface Candidato {
  score?: number; location?: { x?: number; y?: number };
  attributes?: { Addr_type?: string; Country?: string; City?: string; RegionAbbr?: string; StName?: string; StPreType?: string; StType?: string; AddNum?: string };
}
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nomeRua = (s: string) => normalizar(s.replace(/^(rua|r\.?|avenida|av\.?|travessa|tv\.?|estrada|rodovia|praça|praca|alameda)\s+/i, ''));
const cache = new Map<string, { coord: Coordenada; expira: number }>();
const emCurso = new Map<string, Promise<Coordenada | null>>();

/** Só aceita logradouro da mesma cidade/UF; destino numerado precisa casar com o número. */
export function coordenadaDoCandidato(c: Candidato, end: EnderecoParaGeocodificar): Coordenada | null {
  const a = c.attributes;
  const tipos = end.numero ? ['PointAddress','Subaddress','StreetAddress','PointAddressInt'] : ['PointAddress','StreetAddress','StreetName'];
  if (!a || typeof c.score !== 'number' || c.score < 95 || !tipos.includes(a.Addr_type || '') || a.Country !== 'BRA') return null;
  if (!end.cidade || !end.uf || normalizar(a.City || '') !== normalizar(end.cidade) || normalizar(a.RegionAbbr || '') !== normalizar(end.uf)) return null;
  const rua = [a.StPreType, a.StName, a.StType].filter(Boolean).join(' ');
  if (!end.endereco || !a.StName || nomeRua(rua) !== nomeRua(end.endereco)) return null;
  if (end.numero && normalizar(a.AddNum || '') !== normalizar(end.numero)) return null;
  const latitude = c.location?.y, longitude = c.location?.x;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -34 || latitude > 6 || longitude < -74 || longitude > -34) return null;
  return { latitude, longitude, ...(a.Addr_type === 'StreetName' ? { precisao: 'logradouro' as const } : {}) };
}

/** ViaCEP preenche o endereço; ArcGIS resolve ruas ausentes no OpenStreetMap. */
export async function localizarEnderecoEntrega(entrada: EnderecoParaGeocodificar): Promise<Coordenada | null> {
  const chave = JSON.stringify(['cep','endereco','numero','bairro','cidade','uf'].map(k => String(entrada[k as keyof EnderecoParaGeocodificar] || '').trim().toLowerCase()));
  const salvo = cache.get(chave);
  if (salvo && salvo.expira > Date.now()) return salvo.coord;
  const pendente = emCurso.get(chave); if (pendente) return pendente;
  const resolver = async () => {
    const end = await enriquecerComViaCep(entrada);
    let coord: Coordenada | null = null;
    if (end.endereco && end.cidade && end.uf) {
      const singleLine = [end.endereco, end.numero, end.bairro, end.cidade, end.uf, end.cep].filter(Boolean).join(', ');
      const url = new URL('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates');
      const parametros = { SingleLine: singleLine, sourceCountry: 'BRA', outFields: 'Addr_type,Country,City,RegionAbbr,StPreType,StName,StType,AddNum', maxLocations: '3', forStorage: 'false', f: 'json' };
      url.search = new URLSearchParams(parametros).toString();
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const data = await response.json() as { candidates?: Candidato[] };
          if (Array.isArray(data.candidates)) for (const c of data.candidates) { coord = coordenadaDoCandidato(c, end); if (coord) break; }
          // Número fora da cobertura: consulta a MESMA rua, cidade e UF, sem inventar uma casa.
          if (!coord && end.numero) {
            const semNumero = { ...end, numero: undefined };
            url.search = new URLSearchParams({ ...parametros, SingleLine: [end.endereco,end.bairro,end.cidade,end.uf,end.cep].filter(Boolean).join(', ') }).toString();
            const alternativa = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (alternativa.ok) {
              const dados = await alternativa.json() as { candidates?: Candidato[] };
              if (Array.isArray(dados.candidates)) for (const c of dados.candidates) {
                const ponto = coordenadaDoCandidato(c, semNumero);
                if (ponto) { coord = { ...ponto, precisao: 'logradouro' }; break; }
              }
            }
          }
        }
      } catch { /* Falha transitória: permite outra tentativa e o provedor alternativo. */ }
    }
    if (!coord) { const ponto = await geocodificarEndereco(end, false); if (ponto) coord = { ...ponto, precisao: 'logradouro' }; }
    if (coord) {
      if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
      cache.set(chave, { coord, expira: Date.now() + 24 * 3600000 });
    }
    return coord;
  };
  const promessa = resolver(); emCurso.set(chave, promessa);
  try { return await promessa; } finally { emCurso.delete(chave); }
}
