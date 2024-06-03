import { Column, Entity, Index, PrimaryGeneratedColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm'

import AccountTxEntity from './AccountTxEntity'
import BlockEntity from './BlockEntity'

@Entity('tx')
@Index('index_with_chainid_and_hash', ['chainId', 'hash'], { unique: true })
@Index('index_with_chainid_and_id', ['chainId', 'id'])
export default class TxEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Index('tx_chainId')
  @Column()
  chainId: string

  @Index('tx_hash')
  @Column()
  hash: string

  @Index('tx_timestamp')
  @Column({ nullable: true })
  timestamp: Date

  @Column({ type: 'jsonb' })
  data: Transaction.LcdTransaction

  @Index('tx_block_id')
  @ManyToOne(() => BlockEntity, (block) => block.txs, {
    cascade: ['insert'],
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'block_id' })
  block: BlockEntity

  @OneToMany(() => AccountTxEntity, (accounts) => accounts.tx, {
    cascade: true
  })
  accounts: AccountTxEntity[]
}
