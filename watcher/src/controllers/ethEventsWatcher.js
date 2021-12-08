const { logger } = require('../utils/logger');
const {
  getProvider,
  getHub,
  getAppRegistry,
  getDatasetRegistry,
  getWorkerpoolRegistry,
  getERlc,
} = require('../loaders/ethereum');
const {
  processClosedAppOrder,
  processClosedDatasetOrder,
  processClosedRequestOrder,
  processClosedWorkerpoolOrder,
  processCreateCategory,
  processOrdersMatched,
  processTransferApp,
  processTransferDataset,
  processTransferWorkerpool,
  processStakeLoss,
  processRoleRevoked,
  processNewBlock,
} = require('./ethEventsProcessor');
const {
  getBlockNumber,
  queryFilter,
  cleanRPC,
  NULL_ADDRESS,
} = require('../utils/eth-utils');
const { isEnterpriseFlavour } = require('../utils/iexec-utils');
const config = require('../config');

const log = logger.extend('controllers:ethEventsWatcher');

const extractEvent =
  (processCallback) =>
  (...args) => {
    const event = args[args.length - 1];
    return processCallback(event);
  };

const registerNewBlock = () => {
  log('registering block events');
  const provider = getProvider();
  provider.on('block', processNewBlock);
};

const registerHubEvents = () => {
  log('registering Hub events');
  const hubContract = getHub();
  hubContract.on('CreateCategory', extractEvent(processCreateCategory));
  hubContract.on('OrdersMatched', extractEvent(processOrdersMatched));
  hubContract.on('ClosedAppOrder', extractEvent(processClosedAppOrder));
  hubContract.on('ClosedDatasetOrder', extractEvent(processClosedDatasetOrder));
  hubContract.on(
    'ClosedWorkerpoolOrder',
    extractEvent(processClosedWorkerpoolOrder),
  );
  hubContract.on('ClosedRequestOrder', extractEvent(processClosedRequestOrder));
  hubContract.on('Transfer', extractEvent(processStakeLoss));
};

const registerERlcEvents = async () => {
  if (isEnterpriseFlavour(config.flavour)) {
    log('registering ERlc events');
    const eRlcContract = getERlc();
    eRlcContract.on('RoleRevoked', extractEvent(processRoleRevoked));
  } else {
    log('skipping register ERlc events');
  }
};

const registerAppRegistryEvents = () => {
  log('registering AppRegistry events');
  const appRegistryContract = getAppRegistry();
  appRegistryContract.on('Transfer', extractEvent(processTransferApp));
};

const registerDatasetRegistryEvents = () => {
  log('registering DatasetRegistry events');
  const datasetRegistryContract = getDatasetRegistry();
  datasetRegistryContract.on('Transfer', extractEvent(processTransferDataset));
};

const registerWorkerpoolRegistryEvents = () => {
  log('registering WorkerpoolRegistry events');
  const workerpoolRegistryContract = getWorkerpoolRegistry();
  workerpoolRegistryContract.on(
    'Transfer',
    extractEvent(processTransferWorkerpool),
  );
};

const unsubscribeHubEvents = () => {
  log('unsubscribe Hub events');
  getHub().removeAllListeners();
};

const unsubscribeERlcEvents = async () => {
  if (isEnterpriseFlavour(config.flavour)) {
    log('unsubscribe ERlc events');
    getERlc().removeAllListeners();
  } else {
    log('skipping unsubscribe ERlc events');
  }
};

const unsubscribeAppRegistryEvents = () => {
  log('unsubscribe AppRegistry events');
  getAppRegistry().removeAllListeners();
};

const unsubscribeDatasetRegistryEvents = () => {
  log('unsubscribe DatasetRegistry events');
  getDatasetRegistry().removeAllListeners();
};

const unsubscribeWorkerpoolRegistryEvents = () => {
  log('unsubscribe WorkerpoolRegistry events');
  getWorkerpoolRegistry().removeAllListeners();
};

const unsubscribeAllEvents = () => {
  unsubscribeHubEvents();
  unsubscribeAppRegistryEvents();
  unsubscribeDatasetRegistryEvents();
  unsubscribeWorkerpoolRegistryEvents();
  unsubscribeERlcEvents();
  getProvider().removeAllListeners();
};

const getContractPastEvent = async (
  contract,
  eventName,
  { fromBlock = config.startBlock, toBlock = 'latest' } = {},
) => {
  try {
    const eventsArray = await queryFilter(contract, [
      eventName,
      fromBlock,
      toBlock,
    ]);
    return eventsArray;
  } catch (error) {
    log(`getContractPastEvent() ${eventName}`, error);
    throw error;
  }
};

const replayPastEventBatch = async (
  firstBlock,
  lastBlock,
  { processedCount = 0 } = {},
) => {
  log('replay batch from block', firstBlock, 'to block', lastBlock);

  const fromBlock = firstBlock;
  const last =
    lastBlock === 'latest' ? await getBlockNumber(getProvider()) : lastBlock;

  let toBlock;
  let iterate;
  if (
    config.runtime.blocksBatchSize > 0 &&
    last - fromBlock > config.runtime.blocksBatchSize
  ) {
    toBlock = fromBlock + config.runtime.blocksBatchSize - 10;
    iterate = true;
  } else {
    toBlock = last;
    iterate = false;
  }

  const hubContract = getHub();
  const appRegistryContract = getAppRegistry();
  const datasetRegistryContract = getDatasetRegistry();
  const workerpoolRegistryContract = getWorkerpoolRegistry();

  const [
    transferAppEvents,
    transferDatasetEvents,
    transferWorkerpoolEvents,
    createCategoryEvents,
    transferStakeEvents,
    ordersMatchedEvents,
    closedAppOrderEvents,
    closedDatasetOrderEvents,
    closedWorkerpoolOrderEvents,
    closedRequestOrderEvents,
    roleRevokedEvents,
  ] = await Promise.all([
    getContractPastEvent(appRegistryContract, 'Transfer', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(datasetRegistryContract, 'Transfer', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(workerpoolRegistryContract, 'Transfer', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(hubContract, 'CreateCategory', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(hubContract, 'Transfer', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(hubContract, 'OrdersMatched', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(hubContract, 'ClosedAppOrder', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(hubContract, 'ClosedDatasetOrder', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(hubContract, 'ClosedWorkerpoolOrder', {
      fromBlock,
      toBlock,
    }),
    getContractPastEvent(hubContract, 'ClosedRequestOrder', {
      fromBlock,
      toBlock,
    }),
    isEnterpriseFlavour(config.flavour)
      ? getContractPastEvent(getERlc(), 'RoleRevoked', {
          fromBlock,
          toBlock,
        })
      : [],
  ]);

  const eventsArray = transferAppEvents
    .map((e) => ({ event: e, process: processTransferApp }))
    .concat(
      transferDatasetEvents.map((e) => ({
        event: e,
        process: processTransferDataset,
      })),
    )
    .concat(
      transferWorkerpoolEvents.map((e) => ({
        event: e,
        process: processTransferWorkerpool,
      })),
    )
    .concat(
      createCategoryEvents.map((e) => ({
        event: e,
        process: processCreateCategory,
      })),
    )
    .concat(
      transferStakeEvents
        .filter((e) => {
          // filter mint & no value
          const { from, value } = cleanRPC(e.args);
          return from !== NULL_ADDRESS && value !== '0';
        })
        .reduce((acc, curr) => {
          // filter unique addresses
          const { from } = curr.args;
          const collectedEvent = acc.find((e) => e.args.from === from);
          if (!collectedEvent) acc.push(curr);
          return acc;
        }, [])
        .map((e) => ({
          event: e,
          process: processStakeLoss,
        })),
    )
    .concat(
      ordersMatchedEvents.map((e) => ({
        event: e,
        process: processOrdersMatched,
      })),
    )
    .concat(
      closedAppOrderEvents.map((e) => ({
        event: e,
        process: processClosedAppOrder,
      })),
    )
    .concat(
      closedDatasetOrderEvents.map((e) => ({
        event: e,
        process: processClosedDatasetOrder,
      })),
    )
    .concat(
      closedWorkerpoolOrderEvents.map((e) => ({
        event: e,
        process: processClosedWorkerpoolOrder,
      })),
    )
    .concat(
      closedRequestOrderEvents.map((e) => ({
        event: e,
        process: processClosedRequestOrder,
      })),
    )
    .concat(
      roleRevokedEvents.map((e) => ({
        event: e,
        process: processRoleRevoked,
      })),
    );

  log('batch events count', eventsArray.length);

  const EVENTS_BATCH_SIZE = 200;

  const processEvents = async (eventsToProcess, i = 0) => {
    await Promise.all(
      eventsToProcess
        .slice(0, EVENTS_BATCH_SIZE - 1)
        .map((e) => e.process(e.event, { isReplay: true })),
    );
    const remainingEvents = eventsToProcess.slice(EVENTS_BATCH_SIZE - 1);
    return remainingEvents.length > 0 && processEvents(remainingEvents, i + 1);
  };

  await processEvents(eventsArray);

  const processed = processedCount + eventsArray.length;
  if (iterate) {
    return replayPastEventBatch(toBlock + 1, lastBlock, {
      processedCount: processed,
    });
  }
  return processed;
};

const replayPastEvents = async (
  startingBlockNumber,
  lastBlockNumber = 'latest',
) => {
  try {
    log(
      'replaying events from block',
      startingBlockNumber,
      'to block',
      lastBlockNumber,
    );
    const currentBlock = await getBlockNumber(getProvider());
    if (startingBlockNumber > currentBlock) {
      log('no new block');
      return;
    }
    const eventsCount = await replayPastEventBatch(
      startingBlockNumber,
      lastBlockNumber,
      {
        batch: config.runtime.blocksBatchSize,
      },
    );
    log(
      'replayed events from block',
      startingBlockNumber,
      'to block',
      lastBlockNumber,
      'events count',
      eventsCount,
    );
  } catch (error) {
    log('replayPastEvents()', error);
    throw error;
  }
};

module.exports = {
  registerNewBlock,
  registerHubEvents,
  registerERlcEvents,
  registerAppRegistryEvents,
  registerDatasetRegistryEvents,
  registerWorkerpoolRegistryEvents,
  unsubscribeAllEvents,
  replayPastEvents,
};
