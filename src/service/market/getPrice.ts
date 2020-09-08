import { getRepository, getConnection } from 'typeorm'
import { PriceEntity } from 'orm'
import { default as parseDuration } from 'parse-duration'

import { getOnedayBefore } from './helper'
import { minus, div } from 'lib/math'
import { getQueryDateTime } from 'lib/time'

const MIN_DURATION = 60000 // 1 min

interface GetPriceParams {
  denom: string // denom name ukrw, uluna, usdr, uusd
  interval: string // price interval 1m,15m,1d: m => minutes, d => day
  count: number // count of data points
}

interface PriceDataByDate {
  denom: string // denom name ukrw, uluna, usdr, uusd
  datetime: number // date time unix
  price: number // price
}

interface GetPriceReturn {
  lastPrice: number | undefined // latest price, undefined if not exists
  oneDayVariation: string | undefined // price changes in one day, undefined if not exists
  oneDayVariationRate: string | undefined // price change ratio in one day, undefined if not exists
  prices: PriceDataByDate[] // list of price points
}

function getMinimumTimestampOfSearchScope(params: GetPriceParams): number {
  const now = Date.now()
  const interval = Math.max(MIN_DURATION, parseDuration(params.interval) || MIN_DURATION)
  const latestTimestamp = now - (now % interval)
  const minTimestamp = latestTimestamp - interval * (params.count + 2) // extra 2 for not to end up less segment than count
  return minTimestamp
}

async function getAvgPriceForDayOrHourInterval(params: GetPriceParams): Promise<PriceDataByDate[]> {
  const { denom, count, interval } = params
  const minTimestamp = getMinimumTimestampOfSearchScope(params)
  const truncType = interval.endsWith('d') ? 'day' : 'hour'

  const rawQuery = `SELECT DATE_TRUNC($1, datetime) AS time,
    AVG(price.price) AS avg_price, 
    MIN(datetime) AS datetime FROM price 
    WHERE denom = $2 AND datetime >= $3 
    GROUP BY time 
    ORDER BY time DESC LIMIT $4`

  const prices: {
    time: string
    avg_price: number
    datetime: string
  }[] = await getConnection().query(rawQuery, [truncType, denom, getQueryDateTime(minTimestamp), count])
  return prices
    .map((price) => ({
      denom,
      price: price.avg_price,
      datetime: new Date(price.datetime).getTime()
    }))
    .reverse()
}

async function getAvgPriceForMinutesInterval(params: GetPriceParams): Promise<PriceDataByDate[]> {
  const { denom, count, interval } = params
  const minTimestamp = getMinimumTimestampOfSearchScope(params)
  const minuteInterval = parseInt(interval, 10)

  const rawQuery = `SELECT DATE_TRUNC('hour', datetime) AS time,
    TRUNC(DATE_PART('MINUTE', datetime)/$1) AS minute_part,
    AVG(price.price) AS avg_price,
    MIN(datetime) AS datetime FROM price
    WHERE denom = $2 AND datetime >= $3
    GROUP BY time, minute_part
    ORDER BY time, minute_part DESC LIMIT $4`

  const prices: {
    time: string
    minute_part: number
    avg_price: number
    datetime: string
  }[] = await getConnection().query(rawQuery, [minuteInterval, denom, getQueryDateTime(minTimestamp), count])

  return prices
    .map((price) => ({
      denom,
      price: price.avg_price,
      datetime: new Date(price.datetime).getTime()
    }))
    .reverse()
}

export default async function getPrice(params: GetPriceParams): Promise<GetPriceReturn> {
  const { denom, interval } = params
  const prices = interval.endsWith('m')
    ? await getAvgPriceForMinutesInterval(params)
    : await getAvgPriceForDayOrHourInterval(params)
  const lastPrice = await getRepository(PriceEntity).findOne({
    where: {
      denom
    },
    order: { datetime: 'DESC' }
  })

  const denomOneDayBeforePrices = await getOnedayBefore()
  const oneDayVariation =
    lastPrice && denomOneDayBeforePrices[denom] ? minus(lastPrice.price, denomOneDayBeforePrices[denom]) : undefined

  const oneDayVariationRate = lastPrice && oneDayVariation ? div(oneDayVariation, lastPrice.price) : undefined

  return {
    lastPrice: lastPrice ? lastPrice.price : undefined,
    oneDayVariation,
    oneDayVariationRate,
    prices
  }
}
