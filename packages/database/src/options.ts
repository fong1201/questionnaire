import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities/index.js';
import { MIGRATIONS } from './migrations/index.js';

export interface DatabaseEnv {
  DB_HOST?: string;
  DB_PORT?: string;
  DB_NAME?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  /** "true" enables TLS using the bundled Amazon RDS certificate authorities. */
  DB_SSL?: string;
  /** Maximum connections per process. */
  DB_POOL_SIZE?: string;
  /** Idle pooled connections are closed after this many ms (lets Aurora Serverless pause). */
  DB_IDLE_TIMEOUT_MS?: string;
}

/** Connection options shared by both APIs and the migration runner. */
export function buildDataSourceOptions(env: DatabaseEnv = process.env): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 3306),
    database: env.DB_NAME ?? 'questionnaire',
    username: env.DB_USER ?? 'questionnaire',
    password: env.DB_PASSWORD ?? 'questionnaire',
    ssl: env.DB_SSL === 'true' ? 'Amazon RDS' : undefined,
    connectTimeout: 60_000,
    timezone: 'Z',
    charset: 'utf8mb4',
    entities: ENTITIES,
    // Bounded pool per process: total connections = pool size x task count, which must stay
    // below the database's max_connections.
    poolSize: Number(env.DB_POOL_SIZE ?? 10),
    extra: {
      // mysql2 keeps idle connections open by default. Closing them lets Aurora Serverless v2
      // scale to zero when nobody votes or watches the dashboard.
      maxIdle: 0,
      idleTimeout: Number(env.DB_IDLE_TIMEOUT_MS ?? 60_000),
    },
    migrations: MIGRATIONS,
    // Schema changes only ever happen through migrations.
    synchronize: false,
    migrationsRun: false,
  };
}
