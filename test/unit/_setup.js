var Hub
export { Hub }
export function _init(FabricHub, endpoint_plugin) ::
  Hub = FabricHub.plugin( endpoint_plugin() )

