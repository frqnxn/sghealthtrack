import { Navigate, useOutletContext } from "react-router-dom";
import ReceptionistDashboard from "../dashboards/ReceptionistDashboard";

export default function ReceptionistPage({ page }) {
  const { session, role } = useOutletContext();
  if (role && role !== "receptionist") return <Navigate to="/dashboard" replace />;
  return <ReceptionistDashboard session={session} page={page} />;
}
