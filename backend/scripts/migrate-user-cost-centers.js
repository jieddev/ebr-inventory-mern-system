// One-time move to several cost centers per user: every warehouse user and encoder's single
// costCenter becomes costCenters: [costCenter], so no one gains or loses access. Admins have
// none (they switch between all). Safe to re-run: accounts that have costCenters are left alone.
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

async function main() {
  await connectDB();

  const users = await User.find({ role: { $ne: 'admin' }, costCenters: { $exists: false }, costCenter: { $type: 'string' } })
    .select('costCenter')
    .lean();
  for (const user of users) {
    await User.updateOne({ _id: user._id }, { $set: { costCenters: [user.costCenter] }, $unset: { costCenter: '' } });
  }
  console.log(users.length ? `Moved ${users.length} user(s) to costCenters.` : 'Every user already had costCenters.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
