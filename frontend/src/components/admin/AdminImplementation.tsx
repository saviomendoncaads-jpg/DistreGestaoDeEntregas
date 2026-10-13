import { useCallback,useEffect,useState } from 'react';
import { implementationRequest,type ImplementationState } from '../../implantacao/api';
type StoreState=ImplementationState&{empresaId:string;ativo:boolean};
export default function AdminImplementation({token}:{token:string}){
 const [data,setData]=useState<StoreState[]|null>(null);const [error,setError]=useState('');const [query,setQuery]=useState('');
 const load=useCallback(async()=>{try{setError('');setData(await implementationRequest(token,'/admin'));}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar.');}},[token]);
 useEffect(()=>{void load();},[load]);
 return <section><div className="admin-header"><h2>Implantação das lojas</h2><button className="btn btn-secondary" onClick={()=>void load()}>Atualizar progresso</button></div>
 <p>Etapa atual, pendências e conclusão por loja. Treinamentos confirmados por conhecimento prévio não significam aula assistida.</p>
 {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Carregando implantação…</p>}
 <label>Buscar loja <input className="form-input" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {data&&<div className="admin-table-container"><table className="admin-table"><thead><tr><th>Loja</th><th>Progresso</th><th>Etapa / pendência</th><th>Conclusão</th><th>Acompanhamento</th></tr></thead><tbody>{data.filter(s=>s.nomeLoja.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).map(s=><tr key={s.lojaId}><td>{s.nomeLoja}{!s.ativo&&' (inativa)'}</td><td>{s.completed}/7 · {s.percent}%</td><td>{s.startedAt?s.currentTitle:'Implantação ainda não iniciada'}<small style={{display:'block'}}>Produtos: {s.stats.produtos} · Saldos: {s.stats.comEstoque} · Imagens: {s.stats.comImagem}</small></td><td>{s.completedAt?new Date(s.completedAt).toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza'}):'Pendente'}</td><td>{s.ativo?<a className="btn btn-secondary btn-small" href={`/implantacao?lojaId=${encodeURIComponent(s.lojaId)}`}>Ver jornada</a>:'Loja inativa'}</td></tr>)}</tbody></table>{!data.length&&<p>Nenhuma loja cadastrada.</p>}</div>}
 </section>;
}
