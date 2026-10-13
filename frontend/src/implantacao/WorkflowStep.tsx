import { useState } from 'react';
import type { Step } from './types';
import type { ImplementationState } from './api';
import Icon from './Icon';
import Materiais from './Materiais';
export default function WorkflowStep({step,state,busy,readOnly,onComplete}:{step:Step;state:ImplementationState;busy:boolean;readOnly:boolean;onComplete:()=>void}){
 const [confirmed,setConfirmed]=useState(false);
 if(readOnly)return <p>Acompanhamento administrativo. A loja confirma suas etapas na própria sessão.</p>;
 const training=step.type==='video';
 const area=step.id===2?'produtos':step.id===4?'estoque':'produtos';
 const caption=step.id===2?'Abrir cadastro e importação de produtos':step.id===4?'Abrir gestão de estoque':'Abrir produtos e cadastrar imagens';
 const ready=step.id===2?state.stats.produtos>0:step.id===4?state.stats.produtos>0&&state.stats.comEstoque===state.stats.produtos:step.id===5?state.stats.produtos>0&&(!state.recebePedidos||state.stats.comImagem===state.stats.produtos):true;
 return <div>
  {training?<><Materiais passo={step.id}/><p className="imp-upload-note">Assista à aula e use o manual quando precisar. Se você já conhece esta etapa, pode confirmar direto. O Distre não registra se o vídeo foi assistido: a confirmação é uma declaração da loja.</p></>:
   step.id===7?<div className="imp-launch"><Materiais passo={7}/><h3>Sua loja está preparada para começar.</h3><p>O sistema verificará novamente os produtos, os saldos e as imagens necessárias. O aceite conclui a implantação, sem gerar pedidos, notas ou cobranças.</p></div>:<>
    <Materiais passo={step.id}/>
    <div className="imp-resource"><Icon name="file"/><div><strong>{step.id===2?`${state.stats.produtos} produtos ativos cadastrados`:step.id===4?`${state.stats.comEstoque} de ${state.stats.produtos} produtos com saldo registrado`:`${state.stats.comImagem} de ${state.stats.produtos} produtos com imagem principal`}</strong><p>Dados reais da loja consultados no servidor.</p></div></div>
    {step.id===5&&!state.recebePedidos&&<p className="imp-upload-note">Esta loja não recebe pedidos pelo e-commerce. Imagens são opcionais até habilitar esse canal.</p>}
    <a className="imp-button secondary" href={`/app?area=${area}&retorno=implantacao`}>{caption} <Icon name="arrow" size={16}/></a>
    <p className="imp-upload-note">Use o cadastro existente para realizar a tarefa e retorne à implantação. O botão abaixo verifica os registros; selecionar um arquivo de exemplo não conclui a tarefa.</p>
   </>}
  <label style={{display:'flex',alignItems:'flex-start',gap:8,marginTop:18,fontSize:12}}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{training?'Assisti à aula, ou já conheço esta etapa, e sei realizar o que ela ensina.':step.id===7?'Revisei os dados e confirmo que a loja está pronta para iniciar a operação.':'Revisei os dados desta etapa na loja.'}</label>
  <div className="imp-action-row"><span>{training?'Confirmação da loja · assistir ao vídeo não é obrigatório':ready?'Os registros serão verificados ao confirmar.':'Existem dados pendentes nesta etapa.'}</span><button className={`imp-button primary ${step.id===7?'imp-launch-button':''}`} disabled={busy||!confirmed} onClick={onComplete}>{busy?'Verificando…':step.id===7?'Iniciar Utilização do ERP':training?'Confirmar conhecimento e continuar':'Verificar dados e concluir'} <Icon name="arrow" size={17}/></button></div>
 </div>;
}
