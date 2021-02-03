import { default as parseDuration } from 'parse-duration'
import { getRepository, LessThanOrEqual } from 'typeorm'
import { PriceEntity } from 'orm'
import { div } from 'lib/math'

const MIN_DURATION = 60000

export function getTargetDatetime(datetime: Date, interval: string): number {
  const msc = Math.max(MIN_DURATION, parseDuration(interval) || MIN_DURATION)
  return Number(datetime) - (Number(datetime) % msc)
}

export function getQueryDatetimes(interval: string, count: number): Date[] {
  const now = Date.now()
  const msc = Math.max(MIN_DURATION, parseDuration(interval) || MIN_DURATION)
  const lastestTimestamp = now - (now % msc)
  return [...Array(count).keys()].map((multiple) => new Date(lastestTimestamp - multiple * msc - MIN_DURATION))
}

export async function getOnedayBefore(): Promise<CoinByDenoms> {
  const now = new Date()
  const oneDayBefore = getTargetDatetime(now, '1d') - MIN_DURATION
  const denomPrices = await getRepository(PriceEntity).find({
    where: {
      datetime: LessThanOrEqual(new Date(getTargetDatetime(new Date(oneDayBefore), '1m')))
    },
    order: {
      datetime: 'DESC'
    },
    skip: 0,
    take: 20
  })

  return denomPrices.reduce((acc, curr) => {
    if (acc[curr.denom]) return acc
    return { ...acc, [curr.denom]: curr.price }
  }, {})
}

export function getSwapRate(prices: CoinByDenoms, base: string): CoinByDenoms {
  if (base === 'uluna') {
    return prices
  }

  const lunaSwapRate = prices[base] ? div(1, prices[base]) : undefined

  return Object.keys(prices).reduce(
    (acc, curr) => {
      if (curr === base) {
        return acc
      }

      return { ...acc, [curr]: div(prices[curr], prices[base]) }
    },
    { uluna: lunaSwapRate }
  )
}
