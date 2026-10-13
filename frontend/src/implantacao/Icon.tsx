export default function Icon({ name, size = 20 }: { name: 'check' | 'lock' | 'play' | 'upload' | 'arrow' | 'grid' | 'book' | 'help' | 'file'; size?: number }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />, lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    play: <path d="m9 5 11 7-11 7Z" />, upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />, grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    book: <><path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-4-1-7 0-10 1Z" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01" /></>,
    file: <><path d="M14 2H5v20h14V7Z M14 2v5h5M8 12h8M8 16h6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
