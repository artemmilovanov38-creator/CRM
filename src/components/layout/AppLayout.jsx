import { Outlet } from "react-router-dom";
import Header from "./Header";

export default function AppLayout() {
  return (
    <div className="app">
      <Header />

      <Outlet />
    </div>
  );
}