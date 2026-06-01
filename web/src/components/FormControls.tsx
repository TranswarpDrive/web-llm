import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectMenuProps<T extends string = string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled,
  className,
}: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm outline-none transition',
          'hover:bg-accent focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60',
          open && 'border-primary ring-2 ring-primary/15'
        )}
      >
        <span className={cn('min-w-0 truncate', !selected && 'text-muted-foreground')}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180 text-foreground')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-40 mt-2 max-h-64 w-full overflow-auto rounded-md border bg-card p-1 shadow-xl"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">暂无选项</div>
          ) : (
            options.map(option => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition',
                    active ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                    option.disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface CheckboxCardProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  icon?: ElementType;
  disabled?: boolean;
  className?: string;
}

export function CheckboxCard({
  checked,
  onCheckedChange,
  label,
  icon: Icon,
  disabled,
  className,
}: CheckboxCardProps) {
  return (
    <label className={cn('ui-check-card', checked && 'is-checked', disabled && 'is-disabled', className)} aria-disabled={disabled}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={event => onCheckedChange(event.target.checked)}
        className="ui-checkbox"
      />
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

interface ConfirmActionProps {
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  title?: string;
}

export function ConfirmAction({
  onConfirm,
  children,
  className = 'ui-icon-button text-destructive hover:text-destructive',
  confirmLabel = '确认',
  cancelLabel = '取消',
  title,
}: ConfirmActionProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="h-8 rounded-md bg-destructive px-2.5 text-xs font-medium text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-60"
        >
          {busy ? '处理中' : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="h-8 rounded-md border bg-background px-2.5 text-xs transition hover:bg-accent disabled:opacity-60"
        >
          {cancelLabel}
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className={className} title={title}>
      {children}
    </button>
  );
}
