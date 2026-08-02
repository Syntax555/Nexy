import { useLayoutEffect, useRef } from "preact/hooks";

/** Shared native-dialog lifecycle with consistent initial and return focus. */
export function useModalDialog(open: boolean, onClose: () => void, explicitReturnFocus: HTMLElement | null = null) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeHandledRef = useRef(false);

  // Native dialog visibility is DOM state. Synchronizing it during the commit
  // prevents a deferred stale effect from closing a newly opened dialog when
  // the owning profile has just rendered.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      closeHandledRef.current = false;
      returnFocusRef.current =
        explicitReturnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      dialog.showModal();
      window.requestAnimationFrame(() => {
        dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus({ preventScroll: true });
      });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [explicitReturnFocus, open]);

  const handleClose = (): void => {
    if (closeHandledRef.current) return;
    closeHandledRef.current = true;
    onClose();
    const returnFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    const restoreFocus = (): void => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
    restoreFocus();
    // WebKit may complete its native dialog focus steps after `close` fires.
    window.setTimeout(restoreFocus, 0);
  };

  const requestClose = (): void => {
    if (dialogRef.current?.open) dialogRef.current.close();
    handleClose();
  };

  const handleCancel = (event: Event): void => {
    event.preventDefault();
    requestClose();
  };

  return { dialogRef, handleCancel, handleClose, requestClose } as const;
}
