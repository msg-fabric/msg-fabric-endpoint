const FabricHub = require('msg-fabric-core')
const {endpoint_plugin} = require('..')

const Hub = FabricHub.plugin(endpoint_plugin())
module.exports = exports = Hub
exports.default = Hub
