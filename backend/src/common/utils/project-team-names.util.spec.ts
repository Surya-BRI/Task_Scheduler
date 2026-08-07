import {
  collectProjectTeamNames,
  normalizePersonName,
} from './project-team-names.util';

describe('project-team-names.util', () => {
  it('normalizes trim + lower', () => {
    expect(normalizePersonName('  Alex Johnson ')).toBe('alex johnson');
  });

  it('collects team fields and comma-split designers', () => {
    const { displayNames, normalized } = collectProjectTeamNames({
      technicalHead: ' Alex Johnson ',
      teamLead: null,
      subTeamLead: '',
      designers: 'Benjamin Harris,  Casey Lee ',
    });
    expect([...displayNames].sort()).toEqual([
      'Alex Johnson',
      'Benjamin Harris',
      'Casey Lee',
    ]);
    expect(normalized.has('alex johnson')).toBe(true);
    expect(normalized.has('benjamin harris')).toBe(true);
    expect(normalized.has('casey lee')).toBe(true);
  });

  it('returns empty sets when no team names', () => {
    const { displayNames, normalized } = collectProjectTeamNames({
      technicalHead: null,
      teamLead: '  ',
      subTeamLead: null,
      designers: null,
    });
    expect(displayNames.size).toBe(0);
    expect(normalized.size).toBe(0);
  });
});
