import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId?: string) {
    const where = userId ? { userId } : {};
    const requests = await this.prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, role: { select: { name: true } } } }
      }
    });

    return requests.map(req => ({
      id: req.id,
      designerId: req.userId,
      reason: req.reason,
      fromDate: req.startDate.toISOString().split('T')[0],
      toDate: req.endDate ? req.endDate.toISOString().split('T')[0] : req.startDate.toISOString().split('T')[0],
      status: req.status.toUpperCase(),
      type: req.type,
      createdBy: req.user.role.name === 'HOD' ? 'HOD' : 'Designer'
    }));
  }

  async create(dto: CreateLeaveRequestDto) {
    const req = await this.prisma.leaveRequest.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : new Date(dto.startDate),
        reason: dto.reason,
        status: 'PENDING'
      },
      include: {
        user: { select: { id: true, fullName: true, role: { select: { name: true } } } }
      }
    });

    return {
      id: req.id,
      designerId: req.userId,
      reason: req.reason,
      fromDate: req.startDate.toISOString().split('T')[0],
      toDate: req.endDate ? req.endDate.toISOString().split('T')[0] : req.startDate.toISOString().split('T')[0],
      status: req.status.toUpperCase(),
      type: req.type,
      createdBy: req.user.role.name === 'HOD' ? 'HOD' : 'Designer'
    };
  }

  async updateStatus(id: string, dto: UpdateRequestStatusDto) {
    const existing = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Leave request not found');

    const req = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: dto.status },
      include: {
        user: { select: { id: true, fullName: true, role: { select: { name: true } } } }
      }
    });

    return {
      id: req.id,
      designerId: req.userId,
      reason: req.reason,
      fromDate: req.startDate.toISOString().split('T')[0],
      toDate: req.endDate ? req.endDate.toISOString().split('T')[0] : req.startDate.toISOString().split('T')[0],
      status: req.status.toUpperCase(),
      type: req.type,
      createdBy: req.user.role.name === 'HOD' ? 'HOD' : 'Designer'
    };
  }
}
