import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileText, Upload } from 'lucide-react';

export interface FileActionOption {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  direction?: 'import' | 'export';
}

export default function FileActionMenu({
  label,
  direction,
  options,
}: {
  label: string;
  direction: 'import' | 'export' | 'files';
  options: FileActionOption[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return <div className="file-action-menu" ref={rootRef}>
    <button
      className="catalog-button catalog-button-light file-action-trigger"
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    >
      {direction === 'import' ? <Upload size={14}/> : direction === 'export' ? <Download size={14}/> : <FileText size={14}/>}
      {label}<ChevronDown size={12}/>
    </button>
    {open && <div className="file-action-popover" role="menu" aria-label={`${label} file options`}>
      {options.map((option) => <button
        key={option.label}
        type="button"
        role="menuitem"
        disabled={option.disabled}
        onClick={() => { setOpen(false); option.onSelect(); }}
      >
        {(option.direction ?? direction) === 'import' ? <Upload size={13}/> : <Download size={13}/>}
        <span>{option.label}</span>
      </button>)}
    </div>}
  </div>;
}