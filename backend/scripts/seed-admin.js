// Creates the first admin from SEED_ADMIN_* in .env. Safe to re-run: skips if the ID exists.
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

const PLACEHOLDER = 'change-me';

async function main() {
  const userId = process.env.SEED_ADMIN_ID;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Administrator';

  if (!userId || !password)
    throw new Error(
      'Set SEED_ADMIN_ID and SEED_ADMIN_PASSWORD in backend/.env',
    );
  if (password === PLACEHOLDER)
    throw new Error('Change SEED_ADMIN_PASSWORD in backend/.env first');
  if (password.length < 8)
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters');

  await connectDB();

  if (await User.exists({ userId: userId.toLowerCase() })) {
    console.log(`User "${userId}" already exists, nothing to do.`);
    return;
  }

  const user = new User({ userId, name, role: 'admin' });
  await user.setPassword(password);
  await user.save();
  console.log(`Created admin "${user.userId}" (${user.name}).`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
