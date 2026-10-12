import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';

/**
 * One place to open a Mongo session/transaction (tech.md principle #3: "a business command is
 * one transaction"). `session.withTransaction()` retries the whole callback automatically on
 * a transient write conflict - Mongo's replacement for tech.md's deterministic lock ordering,
 * since there is no `SELECT ... FOR UPDATE` here. Requires a replica set (docker-compose.yml
 * and the test harness both start one); a standalone `mongod` cannot run this.
 */
@Injectable()
export class TransactionService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async run<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }
}
