/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ElectoralTable,
  ElectoralTableDocument,
} from '../schemas/electoral-table.schema';
import {
  CreateElectoralTableDto,
  UpdateElectoralTableDto,
  ElectoralTableQueryDto,
} from '../dto/electoral-table.dto';
import { ElectoralLocationService } from './electoral-location.service';
import { LoggerService } from '../../../core/services/logger.service';

@Injectable()
export class ElectoralTableService {
  constructor(
    @InjectModel(ElectoralTable.name)
    private electoralTableModel: Model<ElectoralTableDocument>,
    private electoralLocationService: ElectoralLocationService,
    private logger: LoggerService,
  ) {}

  async create(createDto: CreateElectoralTableDto): Promise<ElectoralTable> {
    // Verificar que el recinto electoral existe
    await this.electoralLocationService.findOne(createDto.electoralLocationId);

    try {
      const table = new this.electoralTableModel(createDto);
      const saved = await table.save();

      this.logger.log(
        `Mesa electoral creada: ${saved.tableNumber} en recinto ${createDto.electoralLocationId}`,
        'ElectoralTableService',
      );
      return saved;
    } catch (error) {
      if (error.code === 11000) {
        if (error.message.includes('tableCode')) {
          throw new ConflictException(
            `El código de mesa '${createDto.tableCode}' ya existe`,
          );
        }
        if (error.message.includes('electoralLocationId_1_tableNumber_1')) {
          throw new ConflictException(
            `Ya existe una mesa con número '${createDto.tableNumber}' en este recinto`,
          );
        }
      }
      throw error;
    }
  }

  async findAll(query: ElectoralTableQueryDto) {
    const {
      page = 1,
      limit = 10,
      sort = 'tableNumber',
      order = 'asc',
      search,
      active,
      electoralLocationId,
    } = query;
    const skip = (page - 1) * limit;

    const filters: any = {};
    if (search) {
      filters.$or = [
        { tableNumber: { $regex: search, $options: 'i' } },
        { tableCode: { $regex: search, $options: 'i' } },
      ];
    }
    if (active !== undefined) {
      filters.active = active === 'true';
    }
    if (electoralLocationId) {
      filters.electoralLocationId = electoralLocationId;
    }

    const [tables, total] = await Promise.all([
      this.electoralTableModel
        .find(filters)
        .populate({
          path: 'electoralLocationId',
          select: 'name code address',
          populate: {
            path: 'electoralSeatId',
            select: 'name',
            populate: {
              path: 'municipalityId',
              select: 'name',
              populate: {
                path: 'provinceId',
                select: 'name',
                populate: {
                  path: 'departmentId',
                  select: 'name',
                },
              },
            },
          },
        })
        .sort({ [sort]: order === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.electoralTableModel.countDocuments(filters),
    ]);

    return {
      data: tables,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<ElectoralTable> {
    const table = await this.electoralTableModel
      .findById(id)
      .populate({
        path: 'electoralLocationId',
        select: 'name code address',
        populate: {
          path: 'electoralSeatId',
          select: 'name',
          populate: {
            path: 'municipalityId',
            select: 'name',
            populate: {
              path: 'provinceId',
              select: 'name',
              populate: {
                path: 'departmentId',
                select: 'name',
              },
            },
          },
        },
      })
      .exec();

    if (!table) {
      throw new NotFoundException(`Mesa electoral con ID ${id} no encontrada`);
    }
    return table;
  }

  async findByElectoralLocation(
    electoralLocationId: string,
  ): Promise<ElectoralTable[]> {
    // Verificar que el recinto existe
    await this.electoralLocationService.findOne(electoralLocationId);

    const tables = await this.electoralTableModel
      .find({
        electoralLocationId,
        active: true,
      })
      .sort({ tableNumber: 1 })
      .exec();

    return tables;
  }

  async findByTableCode(tableCode: string): Promise<ElectoralTable> {
    const table = await this.electoralTableModel
      .findOne({ tableCode })
      .populate({
        path: 'electoralLocationId',
        select: 'name code address',
      })
      .exec();

    if (!table) {
      throw new NotFoundException(
        `Mesa electoral con código '${tableCode}' no encontrada`,
      );
    }
    return table;
  }

  async update(
    id: string,
    updateDto: UpdateElectoralTableDto,
  ): Promise<ElectoralTable> {
    if (updateDto.electoralLocationId) {
      await this.electoralLocationService.findOne(
        updateDto.electoralLocationId,
      );
    }

    try {
      const table = await this.electoralTableModel
        .findByIdAndUpdate(id, updateDto, { new: true })
        .populate('electoralLocationId', 'name code')
        .exec();

      if (!table) {
        throw new NotFoundException(
          `Mesa electoral con ID ${id} no encontrada`,
        );
      }

      this.logger.log(
        `Mesa electoral actualizada: ${table.tableNumber}`,
        'ElectoralTableService',
      );
      return table;
    } catch (error) {
      if (error.code === 11000) {
        if (error.message.includes('tableCode')) {
          throw new ConflictException(
            `El código de mesa '${updateDto.tableCode}' ya existe`,
          );
        }
        if (error.message.includes('electoralLocationId_1_tableNumber_1')) {
          throw new ConflictException(
            `Ya existe una mesa con número '${updateDto.tableNumber}' en este recinto`,
          );
        }
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.electoralTableModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Mesa electoral con ID ${id} no encontrada`);
    }

    this.logger.log(
      `Mesa electoral eliminada: ${result.tableNumber}`,
      'ElectoralTableService',
    );
  }

  async activate(id: string): Promise<ElectoralTable> {
    const table = await this.electoralTableModel
      .findByIdAndUpdate(id, { active: true }, { new: true })
      .exec();

    if (!table) {
      throw new NotFoundException(`Mesa electoral con ID ${id} no encontrada`);
    }

    this.logger.log(
      `Mesa electoral activada: ${table.tableNumber}`,
      'ElectoralTableService',
    );
    return table;
  }

  async deactivate(id: string): Promise<ElectoralTable> {
    const table = await this.electoralTableModel
      .findByIdAndUpdate(id, { active: false }, { new: true })
      .exec();

    if (!table) {
      throw new NotFoundException(`Mesa electoral con ID ${id} no encontrada`);
    }

    this.logger.log(
      `Mesa electoral desactivada: ${table.tableNumber}`,
      'ElectoralTableService',
    );
    return table;
  }

  async getStatistics() {
    const stats = await this.electoralTableModel.aggregate([
      { $match: { active: true } },
      {
        $group: {
          _id: '$electoralLocationId',
          tableCount: { $sum: 1 },
          tableNumbers: { $push: '$tableNumber' },
        },
      },
      {
        $lookup: {
          from: 'electoral_locations',
          localField: '_id',
          foreignField: '_id',
          as: 'location',
        },
      },
      {
        $unwind: '$location',
      },
      {
        $group: {
          _id: null,
          totalTables: { $sum: '$tableCount' },
          totalLocations: { $sum: 1 },
          avgTablesPerLocation: { $avg: '$tableCount' },
          maxTablesPerLocation: { $max: '$tableCount' },
          minTablesPerLocation: { $min: '$tableCount' },
        },
      },
    ]);

    const total = await this.electoralTableModel.countDocuments({
      active: true,
    });
    const totalLocationsWithTables = await this.electoralTableModel
      .distinct('electoralLocationId')
      .then((arr) => arr.length);

    return {
      total,
      totalLocationsWithTables,
      summary: stats[0] || {
        totalTables: 0,
        totalLocations: 0,
        avgTablesPerLocation: 0,
        maxTablesPerLocation: 0,
        minTablesPerLocation: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async countTotal(): Promise<number> {
    return this.electoralTableModel.countDocuments({ active: true }).exec();
  }

  async countByLocation(electoralLocationId: string): Promise<number> {
    return this.electoralTableModel
      .countDocuments({
        electoralLocationId: new Types.ObjectId(electoralLocationId),
        active: true,
      })
      .exec();
  }
}
