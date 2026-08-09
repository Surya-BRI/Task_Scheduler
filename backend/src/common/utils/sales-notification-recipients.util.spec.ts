import { matchSalesUsersToProject } from './sales-notification-recipients.util';

describe('matchSalesUsersToProject', () => {
  const salesUsers = [
    { id: 'sales-1', fullName: 'Sithara Sukumaran' },
    { id: 'sales-2', fullName: 'Fahad' },
    { id: 'sales-3', fullName: 'Nishad Lona' },
  ];

  it('matches compact ERP salesPerson to first-name user (Fahad ↔ FahadQuazi)', () => {
    const matched = matchSalesUsersToProject(
      { salesPerson: 'FahadQuazi', createdById: null },
      salesUsers,
    );
    expect(matched.map((u) => u.id)).toEqual(['sales-2']);
  });

  it('does not match unrelated sales users', () => {
    const matched = matchSalesUsersToProject(
      { salesPerson: 'NishadLona', createdById: null },
      salesUsers,
    );
    expect(matched.map((u) => u.id)).toEqual(['sales-3']);
    expect(matched.map((u) => u.id)).not.toContain('sales-1');
    expect(matched.map((u) => u.id)).not.toContain('sales-2');
  });

  it('includes project creator when they are sales', () => {
    const matched = matchSalesUsersToProject(
      { salesPerson: '', createdById: 'sales-1' },
      salesUsers,
    );
    expect(matched.map((u) => u.id)).toEqual(['sales-1']);
  });

  it('includes extraUserIds (e.g. TASK_CREATED actor) who are sales', () => {
    const matched = matchSalesUsersToProject(
      { salesPerson: 'SomeoneElse', createdById: null },
      salesUsers,
      { extraUserIds: ['sales-1', 'not-sales'] },
    );
    expect(matched.map((u) => u.id)).toEqual(['sales-1']);
  });

  it('returns empty when nothing matches', () => {
    expect(
      matchSalesUsersToProject({ salesPerson: 'PSGSales', createdById: null }, salesUsers),
    ).toEqual([]);
  });
});
