import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ValidationFailedException } from '../errors/problem.exception';

function flatten(errors: ValidationError[], prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const err of errors) {
    const field = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.constraints) {
      out[field] = Object.values(err.constraints).join('; ');
    }
    if (err.children?.length) {
      Object.assign(out, flatten(err.children, field));
    }
  }
  return out;
}

/**
 * Used by generic controller mixins (which cannot rely on the global ValidationPipe's
 * design:paramtypes inference, since the `@Body()` parameter there is typed loosely) to
 * still enforce VAL-01 ("validate required fields...") per concrete DTO class.
 */
export async function validateDto<T extends object>(cls: new () => T, plain: unknown): Promise<T> {
  const instance = plainToInstance(cls, plain, { excludeExtraneousValues: false });
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: false });
  if (errors.length > 0) {
    throw new ValidationFailedException(flatten(errors));
  }
  return instance;
}
