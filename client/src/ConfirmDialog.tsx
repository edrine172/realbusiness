import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

type ConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
};

type PendingConfirmation = ConfirmationOptions & {
  resolve: (confirmed: boolean) => void;
};

type MutationConfirmationHandler = (options: ConfirmationOptions) => Promise<boolean>;

let mutationConfirmationHandler: MutationConfirmationHandler | null = null;

export function registerMutationConfirmationHandler(handler: MutationConfirmationHandler) {
  mutationConfirmationHandler = handler;
  return () => {
    if (mutationConfirmationHandler === handler) mutationConfirmationHandler = null;
  };
}

export function requestMutationConfirmation(options: ConfirmationOptions) {
  return mutationConfirmationHandler ? mutationConfirmationHandler(options) : Promise.resolve(false);
}

export function useConfirmation() {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmationOptions) => {
    if (pendingRef.current) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [pending, finish]);

  useEffect(() => () => {
    pendingRef.current?.resolve(false);
    pendingRef.current = null;
  }, []);

  const dialog = pending ? createPortal(
    <div
      className="app-confirm-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && finish(false)}
    >
      <section
        className={`app-confirm-dialog ${pending.variant === 'danger' ? 'is-danger' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-message"
      >
        <span className="app-confirm-icon"><AlertTriangle size={20}/></span>
        <h2 id="app-confirm-title">{pending.title}</h2>
        <p id="app-confirm-message">{pending.message}</p>
        <div className="app-confirm-actions">
          <button type="button" className="catalog-button catalog-button-light" onClick={() => finish(false)} autoFocus>
            {pending.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={`catalog-button ${pending.variant === 'danger' ? 'app-confirm-danger' : 'catalog-button-primary'}`}
            onClick={() => finish(true)}
          >
            {pending.confirmLabel ?? 'Continue'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  return { confirm, dialog };
}

export function MutationConfirmationHost() {
  const { confirm, dialog } = useConfirmation();

  useEffect(
    () => registerMutationConfirmationHandler(confirm),
    [confirm],
  );

  return dialog;
}
