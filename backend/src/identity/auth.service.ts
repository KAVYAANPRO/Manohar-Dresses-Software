import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { User, UserDocument } from './schemas/user.schema';
import { Session, SessionDocument } from './schemas/session.schema';
import { PasswordService } from './password.service';
import { PermissionsService } from './permissions.service';
import { LoginThrottleService } from './login-throttle.service';
import { AppConfig } from '../config/configuration';
import { ProblemException, UnauthenticatedException } from '../common/errors/problem.exception';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { MIN_PASSWORD_LENGTH } from './identity.constants';

const GENERIC_LOGIN_ERROR = 'Incorrect username or password.';

export interface LoginResult {
  rawToken: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly passwordService: PasswordService,
    private readonly permissionsService: PermissionsService,
    private readonly throttle: LoginThrottleService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async login(
    usernameOrMobile: string,
    password: string,
    ip: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const normalized = usernameOrMobile.trim().toLowerCase();
    await this.throttle.assertNotLocked(normalized, ip);

    const user = await this.userModel
      .findOne({
        isActive: true,
        $or: [{ username: normalized }, { mobile: usernameOrMobile.trim() }],
      })
      .select('+passwordHash');

    // Identical error text and identical code path timing-wise for "no such user" and
    // "wrong password" - no user enumeration (tech.md §9.1).
    if (!user) {
      await this.passwordService.verifyAgainstDummy(password);
      await this.throttle.recordFailure(normalized, ip);
      throw new UnauthenticatedException(GENERIC_LOGIN_ERROR);
    }

    const passwordOk = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordOk) {
      await this.throttle.recordFailure(normalized, ip);
      throw new UnauthenticatedException(GENERIC_LOGIN_ERROR);
    }

    await this.throttle.recordSuccess(normalized, ip);

    const { isSuperAdmin, permissions } =
      await this.permissionsService.computeEffectivePermissions(user);

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const session = this.config.get('session', { infer: true });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + session.absoluteTimeoutHours * 60 * 60_000);

    await this.sessionModel.create({
      tokenHash,
      userId: user._id,
      expiresAt,
      lastSeenAt: now,
      ip,
      userAgent,
    });

    return {
      rawToken,
      expiresAt,
      user: this.toAuthenticatedUser(user, isSuperAdmin, permissions),
    };
  }

  async validateSession(
    rawToken: string,
  ): Promise<{ user: AuthenticatedUser; sessionId: string } | null> {
    const tokenHash = this.hashToken(rawToken);
    const session = await this.sessionModel.findOne({ tokenHash });
    if (!session || session.revokedAt) return null;

    const now = new Date();
    if (session.expiresAt <= now) return null;

    const idleTimeout = this.config.get('session', { infer: true }).idleTimeoutMinutes * 60_000;
    if (now.getTime() - session.lastSeenAt.getTime() > idleTimeout) {
      session.revokedAt = now;
      session.revokedReason = 'idle timeout';
      await session.save();
      return null;
    }

    const user = await this.userModel.findById(session.userId);
    if (!user || !user.isActive) return null;

    session.lastSeenAt = now;
    await session.save();

    const { isSuperAdmin, permissions } =
      await this.permissionsService.computeEffectivePermissions(user);
    return {
      user: this.toAuthenticatedUser(user, isSuperAdmin, permissions),
      sessionId: String(session._id),
    };
  }

  async logout(sessionId: string, reason = 'logout'): Promise<void> {
    await this.sessionModel.updateOne(
      { _id: new Types.ObjectId(sessionId) },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    );
  }

  /** Admin "force logout" of any user, or a self-triggered revoke-all on password change. */
  async revokeAllSessionsForUser(userId: string, reason: string): Promise<void> {
    await this.sessionModel.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    );
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user) throw new UnauthenticatedException();

    const ok = await this.passwordService.verify(user.passwordHash, oldPassword);
    if (!ok)
      throw new ProblemException('VALIDATION_FAILED', 422, 'Current password is incorrect.', {
        oldPassword: 'incorrect',
      });

    this.assertPasswordStrength(newPassword);

    user.passwordHash = await this.passwordService.hash(newPassword);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    await user.save();

    await this.revokeAllSessionsForUser(userId, 'password changed');
  }

  /** Admin reset (AUTH-08 R1 scope): sets a new password and forces a change on next login. */
  async adminResetPassword(userId: string, newPassword: string): Promise<void> {
    this.assertPasswordStrength(newPassword);
    const user = await this.userModel.findById(userId);
    if (!user) throw new ProblemException('NOT_FOUND', 404, 'User not found.');
    user.passwordHash = await this.passwordService.hash(newPassword);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = true;
    await user.save();
    await this.revokeAllSessionsForUser(userId, 'admin reset');
  }

  private assertPasswordStrength(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        { password: 'too short' },
      );
    }
    // A breached-password check (e.g. HaveIBeenPwned range API) is a candidate follow-up;
    // deliberately out of scope for this pass so it does not become an unreviewed external
    // network dependency on the login path.
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private toAuthenticatedUser(
    user: UserDocument,
    isSuperAdmin: boolean,
    permissions: Set<string>,
  ): AuthenticatedUser {
    return {
      id: String(user._id),
      username: user.username,
      principal: user.principal,
      jobWorkerId: user.jobWorkerId ? String(user.jobWorkerId) : null,
      permissions,
      isSuperAdmin,
      roleKeys: user.roleKeys,
    };
  }
}
