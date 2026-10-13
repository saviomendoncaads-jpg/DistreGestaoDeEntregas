import { useState } from 'react';
export default function AccessKey({value}:{value:string}) {
  const [visible,setVisible]=useState(false);
  return <span className="master-access-key"><code>{visible?value:'••••••••'}</code><button type="button" onClick={()=>setVisible(current=>!current)} aria-label={visible?'Ocultar chave de acesso':'Mostrar chave de acesso'} aria-pressed={visible}>{visible?'Ocultar':'Mostrar'}</button></span>;
}
