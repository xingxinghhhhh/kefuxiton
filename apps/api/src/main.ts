import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  capabilitiesForRuntime,
  ConfigValidationError,
  evaluateReleaseReadiness,
  formatConfigIssues,
  loadApiConfig,
} from '@ai-agent/config';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';

async function bootstrap() {
  let config;
  try {
    config = loadApiConfig(process.env);
  } catch (error) {
    const details = error instanceof ConfigValidationError ? formatConfigIssues(error) : 'CONFIG_INVALID field=RUNTIME_CONFIG';
    console.error(`API configuration rejected: ${details}`);
    process.exitCode = 1;
    return;
  }
  if (config.appEnv === 'production') {
    const readiness = evaluateReleaseReadiness({
      target: 'production',
      appEnv: config.appEnv,
      configValid: true,
      businessReadiness: null,
      capabilities: capabilitiesForRuntime(config),
    });
    if (readiness.status !== 'PRODUCTION_READY') {
      console.error(`API production readiness rejected: target=${readiness.target}; reasons=${readiness.reasonCodes.join(',')}`);
      process.exitCode = 1;
      return;
    }
  }
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: config.webOrigin });
  app.use(new RequestIdMiddleware().use);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(config.port);
}

bootstrap().catch(() => {
  console.error('API startup rejected: CONFIG_INVALID field=RUNTIME_CONFIG');
  process.exitCode = 1;
});
