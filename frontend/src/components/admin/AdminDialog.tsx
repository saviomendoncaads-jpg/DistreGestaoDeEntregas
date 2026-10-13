import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react';
interface Props { title: string; onClose: () => void; children: ReactNode }
export default function AdminDialog({title,onClose,children}:Props) {
  const container=useRef<HTMLDivElement>(null);
  const focusable=()=>Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')??[]).filter(element=>element.getClientRects().length>0);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    container.current?.querySelector<HTMLElement>('button[aria-label="Fechar formulário"]')?.focus();
    return ()=>{document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus();};
  },[]);
  const keyboard=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(event.key==='Escape'){event.preventDefault();onClose();}
    if(event.key==='Tab'){
      const elements=focusable(),first=elements[0],last=elements.at(-1);
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  };
  return <div ref={container} className="report-modal-overlay master-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={keyboard} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>{children}</div>;
}
