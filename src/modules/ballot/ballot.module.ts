import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ballot, BallotSchema } from './schemas/ballot.schema';
import { BallotService } from './services/ballot.service';
import { BallotController } from './controllers/ballot.controller';
import { GeographicModule } from '../geographic/geographic.module';
import { PoliticalModule } from '../political/political.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ballot.name, schema: BallotSchema }]),
    GeographicModule,
    PoliticalModule,
    HttpModule,
  ],
  controllers: [BallotController],
  providers: [BallotService],
  exports: [BallotService],
})
export class BallotModule {}
