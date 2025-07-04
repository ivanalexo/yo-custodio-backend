/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { DatabaseModule } from '../database/database.module';
import { LoggerService } from './services/logger.service';
import { HealthService } from './services/health.service';
import { HealthController } from './controllers/health.controller';
import appConfig from '../config/app.config';

@Global()
@Module({
  imports: [
    // Configuración global
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: '.env',
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),

    // Base de datos
    DatabaseModule,

    // Cache con Redis
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        store: redisStore as any,
        host: configService.get<string>('app.redis.host'),
        port: configService.get<string>('app.redis.port'),
        password: configService.get<string>('app.redis.password'),
        ttl: configService.get<string>('app.cache.ttl') ? Number(configService.get<string>('app.cache.ttl')) : undefined,
        max: configService.get<string>('app.cache.max') ? Number(configService.get<string>('app.cache.max')) : undefined,
        isGlobal: true,
      }),
      inject: [ConfigService],
      isGlobal: true,
    }),
  ],
  controllers: [HealthController],
  providers: [LoggerService, HealthService],
  exports: [LoggerService, HealthService, CacheModule],
})
export class CoreModule {}