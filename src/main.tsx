import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ArchiveWindow from "./windows/ArchiveWindow";
import MemoWindow from "./windows/MemoWindow";

const params = new URLSearchParams(window.location.search);
const isArchive = params.get("archive") === "1";
const isMemo = params.has("memo") || params.has("create_category_id");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isArchive ? <ArchiveWindow /> : isMemo ? <MemoWindow /> : <App />}
  </React.StrictMode>,
);
