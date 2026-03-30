const fs = require('fs/promises');
const path = require('path');

const rootDir = process.cwd();

async function removePath(targetPath) {
  await fs.rm(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300
  });
}

async function main() {
  const dbPath = path.join(rootDir, 'db.json');
  const publicPath = path.join(rootDir, 'public');

  try {
    await Promise.all([
      removePath(dbPath),
      removePath(publicPath)
    ]);

    console.log('INFO  Removed db.json and public folder with Windows-safe retries.');
  } catch (error) {
    console.error('ERROR Clean failed. A file in public/ or db.json is likely being held open by another process.');
    console.error('ERROR Close hexo server, Obsidian preview, Explorer preview, or sync tools and retry.');
    console.error(error);
    process.exit(1);
  }
}

main();
