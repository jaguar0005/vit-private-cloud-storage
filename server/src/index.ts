import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import config from './config/index.js';
import { ensureDatabaseAvailable } from './db/embeddedPg.js';
import { initSchema } from './db/initSchema.js';

// Ensure storage directories exist on host laptop
const requiredDirectories = [
  config.STORAGE_ROOT_DIR,
  config.STORAGE_VAULT_DIR,
  config.STORAGE_QUARANTINE_DIR,
  config.STORAGE_CHUNKS_DIR,
];

for (const dir of requiredDirectories) {
  const fullPath = path.resolve(dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}

import CleanupJob from './jobs/cleanup.job.js';

async function startServer() {
  try {
    // 1. Ensure PostgreSQL database is running (either external or embedded)
    await ensureDatabaseAvailable();

    // 2. Ensure schema tables are initialized
    await initSchema();

    // 3. Start Express Web Engine
    const app = createApp();

    app.listen(config.PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 VIT Private Cloud Storage Engine Online`);
      console.log(`📡 URL: http://localhost:${config.PORT}`);
      console.log(`🔒 Domain Restricted to: @${config.ALLOWED_EMAIL_DOMAIN}`);
      console.log(`💾 Host Storage Pool: ${config.STORAGE_VAULT_DIR}`);
      console.log(`🛡️ 9-Stage Defense Pipeline: Ready`);
      console.log(`======================================================\n`);

      // 3. Initialize background scheduled tasks
      CleanupJob.initSchedules();
    });
  } catch (error) {
    console.error('Fatal Server Boot Error:', error);
    process.exit(1);
  }
}

startServer();
