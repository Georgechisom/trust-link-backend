import { Injectable } from '@nestjs/common';
import { DisputeStatusEnum } from '../../common/enums/escrow-state.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminStatsDto } from './dto/admin-stats.dto';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Aggregates escrow, volume, participant, and dispute totals for admins. */
  async getStats(): Promise<AdminStatsDto> {
    const [
      aggregation,
      stateGroups,
      uniqueVendorsResult,
      uniqueBuyersResult,
      totalDisputes,
      openDisputes,
    ] = await Promise.all([
      this.prisma.escrow.aggregate({
        _sum: { amount: true },
      }),
      this.prisma.escrow.groupBy({
        by: ['state'],
        _count: true,
      }),
      // Count distinct vendors in SQL
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "vendorAddress") as count FROM "Escrow"
      `,
      // Count distinct buyers in SQL
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "buyerAddress") as count FROM "Escrow"
      `,
      this.prisma.dispute.count(),
      this.prisma.dispute.count({
        where: {
          status: {
            in: [DisputeStatusEnum.OPEN, DisputeStatusEnum.UNDER_REVIEW],
          },
        },
      }),
    ]);

    const totalEscrows = (stateGroups as Array<{ _count: number }>).reduce(
      (sum, g) => sum + g._count,
      0,
    );
    const totalVolume = Number(aggregation._sum?.amount ?? 0);
    const uniqueVendors = Number(uniqueVendorsResult[0].count);
    const uniqueBuyers = Number(uniqueBuyersResult[0].count);
    const averageEscrowAmount =
      totalEscrows > 0 ? totalVolume / totalEscrows : 0;

    const escrowsByState: Record<string, number> = {};
    for (const group of stateGroups as Array<{
      state: string;
      _count: number;
    }>) {
      escrowsByState[group.state] = group._count;
    }

    return {
      totalEscrows,
      totalVolume,
      escrowsByState,
      uniqueVendors,
      uniqueBuyers,
      totalDisputes,
      openDisputes,
      averageEscrowAmount,
    };
  }
}
