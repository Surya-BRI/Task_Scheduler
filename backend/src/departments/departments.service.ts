import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Department already exists');
    return this.prisma.department.create({
      data: { name: dto.name },
    });
  }

  findAll() {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true, fullName: true, email: true, role: { select: { name: true } } },
        },
      },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async update(id: string, dto: CreateDepartmentDto) {
    await this.findOne(id);
    return this.prisma.department.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.department.delete({ where: { id } });
  }
}
