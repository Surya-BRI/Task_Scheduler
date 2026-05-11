import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DesignListRow = {
  id: string;
  opNo: string;
  projectNo: string;
  projectCode: string | null;
  designType: 'Retail' | 'Project';
  businessUnit: string;
  name: string;
  status: 'WIP' | 'Completed' | 'Pending' | 'Revision' | 'Approved';
  salesPerson: string;
  created: Date;
  deadline: Date;
  agingDays: number;
  agingLabel: string | null;
  clientName: string | null;
  projectName: string | null;
  assigneeName: string | null;
};

function toDdMmYyyy(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const year = value.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

@Injectable()
export class DesignListService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.$queryRaw<DesignListRow[]>`
      SELECT
        id, opNo, projectNo, projectCode, designType, businessUnit, [name], [status],
        salesPerson, created, deadline, agingDays, agingLabel, clientName, projectName, assigneeName
      FROM dbo.ErpDesignList
      ORDER BY created DESC, id ASC
    `;

    return rows.map((row) => ({
      id: row.id,
      opNo: row.opNo,
      projectNo: row.projectNo,
      projectCode: row.projectCode ?? undefined,
      designType: row.designType,
      businessUnit: row.businessUnit,
      name: row.name,
      status: row.status,
      salesPerson: row.salesPerson,
      created: toDdMmYyyy(new Date(row.created)),
      deadline: toDdMmYyyy(new Date(row.deadline)),
      agingDays: row.agingDays,
      agingLabel: row.agingLabel ?? undefined,
      clientName: row.clientName ?? undefined,
      projectName: row.projectName ?? undefined,
      assignee: row.assigneeName ? { name: row.assigneeName } : undefined,
    }));
  }
}

