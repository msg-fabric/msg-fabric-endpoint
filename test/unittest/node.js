import FabricHub from 'msg-fabric-core'
import { endpoint_plugin } from '../..'

import { _init } from '../unit/_setup'
_init(FabricHub.plugin( endpoint_plugin() ))

export * from './../unit/all'
