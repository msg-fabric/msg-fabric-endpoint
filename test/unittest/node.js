import FabricHub from 'msg-fabric-core/esm/core-node'
import { endpoint_plugin } from 'msg-fabric-endpoint'

import { _init } from '../unit/_setup'
_init(FabricHub.plugin( endpoint_plugin() ))

export * from './../unit/all'
