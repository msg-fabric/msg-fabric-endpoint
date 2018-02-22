import FabricHub from 'msg-fabric-core/esm/core-browser'
import { endpoint_plugin } from '../../code/index.jsy'

import { _init } from './_setup'
_init(FabricHub, endpoint_plugin)

export * from './all'
