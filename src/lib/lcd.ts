import * as crypto from 'crypto'
import * as sentry from '@sentry/node'
import * as rp from 'request-promise'
import { uniqBy } from 'lodash'

import config from 'config'
import { pick, pickBy } from 'lodash'
import { plus, times, div, getIntegerPortion } from 'lib/math'
import { ErrorTypes, APIError } from './error'

const protocol = require(config.LCD_URI.startsWith('https') ? 'https' : 'http')
const agent = new protocol.Agent({
  rejectUnauthorized: false,
  keepAlive: true
})

const NOT_FOUND_REGEX = /(?:not found|no del|not ex|failed to find|unknown prop|empty bytes|No price reg)/i

async function get(url: string, params?: { [key: string]: string | undefined }): Promise<any> {
  const options = {
    method: 'GET',
    rejectUnauthorized: false,
    headers: {
      'Content-Type': 'application/json'
    },
    qs: params,
    json: true,
    agent
  }

  const res = await rp(`${config.LCD_URI}${url}`, options).catch((err) => {
    if (err.statusCode === 404 || (err?.message && NOT_FOUND_REGEX.test(err.message))) {
      return undefined
    }

    if (err.statusCode === 400) {
      throw new APIError(ErrorTypes.INVALID_REQUEST_ERROR, undefined, url, err)
    }

    throw new APIError(ErrorTypes.LCD_ERROR, err.statusCode, `${url} ${err.message}`, err)
  })

  if (res?.height && res.result !== undefined) {
    return res.result
  }

  return res
}

///////////////////////////////////////////////
// Transactions
///////////////////////////////////////////////
export async function getTx(hash: string): Promise<Transaction.LcdTransaction | undefined> {
  const { tx_response } = await get(`/cosmos/tx/v1beta1/txs/${hash}`)

  const intermediate = pickBy(
    pick(tx_response, ['height', 'txhash', 'logs', 'gas_wanted', 'gas_used', 'codespace', 'code', 'timestamp'])
  ) as Pick<
    Transaction.LcdTransaction,
    'height' | 'txhash' | 'logs' | 'gas_wanted' | 'gas_used' | 'codespace' | 'code' | 'timestamp'
  >

  const { auth_info, body, signatures } = tx_response.tx

  return {
    ...intermediate,
    tx: {
      type: 'core/StdTx',
      value: {
        fee: {
          amount: auth_info.fee.amount,
          gas: auth_info.fee.gas_limit
        },
        msg: body.messages.map((m) => {
          // '/terra.oracle.v1beta1.MsgAggregateExchangeRatePrevote' ->
          // [ 'terra', 'oracle', 'v1beta1', 'MsgAggregateExchangeRatePrevote' ]
          const tokens = m['@type'].match(/([a-zA-Z0-9]+)/g)
          let type

          if (tokens[0] === 'terra' || tokens[0] === 'cosmos') {
            type = `${tokens[1]}/${tokens[tokens.length - 1]}`
          } else {
            type = `${tokens[0]}/${tokens[tokens.length - 1]}`
          }

          type = type
            .replace('distribution/MsgSetWithdrawAddress', 'distribution/MsgModifyWithdrawAddress')
            .replace('distribution/MsgWithdrawDelegatorReward', 'distribution/MsgWithdrawDelegationReward')
            .replace('authz/MsgGrant', 'msgauth/MsgGrantAuthorization')
            .replace('authz/MsgRevoke', 'msgauth/MsgRevokeAuthorization')
            .replace('authz/MsgExec', 'msgauth/MsgExecAuthorized')
            .replace('ibc/MsgTransfer', 'cosmos-sdk/MsgTransfer')

          return {
            type,
            value: pick(
              m,
              Object.keys(m).filter((key) => key !== '@type')
            )
          }
        }),
        signatures: auth_info.signer_infos.map((si, idx) => ({
          pub_key: {
            type: 'tendermint/PubKeySecp256k1',
            value: si.public_key.key
          },
          signature: signatures[idx]
        })),
        memo: body.memo
      }
    }
  }
}

export function getTxHash(txstring: string): string {
  const s256Buffer = crypto.createHash(`sha256`).update(Buffer.from(txstring, `base64`)).digest()
  const txbytes = new Uint8Array(s256Buffer)
  return Buffer.from(txbytes.slice(0, 32)).toString(`hex`).toUpperCase()
}

export function getTxHashesFromBlock(lcdBlock: LcdBlock): string[] {
  const txStrings = lcdBlock.block.data.txs

  if (!txStrings || !txStrings.length) {
    return []
  }

  const hashes = txStrings.map(getTxHash)
  return hashes
}

export function decodeTx(tx: string): Promise<Transaction.LcdTx> {
  return rp
    .post(`${config.LCD_URI}/txs/decode`, { json: true, body: { tx } })
    .then((res) => ({
      type: 'core/StdTx',
      value: res.result
    }))
    .catch((err) => {
      sentry.withScope((scope) => {
        scope.setExtra('tx', tx)
        sentry.captureException(err)
      })

      return {}
    })
}

export function broadcast(body: { tx: Transaction.Value; mode: string }): Promise<Transaction.LcdPostTransaction> {
  const options: rp.RequestPromiseOptions = {
    method: 'POST',
    rejectUnauthorized: false,
    body,
    json: true
  }

  return rp(`${config.LCD_URI}/txs`, options).catch((err) => {
    throw new APIError(ErrorTypes.LCD_ERROR, err.statusCode, err.message, err)
  })
}

///////////////////////////////////////////////
// Tendermint RPC
///////////////////////////////////////////////
async function getSigningInfos(): Promise<LcdValidatorSigningInfo[]> {
  return (await get('/cosmos/slashing/v1beta1/signing_infos')).info
}

export function getValidatorConsensus(strHeight?: string): Promise<LcdValidatorConsensus[]> {
  const height = calculateHeightParam(strHeight)

  return Promise.all([
    get(`/validatorsets/${height || 'latest'}`, { height }).then((res): LcdValidatorConsensus[] => res.validators),
    get(`/validatorsets/${height || 'latest'}`, { page: '2', height })
      .then((res): LcdValidatorConsensus[] => res.validators)
      .catch((): LcdValidatorConsensus[] => []),
    get(`/validatorsets/${height || 'latest'}`, { page: '3', height })
      .then((res): LcdValidatorConsensus[] => res.validators)
      .catch((): LcdValidatorConsensus[] => [])
  ]).then((results) => uniqBy(results.flat(), 'address'))
}

// ExtendedValidator includes all LcdValidator, VotingPower and Uptime
export interface ExtendedValidator {
  lcdValidator: LcdValidator
  votingPower: string
  votingPowerWeight: string
  signingInfo?: LcdValidatorSigningInfo
}

export async function getExtendedValidators(): Promise<ExtendedValidator[]> {
  const [validators, validatorConsensus, signingInfos] = await Promise.all([
    getValidators(),
    getValidatorConsensus(),
    getSigningInfos()
  ])
  const totalVotingPower = validatorConsensus.reduce((acc, consVal) => plus(acc, consVal.voting_power), '0')

  return validators.reduce((prev, lcdValidator) => {
    const consVal = validatorConsensus.find((consVal) => consVal.pub_key.value === lcdValidator.consensus_pubkey.value)

    prev.push({
      lcdValidator,
      votingPower: consVal ? times(consVal.voting_power, 1000000) : '0.0',
      votingPowerWeight: consVal ? div(consVal.voting_power, totalVotingPower) : '0.0',
      signingInfo: consVal && signingInfos.find((si) => si.address === consVal.address)
    })

    return prev
  }, [] as ExtendedValidator[])
}

export function getBlock(height: string): Promise<LcdBlock> {
  return get(`/blocks/${height}`)
}

// Store latestHeight for later use
let latestHeight = 0

export function getLatestBlock(): Promise<LcdBlock> {
  return get(`/blocks/latest`).then((latestBlock) => {
    if (latestBlock?.block) {
      latestHeight = Number(latestBlock.block.header.height)
    }

    return latestBlock
  })
}

// NOTE: height parameter depends on node's configuration
// The default is: PruneDefault defines a pruning strategy where the last 100 heights are kept
// in addition to every 100th and where to-be pruned heights are pruned at every 10th height.
function calculateHeightParam(strHeight?: string): string | undefined {
  const numHeight = Number(strHeight)

  if (!numHeight) {
    return undefined
  }

  if (
    latestHeight &&
    (latestHeight < config.INITIAL_HEIGHT + config.PRUNING_KEEP_EVERY || // Pruning not happened yet
      latestHeight - numHeight < config.PRUNING_KEEP_EVERY) // Last 100 heights are guarenteed
  ) {
    return strHeight
  }

  return Math.max(
    config.INITIAL_HEIGHT,
    numHeight + (config.PRUNING_KEEP_EVERY - (numHeight % config.PRUNING_KEEP_EVERY))
  ).toString()
}

///////////////////////////////////////////////
// Auth
///////////////////////////////////////////////
export async function getAccount(
  address: string
): Promise<StandardAccount | VestingAccount | LazyVestingAccount | ModuleAccount> {
  // Auth
  const empty = {
    type: 'auth/Account',
    value: {
      address: '',
      coins: null,
      public_key: null,
      account_number: '0',
      sequence: '0'
    }
  }

  if (config.LEGACY_NETWORK) {
    return (await get(`/auth/accounts/${address}`)) || empty
  }

  const results = await Promise.all([get(`/auth/accounts/${address}`), get(`/bank/balances/${address}`)])

  const account = results[0] || empty
  account.value.coins = results[1]

  return account
}

///////////////////////////////////////////////
// Staking
///////////////////////////////////////////////
export async function getDelegations(delegator: string): Promise<LcdStakingDelegation[]> {
  return (await get(`/staking/delegators/${delegator}/delegations`)) || []
}

export function getDelegationForValidator(
  delegator: string,
  validator: string
): Promise<LcdStakingDelegation | undefined> {
  return get(`/staking/delegators/${delegator}/delegations/${validator}`)
}

export async function getUnbondingDelegations(address: string): Promise<LcdStakingUnbonding[]> {
  return (await get(`/staking/delegators/${address}/unbonding_delegations`)) || []
}

const STATUS_MAPPINGS = {
  unbonded: 'BOND_STATUS_UNBONDED', // 1
  unbonding: 'BOND_STATUS_UNBONDING', // 2
  bonded: 'BOND_STATUS_BONDED' // 3
}

export async function getValidators(
  status?: 'bonded' | 'unbonded' | 'unbonding',
  strHeight?: string
): Promise<LcdValidator[]> {
  if (status) {
    return get(`/staking/validators?status=${config.LEGACY_NETWORK ? status : STATUS_MAPPINGS[status]}`)
  }

  const height = calculateHeightParam(strHeight)
  const url = `/staking/validators`

  const [bonded, unbonded, unbonding] = await Promise.all([
    get(url, { status: config.LEGACY_NETWORK ? 'bonded' : STATUS_MAPPINGS.bonded, height }),
    get(url, { status: config.LEGACY_NETWORK ? 'unbonded' : STATUS_MAPPINGS.unbonded, height }),
    get(url, { status: config.LEGACY_NETWORK ? 'unbonding' : STATUS_MAPPINGS.unbonding, height })
  ])

  return [bonded, unbonded, unbonding].flat()
}

export async function getValidator(operatorAddr: string): Promise<LcdValidator | undefined> {
  return get(`/staking/validators/${operatorAddr}`)
}

export async function getValidatorDelegations(
  validatorOperKey: string,
  page = 1,
  limit = 1000000
): Promise<LcdValidatorDelegationItem[]> {
  return (await get(`/staking/validators/${validatorOperKey}/delegations?page=${page}&limit=${limit}`)) || []
}

export function getStakingPool(strHeight?: string): Promise<LcdStakingPool> {
  return get(`/staking/pool`, { height: calculateHeightParam(strHeight) })
}

export function getRedelegations(delegator: string): Promise<LCDStakingRelegation[]> {
  return get(`/staking/redelegations`, { delegator })
}

///////////////////////////////////////////////
// Governance
///////////////////////////////////////////////
export async function getProposals(): Promise<LcdProposal[]> {
  return (await get(`/gov/proposals`)) || []
}

export function getProposal(proposalId: string): Promise<LcdProposal> {
  return get(`/gov/proposals/${proposalId}`)
}

export function getProposalProposer(proposalId: string): Promise<LcdProposalProposer | undefined> {
  return get(`/gov/proposals/${proposalId}/proposer`)
}

export async function getProposalDeposits(proposalId: string): Promise<LcdProposalDeposit[]> {
  return (await get(`/gov/proposals/${proposalId}/deposits`)) || []
}

export async function getProposalVotes(proposalId: string): Promise<LcdProposalVote[]> {
  return (await get(`/gov/proposals/${proposalId}/votes?limit=1000000000000`)) || []
}

export function getProposalTally(proposalId: string): Promise<LcdProposalTally | undefined> {
  return get(`/gov/proposals/${proposalId}/tally`)
}

export function getProposalDepositParams(strHeight?: string): Promise<LcdProposalDepositParams> {
  return get(`/gov/parameters/deposit`, { height: calculateHeightParam(strHeight) })
}

export function getProposalVotingParams(strHeight?: string): Promise<LcdProposalVotingParams> {
  return get(`/gov/parameters/voting`, { height: calculateHeightParam(strHeight) })
}

export function getProposalTallyingParams(strHeight?: string): Promise<LcdProposalTallyingParams> {
  return get(`/gov/parameters/tallying`, { height: calculateHeightParam(strHeight) })
}

///////////////////////////////////////////////
// Distribution
///////////////////////////////////////////////
function rewardMapper(reward): Coin {
  return {
    denom: reward.denom,
    amount: getIntegerPortion(reward.amount)
  }
}

function rewardFilter(reward) {
  return reward.amount > 0
}

export async function getTotalRewards(delegatorAddress: string): Promise<Coin[]> {
  const rewards = await get(`/distribution/delegators/${delegatorAddress}/rewards`)
  return (rewards.total || []).map(rewardMapper).filter(rewardFilter)
}

export async function getRewards(delegatorAddress: string, validatorOperAddress: string): Promise<Coin[]> {
  const rewards = (await get(`/distribution/delegators/${delegatorAddress}/rewards/${validatorOperAddress}`)) || []
  return rewards.map(rewardMapper).filter(rewardFilter)
}

export function getCommissions(validatorAddress: string): Promise<LcdRewardPool | undefined> {
  return get(`/distribution/validators/${validatorAddress}`)
}

export async function getValidatorRewards(validatorOperAddress: string): Promise<Coin[]> {
  if (config.LEGACY_NETWORK) {
    return (await get(`/distribution/validators/${validatorOperAddress}/outstanding_rewards`)) || []
  }

  return (await get(`/distribution/validators/${validatorOperAddress}/outstanding_rewards`)).rewards || []
}

export function getCommunityPool(strHeight?: string): Promise<Coin[] | null> {
  return get(`/distribution/community_pool`, { height: calculateHeightParam(strHeight) })
}

///////////////////////////////////////////////
// Market
///////////////////////////////////////////////
export async function getSwapResult(params: { offer_coin: string; ask_denom: string }): Promise<Coin | undefined> {
  return get(`/market/swap`, params)
}

///////////////////////////////////////////////
// Oracle
///////////////////////////////////////////////
export async function getOraclePrices(strHeight?: string): Promise<Coin[]> {
  return (await get(`/oracle/denoms/exchange_rates`, { height: calculateHeightParam(strHeight) })) || []
}

export async function getOracleActives(): Promise<string[]> {
  const res = await get(`/oracle/denoms/actives`)

  // from columbus-3
  if (Array.isArray(res)) {
    return res
  }

  // columbus-2 compatibility
  return res.actives || []
}

export async function getActiveOraclePrices(strHeight?: string): Promise<CoinByDenoms> {
  return (await getOraclePrices(strHeight)).filter(Boolean).reduce((prev, item) => {
    if (item) {
      prev[item.denom] = item.amount
    }

    return prev
  }, {})
}

// non existent addresses will always return "0"
export function getMissedOracleVotes(operatorAddr: string): Promise<string> {
  return get(`/oracle/voters/${operatorAddr}/miss`)
}

///////////////////////////////////////////////
// Treasury
///////////////////////////////////////////////
// async function getLunaSupply() {
//   // columbus-2
//   const response = await getStakingPool()
//   const { not_bonded_tokens: notBondedTokens, bonded_tokens: bondedTokens } = response
//   return plus(notBondedTokens, bondedTokens)
// }

export async function getDenomIssuanceAfterGenesis(denom: string, day: number): Promise<object | null> {
  // columbus-2
  const res = await get(`/treasury/issuance/${denom}/${day}`)

  if (!res.issuance) {
    return null
  }

  return {
    denom,
    issuance: res.issuance
  }
}

export async function getTotalSupply(strHeight?: string): Promise<Coin[]> {
  if (config.LEGACY_NETWORK) {
    return (await get(`/supply/total`, { height: calculateHeightParam(strHeight) })) || []
  }

  return (await get('/cosmos/bank/v1beta1/supply', { height: calculateHeightParam(strHeight) })).supply || []
}

export async function getAllActiveIssuance(strHeight?: string): Promise<{ [denom: string]: string }> {
  return (await getTotalSupply(strHeight)).reduce((acc, item) => {
    acc[item.denom] = item.amount
    return acc
  }, {})
}

export function getTaxProceeds(strHeight?: string): Promise<Coin[]> {
  return get(`/treasury/tax_proceeds`, { height: calculateHeightParam(strHeight) })
}

export function getSeigniorageProceeds(strHeight?: string): Promise<string> {
  return get(`/treasury/seigniorage_proceeds`, { height: calculateHeightParam(strHeight) })
}

export async function getTaxRate(strHeight?: string): Promise<string> {
  const taxRate = await get(`/treasury/tax_rate`, { height: calculateHeightParam(strHeight) })
  return taxRate ? taxRate : get(`/treasury/tax_rate`) // fallback for col-3 to col-4 upgrade
}

export async function getTaxCap(denom: string, strHeight?: string): Promise<string> {
  const taxCaps = await get(`/treasury/tax_cap/${denom}`, { height: calculateHeightParam(strHeight) })
  return taxCaps ? taxCaps : get(`/treasury/tax_cap/${denom}`) // fallback for col-3 to col-4 upgrade
}

export async function getTaxCaps(strHeight?: string): Promise<{ denom: string; tax_cap: string }[]> {
  // NOTE: tax cap with specific height must be queried by node's configuration
  // The default is: PruneDefault defines a pruning strategy where the last 100 heights are kept
  // in addition to every 100th and where to-be pruned heights are pruned at every 10th height.
  const taxCaps = (await get('/treasury/tax_caps', { height: calculateHeightParam(strHeight) })) || []

  taxCaps.push({
    denom: 'uluna',
    tax_cap: '1000000'
  })

  return taxCaps
}

export async function getContract(contractAddress: string): Promise<Record<string, unknown>> {
  return get(`/wasm/contracts/${contractAddress}`)
}

export async function getContractStore(
  contractAddress: string,
  query: any,
  strHeight?: string
): Promise<Record<string, unknown>> {
  return get(`/wasm/contracts/${contractAddress}/store`, {
    query_msg: JSON.stringify(query),
    height: calculateHeightParam(strHeight)
  })
}
