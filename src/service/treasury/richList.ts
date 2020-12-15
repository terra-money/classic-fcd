import { getRepository } from 'typeorm'
import { RichListEntity } from 'orm'
import { isToken, getRichList as getTokenRichList } from './token'

export async function getRichList(
  denom: string,
  page: number,
  limit: number
): Promise<{ account: string; amount: string }[]> {
  if (isToken(denom)) {
    return getTokenRichList(denom, page, limit)
  }

  if (!denom || limit < 1 || page < 1) {
    throw new Error('invalid parameter')
  }

  const offset = limit * (page - 1)

  return getRepository(RichListEntity).find({
    select: ['account', 'amount'],
    where: {
      denom
    },
    order: {
      amount: 'DESC'
    },
    skip: offset,
    take: limit
  })
}
