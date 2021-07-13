const config = require('../config');
const { getAgenda } = require('../loaders/agenda');
const { getProvider, getRpcProvider } = require('../loaders/ethereum');
const { logger } = require('../utils/logger');
const { sleep } = require('../utils/utils');
const { errorHandler } = require('../utils/error');
const { getBlockNumber } = require('../utils/eth-utils');

const { chainId } = config.chain;
const { checkSyncInterval } = config.runtime;

const log = logger.extend('controllers:syncWatcher');

const SYNC_WATCHER_JOB = 'watch-eth-node';

const MAX_ERROR_COUNT = 3;

const checkSync = () => async () => {
  let errorCount = 0;
  let isSync = false;
  await sleep(config.runtime.syncWatcherInterval);
  while (!isSync && errorCount < MAX_ERROR_COUNT) {
    try {
      const wsProvider = getProvider();
      const rpcProvider = getRpcProvider();

      const [rpcBlock, wsBlock] = await Promise.all([
        getBlockNumber(wsProvider),
        getBlockNumber(rpcProvider),
      ]);
      log('Sync - RPC:', rpcBlock, 'WS:', wsBlock);
      if (
        rpcBlock > wsBlock + config.runtime.outOfSyncThreshold ||
        wsBlock > rpcBlock + config.runtime.outOfSyncThreshold
      ) {
        errorHandler(
          Error(
            `Ethereum node out of sync! (RPC blockNumber: ${rpcBlock} - WS blockNumber: ${wsBlock})`,
          ),
          { type: 'out-of-sync', critical: true },
        );
      }
      isSync = true;
    } catch (error) {
      errorCount += 1;
      log(`syncWatcher() (${errorCount} error)`, error);
      if (errorCount >= MAX_ERROR_COUNT) {
        log(`syncWatcher() max error reached (${MAX_ERROR_COUNT})`);
        errorHandler(error, {
          type: 'too-much-sync-error',
          errorCount,
          critical: true,
        });
      }
      await sleep(5000);
    }
  }
};

const startSyncWatcher = async () => {
  const agenda = await getAgenda(chainId);
  agenda.define(SYNC_WATCHER_JOB, { lockLifetime: 16000 }, checkSync());
  await agenda.every(`${checkSyncInterval} seconds`, SYNC_WATCHER_JOB);
  log(
    `${SYNC_WATCHER_JOB} jobs added (run every ${checkSyncInterval} seconds)`,
  );
};

const stopSyncWatcher = async () => {
  const agenda = await getAgenda(chainId);
  await agenda.cancel({ name: SYNC_WATCHER_JOB });
};

module.exports = { startSyncWatcher, stopSyncWatcher };
