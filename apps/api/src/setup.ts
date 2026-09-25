import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication) {
  // Behind a hosting load balancer (e.g. Render), trust X-Forwarded-For so rate limits apply per client
  // rather than to the proxy's IP. Accepts a hop count ("1") or "true".
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.getHttpAdapter().getInstance().set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true');
  }
  app.use(helmet());
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
}
