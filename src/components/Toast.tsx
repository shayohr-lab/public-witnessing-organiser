import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Kind = "ok" | "error" | "info";
interface ToastItem { id: number; text: string; kind: Kind }

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, kind: Kind = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={
              "pointer-events-auto w-full max-w-[440px] rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg " +
              (t.kind === "error" ? "bg-danger text-white" : t.kind === "info" ? "bg-ink text-white" : "bg-primary text-white")
            }
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
