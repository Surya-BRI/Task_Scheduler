import { describe, expect, it } from 'vitest';
import {
  parseApiErrorMessage,
  toUserFacingError,
  USER_NETWORK_ERROR,
  USER_SERVER_ERROR,
} from './api-error';

describe('api-error user-facing sanitization', () => {
  it('hides localhost / env / npm details', () => {
    expect(
      toUserFacingError(
        new Error('Cannot reach the API at http://localhost:7600/api/v1. Start the backend (npm run dev:backend)'),
      ),
    ).toBe(USER_NETWORK_ERROR);
    expect(toUserFacingError('Confirm NEXT_PUBLIC_API_BASE_URL')).toBe('Something went wrong. Please try again.');
  });

  it('keeps normal business messages', () => {
    expect(toUserFacingError(new Error('Only HOD can approve leave'))).toBe('Only HOD can approve leave');
  });

  it('parseApiErrorMessage strips technical payloads', () => {
    expect(
      parseApiErrorMessage(
        JSON.stringify({
          message: 'Cannot reach the API at http://localhost:7000 — confirm BACKEND_ORIGIN',
        }),
        503,
      ),
    ).toBe(USER_NETWORK_ERROR);
    expect(parseApiErrorMessage('', 500)).toBe(USER_SERVER_ERROR);
  });
});
