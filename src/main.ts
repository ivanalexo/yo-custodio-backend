/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LoggerService } from './core/services/logger.service';
import { GlobalValidationPipe } from './core/pipes/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(LoggerService);

  app.useLogger(logger);
  app.useGlobalPipes(GlobalValidationPipe);

  // CORS
  app.enableCors({
    origin: configService.get<string[]>('app.cors.origins'),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Electoral Results API')
    .setDescription('API para sistema de resultados electorales con blockchain')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Sistema', 'Endpoints del sistema')
    .addTag('Autenticación', 'Gestión de usuarios y autenticación')
    .addTag('Geografía', 'Jerarquía geográfica electoral')
    .addTag('Partidos', 'Partidos políticos')
    .addTag('Actas', 'Actas electorales y resultados')
    .addTag('Blockchain', 'Sincronización con smart contracts')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<string>('app.port') || '3000';
  await app.listen(port);

  logger.log(`🚀 Servidor iniciado en puerto ${port}`, 'Bootstrap');
  logger.log(
    `📚 Documentación disponible en http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
  logger.log(`🏥 Health check en http://localhost:${port}/health`, 'Bootstrap');
}

bootstrap();
