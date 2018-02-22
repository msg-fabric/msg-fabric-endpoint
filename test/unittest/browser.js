import FabricHub from 'msg-fabric-core/esm/core-browser'
import { endpoint_plugin } from '../../code/index.jsy'

import { _init } from '../unit/_setup'
_init(FabricHub.plugin( endpoint_plugin() ))

export * from '../unit/all'
