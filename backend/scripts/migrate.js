const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/quotesync_crm'
  });

  try {
    console.log('🔄 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully');

    console.log('🔄 Running database migration...');

    // Read SQL schema file
    const schemaPath = path.join(__dirname, '../../docs/database-schema.sql');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    await client.query(schema);

    console.log('✅ Migration completed successfully');
    console.log('📊 Tables created:');
    console.log('  - contacts');
    console.log('  - sources');
    console.log('  - consents');
    console.log('  - events');
    console.log('  - event_actions');
    console.log('  - orders');
    console.log('  - tracking_links');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

migrate();
