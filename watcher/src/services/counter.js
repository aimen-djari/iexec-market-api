const config = require('../config');
const counterModel = require('../models/counterModel');
const { logger } = require('../utils/logger');

const { chainId } = config.chain;

const log = logger.extend('services:counter');

const getNextBlockToProcess = async () => {
  try {
    const CounterModel = await counterModel.getModel(chainId);
    const lastBlockCounter = await CounterModel.findOne({ name: 'lastBlock' });
    if (lastBlockCounter !== null) return lastBlockCounter.value + 1;
    return config.runtime.startBlock;
  } catch (e) {
    log('getNextBlockToProcess()', e);
    throw e;
  }
};

const updateLastBlock = async (blockNumber) => {
  try {
    const CounterModel = await counterModel.getModel(chainId);
    const lastBlockCounter = await CounterModel.findOneAndUpdate(
      { name: 'lastBlock' },
      { $max: { value: blockNumber } },
      { new: true, upsert: true },
    );
    log('lastBlockCounter', lastBlockCounter.value);
  } catch (e) {
    log('updateLastBlock()', e);
    throw e;
  }
};

const getCheckpointBlock = async () => {
  try {
    const CounterModel = await counterModel.getModel(chainId);
    const checkpointBlockCounter = await CounterModel.findOne({
      name: 'checkpointBlock',
    });
    if (checkpointBlockCounter !== null) return checkpointBlockCounter.value;
    return config.runtime.startBlock;
  } catch (e) {
    log('getCheckpointBlock()', e);
    throw e;
  }
};

const setCheckpointBlock = async (blockNumber) => {
  try {
    const CounterModel = await counterModel.getModel(chainId);
    const checkpointBlockCounter = await CounterModel.findOneAndUpdate(
      { name: 'checkpointBlock' },
      { value: blockNumber },
      { new: true, upsert: true },
    );
    log('checkpointBlockCounter', checkpointBlockCounter.value);
  } catch (e) {
    log('setCheckpointBlock()', e);
    throw e;
  }
};

module.exports = {
  getNextBlockToProcess,
  updateLastBlock,
  getCheckpointBlock,
  setCheckpointBlock,
};
