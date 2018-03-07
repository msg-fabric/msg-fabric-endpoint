import { Hub, expect, sleep, newLog } from './_setup'

describe @ 'endpoint plugin extensions', @=> ::
  let log
  beforeEach @=> ::
    log = newLog()

  it @ 'with encoding', @=>> ::
    const TestHub = Hub.plugin @
      hub => ::
        const weak_src = new WeakMap()

        let count_token = 1000
        const pi_msgs2 = hub.msgs.createMsgsPlugin @:
          newToken: @=> (count_token++)+''

          bind_framings({as_op_frame, standard_frames}) ::
            log @ 'bind_framings'
            return standard_frames @ opfrm => ::
              opfrm.action += 'x'
              return as_op_frame(opfrm)

          bind_ops_api(as_ops_api) ::
            log @ 'bind_ops_api'
            return as_ops_api

          send_pkt(pkt) ::
            const v = weak_src.get @ this._mx_.source

            expect(v).to.not.be.undefined
            expect(v).to.have.property @ 'id_route', hub.local.id_route
            expect(v).to.have.property @ 'id_target'
            expect(v).to.have.property @ 'secret', v.id_target + ' 42'

            // TODO: Demo xor "encrypt" transform using use weak_src secret
            return hub.send(pkt)

        let count_tgt_id = 9000
        return hub.ep_test = hub.endpoint
          .createEndpointPlugin @:
            ep_msgs: pi_msgs2
            ep_create(ep_addr) ::
              log @ 'ext ep_create', arguments.length
              const ep = this.ep_msgs.as(ep_addr)
              weak_src.set @ ep,
                Object.create @ ep_addr, @{}
                  secret: @{} value: ep_addr.id_target + ' 42'

              // TODO: Demo xor "decrypt" transform using use weak_src secret
              return ep
            ep_post_init() ::
              log @ 'ext ep_post_init', arguments.length
            ep_pre_ready() ::
              log @ 'ext ep_pre_ready', arguments.length
            newTargetId: @=> (count_tgt_id++)+''



    expect(log.calls).to.be.empty

    const hub = TestHub.create('$unit$')

    expect(log.calls).to.deep.equal @#
      'bind_framings'
      'bind_ops_api'

    log.calls = []

    const ep0 = hub.ep_test.create @ 'tgt_ep0', @=>
      async ({pkt}) => ::
        log @ `ep0 on_msg ${pkt.pkt_kind}`, pkt._hdr_

    ::
      expect(log.calls).to.deep.equal @#
        @[] 'ext ep_create', 3

      await ep0.ready

      expect(log.calls).to.deep.equal @#
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
          @[] '$unit$', 'tgt_ep0', '@x', '$unit$', '9000'

