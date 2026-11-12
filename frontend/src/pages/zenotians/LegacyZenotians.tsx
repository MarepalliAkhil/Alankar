import { Navigate, useLocation } from 'react-router-dom';
import { ROOT } from './model';

/** The old address (/zenotians/...) keeps working: same section, same query and hash. */
export default function LegacyZenotians() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/zenotians/, ROOT)}${search}${hash}`} replace />;
}
