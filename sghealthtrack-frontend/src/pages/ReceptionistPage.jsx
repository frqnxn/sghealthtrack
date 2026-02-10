import { Navigate, useOutletContext } from "react-router-dom";
import AdminDashboard from "../dashboards/AdminDashboard";

export default function ReceptionistPage({ page }) {
  const { session, role } = useOutletContext();
  if (role && role !== "receptionist") return <Navigate to="/dashboard" replace />;
  return (
    <AdminDashboard
      session={session}
      page={page || "appointments"}
      appointmentsBasePath="/receptionist/appointments"
    />
  );
}
