import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create orders table
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('symbol', 20).notNullable();
    table.enum('side', ['BUY', 'SELL']).notNullable();
    table.enum('type', ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']).notNullable();
    table.decimal('quantity', 20, 8).notNullable();
    table.decimal('price', 20, 8).nullable(); // Null for market orders
    table.decimal('stop_price', 20, 8).nullable(); // For stop orders
    table.enum('status', [
      'PENDING',
      'OPEN', 
      'PARTIALLY_FILLED',
      'FILLED',
      'CANCELLED',
      'REJECTED',
      'EXPIRED'
    ]).defaultTo('PENDING');
    table.decimal('filled_quantity', 20, 8).defaultTo(0);
    table.decimal('average_price', 20, 8).nullable();
    table.decimal('commission', 20, 8).defaultTo(0);
    table.enum('time_in_force', ['GTC', 'IOC', 'FOK', 'DAY']).defaultTo('GTC');
    table.timestamp('placed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').nullable();
    table.json('metadata').nullable(); // Additional order metadata
    
    // Indexes
    table.index('user_id');
    table.index('symbol');
    table.index('status');
    table.index(['user_id', 'status']);
    table.index(['symbol', 'status']);
    table.index('placed_at');
  });

  // Create trades table
  await knex.schema.createTable('trades', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('symbol', 20).notNullable();
    table.enum('side', ['BUY', 'SELL']).notNullable();
    table.decimal('quantity', 20, 8).notNullable();
    table.decimal('price', 20, 8).notNullable();
    table.decimal('commission', 20, 8).defaultTo(0);
    table.timestamp('executed_at').notNullable().defaultTo(knex.fn.now());
    table.string('execution_venue', 50).nullable();
    table.json('metadata').nullable();
    
    // Foreign key
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
    
    // Indexes
    table.index('order_id');
    table.index('user_id');
    table.index('symbol');
    table.index('executed_at');
    table.index(['user_id', 'symbol']);
  });

  // Create positions table
  await knex.schema.createTable('positions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('symbol', 20).notNullable();
    table.decimal('quantity', 20, 8).notNullable(); // Can be negative for short positions
    table.decimal('average_price', 20, 8).notNullable();
    table.decimal('market_value', 20, 8).notNullable();
    table.decimal('unrealized_pnl', 20, 8).notNullable();
    table.decimal('realized_pnl', 20, 8).defaultTo(0);
    table.timestamp('opened_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.json('metadata').nullable();
    
    // Unique constraint - one position per user per symbol
    table.unique(['user_id', 'symbol']);
    
    // Indexes
    table.index('user_id');
    table.index('symbol');
    table.index(['user_id', 'symbol']);
  });

  // Create portfolio_snapshots table for performance tracking
  await knex.schema.createTable('portfolio_snapshots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.decimal('total_value', 20, 8).notNullable();
    table.decimal('cash_balance', 20, 8).notNullable();
    table.decimal('positions_value', 20, 8).notNullable();
    table.decimal('unrealized_pnl', 20, 8).notNullable();
    table.decimal('realized_pnl', 20, 8).notNullable();
    table.decimal('day_pnl', 20, 8).notNullable();
    table.integer('total_positions').defaultTo(0);
    table.timestamp('snapshot_at').notNullable().defaultTo(knex.fn.now());
    table.json('positions_breakdown').nullable(); // Detailed position breakdown
    
    // Indexes
    table.index('user_id');
    table.index('snapshot_at');
    table.index(['user_id', 'snapshot_at']);
  });

  // Create order_events table for audit trail
  await knex.schema.createTable('order_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable();
    table.string('event_type', 50).notNullable(); // CREATED, FILLED, CANCELLED, etc.
    table.enum('old_status', [
      'PENDING',
      'OPEN', 
      'PARTIALLY_FILLED',
      'FILLED',
      'CANCELLED',
      'REJECTED',
      'EXPIRED'
    ]).nullable();
    table.enum('new_status', [
      'PENDING',
      'OPEN', 
      'PARTIALLY_FILLED',
      'FILLED',
      'CANCELLED',
      'REJECTED',
      'EXPIRED'
    ]).notNullable();
    table.decimal('quantity_delta', 20, 8).nullable(); // For partial fills
    table.decimal('price', 20, 8).nullable();
    table.string('reason', 255).nullable(); // Reason for status change
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.json('metadata').nullable();
    
    // Foreign key
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
    
    // Indexes
    table.index('order_id');
    table.index('event_type');
    table.index('occurred_at');
  });

  // Create risk_limits table
  await knex.schema.createTable('risk_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.decimal('daily_loss_limit', 20, 8).notNullable();
    table.decimal('position_limit', 20, 8).notNullable();
    table.decimal('order_size_limit', 20, 8).notNullable();
    table.integer('max_open_orders').defaultTo(100);
    table.decimal('max_leverage', 5, 2).defaultTo(1.0);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Unique constraint - one risk limit per user
    table.unique(['user_id']);
    
    // Index
    table.index('user_id');
  });

  // Create market_data_cache table for local caching
  await knex.schema.createTable('market_data_cache', (table) => {
    table.string('symbol', 20).primary();
    table.decimal('last_price', 20, 8).notNullable();
    table.decimal('bid_price', 20, 8).nullable();
    table.decimal('ask_price', 20, 8).nullable();
    table.decimal('volume', 20, 8).nullable();
    table.decimal('daily_change', 10, 4).nullable(); // Percentage
    table.timestamp('last_updated').notNullable().defaultTo(knex.fn.now());
    table.json('extended_data').nullable(); // Additional market data
    
    // Index
    table.index('last_updated');
  });

  // Create processing_locks table for order processing coordination
  await knex.schema.createTable('processing_locks', (table) => {
    table.string('lock_key', 255).primary();
    table.string('owner', 255).notNullable(); // Process/instance ID
    table.timestamp('acquired_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.json('metadata').nullable();
    
    // Index
    table.index('expires_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order of creation (to handle foreign keys)
  await knex.schema.dropTableIfExists('processing_locks');
  await knex.schema.dropTableIfExists('market_data_cache');
  await knex.schema.dropTableIfExists('risk_limits');
  await knex.schema.dropTableIfExists('order_events');
  await knex.schema.dropTableIfExists('portfolio_snapshots');
  await knex.schema.dropTableIfExists('positions');
  await knex.schema.dropTableIfExists('trades');
  await knex.schema.dropTableIfExists('orders');
}