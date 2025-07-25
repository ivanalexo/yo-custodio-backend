/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ballot, BallotDocument } from '../../ballot/schemas/ballot.schema';
import { ElectoralTable } from '../../geographic/schemas/electoral-table.schema';
import {
  QuickCountResponseDto,
  LocationResultsResponseDto,
  RegistrationProgressResponseDto,
  CircunscripcionResponseDto,
  HeatMapResponseDto,
  SystemStatisticsResponseDto,
  ElectionTypeFilterDto,
  LocationFilterDto,
  CircunscripcionFilterDto,
} from '../dto/results.dto';

@Injectable()
export class ResultsService {
  constructor(
    @InjectModel(Ballot.name) private ballotModel: Model<BallotDocument>,
    @InjectModel(ElectoralTable.name)
    private electoralTableModel: Model<ElectoralTable>,
  ) {}

  /**
   * Obtiene el conteo rápido nacional (solo votos presidenciales)
   */
  async getQuickCount(): Promise<QuickCountResponseDto> {
    // TODO: implementar publicación en cache

    const results = await this.ballotModel.aggregate([
      {
        $match: {
          status: 'processed',
        },
      },
      {
        $unwind: '$votes.partyVotes', // Descomponer array de votos por partido
      },
      {
        $group: {
          _id: '$votes.partyVotes.partyId',
          totalVotes: { $sum: '$votes.partyVotes.votes' },
          departments: { $addToSet: '$location.department' }, // Para verificar cobertura
        },
      },
      {
        $project: {
          _id: 0,
          partyId: '$_id',
          totalVotes: 1,
          departmentsCovered: { $size: '$departments' },
        },
      },
      {
        $sort: { totalVotes: -1 },
      },
    ]);

    // Calcular totales generales
    const totalValidVotes = await this.ballotModel.aggregate([
      { $match: { status: 'processed' } },
      { $group: { _id: null, total: { $sum: '$votes.validVotes' } } },
    ]);

    const totalNullVotes = await this.ballotModel.aggregate([
      { $match: { status: 'processed' } },
      { $group: { _id: null, total: { $sum: '$votes.nullVotes' } } },
    ]);

    const totalBlankVotes = await this.ballotModel.aggregate([
      { $match: { status: 'processed' } },
      { $group: { _id: null, total: { $sum: '$votes.blankVotes' } } },
    ]);

    const grandTotal =
      (totalValidVotes[0]?.total || 0) +
      (totalNullVotes[0]?.total || 0) +
      (totalBlankVotes[0]?.total || 0);

    // Agregar porcentajes a cada partido
    const resultsWithPercentages = results.map((party) => ({
      ...party,
      percentage:
        grandTotal > 0
          ? (
              (party.totalVotes / (totalValidVotes[0]?.total || 1)) *
              100
            ).toFixed(2)
          : '0.00',
    }));

    // TODO: Publicar en cache

    return {
      results: resultsWithPercentages,
      summary: {
        validVotes: totalValidVotes[0]?.total || 0,
        nullVotes: totalNullVotes[0]?.total || 0,
        blankVotes: totalBlankVotes[0]?.total || 0,
        totalVotes: grandTotal,
      },
      lastUpdate: new Date(),
    };
  }

  /**
   * Obtiene resultados filtrados por ubicación geográfica
   * soporta filtros por departamento, municipio, provincia, recinto y mesa
   */
  async getResultsByLocation(
    filters: ElectionTypeFilterDto,
  ): Promise<LocationResultsResponseDto> {
    // TODO: Implementar verificación de cache

    const matchStage: any = { status: 'processed' };

    // Aplicar filtros según los parámetros
    if (filters.department) {
      matchStage['location.department'] = filters.department;
    }
    if (filters.municipality) {
      matchStage['location.municipality'] = filters.municipality;
    }
    if (filters.province) {
      matchStage['location.province'] = filters.province;
    }
    if (filters.electoralSeat) {
      matchStage['location.electoralSeat'] = filters.electoralSeat;
    }
    if (filters.tableNumber) {
      matchStage.tableNumber = filters.tableNumber;
    }

    // Determinar campo de votos según tipo de elección
    const votesField =
      filters.electionType === 'presidential' ? 'partyVotes' : 'deputiesVotes';

    const results = await this.ballotModel.aggregate([
      { $match: matchStage },
      { $unwind: `$votes.${votesField}` },
      {
        $group: {
          _id: `$votes.${votesField}.partyId`,
          totalVotes: { $sum: `$votes.${votesField}.votes` },
          tablesCount: { $addToSet: '$tableNumber' }, // Contar mesas únicas
        },
      },
      {
        $project: {
          _id: 0,
          partyId: '$_id',
          totalVotes: 1,
          tablesProcessed: { $size: '$tablesCount' },
        },
      },
      { $sort: { totalVotes: -1 } },
    ]);

    // Obtener totales para la ubicación filtrada
    const totals = await this.ballotModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          validVotes: { $sum: '$votes.validVotes' },
          nullVotes: { $sum: '$votes.nullVotes' },
          blankVotes: { $sum: '$votes.blankVotes' },
          totalTables: { $addToSet: '$tableNumber' },
        },
      },
    ]);

    const summary = totals[0] || {
      validVotes: 0,
      nullVotes: 0,
      blankVotes: 0,
      totalTables: [],
    };
    const grandTotal =
      summary.validVotes + summary.nullVotes + summary.blankVotes;

    // Calcular porcentajes
    const resultsWithPercentages = results.map((party) => ({
      ...party,
      percentage:
        summary.validVotes > 0
          ? ((party.totalVotes / summary.validVotes) * 100).toFixed(2)
          : '0.00',
    }));

    // TODO: Publicar en cache

    return {
      filters,
      results: resultsWithPercentages,
      summary: {
        validVotes: summary.validVotes,
        nullVotes: summary.nullVotes,
        blankVotes: summary.blankVotes,
        totalVotes: grandTotal,
        tablesProcessed: summary.totalTables.length,
      },
      lastUpdate: new Date(),
    };
  }

  /**
   * Obtiene el progreso de registro de actas
   * Compara actas registradas vs total de mesas
   */
  async getRegistrationProgress(
    filters?: LocationFilterDto,
  ): Promise<RegistrationProgressResponseDto> {
    // TODO: Verificar cache

    // Construir filtro para mesas
    const tableFilter: any = {};
    if (filters?.department)
      tableFilter['location.department'] = filters.department;
    if (filters?.municipality)
      tableFilter['location.municipality'] = filters.municipality;
    if (filters?.province) tableFilter['location.province'] = filters.province;

    // Total de mesas esperadas
    const totalTables =
      await this.electoralTableModel.countDocuments(tableFilter);

    // Construir filtro para actas registradas
    const ballotFilter: any = { status: { $in: ['processed', 'synced'] } };
    if (filters?.department)
      ballotFilter['location.department'] = filters.department;
    if (filters?.municipality)
      ballotFilter['location.municipality'] = filters.municipality;
    if (filters?.province) ballotFilter['location.province'] = filters.province;

    // Total de actas registradas
    const registeredBallots =
      await this.ballotModel.countDocuments(ballotFilter);

    // Progreso por estado
    const progressByStatus = await this.ballotModel.aggregate([
      { $match: filters ? ballotFilter : {} },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statusMap = progressByStatus.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // TODO: Publicar en cache

    return {
      progress: {
        totalTables,
        registeredBallots,
        percentage:
          totalTables > 0
            ? ((registeredBallots / totalTables) * 100).toFixed(2)
            : '0.00',
        pending: totalTables - registeredBallots,
      },
      byStatus: {
        pending: statusMap.pending || 0,
        processed: statusMap.processed || 0,
        synced: statusMap.synced || 0,
        error: statusMap.error || 0,
      },
      filters,
      lastUpdate: new Date(),
    };
  }

  /**
   * Obtiene resultados agrupados por circunscripción
   * util para visualizar resultados por distritos electorales
   */
  async getResultsByCircunscripcion(
    filters: CircunscripcionFilterDto,
  ): Promise<CircunscripcionResponseDto> {
    // TODO: Verificar cache

    const matchStage: any = { status: 'processed' };

    if (filters.circunscripcionType) {
      matchStage['location.circunscripcion.type'] = filters.circunscripcionType;
    }
    if (filters.circunscripcionNumber) {
      matchStage['location.circunscripcion.number'] =
        filters.circunscripcionNumber;
    }

    const votesField =
      filters.electionType === 'presidential' ? 'partyVotes' : 'deputiesVotes';

    const results = await this.ballotModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            number: '$location.circunscripcion.number',
            type: '$location.circunscripcion.type',
            name: '$location.circunscripcion.name',
          },
          ballots: { $push: '$ROOT' },
        },
      },
      {
        $project: {
          _id: 0,
          circunscripcion: '$_id',
          results: {
            $map: {
              input: {
                $reduce: {
                  input: '$ballots',
                  initialValue: [],
                  in: {
                    $concatArrays: ['$value', `$this.votes.${votesField}`],
                  },
                },
              },
              as: 'vote',
              in: '$vote',
            },
          },
          summary: {
            validVotes: { $sum: '$ballots.votes.validVotes' },
            nullVotes: { $sum: '$ballots.votes.nullVotes' },
            blankVotes: { $sum: '$ballots.votes.blankVotes' },
          },
        },
      },
      {
        $project: {
          circunscripcion: 1,
          summary: 1,
          partyResults: {
            $map: {
              input: {
                $objectToArray: {
                  $reduce: {
                    input: '$results',
                    initialValue: {},
                    in: {
                      $mergeObjects: [
                        '$value',
                        {
                          $arrayToObject: [
                            [
                              {
                                k: '$this.partyId',
                                v: {
                                  $add: [
                                    { $ifNull: [`$value.$this.partyId`, 0] },
                                    '$this.votes',
                                  ],
                                },
                              },
                            ],
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              as: 'party',
              in: {
                partyId: '$party.k',
                totalVotes: '$party.v',
              },
            },
          },
        },
      },
      {
        $project: {
          number: '$circunscripcion.number',
          type: '$circunscripcion.type',
          name: '$circunscripcion.name',
          results: {
            $map: {
              input: '$partyResults',
              as: 'party',
              in: {
                partyId: '$party.partyId',
                totalVotes: '$party.totalVotes',
                percentage: {
                  $cond: [
                    { $gt: ['$summary.validVotes', 0] },
                    {
                      $round: [
                        {
                          $multiply: [
                            {
                              $divide: [
                                '$party.totalVotes',
                                '$summary.validVotes',
                              ],
                            },
                            100,
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
          summary: {
            validVotes: '$summary.validVotes',
            nullVotes: '$summary.nullVotes',
            blankVotes: '$summary.blankVotes',
            totalVotes: {
              $add: [
                '$summary.validVotes',
                '$summary.nullVotes',
                '$summary.blankVotes',
              ],
            },
          },
        },
      },
      { $sort: { number: 1 } },
    ]);

    // TODO: Publicar en cache

    return {
      circunscripciones: results.map((r) => ({
        ...r,
        results: r.results
          .sort((a, b) => b.totalVotes - a.totalVotes)
          .map((party) => ({
            ...party,
            percentage: party.percentage.toFixed(2),
          })),
      })),
      lastUpdate: new Date(),
    };
  }

  /**
   * Obtiene datos para mapa de calor por participación y resultados
   * visualizaciones geográficas
   */
  async getHeatMapData(params: {
    electionType: 'presidential' | 'deputies';
    locationType: 'department' | 'municipality' | 'province';
    department?: string;
  }): Promise<HeatMapResponseDto> {
    // TODO: Verificar caché

    const matchStage: any = { status: 'processed' };
    if (params.department && params.locationType === 'municipality') {
      matchStage['location.department'] = params.department;
    }

    const groupField = `$location.${params.locationType}`;
    const votesField =
      params.electionType === 'presidential' ? 'partyVotes' : 'deputiesVotes';

    const results = await this.ballotModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: groupField,
          totalVotes: {
            $sum: {
              $add: [
                '$votes.validVotes',
                '$votes.nullVotes',
                '$votes.blankVotes',
              ],
            },
          },
          validVotes: { $sum: '$votes.validVotes' },
          partyVotes: { $push: `$votes.${votesField}` },
          tableCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          location: '$_id',
          locationType: params.locationType,
          totalVotes: 1,
          partyPercentages: {
            $arrayToObject: {
              $map: {
                input: {
                  $objectToArray: {
                    $reduce: {
                      input: {
                        $reduce: {
                          input: '$partyVotes',
                          initialValue: [],
                          in: { $concatArrays: ['$value', '$this'] },
                        },
                      },
                      initialValue: {},
                      in: {
                        $mergeObjects: [
                          '$value',
                          {
                            $arrayToObject: [
                              [
                                {
                                  k: '$this.partyId',
                                  v: {
                                    $add: [
                                      { $ifNull: [`$value.$this.partyId`, 0] },
                                      '$this.votes',
                                    ],
                                  },
                                },
                              ],
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
                as: 'party',
                in: {
                  k: '$party.k',
                  v: {
                    $round: [
                      {
                        $multiply: [
                          { $divide: ['$party.v', '$validVotes'] },
                          100,
                        ],
                      },
                      2,
                    ],
                  },
                },
              },
            },
          },
          // Calcular tasa de participación (esto requeriría datos del oep)
          participationRate: 0, // TODO: Implementar cuando tengamos datos del oep
        },
      },
      { $sort: { location: 1 } },
    ]);

    // TODO: Publicar en cache

    return {
      data: results,
      electionType: params.electionType,
      lastUpdate: new Date(),
    };
  }

  /**
   * Obtiene estadísticas generales del sistema
   * dashboards administrativos
   */
  async getSystemStatistics(): Promise<SystemStatisticsResponseDto> {
    // TODO: Verificar caché

    const [totalBallots, ballotsbyStatus, departmentCoverage, recentActivity] =
      await Promise.all([
        // Total de actas
        this.ballotModel.countDocuments(),

        // Actas por estado
        this.ballotModel.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ]),

        // Cobertura por departamento
        this.ballotModel.aggregate([
          { $match: { status: 'processed' } },
          {
            $group: {
              _id: '$location.department',
              ballotCount: { $sum: 1 },
              lastUpdate: { $max: '$updatedAt' },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Actividad reciente (últimas 24 horas)
        this.ballotModel.aggregate([
          {
            $match: {
              createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

    const statusMap = ballotsbyStatus.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // TODO: Publicar en cache

    return {
      summary: {
        totalBallots,
        byStatus: statusMap,
        departmentsCovered: departmentCoverage.length,
      },
      departmentCoverage: departmentCoverage.map((dept) => ({
        department: dept._id,
        ballotCount: dept.ballotCount,
        lastUpdate: dept.lastUpdate,
      })),
      recentActivity: recentActivity.map((activity) => ({
        hour: activity._id,
        count: activity.count,
      })),
      lastUpdate: new Date(),
    };
  }
}
