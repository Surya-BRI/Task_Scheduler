import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../constants/roles.enum';
import { resolveDesignerScope } from './resolve-designer-scope.util';

describe('resolveDesignerScope', () => {
  const callerId = '11111111-1111-1111-1111-111111111111';
  const otherId = '22222222-2222-2222-2222-222222222222';

  it('defaults to caller id when designerId is omitted', () => {
    expect(resolveDesignerScope(undefined, callerId, UserRole.DESIGNER)).toBe(callerId);
  });

  it('allows designers to request their own id explicitly', () => {
    expect(resolveDesignerScope(callerId, callerId, UserRole.DESIGNER)).toBe(callerId);
  });

  it('blocks designers from accessing another designer id', () => {
    expect(() => resolveDesignerScope(otherId, callerId, UserRole.DESIGNER)).toThrow(
      ForbiddenException,
    );
  });

  it('allows HOD to access any designer id', () => {
    expect(resolveDesignerScope(otherId, callerId, UserRole.HOD)).toBe(otherId);
  });
});
