import { isAccessDeniedError } from '@questionnaire/database';

describe('isAccessDeniedError', () => {
  it('recognises mysql2 access-denied errors, also when wrapped by TypeORM', () => {
    expect(isAccessDeniedError({ code: 'ER_ACCESS_DENIED_ERROR', errno: 1045 })).toBe(true);
    expect(isAccessDeniedError({ name: 'QueryFailedError', driverError: { errno: 1045 } })).toBe(true);
    expect(isAccessDeniedError(new Error('wrapped', { cause: { code: 'ER_ACCESS_DENIED_ERROR' } }))).toBe(true);
  });

  it('ignores outages and other database errors, which must not restart the task', () => {
    expect(isAccessDeniedError({ code: 'ECONNREFUSED' })).toBe(false);
    expect(isAccessDeniedError({ code: 'ER_LOCK_DEADLOCK', errno: 1213 })).toBe(false);
    expect(isAccessDeniedError(undefined)).toBe(false);
  });
});
