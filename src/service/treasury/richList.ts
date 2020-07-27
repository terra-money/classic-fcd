import { getRepository } from 'typeorm'
import { RichListEntity } from 'orm'

export async function getRichList(denom: string, page: number, limit: number): Promise<RichListEntity[]> {
  if (!denom || limit < 1 || page < 1) {
    throw new Error('invalid parameter')
  }

  const offset = limit * (page - 1)

  return getRepository(RichListEntity).find({
    select: ['account', 'amount', 'percentage'],
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
