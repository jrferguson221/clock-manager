import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./mantine-styles";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "./styles.css";
import App from "./App";
import { createAppRouter } from "./router";

const root = document.getElementById("root");
if (root === null) throw new Error('index.html is missing its <div id="root">');

createRoot(root).render(
  <StrictMode>
    <App router={createAppRouter()} />
  </StrictMode>,
);
