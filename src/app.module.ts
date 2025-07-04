import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { GeographicModule } from './modules/geographic/geographic.module';

@Module({
  imports: [CoreModule, GeographicModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
