// Runs pending migrations. Used locally (npm run db:migrate) and by the deploy
// pipeline as a one-off ECS task before the services are updated.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './options.js';

const dataSource = new DataSource(buildDataSourceOptions());
await dataSource.initialize();
try {
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  console.log(
    applied.length
      ? `Applied migrations: ${applied.map((m) => m.name).join(', ')}`
      : 'Database schema is up to date',
  );
} finally {
  await dataSource.destroy();
}
