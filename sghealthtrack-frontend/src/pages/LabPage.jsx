import { Navigate, useOutletContext } from "react-router-dom";
import LabDashboard from "../dashboards/LabDashboard";

export default function LabPage({ page }) {
  const { session, role } = useOutletContext();
  if (role && role !== "lab") return <Navigate to="/dashboard" replace />;
  return <LabDashboard session={session} page={page} />;
}
