const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Starts one throwaway MongoDB for the integration tests. A replica set, because the app saves
// with transactions (mongoose.connection.transaction), which a single standalone server can't do.
// Tests read its address with inject('mongoUri').
module.exports = async function setup(project) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ ip: '127.0.0.1' }],
  });
  project.provide('mongoUri', replSet.getUri());

  return async () => {
    await replSet.stop();
  };
};
