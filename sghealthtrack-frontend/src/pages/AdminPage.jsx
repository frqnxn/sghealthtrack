import { Navigate, useOutletContext } from "react-router-dom";
import AdminDashboard from "../dashboards/AdminDashboard";

export default function AdminPage({ page }) {
  const { session, role } = useOutletContext();
  if (role && role !== "admin") return <Navigate to="/dashboard" replace />;
  return <AdminDashboard session={session} page={page} />;
}
