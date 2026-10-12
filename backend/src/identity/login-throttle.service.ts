import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { LoginAttempt, LoginAttemptDocument } from './schemas/login-attempt.schema';
import { AppConfig } from '../config/configuration';
import { ProblemException } from '../common/errors/problem.exception';

/**
 * Login throttling with exponential-feel lockout (AUTH-01, tech.md §9.1). Tracks by username
 * and by IP independently so neither a credential-stuffing spray across usernames nor a
 * single-account brute force from one IP escapes the limit.
 */
@Injectable()
export class LoginThrottleService {
  constructor(
    @InjectModel(LoginAttempt.name) private readonly model: Model<LoginAttemptDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async assertNotLocked(username: string, ip: string): Promise<void> {
    const [byUser, byIp] = await Promise.all([
      this.model.findOne({ key: `user:${username}` }).lean(),
      this.model.findOne({ key: `ip:${ip}` }).lean(),
    ]);
    const now = new Date();
    for (const attempt of [byUser, byIp]) {
      if (attempt?.lockedUntil && attempt.lockedUntil > now) {
        throw new ProblemException(
          'RATE_LIMITED',
          429,
          'Too many failed login attempts. Try again later.',
        );
      }
    }
  }

  async recordFailure(username: string, ip: string): Promise<void> {
    await Promise.all([this.bump(`user:${username}`), this.bump(`ip:${ip}`)]);
  }

  async recordSuccess(username: string, ip: string): Promise<void> {
    await Promise.all([
      this.model.deleteOne({ key: `user:${username}` }),
      this.model.deleteOne({ key: `ip:${ip}` }),
    ]);
  }

  private async bump(key: string): Promise<void> {
    const login = this.config.get('login', { infer: true });
    const now = new Date();
    const windowMs = login.windowMinutes * 60_000;
    const existing = await this.model.findOne({ key });

    if (!existing || now.getTime() - existing.windowStart.getTime() > windowMs) {
      await this.model.updateOne(
        { key },
        { $set: { count: 1, windowStart: now, lockedUntil: null } },
        { upsert: true },
      );
      return;
    }

    const count = existing.count + 1;
    const update: Record<string, unknown> = { count };
    if (count >= login.maxAttempts) {
      update.lockedUntil = new Date(now.getTime() + login.lockoutMinutes * 60_000);
    }
    await this.model.updateOne({ key }, { $set: update });
  }
}
