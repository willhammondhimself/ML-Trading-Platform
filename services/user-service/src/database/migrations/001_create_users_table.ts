import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('username', 50).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('phone_number', 20).nullable();
    table.enum('status', ['pending_verification', 'active', 'suspended', 'deactivated']).defaultTo('pending_verification');
    table.enum('role', ['user', 'admin', 'trader', 'analyst']).defaultTo('user');
    table.boolean('email_verified').defaultTo(false);
    table.boolean('phone_verified').defaultTo(false);
    table.boolean('mfa_enabled').defaultTo(false);
    table.string('mfa_secret', 32).nullable();
    table.json('mfa_backup_codes').nullable();
    table.timestamp('email_verified_at').nullable();
    table.timestamp('phone_verified_at').nullable();
    table.timestamp('last_login_at').nullable();
    table.string('last_login_ip', 45).nullable(); // IPv6 compatible
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('locked_until').nullable();
    table.json('preferences').nullable(); // User preferences as JSON
    table.json('metadata').nullable(); // Additional metadata
    table.timestamps(true, true); // created_at, updated_at
    table.timestamp('deleted_at').nullable(); // Soft delete

    // Indexes
    table.index('email');
    table.index('username');
    table.index('status');
    table.index('role');
    table.index(['status', 'email_verified']);
  });

  // Create user_sessions table for refresh token management
  await knex.schema.createTable('user_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('refresh_token_hash', 255).notNullable().unique();
    table.string('device_info', 500).nullable();
    table.string('ip_address', 45).notNullable();
    table.string('user_agent', 500).nullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('last_used_at').notNullable();
    table.boolean('is_revoked').defaultTo(false);
    table.timestamps(true, true);

    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Indexes
    table.index('user_id');
    table.index('refresh_token_hash');
    table.index(['user_id', 'is_revoked']);
    table.index('expires_at');
  });

  // Create password_reset_tokens table
  await knex.schema.createTable('password_reset_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('token_hash', 255).notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.boolean('is_used').defaultTo(false);
    table.string('ip_address', 45).notNullable();
    table.timestamps(true, true);

    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Indexes
    table.index('user_id');
    table.index('token_hash');
    table.index('expires_at');
  });

  // Create email_verification_tokens table
  await knex.schema.createTable('email_verification_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('token_hash', 255).notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.boolean('is_used').defaultTo(false);
    table.timestamps(true, true);

    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Indexes
    table.index('user_id');
    table.index('token_hash');
    table.index('expires_at');
  });

  // Create audit_logs table for security tracking
  await knex.schema.createTable('user_audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable(); // Nullable for failed login attempts
    table.string('action', 100).notNullable(); // login, logout, password_change, etc.
    table.json('details').nullable(); // Additional action details
    table.string('ip_address', 45).notNullable();
    table.string('user_agent', 500).nullable();
    table.enum('result', ['success', 'failure', 'blocked']).notNullable();
    table.string('failure_reason', 255).nullable();
    table.timestamps(true, true);

    // Foreign key (nullable)
    table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
    
    // Indexes
    table.index('user_id');
    table.index('action');
    table.index('result');
    table.index('created_at');
    table.index(['user_id', 'action']);
  });

  // Create rate_limit_logs table for tracking rate limiting
  await knex.schema.createTable('rate_limit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('identifier', 255).notNullable(); // IP, user ID, etc.
    table.string('key', 255).notNullable(); // Rate limit key
    table.integer('hits').notNullable();
    table.timestamp('window_start').notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index(['identifier', 'key']);
    table.index('expires_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order of creation (to handle foreign keys)
  await knex.schema.dropTableIfExists('rate_limit_logs');
  await knex.schema.dropTableIfExists('user_audit_logs');
  await knex.schema.dropTableIfExists('email_verification_tokens');
  await knex.schema.dropTableIfExists('password_reset_tokens');
  await knex.schema.dropTableIfExists('user_sessions');
  await knex.schema.dropTableIfExists('users');
}