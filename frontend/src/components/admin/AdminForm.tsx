import { useRef, useState, type ComponentPropsWithoutRef, type FormEvent } from 'react';

type Props = Omit<ComponentPropsWithoutRef<'form'>, 'onSubmit'> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export default function AdminForm({ onSubmit, children, ...attributes }: Props) {
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try { await onSubmit(event); }
    finally { submitting.current = false; setSaving(false); }
  };
  return <form {...attributes} onSubmit={submit} aria-busy={saving}>
    <fieldset className="master-form-fields" disabled={saving}>{children}</fieldset>
    {saving && <p className="master-form-progress" role="status">Salvando… aguarde a confirmação.</p>}
  </form>;
}
