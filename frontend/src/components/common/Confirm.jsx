import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button } from "./Ui";
import { Icon } from "./Icon";

const ConfirmContext = createContext(null);

let seq = 0;

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setRequest({ ...options, id: ++seq, resolve });
    });
  }, []);

  const close = useCallback((value) => {
    setRequest((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const api = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {request && <ConfirmDialog key={request.id} request={request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

function ConfirmDialog({ request, onClose }) {
  const variant = request.variant ?? "danger";
  const icon = request.icon ?? (variant === "danger" ? "ban" : "info");
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onMouseDown={() => onClose(false)}>
      <div className="anim-fade-in absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div
        className="anim-rise relative w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title}
      >
        <div className="flex items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${variant === "danger" ? "bg-rose-500/15 text-rose-400" : "bg-accent/15 text-accent"}`}>
            <Icon name={icon} size={22} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-black leading-7">{request.title}</h3>
            {request.message && <p className="mt-1 text-sm leading-6 text-muted">{request.message}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onClose(false)} autoFocus>{request.cancelLabel ?? "انصراف"}</Button>
          <Button variant={variant} onClick={() => onClose(true)}>{request.confirmLabel ?? "تأیید"}</Button>
        </div>
      </div>
    </div>
  );
}
