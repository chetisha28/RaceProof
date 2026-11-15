import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import apiRoutes from './routes/index.js';
import { errorHandler } from './middleware/error.middleware.js';
import { env } from './config/env.js';

const app = express();

// Strict Security and CORS middleware
// Phase 4A: Exact configured production origin allowlist; localhost allowed only in development
const configuredOrigins = (env.CLIENT_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/$/, ''))
  .filter(Boolean);

const developmentOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
];

const allowedOrigins = new Set(
  env.NODE_ENV === 'production'
    ? configuredOrigins
    : [...configuredOrigins, ...developmentOrigins]
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or supertest)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, '');

      // Check against strict allowedOrigins Set
      if (allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }

      // In non-production only, permit localhost ports dynamically
      if (env.NODE_ENV !== 'production') {
        try {
          const parsed = new URL(origin);
          if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return callback(null, true);
          }
        } catch {
          // invalid origin
        }
      }

      return callback(new Error(`Origin '${origin}' not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  })
);

app.use(cookieParser(env.COOKIE_SECRET));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'RaceProof API',
    environment: env.NODE_ENV,
  });
});

// Mount Main API Routes
app.use('/api', apiRoutes);

// 404 Route Catch-all
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.method} ${req.originalUrl}' does not exist`,
    code: 'NOT_FOUND',
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;

