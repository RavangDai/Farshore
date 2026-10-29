import React from "react";
import ReactDOM from "react-dom/client";
import VoyageApp from "./VoyageApp";
import MysteryApp from "./MysteryApp";
import ArcadeApp from "./ArcadeApp";
import "./styles/global.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).has("voyage") ? <VoyageApp /> : new URLSearchParams(window.location.search).has("mystery") ? <MysteryApp /> : <ArcadeApp />}
  </React.StrictMode>,
);
