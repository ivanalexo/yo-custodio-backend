/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ballot, BallotDocument } from '../schemas/ballot.schema';
import {
  CreateBallotFromIpfsDto,
  BallotQueryDto,
  BallotStatsDto,
  OpenSeaMetadata,
  BallotDataFromIpfs,
} from '../dto/ballot.dto';
import { ElectoralLocationService } from '../../geographic/services/electoral-location.service';
import { ElectoralTableService } from '../../geographic/services/electoral-table.service';
import { PoliticalPartyService } from '../../political/services/political-party.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class BallotService {
  constructor(
    @InjectModel(Ballot.name) private ballotModel: Model<BallotDocument>,
    private electoralLocationService: ElectoralLocationService,
    private electoralTableService: ElectoralTableService,
    private politicalPartyService: PoliticalPartyService,
    private readonly httpService: HttpService,
  ) {}

  async createFromIpfs(createDto: CreateBallotFromIpfsDto): Promise<Ballot> {
    try {
      // 1. Fetch data from IPFS
      const ipfsData = await this.fetchFromIpfs(createDto.ipfsUri);

      // 2. Extract ballot data from OpenSea format
      const ballotData = this.extractBallotData(ipfsData);

      // 3. Validate data
      await this.validateBallotData(ballotData);

      // 4. Get location details
      const locationDetails = await this.getLocationDetails(
        ballotData.locationId,
      );

      // 5. Extract CID from URI
      const cid = this.extractCidFromUri(createDto.ipfsUri);

      // 6. Create ballot document
      const ballot = new this.ballotModel({
        tableNumber: ballotData.tableNumber,
        tableCode: ballotData.tableCode,
        electoralLocationId: ballotData.locationId,
        location: locationDetails,
        votes: ballotData.votes,
        ipfsUri: createDto.ipfsUri,
        ipfsCid: cid,
        status: 'processed',
      });

      return await ballot.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('El acta ya fue registrada para esta mesa');
      }
      throw error;
    }
  }

  private async fetchFromIpfs(ipfsUri: string): Promise<OpenSeaMetadata> {
    try {
      //   const response = await firstValueFrom(
      //     this.httpService.get(ipfsUri, {
      //       timeout: 30000, // 30 segundos timeout
      //     }),
      //   );
      const response = await fetch(ipfsUri);
      const data = await response.json();
      console.log(data);
      return data as unknown as OpenSeaMetadata;
    } catch (error) {
      console.log('Error al obtener datos de IPFS:', error);
      throw new BadRequestException('Error al obtener datos de IPFS');
    }
  }

  private extractBallotData(metadata: OpenSeaMetadata): BallotDataFromIpfs {
    // Buscar el atributo que contiene 'data'
    const dataAttribute = metadata.attributes.find(
      (attr: any) => attr.data !== undefined,
    );

    if (!dataAttribute || !dataAttribute.data) {
      throw new BadRequestException(
        'Formato de metadata inválido: no se encontró data',
      );
    }

    return dataAttribute.data as BallotDataFromIpfs;
  }

  private async validateBallotData(data: BallotDataFromIpfs): Promise<void> {
    const errors: string[] = [];

    // Validar estructura básica
    if (!data.tableCode || !data.tableNumber || !data.locationId) {
      errors.push('Datos de mesa incompletos');
    }

    if (!data.votes || typeof data.votes !== 'object') {
      errors.push('Datos de votación faltantes');
    }

    // Validar que existe la mesa electoral
    try {
      const table = await this.electoralTableService.findByTableCode(
        data.tableCode,
      );
      if (!table) {
        errors.push('Código de mesa no existe');
      }
    } catch {
      errors.push('Código de mesa inválido');
    }

    // Validar partidos políticos
    if (data.votes && data.votes.partyVotes) {
      const partyIds = data.votes.partyVotes.map((pv) => pv.partyId);
      const validParties =
        await this.politicalPartyService.validatePartyIds(partyIds);
      if (!validParties) {
        errors.push('Algunos partidos políticos no son válidos');
      }
    }

    // Validar suma de votos
    if (data.votes) {
      const sumPartyVotes = data.votes.partyVotes.reduce(
        (sum, pv) => sum + pv.votes,
        0,
      );
      if (sumPartyVotes !== data.votes.validVotes) {
        errors.push(
          'La suma de votos por partido no coincide con votos válidos',
        );
      }

      // Validar que todos los votos sean no negativos
      if (
        data.votes.validVotes < 0 ||
        data.votes.nullVotes < 0 ||
        data.votes.blankVotes < 0
      ) {
        errors.push('Los votos no pueden ser negativos');
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(
        `Errores de validación: ${errors.join(', ')}`,
      );
    }
  }

  private async getLocationDetails(locationId: string): Promise<any> {
    try {
      const location =
        await this.electoralLocationService.findOneWithHierarchy(locationId);

      return {
        department: location.department.name,
        province: location.province.name,
        municipality: location.municipality.name,
        electoralSeat: location.electoralSeat.name,
        electoralLocationName: location.name,
        district: location.district,
        zone: location.zone,
        circunscripcion: {
          number: location.circunscripcion.number,
          type: location.circunscripcion.type,
          name: location.circunscripcion.name,
        },
      };
    } catch (error) {
      throw new NotFoundException('Recinto electoral no encontrado');
    }
  }

  private extractCidFromUri(uri: string): string {
    // Extraer CID de diferentes formatos de URI IPFS
    const patterns = [
      /ipfs\.io\/ipfs\/([a-zA-Z0-9]+)/,
      /gateway\.pinata\.cloud\/ipfs\/([a-zA-Z0-9]+)/,
      /([Qm][a-zA-Z0-9]{44,})/,
      /([a-z0-9]{46,})/i, // CIDv1
    ];

    for (const pattern of patterns) {
      const match = uri.match(pattern);
      if (match) {
        return match[1];
      }
    }

    throw new BadRequestException('No se pudo extraer CID de la URI');
  }

  async findAll(query: BallotQueryDto): Promise<{
    data: Ballot[];
    total: number;
    page: number;
    pages: number;
  }> {
    const filter: any = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.department) {
      filter['location.department'] = query.department;
    }

    if (query.province) {
      filter['location.province'] = query.province;
    }

    if (query.municipality) {
      filter['location.municipality'] = query.municipality;
    }

    if (query.circunscripcionType) {
      filter['location.circunscripcion.type'] = query.circunscripcionType;
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.ballotModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.ballotModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async getStats(): Promise<BallotStatsDto> {
    // Obtener total de mesas desde electoral_tables
    const totalTables = await this.electoralTableService.countTotal();

    // Obtener estadísticas de ballots
    const [processed, pending, synced, error] = await Promise.all([
      this.ballotModel.countDocuments({ status: 'processed' }),
      this.ballotModel.countDocuments({ status: 'pending' }),
      this.ballotModel.countDocuments({ status: 'synced' }),
      this.ballotModel.countDocuments({ status: 'error' }),
    ]);

    const processedTotal = processed + synced;
    const completionPercentage =
      totalTables > 0
        ? Math.round((processedTotal / totalTables) * 10000) / 100
        : 0;

    return {
      totalTables,
      processedTables: processedTotal,
      pendingTables: pending,
      syncedTables: synced,
      errorTables: error,
      completionPercentage,
    };
  }

  async findOne(id: string): Promise<Ballot> {
    const ballot = await this.ballotModel.findById(id).exec();
    if (!ballot) {
      throw new NotFoundException('Acta no encontrada');
    }
    return ballot;
  }

  async findByTableCode(tableCode: string): Promise<Ballot> {
    const ballot = await this.ballotModel.findOne({ tableCode }).exec();
    if (!ballot) {
      throw new NotFoundException('Acta no encontrada');
    }
    return ballot;
  }

  async findByNearestLocation(
    latitude: number,
    longitude: number,
    maxDistance: number = 5000,
  ): Promise<{
    location: any;
    ballots: Ballot[];
    stats: any;
  }> {
    // 1. Encontrar el recinto electoral más cercano
    const nearestLocation =
      await this.electoralLocationService.findNearestLocation(
        latitude,
        longitude,
        maxDistance,
      );

    if (!nearestLocation) {
      throw new NotFoundException(
        `No se encontró ningún recinto electoral en un radio de ${maxDistance} metros`,
      );
    }

    // 2. Buscar todas las actas de ese recinto
    const ballots = await this.ballotModel
      .find({ electoralLocationId: nearestLocation._id })
      .sort({ tableNumber: 1 })
      .exec();

    // 3. Obtener estadísticas del recinto
    const totalTables = await this.electoralTableService.countByLocation(
      nearestLocation._id.toString(),
    );

    const processedTables = ballots.filter(
      (b) => b.status === 'processed' || b.status === 'synced',
    ).length;

    const completionPercentage =
      totalTables > 0
        ? Math.round((processedTables / totalTables) * 10000) / 100
        : 0;

    return {
      location: {
        _id: nearestLocation._id,
        name: nearestLocation.name,
        address: nearestLocation.address,
        district: nearestLocation.district,
        zone: nearestLocation.zone,
        distance: nearestLocation.distance,
        coordinates: {
          latitude: nearestLocation.coordinates.latitude,
          longitude: nearestLocation.coordinates.longitude,
        },
      },
      ballots,
      stats: {
        totalTables,
        processedTables,
        completionPercentage,
      },
    };
  }
}
