import { Hub, sym_sampi, expect } from './_setup'

describe @ 'Basic endpoint create', @=> ::
  var hub
  beforeEach @=> :: hub = Hub.create('$unit$')

  describe @ 'endpoint()', @=> ::
    it @ 'endpoint with on_msg closure', @=>> :: 
      const tgt = hub.endpoint @ ep => () => null
      check_id(hub, null, tgt)

    it @ 'endpoint with hub and on_msg closure', @=>> :: 
      const tgt = hub.endpoint @ (ep, ep_hub) => ::
        expect(ep_hub).to.equal(hub)
        return () => null

      check_id(hub, null, tgt)

    it @ 'endpoint with object closure', @=>> :: 
      const tgt = hub.endpoint @ ep => @:
        on_msg() ::

      check_id(hub, null, tgt)

    it @ 'endpoint with hub and object closure', @=>> :: 
      const tgt = hub.endpoint @ (ep, ep_hub) => ::
        expect(ep_hub).to.equal(hub)
        return @{} on_msg() ::

      check_id(hub, null, tgt)


  describe @ 'endpoint.endpoint()', @=> ::
    it @ 'endpoint with on_msg closure', @=>> :: 
      const tgt = hub.endpoint.endpoint @ ep => () => null
      check_id(hub, null, tgt)

    it @ 'endpoint with hub and on_msg closure', @=>> :: 
      const tgt = hub.endpoint.endpoint @ (ep, ep_hub) => ::
        expect(ep_hub).to.equal(hub)
        return () => null

      check_id(hub, null, tgt)

    it @ 'endpoint with object closure', @=>> :: 
      const tgt = hub.endpoint.endpoint @ ep => @:
        on_msg() ::

      check_id(hub, null, tgt)

    it @ 'endpoint with hub and object closure', @=>> :: 
      const tgt = hub.endpoint.endpoint @ (ep, ep_hub) => ::
        expect(ep_hub).to.equal(hub)
        return @{} on_msg() ::

      check_id(hub, null, tgt)


  describe @ 'endpoint.create(named)', @=> ::
    const id_target = '$unit$'

    it @ 'endpoint with on_msg closure', @=>> :: 
      const tgt = hub.endpoint.create @ id_target, ep => () => null
      check_id(hub, id_target, tgt)

    it @ 'endpoint with hub and on_msg closure', @=>> :: 
      const tgt = hub.endpoint.create @ id_target, (ep, ep_hub) => ::
        expect(ep_hub).to.equal(hub)
        return () => null

      check_id(hub, id_target, tgt)

    it @ 'endpoint with object closure', @=>> :: 
      const tgt = hub.endpoint.create @ id_target, ep => @:
        on_msg() ::

      check_id(hub, id_target, tgt)

    it @ 'endpoint with hub and object closure', @=>> :: 
      const tgt = hub.endpoint.create @ id_target, (ep, ep_hub) => ::
        expect(ep_hub).to.equal(hub)
        return @{} on_msg() ::

      check_id(hub, id_target, tgt)


function check_id(hub, id, tgt) ::
  if null == id ::
    expect @
      tgt[sym_sampi].startsWith @
        `${hub.local.id_route} `
    .to.be.true
  else ::
    expect @ tgt[sym_sampi]
    .to.equal @ `${hub.local.id_route} ${id}`

