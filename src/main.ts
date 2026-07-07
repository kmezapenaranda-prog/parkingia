process.env.TZ = 'America/Bogota';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DateFormatterInterceptor } from './common/interceptors/date-formatter.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:3001' });
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new DateFormatterInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Parking IA API')
    .setDescription('API de gestión de parqueaderos')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Parking IA API corriendo en http://localhost:${port}`);
  console.log(`Documentación Swagger en http://localhost:${port}/docs`);
}
bootstrap();
