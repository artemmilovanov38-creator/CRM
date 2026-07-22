import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute({
  children,
  allowedRoles,
}) {
  const location = useLocation();

  const {
    user,
    isAuthenticated,
    isAuthLoading,
  } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="auth-loader">
        <div className="auth-loader__spinner" />

        <span>Загрузка CRM...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
        }}
      />
    );
  }

  if (
    user?.status === "blocked" ||
    user?.status === "inactive"
  ) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(user?.role)
  ) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }

  return children;
}