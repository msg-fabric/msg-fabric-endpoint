import { Hub, expect, sleep, newLog } from './_setup'

describe @ 'endpoint plugin extensions', @=> ::
  let log
  beforeEach @=> ::
    log = newLog()


  it.only @ 'xor transform extension', @=>> ::
    const hub = Hub.create('$unit$')

    let count_token = 1000, count_tgt_id = 9000
    const pi_xor_endpoint = hub.endpoint.createEndpointPlugin @:
      newTargetId: @=> (count_tgt_id++)+''
      ep_msgs: hub.msgs.createMsgsPlugin @:
        newToken: @=> (count_token++)+''

      ep_create(ep_addr) ::
        const ep = this.ep_msgs.as(ep_addr)

        const { _send_pkt_, _recv_pkt_ } = ep
        expect(_send_pkt_).to.be.a('function')
        expect(_recv_pkt_).to.be.a('function')

        const { fromObjBinaryPacket, packBinaryPacket, unpackBinaryPacket } = hub._pkts_.bin_call
        expect(fromObjBinaryPacket).to.be.a('function')
        expect(packBinaryPacket).to.be.a('function')
        expect(unpackBinaryPacket).to.be.a('function')


        ep._send_pkt_ = (pkt_obj) => ::
          const inner_pkt = fromObjBinaryPacket(pkt_obj)
          log @ `pre _send_pkt_ ${inner_pkt.pkt_kind}`, inner_pkt._hdr_.slice()

          const body = Buffer
            .from @ packBinaryPacket(inner_pkt)
            .map @ b => b ^ -1 // -- xor "encrypt" transform

          const xor_pkt = fromObjBinaryPacket @:
            id_route: inner_pkt.id_route
            id_target: inner_pkt.id_target
            on_sent: inner_pkt.on_sent
            op: [ 'xor' ]
            body

          log @ `xor _send_pkt_ ${xor_pkt.pkt_kind}`, xor_pkt._hdr_.slice()
          return _send_pkt_ @ xor_pkt

        ep._recv_pkt_ = (xor_pkt, pktctx) => ::
          log @ `xor _recv_pkt_ ${xor_pkt.pkt_kind}`, xor_pkt._hdr_.slice()
          const inner_buf = xor_pkt.buffer()
            .map @ b => b ^ -1 // -- xor "decrypt" transform

          const inner_pkt = unpackBinaryPacket(inner_buf)
          log @ `post _recv_pkt_ ${inner_pkt.pkt_kind}`, inner_pkt._hdr_.slice()
          return _recv_pkt_ @ inner_pkt

        log @ 'hooked _send_pkt_ and _recv_pkt_ functions', ep.toJSON()
        return ep


    const ep0 = await pi_xor_endpoint.create @ 'tgt_ep0', @:
      async on_msg({msg, pkt}) ::
        log @ `ep0 on_msg ${pkt.pkt_kind}`, msg
          pkt._hdr_.slice()
          Object.assign({}, pkt._hdr_.op)


    expect(log.calls).to.deep.equal @#
      @[] 'hooked _send_pkt_ and _recv_pkt_ functions'
        @{} Ϡ: '$unit$ tgt_ep0'


    const ep1 = pi_xor_endpoint.client @ async ep => ::
      await ep.to(ep0).dg_post @:
        hello: 'salut'

    await ep1

    await sleep(1)

    expect(log.calls).to.deep.equal @#
      @[] 'hooked _send_pkt_ and _recv_pkt_ functions'
        @{} Ϡ: '$unit$ tgt_ep0'
      @[] 'hooked _send_pkt_ and _recv_pkt_ functions'
        @{} Ϡ: '$unit$ 9000'

      @[] 'pre _send_pkt_ json',  @[] '$unit$', 'tgt_ep0', '@', '$unit$', '9000'
      @[] 'xor _send_pkt_ data',  @[] '$unit$', 'tgt_ep0', 'xor'
      @[] 'xor _recv_pkt_ data',  @[] '$unit$', 'tgt_ep0', 'xor'
      @[] 'post _recv_pkt_ json', @[] '$unit$', 'tgt_ep0', '@', '$unit$', '9000'

      @[] 'ep0 on_msg json',
        @{} hello: 'salut'
        @[] '$unit$', 'tgt_ep0', '@', '$unit$', '9000'
        @{} kind: 'datagram',
            from: true, from_route: '$unit$', from_target: '9000'


  it @ 'extension flow', @=>> ::
    const TestHub = Hub.plugin @
      hub => ::
        log @ 'new plugin for hub'
        let count_token = 1000
        const pi_msgs2 = hub.msgs.createMsgsPlugin @:
          newToken: @=> (count_token++)+''

        let count_tgt_id = 9000
        return hub.ep_test = hub.endpoint
          .createEndpointPlugin @:
            newTargetId: @=> (count_tgt_id++)+''
            ep_msgs: pi_msgs2

            ep_create(ep_addr) ::
              log @ 'ext ep_create', arguments.length
              return this.ep_msgs.as(ep_addr)

            ep_post_init() ::
              log @ 'ext ep_post_init', arguments.length

            ep_pre_ready() ::
              log @ 'ext ep_pre_ready', arguments.length



    expect(log.calls).to.be.empty

    const hub = TestHub.create('$unit$')

    const ep0 = hub.ep_test.create @ 'tgt_ep0', @=>
      async ({pkt}) => ::
        log @ `ep0 on_msg ${pkt.pkt_kind}`, pkt._hdr_

    ::
      expect(log.calls).to.deep.equal @#
        'new plugin for hub'
        @[] 'ext ep_create', 3

      await ep0.ready

      expect(log.calls).to.deep.equal @#
        'new plugin for hub'
        @[] 'ext ep_create', 3
        @[] 'ext ep_post_init', 3
        @[] 'ext ep_pre_ready', 3

      log.calls = []
      expect(log.calls).to.be.empty


    const ep1 = hub.ep_test.client @
      async ep => ::
        log @ 'ep1 ready 0'
        await 0
        log @ 'ep1 ready 1'

        await ep.to(ep0).dg_post @:
          hello: 'salut'

    ::
      expect(log.calls).to.deep.equal @#
        @[] 'ext ep_create', 3

    await ep1

    ::
      expect(log.calls).to.deep.equal @#
        @[] 'ext ep_create', 3
        @[] 'ext ep_post_init', 3
        @[] 'ext ep_pre_ready', 3

        'ep1 ready 0'
        'ep1 ready 1'
        @[] 'ep0 on_msg json'
          @[] '$unit$', 'tgt_ep0', '@', '$unit$', '9000'

