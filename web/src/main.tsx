import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import JoinPage from "./pages/JoinPage";
import RoomPage from "./pages/RoomPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<JoinPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
