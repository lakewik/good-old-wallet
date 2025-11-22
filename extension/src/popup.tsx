import React from "react";
import { createRoot } from "react-dom/client";
import Hello from "./components/Hello";

function Popup() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Good Old Wallet</h1>
      <p>A simple wallet from the Good Old Days</p>
      <Hello />
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
