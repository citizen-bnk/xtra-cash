import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './setup';

async function bootstrap() {
  // rawBody is needed to verify card-network webhook signatures.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('XTRA-CASH API').setVersion('0.1.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('docs', app, doc);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`XTRA-CASH API listening on http://localhost:${port} (docs at /docs)`);
}
bootstrap();
