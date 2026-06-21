import {
  isDesignerDepartmentMentionable,
  mergeCollectedMentionUserIds,
  parseMentionUserIdsFromMessage,
  uniqueUuids,
} from './chatter-mentions.util';

describe('isDesignerDepartmentMentionable', () => {
  it('allows all designers when the viewer has no department', () => {
    expect(isDesignerDepartmentMentionable(null, 'dept-a')).toBe(true);
    expect(isDesignerDepartmentMentionable(undefined, null)).toBe(true);
  });

  it('allows designers without a synced department when the viewer has one', () => {
    expect(isDesignerDepartmentMentionable('dept-a', null)).toBe(true);
    expect(isDesignerDepartmentMentionable('dept-a', undefined)).toBe(true);
  });

  it('matches departments case-insensitively', () => {
    expect(isDesignerDepartmentMentionable('Dept-A', 'dept-a')).toBe(true);
  });

  it('excludes designers from a different department', () => {
    expect(isDesignerDepartmentMentionable('dept-a', 'dept-b')).toBe(false);
  });
});

describe('mergeCollectedMentionUserIds', () => {
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const userC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const eligible = new Set([userA, userB]);

  it('keeps all explicitly tagged users even when outside eligible directory', () => {
    const result = mergeCollectedMentionUserIds({
      explicitIds: [userA, userC],
      parsedFromMessageIds: [],
      eligibleIds: eligible,
    });
    expect(result).toEqual([userA, userC]);
  });

  it('filters parsed message mentions by eligibility but keeps explicit tags', () => {
    const result = mergeCollectedMentionUserIds({
      explicitIds: [userC],
      parsedFromMessageIds: [userA, userC],
      eligibleIds: eligible,
    });
    expect(result).toEqual([userC, userA]);
  });

  it('deduplicates explicit and parsed ids', () => {
    const result = mergeCollectedMentionUserIds({
      explicitIds: [userA],
      parsedFromMessageIds: [userA, userB],
      eligibleIds: eligible,
    });
    expect(result).toEqual(uniqueUuids([userA, userB]));
  });
});

describe('parseMentionUserIdsFromMessage', () => {
  const directory = [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Jane Doe' },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fullName: 'John Smith' },
  ];

  it('parses multiple @mentions in one message', () => {
    const ids = parseMentionUserIdsFromMessage(
      'Hi @Jane Doe and @John Smith please review',
      directory,
    );
    expect(ids).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });
});
