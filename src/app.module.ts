import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { GeographicModule } from './modules/geographic/geographic.module';
import { PoliticalModule } from './modules/political/political.module';

@Module({
  imports: [CoreModule, GeographicModule, PoliticalModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
