import { DesignListService } from './design-list.service';
import { expectInputParameterized, extractPrismaSqlParts } from '../common/utils/prisma-sql-test.util';

const FILTER_EDGE_CASES = [
  { label: 'single quote', value: "O'Brien" },
  { label: 'sql comment', value: "'; DROP TABLE ErpMasterProject; --" },
  { label: 'percent wildcard', value: '100%' },
  { label: 'underscore wildcard', value: 'proj_01' },
  { label: 'unicode', value: 'プロジェクト' },
  { label: 'empty string', value: '' },
  { label: 'whitespace only', value: '   ' },
];

describe('DesignListService SQL security', () => {
  const queryRaw = jest.fn();
  const prisma = { live: { $queryRaw: queryRaw } };
  const service = new DesignListService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockImplementation(async () => []);
  });

  it.each(FILTER_EDGE_CASES)('parameterizes search filter: $label', async ({ value }) => {
    await service.findProjectsListPage(1, 50, value);

    expect(queryRaw).toHaveBeenCalled();
    const firstQuery = queryRaw.mock.calls[0][0];
    if (value.trim()) {
      expectInputParameterized(firstQuery, value.trim());
    } else {
      const { values } = extractPrismaSqlParts(firstQuery);
      expect(values.filter((v) => typeof v === 'string' && v.includes('%'))).toHaveLength(0);
    }
  });

  it.each(FILTER_EDGE_CASES)('parameterizes design list filters: $label', async ({ value }) => {
    await service.findDesignListPage(1, 50, {
      q: value,
      type: '',
      status: value,
      salesPerson: value,
      startDate: value === 'not-a-date' ? value : '2026-01-01',
      endDate: '2026-12-31',
    });

    expect(queryRaw).toHaveBeenCalled();
    for (const call of queryRaw.mock.calls) {
      const query = call[0];
      if (value.trim() && value !== 'not-a-date') {
        expectInputParameterized(query, value.trim());
      }
    }
  });

  it('parameterizes salesForceCode lookup', async () => {
    const payload = "SF-'; DELETE FROM ErpMasterOpportunity; --";
    await service.findProjectSignTypes(payload);

    expect(queryRaw).toHaveBeenCalledWith(expect.anything());
    expectInputParameterized(queryRaw.mock.calls[0][0], payload.trim());
  });

  it('clamps pagination boundaries without string-building offset/limit', async () => {
    await service.findProjectsListPage(-5, 9999, 'test');

    const pageQuery = queryRaw.mock.calls[0][0];
    const { values } = extractPrismaSqlParts(pageQuery);
    expect(values).toContain(0);
    expect(values).toContain(200);
    expect(values).not.toContain(9999);
  });

  it('ignores invalid date strings instead of embedding them in SQL text', async () => {
    await service.findDesignListPage(1, 20, {
      q: '',
      type: '',
      status: '',
      salesPerson: '',
      startDate: "'; DROP TABLE ErpMasterProject; --",
      endDate: 'not-valid',
    });

    const pageQuery = queryRaw.mock.calls[0][0];
    const { strings } = extractPrismaSqlParts(pageQuery);
    expect(strings.join('')).not.toContain('DROP TABLE');
  });
});
