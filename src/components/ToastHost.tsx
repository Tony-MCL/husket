// ===============================
// src/components/ToastHost.tsx
// ===============================
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastState = { id: string; text: string } | null;

type ToastApi = {
  show: (text: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);

  const show = useCallback((text: string) => {
    const id = crypto.randomUUID();
    setToast({ id, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 1800);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toastHost" aria-live="polite" aria-atomic="true">
        {toast ? <div className="toast">{toast.text}</div> : null}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}


