import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './operation-settings.css';

export default function OperationSettingsModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="ops-settings-overlay"><div ref={panel} className="ops-settings-panel" role="dialog" aria-modal="true" aria-labelledby="ops-settings-title" tabIndex={-1} onKeyDown={e => {
    if (e.key === 'Escape') onClose();
    if (e.key !== 'Tab') return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)') || [])];
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <header><div><h2 id="ops-settings-title">Configurações</h2><p>Impressão de comandas e emissão de notas fiscais.</p></div><button type="button" className="ops-settings-close" onClick={onClose} aria-label="Fechar configurações">×</button></header>
    <div className="ops-settings-fields">{children}</div>
    <footer><span>As preferências são salvas automaticamente neste navegador.</span><button type="button" onClick={onClose}>Concluir</button></footer>
  </div></div>, document.body);
}
