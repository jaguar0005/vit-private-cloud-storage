import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import authRoutes from './routes/auth.routes.js';
import folderRoutes from './routes/folder.routes.js';
import fileRoutes from './routes/file.routes.js';
import shareRoutes from './routes/share.routes.js';
import trashRoutes from './routes/trash.routes.js';
import searchRoutes from './routes/search.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import adminRoutes from './routes/admin.routes.js';

// Global BigInt JSON serialization polyfill for Prisma BigInt fields
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

export const createApp = (): Express => {
  const app = express();

  // Security Middleware: Helmet with strict headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS allowlist configuration
  app.use(
    cors({
      origin: config.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-share-password'],
    })
  );

  // Standard Parsers
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // Healthcheck endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'VIT Private Cloud Storage Engine',
      version: '1.0.0',
    });
  });

  // Base API v1 ping
  app.get(`${config.API_PREFIX}/ping`, (_req: Request, res: Response) => {
    res.status(200).json({
      message: 'VIT Private Cloud API v1 Online',
      domainRestriction: `@${config.ALLOWED_EMAIL_DOMAIN}`,
      quotaPerUserMb: config.DEFAULT_USER_QUOTA_BYTES / (1024 * 1024),
    });
  });

  // Mount API v1 Routes
  app.use(`${config.API_PREFIX}/auth`, authRoutes);
  app.use(`${config.API_PREFIX}/folders`, folderRoutes);
  app.use(`${config.API_PREFIX}/files`, fileRoutes);
  app.use(`${config.API_PREFIX}/shares`, shareRoutes);
  app.use(`${config.API_PREFIX}/trash`, trashRoutes);
  app.use(`${config.API_PREFIX}/search`, searchRoutes);
  app.use(`${config.API_PREFIX}/analytics`, analyticsRoutes);
  app.use(`${config.API_PREFIX}/admin`, adminRoutes);

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    if (statusCode === 500) {
      console.error('Unhandled Server Error:', err);
    }
    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
        message: err.message || (config.NODE_ENV === 'production' ? 'An unexpected error occurred.' : String(err)),
      },
    });
  });

  return app;
};

export default createApp;
