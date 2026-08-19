import { designerInvolvementWhere, parseStatusList } from './designer-involvement.util';

describe('designerInvolvementWhere', () => {
  it('matches assignee, junction, scheduler, and work-session involvement', () => {
    expect(designerInvolvementWhere('designer-1')).toEqual({
      OR: [
        { assigneeId: 'designer-1' },
        { taskDesigners: { some: { designerId: 'designer-1' } } },
        { schedulerAssignments: { some: { designerId: 'designer-1' } } },
        { workSessions: { some: { designerId: 'designer-1' } } },
      ],
    });
  });
});

describe('parseStatusList', () => {
  it('splits unique comma-separated statuses', () => {
    expect(parseStatusList('DESIGN_NEW, IN_PROGRESS, DESIGN_NEW')).toEqual([
      'DESIGN_NEW',
      'IN_PROGRESS',
    ]);
  });

  it('returns empty for blank input', () => {
    expect(parseStatusList('')).toEqual([]);
    expect(parseStatusList(undefined)).toEqual([]);
  });
});
