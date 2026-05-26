import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./features/auth/AuthProvider";
import ProtectedRoute from "./features/auth/ProtectedRoute";
import LoginPage from "./features/auth/LoginPage";

import LandingPage from "./features/public/LandingPage";
import RequestDemoPage from "./features/public/RequestDemoPage";

import SuperAdminPage from "./features/superadmin/SuperAdminPage";
import AdminDashboardPage from "./features/admin/AdminDashboardPage";
import ServiceManagementPage from "./features/admin/ServiceManagementPage";
import CounterManagementPage from "./features/admin/CounterManagementPage";
import ServiceAssignmentPage from "./features/admin/ServiceAssignmentPage";
import StaffManagementPage from "./features/admin/StaffManagementPage";

import KioskPage from "./features/kiosk/KioskPage";
import TokenCreatedPage from "./features/kiosk/TokenCreatedPage";

import TrackingPage from "./features/tracking/TrackingPage";
import StaffDashboard from "./features/staff/StaffDashboard";
import StaffCounterPage from "./features/staff/StaffCounterPage";
import CounterDisplayPage from "./features/display/CounterDisplayPage";

function Navigation() {
  const { currentUser, isSuperAdmin, isOrganizationAdmin, isStaff, logout } = useAuth();

  return (
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 16 }}>
      <Link to="/">Landing</Link>
      <Link to="/request-demo">Request Demo</Link>

      {!currentUser && <Link to="/internal-login">Internal Login</Link>}

      {isSuperAdmin && <Link to="/superadmin">Superadmin</Link>}

      {isOrganizationAdmin && <Link to="/admin">Organization Admin</Link>}

      {isStaff && <Link to="/staff">Staff Counter</Link>}

      {currentUser && <button onClick={logout}>Logout</button>}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navigation />

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/request-demo" element={<RequestDemoPage />} />
        <Route path="/internal-login" element={<LoginPage />} />

        <Route
          path="/superadmin"
          element={
            <ProtectedRoute requireSuperAdmin>
              <SuperAdminPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute requireOrganizationAdmin>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/services"
          element={
            <ProtectedRoute requireOrganizationAdmin>
              <ServiceManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/counters"
          element={
            <ProtectedRoute requireOrganizationAdmin>
              <CounterManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/assignments"
          element={
            <ProtectedRoute requireOrganizationAdmin>
              <ServiceAssignmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/staff"
          element={
            <ProtectedRoute requireOrganizationAdmin>
              <StaffManagementPage />
            </ProtectedRoute>
          }
        />

        <Route path="/kiosk/:organizationId" element={<KioskPage />} />
        <Route
          path="/token-created/:organizationId/:tokenId"
          element={<TokenCreatedPage />}
        />
        <Route
          path="/track/:organizationId/:tokenId"
          element={<TrackingPage />}
        />

        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/staff/:organizationId/:counterId"
          element={
            <ProtectedRoute requireStaff>
              <StaffCounterPage />
            </ProtectedRoute>
          }
        />

        <Route path="/display/:organizationId/:counterId" element={<CounterDisplayPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
