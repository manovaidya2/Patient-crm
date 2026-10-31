import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, getDefaultRoute, isAdminLike } from '../constants/roles.js';

const ProtectedRoute = ({ children, role, roles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-sm text-charcoal/55">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const allowedRoles = roles || (role ? [role] : null);

  // The Manager can open every page the Admin can.
  const allowed = !allowedRoles || allowedRoles.includes(user.role) || (isAdminLike(user) && allowedRoles.includes(ROLES.ADMIN));

  if (!allowed) {
    return <Navigate to={getDefaultRoute(user.role)} replace />;
  }

  return children;
};

export default ProtectedRoute;