import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

type Props = {
  children: ReactNode;
  requireSuperAdmin?: boolean;
  requireOrganizationAdmin?: boolean;
  requireStaff?: boolean;
};

export default function ProtectedRoute({
  children,
  requireSuperAdmin = false,
  requireOrganizationAdmin = false,
  requireStaff = false,
}: Props) {
  const { currentUser, loading, isSuperAdmin, isOrganizationAdmin, isStaff } =
    useAuth();

  if (loading) {
    return <p style={{ padding: 24 }}>Loading...</p>;
  }

  if (!currentUser) {
    return <Navigate to="/internal-login" replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  if (requireOrganizationAdmin && !isOrganizationAdmin) {
    return <Navigate to="/" replace />;
  }

  if (requireStaff && !isStaff) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
