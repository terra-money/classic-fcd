import * as sentry from '@sentry/node'
import { getMinutes } from 'date-fns'
import { getRepository, getManager, DeepPartial, EntityManager } from 'typeorm'
import * as Bluebird from 'bluebird'

import config from 'config'
import { BlockEntity, BlockRewardEntity } from 'orm'
import { splitDenomAndAmount, convertAddressToHex } from 'lib/common'
import { plus } from 'lib/math'
import { collectorLogger as logger } from 'lib/logger'
import * as lcd from 'lib/lcd'
import * as rpc from 'lib/rpc'

import { collectTxs } from './tx'
import { collectWasm } from './wasm'
import { collectReward } from './reward'
// import { collectSwap } from './swap'
import { collectNetwork } from './network'
import { collectPrice } from './price'
import { collectGeneral } from './general'
import { detectAndUpdateProposal } from 'collector/gov'

const validatorCache = new Map()

export async function getValidatorOperatorAddressByHexAddress(hexAddress: string, height: string) {
  const operatorAddress = validatorCache.get(hexAddress)

  if (operatorAddress) {
    return operatorAddress
  }

  const validators = await lcd.getValidators(undefined, height)
  const validatorSet = await lcd.getValidatorConsensus(height)

  validatorSet.forEach((s) => {
    let v
    if (config.CHAIN_ID === 'columbus-5') {
      v = validators.find((v) => v.consensus_pubkey.value === s.pub_key.value)
    } else {
      v = validators.find((v) => v.consensus_pubkey === s.pub_key)
    }

    if (v) {
      const h = convertAddressToHex(s.address).toUpperCase()
      validatorCache.set(h, v.operator_address)
    }
  })

  if (!validatorCache.has(hexAddress)) {
    throw new Error(`could not find validator by ${hexAddress} at height ${height}`)
  }

  return validatorCache.get(hexAddress)
}

async function getLatestIndexedBlock(): Promise<BlockEntity | undefined> {
  const latestBlock = await getRepository(BlockEntity).find({
    where: {
      chainId: config.CHAIN_ID
    },
    order: {
      id: 'DESC'
    },
    take: 1
  })

  if (!latestBlock || latestBlock.length === 0) {
    return
  }

  return latestBlock[0]
}

async function generateBlockEntity(
  lcdBlock: LcdBlock,
  blockReward: BlockRewardEntity
): Promise<DeepPartial<BlockEntity>> {
  const { chain_id: chainId, height, time: timestamp, proposer_address } = lcdBlock.block.header

  const blockEntity: DeepPartial<BlockEntity> = {
    chainId,
    height: +height,
    timestamp,
    reward: blockReward,
    proposer: await getValidatorOperatorAddressByHexAddress(proposer_address, height)
  }

  return blockEntity
}

const totalRewardReducer = (acc: DenomMap, item: Coin & { validator: string }): DenomMap => {
  acc[item.denom] = plus(acc[item.denom], item.amount)
  return acc
}

const validatorRewardReducer = (acc: DenomMapByValidator, item: Coin & { validator: string }): DenomMapByValidator => {
  if (!acc[item.validator]) {
    acc[item.validator] = {}
  }

  acc[item.validator][item.denom] = plus(acc[item.validator][item.denom], item.amount)
  return acc
}

export async function getBlockReward(height: string): Promise<DeepPartial<BlockRewardEntity>> {
  const decodedRewardsAndCommission = await rpc.getRewards(height)

  const totalReward = {}
  const totalCommission = {}
  const rewardPerVal = {}
  const commissionPerVal = {}

  decodedRewardsAndCommission &&
    decodedRewardsAndCommission.forEach((item) => {
      if (!item.amount) {
        return
      }

      if (item.type === 'rewards') {
        const rewards = item.amount
          .split(',')
          .map((amount) => ({ ...splitDenomAndAmount(amount), validator: item.validator }))

        rewards.reduce(totalRewardReducer, totalReward)
        rewards.reduce(validatorRewardReducer, rewardPerVal)
      } else if (item.type === 'commission') {
        const commissions = item.amount
          .split(',')
          .map((amount) => ({ ...splitDenomAndAmount(amount), validator: item.validator }))

        commissions.reduce(totalRewardReducer, totalCommission)
        commissions.reduce(validatorRewardReducer, commissionPerVal)
      }
    })

  const blockReward: DeepPartial<BlockRewardEntity> = {
    reward: totalReward,
    commission: totalCommission,
    rewardPerVal,
    commissionPerVal
  }
  return blockReward
}

export async function saveBlockInformation(
  lcdBlock: LcdBlock,
  latestIndexedBlock: BlockEntity | undefined
): Promise<BlockEntity | undefined> {
  const height: string = lcdBlock.block.header.height
  logger.info(`collectBlock: begin transaction for block ${height}`)

  const result: BlockEntity | undefined = await getManager()
    .transaction(async (mgr: EntityManager) => {
      // Save block rewards
      const newBlockReward = await mgr.getRepository(BlockRewardEntity).save(await getBlockReward(height))
      // Save block entity
      const newBlockEntity = await mgr
        .getRepository(BlockEntity)
        .save(await generateBlockEntity(lcdBlock, newBlockReward))
      // get block tx hashes
      const txHashes = lcd.getTxHashesFromBlock(lcdBlock)

      if (txHashes.length) {
        // save transactions
        const txEntities = await collectTxs(mgr, txHashes, height, newBlockEntity)
        // save wasm
        await collectWasm(mgr, txEntities)
        // save proposals
        await detectAndUpdateProposal(mgr, txEntities, height)
      }

      // new block timestamp
      if (latestIndexedBlock && getMinutes(latestIndexedBlock.timestamp) !== getMinutes(newBlockEntity.timestamp)) {
        const newBlockTimeStamp = new Date(newBlockEntity.timestamp).getTime()

        await collectReward(mgr, newBlockTimeStamp, height)
        // await collectSwap(mgr, newBlockTimeStamp)
        await collectNetwork(mgr, newBlockTimeStamp, height)
        await collectPrice(mgr, newBlockTimeStamp, height)
        await collectGeneral(mgr, newBlockTimeStamp, height)
      }

      return newBlockEntity
    })
    .then((block: BlockEntity) => {
      logger.info('collectBlock: transaction finished')
      return block
    })
    .catch((err) => {
      logger.error(err)
      if (
        err instanceof Error &&
        typeof err.message === 'string' &&
        err.message.includes('transaction not found on node')
      ) {
        return undefined
      }
      sentry.captureException(err)
      return undefined
    })
  return result
}

export async function collectBlock(): Promise<void> {
  let latestHeight

  // Wait until it gets proper block
  while (!latestHeight) {
    const latestBlock = await lcd.getLatestBlock()

    if (latestBlock?.block) {
      latestHeight = Number(latestBlock.block.header.height)
      break
    }

    await Bluebird.delay(1000)
  }

  let latestIndexedBlock = await getLatestIndexedBlock()
  const latestIndexedHeight = latestIndexedBlock ? latestIndexedBlock.height : 0
  if (latestHeight === 0 && config.CHAIN_ID === 'columbus-5') {
    // Colombus-5 first block start at 4724001
    latestIndexedHeight === 4724000
  }
  let nextSyncHeight = latestIndexedHeight + 1

  while (nextSyncHeight <= latestHeight) {
    const lcdBlock = await lcd.getBlock(nextSyncHeight.toString())

    if (!lcdBlock) {
      break
    }

    latestIndexedBlock = await saveBlockInformation(lcdBlock, latestIndexedBlock)

    // Exit the loop after transaction error whether there's more blocks or not
    if (!latestIndexedBlock) {
      break
    }

    nextSyncHeight = nextSyncHeight + 1
  }
}
