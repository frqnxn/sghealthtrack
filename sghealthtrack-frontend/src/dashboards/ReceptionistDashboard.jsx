import AdminDashboard from "./AdminDashboard";

export default function ReceptionistDashboard({ session }) {
  return (
    <AdminDashboard
      session={session}
      page="appointments"
      appointmentsBasePath="/receptionist/appointments"
    />
  );
}
