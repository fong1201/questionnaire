import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVotingSchema1758168000000 implements MigrationInterface {
  name = 'CreateVotingSchema1758168000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci';

    await queryRunner.query(`
      CREATE TABLE ballots (
        id char(36) NOT NULL,
        submitted_at datetime(3) NOT NULL,
        processed_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX idx_ballots_submitted_at (submitted_at)
      ) ${table}`);

    await queryRunner.query(`
      CREATE TABLE ballot_selections (
        ballot_id char(36) NOT NULL,
        country_code char(2) NOT NULL,
        PRIMARY KEY (ballot_id, country_code),
        INDEX idx_ballot_selections_country (country_code),
        CONSTRAINT fk_ballot_selections_ballot FOREIGN KEY (ballot_id) REFERENCES ballots (id) ON DELETE CASCADE
      ) ${table}`);

    await queryRunner.query(`
      CREATE TABLE country_totals (
        country_code char(2) NOT NULL,
        votes bigint unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY (country_code)
      ) ${table}`);

    await queryRunner.query(`
      CREATE TABLE hourly_totals (
        hour_start datetime NOT NULL,
        participants int unsigned NOT NULL DEFAULT 0,
        votes int unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY (hour_start)
      ) ${table}`);

    await queryRunner.query(`
      CREATE TABLE country_hourly_totals (
        hour_start datetime NOT NULL,
        country_code char(2) NOT NULL,
        votes int unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY (hour_start, country_code)
      ) ${table}`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['country_hourly_totals', 'hourly_totals', 'country_totals', 'ballot_selections', 'ballots']) {
      await queryRunner.query(`DROP TABLE ${name}`);
    }
  }
}
