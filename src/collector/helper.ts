import { WhereExpression, getRepository, getConnection } from 'typeorm'

import { PriceEntity } from 'orm'

import { times, div } from 'lib/math'
import { getDateRangeOfLastMinute, getQueryDateTime } from 'lib/time'

export function getUSDValue(denom: string, amount: string, prices: { [denom: string]: string }): string {
  let usdValue = '0'
  if ((denom === 'uluna' || prices[denom]) && prices['uusd']) {
    switch (denom) {
      case 'uusd':
        usdValue = amount
        break
      case 'uluna':
        usdValue = times(prices['uusd'], amount)
        break
      default:
        usdValue = div(amount, div(prices[denom], prices['uusd']))
    }
  }
  return usdValue
}

export function addDatetimeFilterToQuery(timestamp: number, qb: WhereExpression) {
  const { from, to } = getDateRangeOfLastMinute(timestamp)

  qb.andWhere(`timestamp >= '${getQueryDateTime(from)}'`)
  qb.andWhere(`timestamp < '${getQueryDateTime(to)}'`)
}

export function isSuccessfulMsg(msg) {
  return msg.success
}

export function bulkSave(docs) {
  return getConnection().manager.save(docs)
}

export async function getAllActivePrices(timestamp: number): Promise<{ [denom: string]: string }> {
  // TODO: Need to fix the query because of exact time matching might fail
  const prices = await getRepository(PriceEntity).find({
    datetime: new Date(timestamp)
  })

  return prices.reduce((acc, price) => {
    return { ...acc, [price.denom]: price['price'] }
  }, {})
}
