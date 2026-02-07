import { Navigate, useOutletContext } from "react-router-dom";
import CashierDashboard from "../dashboards/CashierDashboard";

export default function CashierPage({ page }) {
  const { session, role } = useOutletContext();
  if (role && role !== "cashier") return <Navigate to="/dashboard" replace />;
  return <CashierDashboard session={session} page={page} />;
}
