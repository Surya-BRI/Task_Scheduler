import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DesignListRow = {
  projectId: number;
  projectCode: string | null;
  salesForceCode: string | null;
  projectName: string | null;
  clientName: string | null;
  businessUnitCode: string | null;
  status: string | null;
  salesPerson: string | null;
  projectManager: string | null;
  projectOwner: string | null;
  createdOn: Date;
};

type ProjectListPageResult = {
  data: Array<ReturnType<DesignListService['mapRow']>>;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type DesignListPageFilters = {
  q: string;
  type: string;
  status: string;
  salesPerson: string;
  startDate: string;
  endDate: string;
};

function toDdMmYyyy(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const year = value.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

const RETAIL_UNIT_CODES = new Set<string>(['retail', 'rtl', 'r', 'prosigns-retail']);
const PROJECT_UNIT_CODES = new Set<string>(['project', 'normal', 'prosigns-projects']);

@Injectable()
export class DesignListService {
  private readonly logger = new Logger(DesignListService.name);

  constructor(private readonly prisma: PrismaService) {}

  private resolveDesignType(businessUnitCode: string | null): 'Retail' | 'Project' {
    const normalized = (businessUnitCode ?? '').trim().toLowerCase();
    if (RETAIL_UNIT_CODES.has(normalized)) return 'Retail';
    if (PROJECT_UNIT_CODES.has(normalized)) return 'Project';

    if (normalized.length > 0 && normalized !== 'project') {
      this.logger.warn(
        JSON.stringify({
          event: 'unknown_business_unit_mapping',
          businessUnitCode,
          fallback: 'Project',
        }),
      );
    }

    return 'Project';
  }

  /** Join fan-out (e.g. multiple opportunities per project) can yield identical mapped `id`s; keep the first row per id. */
  private dedupeMappedRows<T extends { id: string }>(rows: T[]): T[] {
    const byId = new Map<string, T>();
    for (const row of rows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    return [...byId.values()];
  }

  private mapRow(row: DesignListRow, preserveNulls = false) {
    const id = String(row.projectId);
    const projectCode = row.projectCode ?? null;
    const salesForceCode = row.salesForceCode ?? null;
    const projectName = row.projectName ?? null;
    const salesPerson = row.salesPerson ?? null;
    const projectManager = row.projectManager ?? null;
    const projectOwner = row.projectOwner ?? null;
    const customerName = row.clientName ?? null;

    return {
      id,
      opNo: preserveNulls ? salesForceCode : salesForceCode ?? projectCode ?? id,
      projectNo: preserveNulls ? projectCode : projectCode ?? id,
      projectCode: preserveNulls ? projectCode : projectCode ?? undefined,
      designType: this.resolveDesignType(row.businessUnitCode),
      businessUnit: row.businessUnitCode ?? 'Project',
      name: preserveNulls ? projectName : projectName ?? projectCode ?? id,
      status: (row.status as 'WIP' | 'Completed' | 'Pending' | 'Revision' | 'Approved') ?? 'Pending',
      salesPerson: preserveNulls ? salesPerson : salesPerson ?? 'Unassigned',
      created: toDdMmYyyy(new Date(row.createdOn)),
      deadline: toDdMmYyyy(new Date(row.createdOn)),
      agingDays: Math.max(0, Math.floor((Date.now() - new Date(row.createdOn).getTime()) / 86400000)),
      agingLabel: undefined,
      clientName: preserveNulls ? customerName : customerName ?? undefined,
      projectName: preserveNulls ? projectName : projectName ?? undefined,
      assignee: projectManager ? { name: projectManager } : undefined,
      salesForceCode: preserveNulls ? salesForceCode : salesForceCode ?? undefined,
      customerName: preserveNulls ? customerName : customerName ?? undefined,
      projectManager: preserveNulls ? projectManager : projectManager ?? undefined,
      projectOwner: preserveNulls ? projectOwner : projectOwner ?? undefined,
    };
  }

  private buildBaseQuery(whereSearchClause: string) {
    return `
      SELECT
        mp.projectid AS projectId,
        mp.projectCode,
        mo.salesForceCode,
        mp.projectName,
        mc.customerName AS clientName,
        mb.businessUnitCode,
        mt.taxnomycode AS status,
        me.firstName + '' + me.lastName AS salesPerson,
        mee.firstName + '' + mee.lastName AS projectManager,
        meee.firstName + '' + meee.lastName AS projectOwner,
        mp.createdOn
      FROM ErpMasterProject mp
      LEFT JOIN ErpMasterOpportunity mo ON mo.projectid = mp.projectid
      LEFT JOIN ErpMastercustomer mc ON mc.custId = mp.clientIId
      LEFT JOIN ErpMasterBusinessUnit mb ON mb.businessUnitId = mp.businessUnitId
      LEFT JOIN ErpMasterTaxnomy mt ON mt.taxnomyId = mp.statusId
      LEFT JOIN ErpMasterEmployee me ON me.employeeId = mo.salesRepId
      LEFT JOIN ErpMasterEmployee mee ON mee.employeeId = mp.projectManagerId
      LEFT JOIN ErpMasterEmployee meee ON meee.employeeId = mp.projectOwnerId
      WHERE mp.isActive = 1
      ${whereSearchClause}
    `;
  }

  private escapeSqlLike(value: string): string {
    return value.replace(/'/g, "''");
  }

  private buildDesignListWhereClause(filters: DesignListPageFilters): string {
    const clauses: string[] = [];

    const search = filters.q.trim();
    if (search.length > 0) {
      const escaped = this.escapeSqlLike(search);
      clauses.push(`(
        mp.projectCode LIKE '%${escaped}%'
        OR mo.salesForceCode LIKE '%${escaped}%'
        OR mp.projectName LIKE '%${escaped}%'
      )`);
    }

    const type = filters.type.trim().toLowerCase();
    if (type === 'retail') {
      clauses.push(`LOWER(LTRIM(RTRIM(COALESCE(mb.businessUnitCode, '')))) IN ('retail', 'rtl', 'r')`);
    } else if (type === 'project') {
      clauses.push(
        `LOWER(LTRIM(RTRIM(COALESCE(mb.businessUnitCode, '')))) NOT IN ('retail', 'rtl', 'r')`,
      );
    }

    const status = filters.status.trim();
    if (status.length > 0) {
      const escaped = this.escapeSqlLike(status);
      clauses.push(`COALESCE(mt.taxnomycode, 'Pending') = '${escaped}'`);
    }

    const salesPerson = filters.salesPerson.trim();
    if (salesPerson.length > 0) {
      const escaped = this.escapeSqlLike(salesPerson);
      clauses.push(`COALESCE(me.firstName + '' + me.lastName, 'Unassigned') = '${escaped}'`);
    }

    const startDate = filters.startDate.trim();
    if (startDate.length > 0) {
      const escaped = this.escapeSqlLike(startDate);
      clauses.push(`CAST(mp.createdOn AS DATE) >= CAST('${escaped}' AS DATE)`);
    }

    const endDate = filters.endDate.trim();
    if (endDate.length > 0) {
      const escaped = this.escapeSqlLike(endDate);
      clauses.push(`CAST(mp.createdOn AS DATE) <= CAST('${escaped}' AS DATE)`);
    }

    return clauses.length > 0 ? ` AND ${clauses.join('\n      AND ')}` : '';
  }

  async findAll() {
    const rows = await this.prisma.live.$queryRaw<DesignListRow[]>`
      SELECT
        mp.projectid AS projectId,
        mp.projectCode,
        mo.salesForceCode,
        mp.projectName,
        mc.customerName AS clientName,
        mb.businessUnitCode,
        mt.taxnomycode AS status,
        me.firstName + '' + me.lastName AS salesPerson,
        mee.firstName + '' + mee.lastName AS projectManager,
        meee.firstName + '' + meee.lastName AS projectOwner,
        mp.createdOn
      FROM ErpMasterProject mp
      LEFT JOIN ErpMasterOpportunity mo ON mo.projectid = mp.projectid
      LEFT JOIN ErpMastercustomer mc ON mc.custId = mp.clientIId
      LEFT JOIN ErpMasterBusinessUnit mb ON mb.businessUnitId = mp.businessUnitId
      LEFT JOIN ErpMasterTaxnomy mt ON mt.taxnomyId = mp.statusId
      LEFT JOIN ErpMasterEmployee me ON me.employeeId = mo.salesRepId
      LEFT JOIN ErpMasterEmployee mee ON mee.employeeId = mp.projectManagerId
      LEFT JOIN ErpMasterEmployee meee ON meee.employeeId = mp.projectOwnerId
      WHERE mp.isActive = 1
      ORDER BY mp.createdOn DESC
    `;

    return this.dedupeMappedRows(rows.map((row: DesignListRow) => this.mapRow(row)));
  }

  async findProjectsListPage(page: number, limit: number, q: string): Promise<ProjectListPageResult> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(200, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;
    const search = q.trim();
    const hasSearch = search.length > 0;
    const escapedSearch = search.replace(/'/g, "''");
    const whereSearchClause = hasSearch
      ? `
      AND (
        mp.projectCode LIKE '%${escapedSearch}%'
        OR mp.projectName LIKE '%${escapedSearch}%'
        OR (me.firstName + '' + me.lastName) LIKE '%${escapedSearch}%'
      )`
      : '';

    const baseQuery = this.buildBaseQuery(whereSearchClause);
    const rows = await this.prisma.live.$queryRawUnsafe<DesignListRow[]>(`
      ${baseQuery}
      ORDER BY mp.createdOn DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${safeLimit} ROWS ONLY
    `);

    const totalRows = await this.prisma.live.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COUNT(*) AS total
      FROM (${baseQuery}) AS q
    `);
    const total = Number(totalRows[0]?.total ?? 0);

    return {
      data: this.dedupeMappedRows(rows.map((row) => this.mapRow(row, true))),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async findDesignListPage(
    page: number,
    limit: number,
    filters: DesignListPageFilters,
  ): Promise<ProjectListPageResult> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(200, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    const whereClause = this.buildDesignListWhereClause(filters);
    const baseQuery = this.buildBaseQuery(whereClause);

    const rows = await this.prisma.live.$queryRawUnsafe<DesignListRow[]>(`
      ${baseQuery}
      ORDER BY mp.createdOn DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${safeLimit} ROWS ONLY
    `);

    const totalRows = await this.prisma.live.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COUNT(*) AS total
      FROM (${baseQuery}) AS q
    `);
    const total = Number(totalRows[0]?.total ?? 0);

    return {
      data: rows.map((row) => this.mapRow(row)),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }
}
