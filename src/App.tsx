import "./App.css";
import { useEffect } from "react";
import { CategoryGrid } from "./features/categories/CategoryGrid";
import { useAppStore } from "./store/appStore";

function App() {
  const { loading, error, categories, settings, refresh } = useAppStore();

  useEffect(() => {
    refresh();
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
