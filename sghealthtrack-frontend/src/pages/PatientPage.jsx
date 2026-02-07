// Wrapper for patient-only routes (appointments, medical-process, etc.)
import { useOutletContext, Navigate } from "react-router-dom";
import PatientDashboard from "../dashboards/PatientDashboard";

export default function PatientPage({ page }) {
  const { session, role } = useOutletContext();
  if (role && role !== "patient") return <Navigate to="/dashboard" replace />;
  return <PatientDashboard session={session} page={page} />;
}
