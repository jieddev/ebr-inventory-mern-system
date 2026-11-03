// One-time move to per-user permissions: every warehouse user and encoder saved before them
// gets their role's defaults (config/permissions.js), so no one gains or loses access. Admins
// get none (they can do everything). Safe to re-run: accounts that have permissions are left alone.
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const { ROLES } = require('../src/models/User');
const { defaultPermissions } = require('../src/config/permissions');

async function main() {
  await connectDB();

  const counts = [];
  for (const role of ROLES) {
    const { modifiedCount } = await User.updateMany(
      { role, permissions: { $exists: false } },
      { $set: { permissions: defaultPermissions(role).sort() } },
    );
    if (modifiedCount) counts.push(`${modifiedCount} ${role}`);
  }
  console.log(counts.length ? `Set permissions on ${counts.join(', ')} user(s).` : 'Every user already had permissions.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
