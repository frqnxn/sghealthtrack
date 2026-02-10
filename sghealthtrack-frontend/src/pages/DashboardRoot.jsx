// Renders /dashboard: patient overview or staff role-specific dashboard.
import { useOutletContext } from "react-router-dom";
import PatientDashboard from "../dashboards/PatientDashboard";
import NurseDashboard from "../dashboards/NurseDashboard";
import LabDashboard from "../dashboards/LabDashboard";
import CashierDashboard from "../dashboards/CashierDashboard";
import DoctorDashboard from "../dashboards/DoctorDashboard";
import XrayDashboard from "../dashboards/XrayDashboard";
import AdminDashboard from "../dashboards/AdminDashboard";
import ReceptionistDashboard from "../dashboards/ReceptionistDashboard";

const STAFF_MAP = {
  admin: AdminDashboard,
  nurse: NurseDashboard,
  lab: LabDashboard,
  cashier: CashierDashboard,
  doctor: DoctorDashboard,
  xray: XrayDashboard,
};

export default function DashboardRoot() {
  const { session, role } = useOutletContext();

  if (role === "patient") {
    return <PatientDashboard session={session} page="dashboard" />;
  }

  if (role === "receptionist") {
    return <ReceptionistDashboard session={session} />;
  }

  const Staff = STAFF_MAP[role];
  if (role === "cashier") {
    return <CashierDashboard session={session} page="payments" />;
  }
  if (Staff) return <Staff session={session} />;

  return (
    <div className="card">
      <p style={{ margin: 0 }}>No role found. Ensure this user has a row in <b>profiles</b>.</p>
    </div>
  );
}
