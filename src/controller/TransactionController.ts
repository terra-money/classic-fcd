import { KoaController, Validate, Get, Controller, Validator, Post } from 'koa-joi-controllers'
import config from 'config'
import { success } from 'lib/response'
import { ErrorCodes } from 'lib/error'
import { TERRA_ACCOUNT_REGEX, CHAIN_ID_REGEX } from 'lib/constant'
import { getUnconfirmedTxs } from 'lib/rpc'
import Mempool from 'lib/mempool'
import { getTx, getTxList, getMsgList, postTxs } from 'service/transaction'

const Joi = Validator.Joi

@Controller('')
export default class TransactionController extends KoaController {
  /**
   * @api {get} /tx/:txhash Get Tx
   * @apiName getTx
   * @apiGroup Transactions
   *
   * @apiParam {string} txhash Tx Hash
   *
   * @apiSuccess {Object} tx
   * @apiSuccess {string} tx.type
   * @apiSuccess {Object} tx.value
   * @apiSuccess {Object} tx.value.fee
   * @apiSuccess {Object[]} tx.value.fee.amount
   * @apiSuccess {string} tx.value.fee.amount.denom
   * @apiSuccess {string} tx.value.fee.amount.amount
   * @apiSuccess {string} tx.value.fee.gas
   * @apiSuccess {string} tx.value.memo
   * @apiSuccess {Object[]} tx.value.msg
   * @apiSuccess {string} tx.value.msg.type
   * @apiSuccess {Object} tx.value.msg.value
   * @apiSuccess {Object[]} tx.value.msg.value.amount
   * @apiSuccess {string} tx.value.msg.value.amount.denom
   * @apiSuccess {string} tx.value.msg.value.amount.amount
   * @apiSuccess {Object[]} tx.value.signatures
   * @apiSuccess {Object[]} tx.value.signatures.pubKey
   * @apiSuccess {string} tx.value.signatures.pubKey.type
   * @apiSuccess {string} tx.value.signatures.pubKey.value
   * @apiSuccess {string} tx.value.signatures.signature
   *
   * @apiSuccess {Object[]} events
   * @apiSuccess {Object[]} events
   * @apiSuccess {string} events.type
   * @apiSuccess {Object[]} events.attributes
   * @apiSuccess {string} events.attributes.key
   * @apiSuccess {string} events.attributes.value
   * @apiSuccess {Object[]} logs tx logs
   * @apiSuccess {Object[]} logs.events
   * @apiSuccess {Object[]} logs.events.attributes
   * @apiSuccess {string} logs.events.attributes.key
   * @apiSuccess {string} logs.events.attributes.value
   * @apiSuccess {string} logs.events.types
   * @apiSuccess {Object} logs.log
   * @apiSuccess {string} logs.log.tax
   * @apiSuccess {number} logs.msg_index
   * @apiSuccess {boolean} logs.success
   * @apiSuccess {string} height
   * @apiSuccess {string} txhash
   * @apiSuccess {string} raw_log
   * @apiSuccess {string} gas_used
   * @apiSuccess {string} timestamp
   * @apiSuccess {string} gas_wanted
   * @apiSuccess {string} chainId
   */
  @Get('/tx/:txhash')
  @Validate({
    params: {
      txhash: Joi.string().required().alphanum().description('Tx hash')
    },
    failure: ErrorCodes.INVALID_REQUEST_ERROR
  })
  async getTx(ctx): Promise<void> {
    success(ctx, await getTx(ctx.params.txhash))
  }

  /**
   * @api {get} /txs Get Tx List
   * @apiName getTxList
   * @apiGroup Transactions
   *
   * @apiParam {string} [account] Account address
   * @apiParam {string} [block] Block number
   * @apiParam {string} [memo] Memo filter
   * @apiParam {string} [order='ASC','DESC'] Ordering (default: DESC)
   * @apiParam {string} [chainId] Chain ID of Blockchain (default: chain id of mainnet)
   * @apiParam {number} [from] Timestamp from
   * @apiParam {number} [to] Timestamp to
   * @apiParam {number} [offset] Use last id from previous result for pagination
   * @apiParam {number} [page=1] # of page
   * @apiParam {number} [limit=10] Size of page
   *
   * @apiSuccess {number} limit Per page item limit
   * @apiSuccess {Object[]} txs tx list
   * @apiSuccess {Object} txs.tx
   * @apiSuccess {string} txs.tx.type
   * @apiSuccess {Object} txs.tx.value
   * @apiSuccess {Object} txs.tx.value.fee
   * @apiSuccess {string} txs.tx.value.fee.gas
   * @apiSuccess {Object[]} txs.tx.value.fee.amount
   * @apiSuccess {string} txs.tx.value.fee.amount.denom
   * @apiSuccess {string} txs.tx.value.fee.amount.amount
   * @apiSuccess {string} txs.tx.value.memo
   * @apiSuccess {Object[]} txs.tx.value.msg
   * @apiSuccess {string} txs.tx.value.msg.type
   * @apiSuccess {Object} txs.tx.value.msg.value
   * @apiSuccess {Object[]} txs.tx.value.msg.value.inputs
   * @apiSuccess {string} txs.tx.value.msg.value.inputs.address
   * @apiSuccess {Object[]} txs.tx.value.msg.value.inputs.coins
   * @apiSuccess {string} txs.tx.value.msg.value.inputs.coins.deonm
   * @apiSuccess {string} txs.tx.value.msg.value.inputs.coins.amount
   *
   * @apiSuccess {Object[]} txs.tx.value.msg.value.outputs
   * @apiSuccess {string} txs.tx.value.msg.value.outputs.address
   * @apiSuccess {Object[]} txs.tx.value.msg.value.outputs.coins
   * @apiSuccess {string} txs.tx.value.msg.value.outputs.coins.deonm
   * @apiSuccess {string} txs.tx.value.msg.value.outputs.coins.amount
   *
   *
   * @apiSuccess {Object[]} txs.tx.value.signatures
   * @apiSuccess {string} txs.tx.value.signatures.signature
   * @apiSuccess {Object} txs.tx.value.signatures.pub_key
   * @apiSuccess {string} txs.tx.value.signatures.pub_key.type
   * @apiSuccess {string} txs.tx.value.signatures.pub_key.value
   *
   * @apiSuccess {Object[]} txs.events events of tx
   * @apiSuccess {string} txs.events.type
   * @apiSuccess {Object[]} txs.events.attributes
   * @apiSuccess {string} txs.events.attributes.key
   * @apiSuccess {string} txs.events.attributes.value
   *
   *
   * @apiSuccess {Object[]} txs.logs tx logs
   * @apiSuccess {number} txs.logs.msg_index
   * @apiSuccess {boolean} txs.logs.success
   * @apiSuccess {Object} txs.logs.log
   * @apiSuccess {string} txs.logs.log.tax
   * @apiSuccess {Object[]} txs.logs.events
   * @apiSuccess {string} txs.logs.events.type
   * @apiSuccess {Object[]} txs.logs.events.attributes
   * @apiSuccess {string} txs.logs.events.attributes.key
   * @apiSuccess {string} txs.logs.events.attributes.value
   *
   * @apiSuccess {string} txs.height block height
   * @apiSuccess {string} txs.txhash tx hash
   * @apiSuccess {string} txs.raw_log tx raw log
   * @apiSuccess {string} txs.gas_used total gas used in tx
   * @apiSuccess {string} txs.timestamp timestamp tx in utc 0
   * @apiSuccess {string} txs.gas_wanted gas wanted
   */
  @Get('/txs')
  @Validate({
    query: {
      account: Joi.string().allow('').regex(TERRA_ACCOUNT_REGEX).description('User address'),
      block: Joi.string()
        .allow('')
        .regex(/^\d{1,16}$/),
      chainId: Joi.string().default(config.CHAIN_ID).regex(CHAIN_ID_REGEX),
      limit: Joi.number().default(10).valid(10, 100).description('Items per page'),
      offset: Joi.alternatives(Joi.number(), Joi.string()).description('Offset')
    },
    failure: ErrorCodes.INVALID_REQUEST_ERROR
  })
  async getTxList(ctx): Promise<void> {
    success(ctx, await getTxList(ctx.query))
  }
  /**
   * @api {post} /txs Broadcast Txs
   * @apiName postTxs
   * @apiGroup Transactions
   *
   * @apiParam {Object}   tx request tx must be signed
   * @apiParam {string[]} tx.msg tx message
   * @apiParam {Object}   tx.fee tx fee
   * @apiParam {string}   tx.fee.gas tx gas
   * @apiParam {Object[]}   tx.fee.amount tx gas amount
   * @apiParam {string}   tx.fee.amount.denom tx gas amount
   * @apiParam {string}   tx.fee.amount.amount tx gas amount
   * @apiParam {Object}   tx.signature tx signature
   * @apiParam {string}   tx.signature.signature tx signature
   * @apiParam {Object}   tx.signature.pub_key tx signature
   * @apiParam {string}   tx.signature.pub_key.type Key type
   * @apiParam {string}   tx.signature.pub_key.value Key value
   * @apiParam {string}   tx.signature.account_number tx signature
   * @apiParam {string}   tx.signature.sequence tx sequence of the account
   * @apiParam {string}   tx.memo Information related to tx
   * @apiParam {string}   mode broadcast mode
   *
   *
   * @apiSuccess {string} hash Tx hash
   * @apiSuccess {number} height Block height
   * @apiSuccess {Object} check_tx tx info
   * @apiSuccess {number} check_tx.code
   * @apiSuccess {string} check_tx.data
   * @apiSuccess {string} check_tx.log
   * @apiSuccess {number} check_tx.gas_used
   * @apiSuccess {number} check_tx.gas_wanted
   * @apiSuccess {string} check_tx.info
   * @apiSuccess {string[]} check_tx.tags
   * @apiSuccess {Object} deliver_tx tx info
   * @apiSuccess {number} deliver_tx.code
   * @apiSuccess {string} deliver_tx.data
   * @apiSuccess {string} deliver_tx.log
   * @apiSuccess {number} deliver_tx.gas_used
   * @apiSuccess {number} deliver_tx.gas_wanted
   * @apiSuccess {string} deliver_tx.info
   * @apiSuccess {string[]} deliver_tx.tags
   */
  @Post('/txs')
  @Validate({
    type: 'json',
    failure: ErrorCodes.INVALID_REQUEST_ERROR
  })
  async postTxs(ctx): Promise<void> {
    const body = ctx.request.body
    success(ctx, await postTxs(body))
  }

  /**
   * @api {get} /msgs Get Parsed Tx List
   * @apiName getParsedTxList
   * @apiGroup Transactions
   *
   * @apiParam {string} account Account address
   * @apiParam {number} [page=1] Page
   * @apiParam {number} [limit=10] Limit
   * @apiParam {string} [action] Action filter
   * @apiParam {string} [order='ASC','DESC'] Ordering (default: DESC)
   * @apiParam {number} [from] Timestamp from
   * @apiParam {number} [to] Timestamp to
   *
   * @apiSuccess {number} limit Per page item limit
   * @apiSuccess {Object[]} txs tx list
   * @apiSuccess {string} txs.timestamp tx time
   * @apiSuccess {string} txs.txhash tx hash
   * @apiSuccess {Object[]} txs.msgs Parsed tx messages
   * @apiSuccess {string} txs.msgs.tag tx tag
   * @apiSuccess {string} txs.msgs.text tx message text format
   * @apiSuccess {Object[]} txs.msgs.in
   * @apiSuccess {string} txs.msgs.in.denom
   * @apiSuccess {string} txs.msgs.in.amount
   * @apiSuccess {Object[]} txs.msgs.out
   * @apiSuccess {string} txs.msgs.out.denom
   * @apiSuccess {string} txs.msgs.out.amount
   * @apiSuccess {string} txs.msgs.tax transaction tax
   * @apiSuccess {Object[]} txs.txFee
   * @apiSuccess {string} txs.txFee.denom
   * @apiSuccess {string} txs.txFee.amount
   * @apiSuccess {string} txs.memo
   * @apiSuccess {boolean} txs.success
   * @apiSuccess {string} txs.errorMessage
   * @apiSuccess {string} txs.chainId
   */
  @Get('/msgs')
  @Validate({
    query: {
      account: Joi.string().regex(TERRA_ACCOUNT_REGEX).required().description('User address'),
      limit: Joi.number().default(10).valid(10, 100).description('Items per page'),
      offset: Joi.alternatives(Joi.number(), Joi.string()).description('Offset')
    },
    failure: ErrorCodes.INVALID_REQUEST_ERROR
  })
  async getMsgList(ctx): Promise<void> {
    success(ctx, await getMsgList(ctx.request.query))
  }

  /**
   * @api {get} /txs/gas_prices Get gas prices
   * @apiName getGasPrices
   * @apiGroup Transactions
   *
   * @apiSuccess {string} uluna gas price in uluna
   * @apiSuccess {string} usdr gas price in usdr
   * @apiSuccess {string} uusd gas price in uusd
   * @apiSuccess {string} ukrw gas price in ukrw
   * @apiSuccess {string} umnt gas price in umnt
   */
  @Get('/txs/gas_prices')
  async getGasPrices(ctx): Promise<void> {
    success(ctx, config.MIN_GAS_PRICES)
  }

  /**
   * @api {get} /mempool/:txhash Get transaction in mempool
   * @apiName getMempoolByHash
   * @apiGroup Transactions
   *
   * @apiSuccess {String} timestamp Last seen
   * @apiSuccess {String} txhash
   * @apiSuccess {Object} tx
   * @apiSuccess {string} tx.type
   * @apiSuccess {Object} tx.value
   * @apiSuccess {Object} tx.value.fee
   * @apiSuccess {Object[]} tx.value.fee.amount
   * @apiSuccess {string} tx.value.fee.amount.denom
   * @apiSuccess {string} tx.value.fee.amount.amount
   * @apiSuccess {string} tx.value.fee.gas
   * @apiSuccess {string} tx.value.memo
   * @apiSuccess {Object[]} tx.value.msg
   * @apiSuccess {string} tx.value.msg.type
   * @apiSuccess {Object} tx.value.msg.value
   * @apiSuccess {Object[]} tx.value.msg.value.amount
   * @apiSuccess {string} tx.value.msg.value.amount.denom
   * @apiSuccess {string} tx.value.msg.value.amount.amount
   * @apiSuccess {Object[]} tx.value.signatures
   * @apiSuccess {Object[]} tx.value.signatures.pubKey
   * @apiSuccess {string} tx.value.signatures.pubKey.type
   * @apiSuccess {string} tx.value.signatures.pubKey.value
   * @apiSuccess {string} tx.value.signatures.signature
   */
  @Get('/mempool/:txhash')
  @Validate({
    params: {
      txhash: Joi.string().required().alphanum().description('Tx hash')
    },
    failure: ErrorCodes.INVALID_REQUEST_ERROR
  })
  getMempoolByHash(ctx) {
    success(ctx, Mempool.getTransactionByHash(ctx.params.txhash))
  }

  /**
   * @api {get} /mempool Get transactions in mempool
   * @apiName getMempool
   * @apiGroup Transactions
   *
   * @apiParam {string} [account] Account address
   *
   * @apiSuccess {Object[]} txs
   * @apiSuccess {String} txs.timestamp Last seen
   * @apiSuccess {String} txs.txhash
   * @apiSuccess {Object} txs.tx
   * @apiSuccess {string} txs.tx.type
   * @apiSuccess {Object} txs.tx.value
   * @apiSuccess {Object} txs.tx.value.fee
   * @apiSuccess {string} txs.tx.value.fee.gas
   * @apiSuccess {Object[]} txs.tx.value.fee.amount
   * @apiSuccess {string} txs.tx.value.fee.amount.denom
   * @apiSuccess {string} txs.tx.value.fee.amount.amount
   * @apiSuccess {string} txs.tx.value.memo
   * @apiSuccess {Object[]} txs.tx.value.msg
   * @apiSuccess {string} txs.tx.value.msg.type
   * @apiSuccess {Object} txs.tx.value.msg.value
   * @apiSuccess {Object[]} txs.tx.value.msg.value.inputs
   * @apiSuccess {string} txs.tx.value.msg.value.inputs.address
   * @apiSuccess {Object[]} txs.tx.value.msg.value.inputs.coins
   * @apiSuccess {string} txs.tx.value.msg.value.inputs.coins.deonm
   * @apiSuccess {string} txs.tx.value.msg.value.inputs.coins.amount
   *
   * @apiSuccess {Object[]} txs.tx.value.msg.value.outputs
   * @apiSuccess {string} txs.tx.value.msg.value.outputs.address
   * @apiSuccess {Object[]} txs.tx.value.msg.value.outputs.coins
   * @apiSuccess {string} txs.tx.value.msg.value.outputs.coins.deonm
   * @apiSuccess {string} txs.tx.value.msg.value.outputs.coins.amount
   *
   * @apiSuccess {Object[]} txs.tx.value.signatures
   * @apiSuccess {string} txs.tx.value.signatures.signature
   * @apiSuccess {Object} txs.tx.value.signatures.pub_key
   * @apiSuccess {string} txs.tx.value.signatures.pub_key.type
   * @apiSuccess {string} txs.tx.value.signatures.pub_key.value
   */
  @Get('/mempool')
  @Validate({
    query: {
      account: Joi.string().allow('').regex(TERRA_ACCOUNT_REGEX).description('User address')
    }
  })
  async getMempool(ctx) {
    if (ctx.query.account) {
      success(ctx, {
        txs: Mempool.getTransactionsByAddress(ctx.query.account)
      })
    } else {
      success(ctx, {
        txs: Mempool.getTransactions()
      })
    }
  }
}
