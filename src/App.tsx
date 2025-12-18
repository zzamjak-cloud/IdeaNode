import "./App.css";
import { useEffect } from "react";
import { CategoryGrid } from "./features/categories/CategoryGrid";
import { useAppStore } from "./store/appStore";
import { listen } from "@tauri-apps/api/event";

function App() {
  const { loading, error, categories, settings, refresh } = useAppStore();

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | null = null;
    listen("ideanode:data_changed", async () => {
      await refresh();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refresh]);

  useEffect(() => {
    const defaultBg = "#0b1020";
    const next = settings.background_color?.trim().length ? settings.background_color : defaultBg;
    document.documentElement.style.setProperty("--bg", next);
  }, [settings.background_color]);

  return (
    <main className="appRoot">
      {error ? <div className="globalError">{error}</div> : null}
      {loading && categories.length === 0 ? <div className="globalLoading">로딩 중...</div> : null}
      <CategoryGrid />
    </main>
  );
}

export default App;
