import { KoaController, Validate, Get, Controller, Validator } from 'koa-joi-controllers'

import config from 'config'

import { success } from 'lib/response'
import { ErrorCodes } from 'lib/error'

import { getTaxProceeds, getTotalSupply, getRichList, getCirculatingSupply } from 'service/treasury'

const Joi = Validator.Joi

@Controller('')
class TreasuryController extends KoaController {
  /**
   * @api {get} /taxproceeds Get taxproceeds
   * @apiName getTaxProceeds
   * @apiGroup Treasury
   *
   * @apiSuccess {number} total Current tax proceeds
   * @apiSuccess {Object[]} taxProceeds tax by denoms
   * @apiSuccess {string} taxProceeds.denom denom name
   * @apiSuccess {string} taxProceeds.amount amount by denom
   * @apiSuccess {string} taxProceeds.adjustedAmount amount by adjusted with luna
   */
  @Get('/taxproceeds')
  async getTaxProceeds(ctx) {
    success(ctx, await getTaxProceeds())
  }

  /**
   * @api {get} /totalsupply/:denom Get total supply of coins
   * @apiName getTotalSupply
   * @apiGroup Treasury
   *
   * @apiParam {string} denom Coin denomination
   *
   * @apiSuccess {string} - total supply of denom
   */
  @Get('/totalsupply/:denom')
  @Validate({
    params: {
      denom: Joi.string().required().valid(config.ACTIVE_DENOMS, config.ACTIVE_CURRENCY).description('Denom name')
    },
    failure: ErrorCodes.INVALID_REQUEST_ERROR
  })
  async getTotalSupply(ctx) {
    const { denom } = ctx.params
    success(ctx, await getTotalSupply(denom))
  }
  /**
   * @api {get} /richlist/:denom Get richlist of coins
   * @apiName getRichlist
   * @apiGroup Treasury
   *
   * @apiParam {string} denom Coin denomination
   * @apiParam {number{1..}} [page=1] Page number
   * @apiParam {number{1-10000}} [limit=1000] Page size
   *
   * @apiSuccess {Object[]}  accounts List of accounts
   * @apiSuccess {Number}    accounts.account
   * @apiSuccess {String}    accounts.amount
   * @apiSuccess {String}    accounts.percentage
   */
  @Get('/richlist/:denom')
  @Validate({
    params: {
      denom: Joi.string().required().valid(config.ACTIVE_DENOMS).description('Denom name')
    },
    query: {
      page: Joi.number().default(1).min(1).description('Page number'),
      limit: Joi.number().default(1000).min(1).max(10000).description('Items per page')
    },
    failure: ErrorCodes.INVALID_REQUEST_ERROR
  })
  async getRichList(ctx) {
    const { denom } = ctx.params
    success(ctx, await getRichList(denom, +ctx.request.query.page, +ctx.request.query.limit))
  }

  /**
   * @api {get} /circulatingsupply/:denom Get circulating supply of coins
   * @apiName getCirculatingSupply
   * @apiGroup Treasury
   *
   * @apiParam {string} denom Coin denomination
   *
   * @apiSuccess {number} amount Circulating supply of coin.
   */
  @Get('/circulatingsupply/:denom')
  @Validate({
    params: {
      denom: Joi.string().required().valid(config.ACTIVE_DENOMS, config.ACTIVE_CURRENCY).description('Denom name')
    },
    failure: ErrorCodes.INVALID_REQUEST_ERROR
  })
  async getCirculatingSupply(ctx) {
    const { denom } = ctx.params
    success(ctx, await getCirculatingSupply(denom))
  }
}

export default TreasuryController
