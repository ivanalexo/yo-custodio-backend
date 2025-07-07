/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ElectoralLocation,
  ElectoralLocationDocument,
} from '../schemas/electoral-location.schema';
import {
  CreateElectoralLocationDto,
  UpdateElectoralLocationDto,
} from '../dto/electoral-location.dto';
import { LocationQueryDto } from '../dto/query.dto';
import { ElectoralSeatService } from './electoral-seat.service';
import { LoggerService } from '../../../core/services/logger.service';

@Injectable()
export class ElectoralLocationService {
  constructor(
    @InjectModel(ElectoralLocation.name)
    private locationModel: Model<ElectoralLocationDocument>,
    private electoralSeatService: ElectoralSeatService,
    private logger: LoggerService,
  ) {}

  async create(
    createDto: CreateElectoralLocationDto,
  ): Promise<ElectoralLocation> {
    // Verificar que el asiento electoral existe
    await this.electoralSeatService.findOne(createDto.electoralSeatId);

    try {
      const location = new this.locationModel(createDto);
      const saved = await location.save();

      this.logger.log(
        `Recinto electoral creado: ${saved.name}`,
        'ElectoralLocationService',
      );
      return saved;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException(
          `El código de recinto '${createDto.code}' ya existe`,
        );
      }
      throw error;
    }
  }

  async findAll(query: LocationQueryDto) {
    const {
      page = 1,
      limit = 10,
      sort,
      order,
      search,
      active,
      electoralSeatId,
      circunscripcionType,
    } = query;
    const skip = (page - 1) * limit;

    const filters: any = {};
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }
    if (active !== undefined) {
      filters.active = active === 'true';
    }
    if (electoralSeatId) {
      filters.electoralSeatId = electoralSeatId;
    }
    if (circunscripcionType) {
      filters['circunscripcion.type'] = circunscripcionType;
    }

    const [locations, total] = await Promise.all([
      this.locationModel
        .find(filters)
        .populate({
          path: 'electoralSeatId',
          populate: {
            path: 'municipalityId',
            populate: {
              path: 'provinceId',
              populate: {
                path: 'departmentId',
                select: 'name',
              },
              select: 'name departmentId',
            },
            select: 'name provinceId',
          },
          select: 'name municipalityId',
        })
        .sort({ [String(sort)]: order === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.locationModel.countDocuments(filters),
    ]);

    return {
      data: locations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<ElectoralLocation> {
    const location = await this.locationModel
      .findById(id)
      .populate({
        path: 'electoralSeatId',
        populate: {
          path: 'municipalityId',
          populate: {
            path: 'provinceId',
            populate: {
              path: 'departmentId',
              select: 'name',
            },
            select: 'name departmentId',
          },
          select: 'name provinceId',
        },
        select: 'name municipalityId',
      })
      .exec();

    if (!location) {
      throw new NotFoundException(
        `Recinto electoral con ID ${id} no encontrado`,
      );
    }
    return location;
  }

  async findByCode(code: string): Promise<ElectoralLocation> {
    const location = await this.locationModel
      .findOne({ code })
      .populate({
        path: 'electoralSeatId',
        populate: {
          path: 'municipalityId',
          populate: {
            path: 'provinceId',
            populate: {
              path: 'departmentId',
              select: 'name',
            },
            select: 'name departmentId',
          },
          select: 'name provinceId',
        },
        select: 'name municipalityId',
      })
      .exec();

    if (!location) {
      throw new NotFoundException(
        `Recinto electoral con código '${code}' no encontrado`,
      );
    }
    return location;
  }

  async findNearby(
    latitude: number,
    longitude: number,
    maxDistance: number = 1000,
  ) {
    return this.locationModel
      .find({
        coordinates: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
            $maxDistance: maxDistance,
          },
        },
        active: true,
      })
      .populate('electoralSeatId', 'name')
      .limit(10)
      .exec();
  }

  async findByCircunscripcion(
    type: string,
    number?: number,
  ): Promise<ElectoralLocation[]> {
    const filters: any = { 'circunscripcion.type': type, active: true };
    if (number) {
      filters['circunscripcion.number'] = number;
    }

    return this.locationModel
      .find(filters)
      .populate('electoralSeatId', 'name')
      .sort({ 'circunscripcion.number': 1, name: 1 })
      .exec();
  }

  async update(
    id: string,
    updateDto: UpdateElectoralLocationDto,
  ): Promise<ElectoralLocation> {
    if (updateDto.electoralSeatId) {
      await this.electoralSeatService.findOne(updateDto.electoralSeatId);
    }

    try {
      const location = await this.locationModel
        .findByIdAndUpdate(id, updateDto, { new: true })
        .populate('electoralSeatId', 'name')
        .exec();

      if (!location) {
        throw new NotFoundException(
          `Recinto electoral con ID ${id} no encontrado`,
        );
      }

      this.logger.log(
        `Recinto electoral actualizado: ${location.name}`,
        'ElectoralLocationService',
      );
      return location;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException(
          `El código de recinto '${updateDto.code}' ya existe`,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.locationModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(
        `Recinto electoral con ID ${id} no encontrado`,
      );
    }

    this.logger.log(
      `Recinto electoral eliminado: ${result.name}`,
      'ElectoralLocationService',
    );
  }

  async getStatistics() {
    const stats = await this.locationModel.aggregate([
      { $match: { active: true } },
      {
        $group: {
          _id: '$circunscripcion.type',
          count: { $sum: 1 },
          districts: { $addToSet: '$district' },
          zones: { $addToSet: '$zone' },
        },
      },
      {
        $project: {
          type: '$_id',
          count: 1,
          distinctDistricts: { $size: '$districts' },
          distinctZones: { $size: '$zones' },
          _id: 0,
        },
      },
    ]);

    const total = await this.locationModel.countDocuments({ active: true });

    return {
      total,
      byType: stats,
      timestamp: new Date().toISOString(),
    };
  }
}
