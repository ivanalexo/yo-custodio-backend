import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { Department, DepartmentSchema } from './schemas/department.schema';
import { Province, ProvinceSchema } from './schemas/province.schema';
import { Municipality, MunicipalitySchema } from './schemas/municipality';
import {
  ElectoralSeat,
  ElectoralSeatSchema,
} from './schemas/electoral-seat.schema';
import {
  ElectoralLocation,
  ElectoralLocationSchema,
} from './schemas/electoral-location.schema';

// Services
import { DepartmentService } from './services/department.service';
import { ProvinceService } from './services/province.service';
import { MunicipalityService } from './services/municipality.service';
import { ElectoralSeatService } from './services/electoral-seat.service';
import { ElectoralLocationService } from './services/electoral-location.service';

// Controllers
import { DepartmentController } from './controllers/department.controller';
import { ProvinceController } from './controllers/province.controller';
import { MunicipalityController } from './controllers/municipality.controller';
import { ElectoralSeatController } from './controllers/electoral-seat.controller';
import { ElectoralLocationController } from './controllers/electoral-location.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
      { name: Province.name, schema: ProvinceSchema },
      { name: Municipality.name, schema: MunicipalitySchema },
      { name: ElectoralSeat.name, schema: ElectoralSeatSchema },
      { name: ElectoralLocation.name, schema: ElectoralLocationSchema },
    ]),
  ],
  controllers: [
    DepartmentController,
    ProvinceController,
    MunicipalityController,
    ElectoralSeatController,
    ElectoralLocationController,
  ],
  providers: [
    DepartmentService,
    ProvinceService,
    MunicipalityService,
    ElectoralSeatService,
    ElectoralLocationService,
  ],
  exports: [
    DepartmentService,
    ProvinceService,
    MunicipalityService,
    ElectoralSeatService,
    ElectoralLocationService,
  ],
})
export class GeographicModule {}
