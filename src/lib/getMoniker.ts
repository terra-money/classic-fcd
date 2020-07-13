import * as memoizee from 'memoizee'
import { get } from 'lodash'

import * as lcd from 'lib/lcd'

async function getMoniker(valAddr: string): Promise<string> {
  const validator = await lcd.getValidator(valAddr)
  return get(validator, 'description.moniker', '')
}

export default memoizee(getMoniker, { promise: true, maxAge: 3600000 /* 6 minutes */ })
