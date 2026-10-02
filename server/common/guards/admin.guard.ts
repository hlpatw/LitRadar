import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/auth.guard';
import { isAdminEmail } from '../utils/admin.util';

/**
 * Guard for expensive / write operations (connector pulls).
 *
 * A normal logged-in user MUST NOT be able to trigger outbound fetches + bulk writes.
 * Authorize only when ONE of:
 *  (a) the JWT user's email is in ADMIN_EMAILS (comma-separated env allowlist), or
 *  (b) the request carries x-admin-token equal to SYNC_ADMIN_TOKEN (ops / CLI path).
 *
 * When neither env is configured, no user can trigger sync over HTTP by default.
 */
@Injectable()
export class AdminOrCliGuard extends JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const cliToken = process.env.SYNC_ADMIN_TOKEN;
    const presented = req.headers['x-admin-token'];

    // (b) CLI / ops token path — bypasses JWT entirely.
    if (cliToken && presented === cliToken) {
      return true;
    }

    // (a) JWT path: require a valid login AND an admin email.
    await super.canActivate(context);
    const user = req.user as { email?: string } | undefined;
    if (!isAdminEmail(user?.email)) {
      throw new ForbiddenException('admin privileges required');
    }
    return true;
  }
}
