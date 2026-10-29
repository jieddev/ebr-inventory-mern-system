// One-time rename of the "staff" role to "warehouse", on users and on the user copies kept in
// the activity log. Safe to re-run: once nothing has the old role, it changes nothing.
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');

async function main() {
  await connectDB();

  const users = await User.updateMany({ role: 'staff' }, { $set: { role: 'warehouse' } });
  const logs = await AuditLog.updateMany({ 'actor.role': 'staff' }, { $set: { 'actor.role': 'warehouse' } });

  console.log(`Updated ${users.modifiedCount} user(s) and ${logs.modifiedCount} activity log entr(ies).`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
