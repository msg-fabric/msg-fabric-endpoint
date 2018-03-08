import FabricHub from 'msg-fabric-core'
import { endpoint_plugin } from 'msg-fabric-endpoint'

import { _init } from '../unit/_setup'
_init(FabricHub.plugin( endpoint_plugin() ))

