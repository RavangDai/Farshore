import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import MysteryApp from "./MysteryApp";
import ArcadeApp from "./ArcadeApp";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).has("voyage") ? <App /> : new URLSearchParams(window.location.search).has("mystery") ? <MysteryApp /> : <ArcadeApp />}
  </React.StrictMode>,
);
