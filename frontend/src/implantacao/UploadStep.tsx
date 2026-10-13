import { useRef, useState } from 'react';
import Icon from './Icon';
export default function UploadStep({ kind, onComplete }: { kind: 'products' | 'stock' | 'images'; onComplete: () => void }) {
  const images = kind === 'images';
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  function select(list: FileList | null) {
    const selected = Array.from(list || []);
    const pattern = images ? /\.(png|jpe?g|webp)$/i : /\.(csv|xlsx|xls)$/i;
    if (selected.some(f => !pattern.test(f.name) || f.size > 10 * 1024 * 1024)) { setError('Selecione arquivos no formato indicado, com até 10 MB cada.'); return; }
    if (!images && selected.length > 1) { setError('Selecione uma planilha por vez.'); return; }
    setFiles(images ? [...files, ...selected].filter((f, i, all) => all.findIndex(x => x.name === f.name && x.size === f.size) === i) : selected);
    setError('');
  }
  return <div>
    {!images && <div className="imp-template"><span>Comece com a estrutura correta da planilha.</span><button className="imp-button secondary" disabled title="Modelo será disponibilizado depois"><Icon name="file" size={16} /> Baixar Planilha Modelo</button></div>}
    <div className={`imp-dropzone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); select(e.dataTransfer.files); }}>
      <span className="imp-upload-icon"><Icon name="upload" size={25} /></span><strong>{images ? 'Arraste as imagens dos produtos' : 'Arraste sua planilha para cá'}</strong>
      <span>ou <button className="imp-text-button" onClick={() => input.current?.click()}>selecione {images ? 'os arquivos' : 'um arquivo'}</button> no computador</span>
      <small>{images ? 'JPG, PNG ou WebP · vários arquivos' : 'CSV, XLS ou XLSX · uma planilha'} · até 10 MB por arquivo</small>
      <input ref={input} type="file" className="sr-only" aria-label={images ? 'Selecionar imagens dos produtos' : 'Selecionar planilha'} accept={images ? '.jpg,.jpeg,.png,.webp' : '.csv,.xls,.xlsx'} multiple={images} onChange={e => { select(e.target.files); e.target.value = ''; }} />
    </div>
    {error && <p className="imp-error" role="alert">{error}</p>}
    {files.length > 0 && <ul className="imp-files">{files.map((file, index) => <li key={`${file.name}-${file.size}`}><Icon name="file" size={16} /><span>{file.name}<small>{Math.max(1, Math.round(file.size / 1024))} KB · selecionado localmente</small></span><button className="imp-text-button" aria-label={`Remover ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))}>Remover</button></li>)}</ul>}
    {images && <p className="imp-upload-note">Na integração, cada imagem será associada ao produto pelo código. O vínculo e o envio serão implementados depois.</p>}
    <div className="imp-action-row"><span>Nenhum arquivo é enviado nesta prévia.</span><button className="imp-button primary" disabled={!files.length} onClick={onComplete}>Simular {images ? 'envio' : 'importação'} e concluir <Icon name="arrow" size={17} /></button></div>
  </div>;
}
