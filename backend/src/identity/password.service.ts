import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AppConfig } from '../config/configuration';

/**
 * Argon2id password hashing (T-07, AUTH-01). Parameters are configuration, and argon2
 * embeds its own parameters in the encoded hash, so they can be raised later (tech.md §9.1)
 * without invalidating existing hashes or requiring a migration.
 */
@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async hash(plain: string): Promise<string> {
    const argon2Config = this.config.get('argon2', { infer: true });
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: argon2Config.memoryCost,
      timeCost: argon2Config.timeCost,
      parallelism: argon2Config.parallelism,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  private dummyHash?: Promise<string>;

  /**
   * Burns the same argon2 work as a real verify, for the "no such user" login path, so response
   * time doesn't reveal which usernames exist (tech.md §9.1, no user enumeration). Always false.
   */
  async verifyAgainstDummy(plain: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-equalisation');
    await this.verify(await this.dummyHash, plain);
    return false;
  }
}
