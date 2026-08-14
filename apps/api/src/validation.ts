import { ValidationError } from '@sentra/contracts';
import type { z } from 'zod';

/**
 * Parses input against a Zod schema, converting a failure into the shared
 * {@link ValidationError} with a stable, safe list of field problems. The HTTP edge always
 * validates before the core runs (slide 031).
 */
export const parseOrThrow = <S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('The request failed validation.', {
      problems: result.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    });
  }
  return result.data;
};
