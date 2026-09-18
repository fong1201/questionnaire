import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // SIGTERM stops polling and lets in-flight batches finish before exit.
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4003);
  // The HTTP server only exposes /health for container and Kubernetes probes.
  await app.listen(port, '0.0.0.0');
  Logger.log(`Vote worker running, health on :${port}/health`, 'Bootstrap');
}

await bootstrap();
