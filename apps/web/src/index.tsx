import { render } from "solid-js/web";
import { App } from "./App";
import { ToastProvider } from "./Toast";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

render(
  () => (
    <ToastProvider>
      <App />
    </ToastProvider>
  ),
  root,
);
