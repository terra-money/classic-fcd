interface LcdBlock {
  block_id: LcdBlockId
  block: {
    header: LcdBlockHeader
    data: {
      txs: string[]
    }
    evidence: any
    last_commit: LcdBlockLastCommit
  }
}

interface LcdBlockLastCommit {
  height: string
  round: string
  block_id: LcdBlockId
  signatures: LcdBlockSignature[]
}

interface LcdBlockSignature {
  block_id_flag: number
  validator_address: string
  timestamp: string
  signature: string
}

interface LcdBlockId {
  hash: string
  parts: {
    total: string
    hash: string
  }
}

interface LcdBlockHeader {
  version: {
    app: string
    block: string
  }
  chain_id: string
  height: string
  time: string
  last_block_id: LcdBlockId
  last_commit_hash: string
  data_hash: string
  validators_hash: string
  next_validators_hash: string
  consensus_hash: string
  app_hash: string
  last_results_hash: string
  evidence_hash: string
  proposer_address: string
}

interface LcdValidator {
  commission: LcdValidatorCommission
  consensus_pubkey: string
  delegator_shares: string
  description: LcdValidatorDescription
  jailed: boolean
  min_self_delegation: string
  operator_address: string
  status: number
  tokens: string
  unbonding_height: string
  unbonding_time: string
}

interface LcdValidatorDescription {
  details: string
  identity: string
  moniker: string
  website: string
  security_contact: string
}

interface LcdValidatorCommission {
  commission_rates: {
    max_change_rate: string
    max_rate: string
    rate: string
  }
  update_time: string
}

interface LcdLatestValidatorSet {
  block_height: string
  validators: LcdLatestValidator[]
}

interface LcdLatestValidator {
  address: string
  proposer_priority: string
  pub_key: string
  voting_power: string
}

interface LcdValidatorSigningInfo {
  address: string // terravalcons...
  index_offset: string
  jailed_until: string
  missed_blocks_counter: string
  start_height: string
  tombstoned: boolean
}

interface LcdRewardPoolItem {
  denom: string
  amount: string
}

interface LcdRewardPool {
  operator_address: string
  self_bond_rewards: LcdRewardPoolItem[]
  val_commission: LcdRewardPoolItem[]
}

interface LcdValidatorDelegationItem {
  delegator_address: string
  shares: string
  validator_address: string
}

interface ValidatorCommission {
  maxChangeRate: string
  maxRate: string
  rate: string
  updateTime: string
}

interface Validator {
  commision: number
  moniker: stinrg
  rewardPool: number
  uptime: number
  votingPower: number
}

interface Delegator {
  address: string
  amount: string
  weight: string
}

interface ValidatorAnnualReturn {
  isNewValidator: boolean
  stakingReturn: string
}
