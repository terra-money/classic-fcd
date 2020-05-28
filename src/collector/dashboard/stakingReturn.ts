import { getRepository } from 'typeorm'
import { startOfToday, subDays } from 'date-fns'

import * as lcd from 'lib/lcd'
import { times, div, plus } from 'lib/math'
import { getDateFromDateTime } from 'lib/time'

import { RewardEntity, GeneralInfoEntity } from 'orm'
import { convertDbTimestampToDate, getPriceObjKey } from './helpers'
import { getPriceHistory } from 'service/dashboard'

interface DailyReturnInfo {
  tax: string
  gas: string
  oracle: string
  commission: string
  reward: string
}

interface DailyStakingInfo {
  reward: string // bigint
  avgStaking: string // bigint
}

export async function getStakingReturnByDay(daysBefore?: number): Promise<{ [date: string]: DailyStakingInfo }> {
  const { issuance } = await lcd.getIssuanceByDenom('uluna')

  const rewardQb = getRepository(RewardEntity)
    .createQueryBuilder()
    .select(convertDbTimestampToDate('datetime'), 'date')
    .addSelect('denom', 'denom')
    .addSelect('SUM(tax)', 'tax_sum')
    .addSelect('SUM(gas)', 'gas_sum')
    .addSelect('SUM(oracle)', 'oracle_sum')
    .addSelect('SUM(sum)', 'reward_sum')
    .addSelect('SUM(commission)', 'commission_sum')
    .groupBy('date')
    .addGroupBy('denom')
    .orderBy('date', 'ASC')
    .where('datetime < :today', { today: startOfToday() })

  if (daysBefore) {
    rewardQb.andWhere('datetime >= :from', { from: subDays(startOfToday(), daysBefore) })
  }

  const rewards = await rewardQb.getRawMany()

  const priceObj = await getPriceHistory(daysBefore)

  const stakingQb = getRepository(GeneralInfoEntity)
    .createQueryBuilder()
    .select(convertDbTimestampToDate('datetime'), 'date')
    .addSelect('AVG(staking_ratio)', 'avg_staking_ratio')
    .addSelect('AVG(bonded_tokens)', 'avg_bonded_tokens')
    .groupBy('date')
    .orderBy('date', 'DESC')
    .where('datetime < :today', { today: startOfToday() })

  if (daysBefore) {
    stakingQb.andWhere('datetime >= :from', { from: subDays(startOfToday(), daysBefore) })
  }

  const bondedTokens = await stakingQb.getRawMany()

  const bondedTokensObj = bondedTokens.reduce((acc, item) => {
    acc[item.date] = item.avg_bonded_tokens ? item.avg_bonded_tokens : times(issuance, item.avg_staking_ratio)
    return acc
  }, {})

  const rewardObj: {
    [date: string]: DailyReturnInfo
  } = rewards.reduce((acc, item) => {
    if (!priceObj[getPriceObjKey(item.date, item.denom)] && item.denom !== 'uluna') {
      return acc
    }

    const tax =
      item.denom === 'uluna' ? item.tax_sum : div(item.tax_sum, priceObj[getPriceObjKey(item.date, item.denom)])
    const gas =
      item.denom === 'uluna' ? item.gas_sum : div(item.gas_sum, priceObj[getPriceObjKey(item.date, item.denom)])
    const oracle =
      item.denom === 'uluna' ? item.oracle_sum : div(item.oracle_sum, priceObj[getPriceObjKey(item.date, item.denom)])
    const commission =
      item.denom === 'uluna'
        ? item.commission_sum
        : div(item.commission_sum, priceObj[getPriceObjKey(item.date, item.denom)])
    const reward =
      item.denom === 'uluna' ? item.reward_sum : div(item.reward_sum, priceObj[getPriceObjKey(item.date, item.denom)])

    const prev = acc[item.date] || {}

    acc[item.date] = {
      tax: plus(prev.tax, tax),
      gas: plus(prev.gas, gas),
      oracle: plus(prev.oracle, oracle),
      commission: plus(prev.commission, commission),
      reward: plus(prev.reward, reward)
    }

    return acc
  }, {})
  const stakingReturns = Object.keys(rewardObj).reduce((acc, date) => {
    const staked = bondedTokensObj[date]

    if (staked === '0') {
      return acc
    }

    const rewardSum =
      rewardObj[date].reward === '0' && rewardObj[date].commission === '0'
        ? plus(plus(rewardObj[date].tax, rewardObj[date].gas), rewardObj[date].oracle)
        : rewardObj[date].reward
    // TODO: Need to add a failsafe for not found staked
    acc[getDateFromDateTime(new Date(date))] = {
      reward: rewardSum,
      avgStaking: staked
    }
    return acc
  }, {})
  return stakingReturns
}
