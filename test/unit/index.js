import FabricHub from 'msg-fabric-core'
import { endpoint_plugin } from '../..'

import { _init } from './_setup'
_init(FabricHub, endpoint_plugin)

export * from './all'
