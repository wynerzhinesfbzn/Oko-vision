import { createRoot } from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Tell the HTML shell that React is up → removes the instant-paint loader
requestAnimationFrame(() => {
  window.dispatchEvent(new Event("oko:ready"));
});
