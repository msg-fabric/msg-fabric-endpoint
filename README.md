# msg-fabric-endpoint

Endpoint plugin for [msg-fabric-core][msgfab-core]

[msgfab-core]: https://www.npmjs.com/package/msg-fabric-core


## Examples

##### Creating a new hub with endpoint plugin

```javascript
import FabricHubBase from 'msg-fabric-core' 

import pi_endpoint from 'msg-fabric-endpoint'
const FabricHub = FabricHubBase.plugins( pi_endpoint() )


const hub = FabricHub.create()

const ep_addr_1 = await hub.endpoint({
  on_init(ep, hub) {
    console.log('on endpoint init')
  },
  on_ready(ep, hub) {
    console.log('on endpoint ready')
  },
  on_msg({msg, pkt, reply, anon, ep, hub}) {
    console.log('on endpoint message', msg, pkt)
  },
})

// ... or ...

const ep_addr_2 = await hub.endpoint( (ep, hub) => {
  console.log('on endpoint init')

  return ({msg, pkt, reply, anon}) => {
    console.log('on endpoint message', msg, pkt)
  } })

```


##### Creating a new hub with endpoint plugin (JSY dialect)

```javascript
import FabricHubBase from 'msg-fabric-core' 

import pi_endpoint from 'msg-fabric-endpoint'
const FabricHub = FabricHubBase.plugins( pi_endpoint() )


const hub = FabricHub.create()

const ep_addr_1 = await hub.endpoint @:
  on_init(ep, hub) ::
    console.log('on endpoint init')

  on_ready(ep, hub) ::
    console.log('on endpoint ready')

  on_msg({msg, pkt, reply, anon, ep, hub}) ::
    console.log('on endpoint message', msg, pkt)


// ... or ...

const ep_addr_2 = await hub.endpoint @ (ep, hub) => ::
  console.log('on endpoint init')

  return ({msg, pkt, reply, anon}) => ::
    console.log('on endpoint message', msg, pkt)

```



## License

[2-Clause BSD](https://github.com/shanewholloway/msg-fabric-endpoint/blob/master/LICENSE)

