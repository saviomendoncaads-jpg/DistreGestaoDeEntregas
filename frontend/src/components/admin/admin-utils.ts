export const formatMoney = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function billingPeriod(value: string) {
  const match = /^(\d{2})\/(\d{4})$/.exec(value);
  if (match) return Number(match[2]) * 12 + Number(match[1]);
  const iso = /^(\d{4})-(\d{2})$/.exec(value);
  return iso ? Number(iso[1]) * 12 + Number(iso[2]) : 0;
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  // Datas sem horário representam um dia de calendário, independente do fuso.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

export function csvContent(headers: string[], rows: unknown[][]) {
  const cell = (value: unknown) => {
    let text = typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('pt-BR', {useGrouping: false, maximumFractionDigits: 20}) : String(value ?? '');
    const significant = Array.from(text).find(character => character.charCodeAt(0) > 32 && character.trim() !== '');
    if (typeof value !== 'number' && significant && '=+@-'.includes(significant)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
}

export function downloadCsv(name: string, headers: string[], rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([csvContent(headers, rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
