import { Request } from 'express';
import { Principal } from '../context/request-context';

export interface AuthenticatedUser {
  id: string;
  username: string;
  principal: Principal;
  jobWorkerId: string | null;
  permissions: Set<string>;
  isSuperAdmin: boolean;
  /** DEFAULT_ROLES keys this user holds (e.g. "PURCHASE", "SALES") — lets the frontend show the right department UI without re-deriving it from the permission set. */
  roleKeys: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
  requestId: string;
}
