import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Login throttling state (AUTH-01), keyed separately by username and by IP so an attacker
 * cannot dodge the limit by spraying one credential across many IPs, or many credentials from
 * one IP. `lockedUntil` is checked before the password is even verified.
 */
@Schema({ collection: 'login_attempts' })
export class LoginAttempt {
  @Prop({ type: String, required: true, unique: true, index: true })
  key!: string; // `user:<username>` or `ip:<address>`

  @Prop({ type: Number, default: 0 })
  count!: number;

  @Prop({ type: Date, required: true })
  windowStart!: Date;

  @Prop({ type: Date, required: false })
  lockedUntil?: Date | null;
}

export type LoginAttemptDocument = LoginAttempt & Document;
export const LoginAttemptSchema = SchemaFactory.createForClass(LoginAttempt);
