process.env.TZ = 'America/Bogota';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DateFormatterInterceptor } from './common/interceptors/date-formatter.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:3001' });
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new DateFormatterInterceptor());
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Parking IA API corriendo en http://localhost:${port}`);
}
bootstrap();
