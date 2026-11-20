import EmbeddedPostgres from 'embedded-postgres';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';

let embeddedInstance: EmbeddedPostgres | null = null;

export const isPortInUse = (port: number, host = '127.0.0.1'): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
};

export const ensureDatabaseAvailable = async (): Promise<{ port: number; isEmbedded: boolean }> => {
  const is5432InUse = (await isPortInUse(5432, '127.0.0.1')) || (await isPortInUse(5432, '::1'));
  if (is5432InUse) {
    console.log('🐘 PostgreSQL service detected on port 5432.');
    return { port: 5432, isEmbedded: false };
  }

  console.log('📦 Starting native embedded PostgreSQL 18 engine...');
  const dataDir = path.resolve(process.cwd(), 'storage/embedded-pg');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  embeddedInstance = new EmbeddedPostgres({
    port: 5432,
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgrespassword',
    persistent: true,
  });

  try {
    await embeddedInstance.initialise();
  } catch {
    // Already initialised
  }

  await embeddedInstance.start();
  console.log('🚀 Native PostgreSQL active on 127.0.0.1:5432');

  try {
    await embeddedInstance.createDatabase('cloud_storage');
    console.log('📦 Database cloud_storage initialized.');
  } catch {
    // Already exists
  }

  return { port: 5432, isEmbedded: true };
};

export const stopEmbeddedDatabase = async (): Promise<void> => {
  if (embeddedInstance) {
    await embeddedInstance.stop();
    embeddedInstance = null;
  }
};
