import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedRequest, AuthenticatedUser } from '../common/types/authenticated-request';
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME } from './identity.constants';
import { UnauthenticatedException } from '../common/errors/problem.exception';

/**
 * Cookie `secure` flag (NFR: no session over plain HTTP in production). It turns on when ANY of:
 *  - COOKIE_SECURE=true (force on) - or COOKIE_SECURE=false forces it off (local HTTP testing only);
 *  - NODE_ENV=production;
 *  - the request itself arrived over HTTPS (`req.secure`, which honours X-Forwarded-Proto from the
 *    loopback reverse proxy because main.ts sets `trust proxy` to loopback).
 * The session cookie is always httpOnly + SameSite=Lax; the CSRF cookie is SameSite=Lax but
 * readable by the SPA (double-submit pattern).
 */
function isSecure(req: AuthenticatedRequest): boolean {
  const flag = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV === 'production' || req.secure === true;
}

function sessionCookieOptions(req: AuthenticatedRequest) {
  return { httpOnly: true, secure: isSecure(req), sameSite: 'lax' as const, path: '/' };
}

/** Not httpOnly - the SPA must be able to read it and echo it back as the X-CSRF-Token header (double-submit pattern). */
function csrfCookieOptions(req: AuthenticatedRequest) {
  return { httpOnly: false, secure: isSecure(req), sameSite: 'lax' as const, path: '/' };
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip ?? 'unknown';
    const result = await this.authService.login(
      dto.usernameOrMobile,
      dto.password,
      ip,
      req.headers['user-agent'],
    );
    res.cookie(SESSION_COOKIE_NAME, result.rawToken, {
      ...sessionCookieOptions(req),
      expires: result.expiresAt,
    });
    res.cookie(CSRF_COOKIE_NAME, randomBytes(32).toString('hex'), {
      ...csrfCookieOptions(req),
      expires: result.expiresAt,
    });
    return { user: this.publicUser(result.user) };
  }

  @RequirePermissions() // any authenticated user; empty array = "just be logged in"
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.sessionId) await this.authService.logout(req.sessionId);
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(req));
    res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions(req));
    return { ok: true };
  }

  @Public()
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw new UnauthenticatedException();
    return { user: this.publicUser(user) };
  }

  @RequirePermissions()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.id, dto.oldPassword, dto.newPassword);
    return { ok: true };
  }

  private publicUser(user: AuthenticatedUser) {
    return {
      id: user.id,
      username: user.username,
      principal: user.principal,
      jobWorkerId: user.jobWorkerId,
      isSuperAdmin: user.isSuperAdmin,
      permissions: Array.from(user.permissions),
      roleKeys: user.roleKeys,
    };
  }
}
