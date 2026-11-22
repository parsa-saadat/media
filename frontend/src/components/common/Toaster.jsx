import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e) => {
      const d = e.detail;
      const id = ++n;
      setItems((x) => [...x, { ...d, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800);
    };
    window.addEventListener("voxsy-toast", onToast);
    return () => window.removeEventListener("voxsy-toast", onToast);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`anim-rise pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-2xl glass ${
            t.kind === "error"
              ? "border-rose-500/40 text-rose-300"
              : t.kind === "success"
              ? "border-emerald-500/40 text-emerald-300"
              : "border-line text-fg"
          }`}
        >
          <span className={t.kind === "error" ? "text-rose-400" : t.kind === "success" ? "text-emerald-400" : "text-accent"}>
            <Icon name={t.kind === "error" ? "ban" : t.kind === "success" ? "check" : "chat"} size={16} />
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
