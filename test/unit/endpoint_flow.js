import { Hub, assert, expect, newLog } from './_setup'

describe @ 'Endpoint flow', @=> ::
  var hub, log
  beforeEach @=> ::
    hub = Hub.create('$unit$')
    log = newLog()

  describe @ 'normal init', @=> ::

    it @ 'normal ready', @=>> ::
      const tgt = hub.endpoint @=> ::
        log @ 'init'
        return @{}
          on_msg() :: log @ 'msg'
          on_ready() :: log @ 'ready'

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'init'
        'ep_created'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'init'
        'ep_created'
        'ready'


    it @ 'async ready', @=>> ::
      const tgt = hub.endpoint @=> ::
        log @ 'init'
        return @{}
          on_msg() ::
            log @ 'msg'
          async on_ready() ::
            log @ 'ready 0'
            await 0
            log @ 'ready 1'

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'init'
        'ep_created'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'init'
        'ep_created'
        'ready 0'
        'ready 1'


  describe @ 'object init', @=> ::

    it @ 'normal ready', @=>> ::
      const tgt = hub.endpoint @:
        on_init() ::
          log @ 'on_init'
        on_msg() ::
          log @ 'msg'
        on_ready() ::
          log @ 'ready'

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'on_init'
        'ep_created'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'on_init'
        'ep_created'
        'ready'


    it @ 'async ready', @=>> ::
      const tgt = hub.endpoint @:
        on_init() ::
          log @ 'on_init'
        on_msg() ::
          log @ 'msg'
        async on_ready() ::
          log @ 'ready 0'
          await 0
          log @ 'ready 1'

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'on_init'
        'ep_created'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'on_init'
        'ep_created'
        'ready 0'
        'ready 1'


  describe @ 'async init', @=> ::

    it @ 'normal ready', @=>> ::
      const tgt = hub.endpoint @=>> ::
        log @ 'init 0'
        await 0
        log @ 'init 1'

        return @{}
          on_msg() ::
            log @ 'msg'
          on_ready() ::
            log @ 'ready'

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'init 0'
        'ep_created'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'init 0'
        'ep_created'
        'init 1'
        'ready'


    it @ 'async ready', @=>> ::
      const tgt = hub.endpoint @=>> ::
        log @ 'init 0'
        await 0
        log @ 'init 1'
        return @{}
          on_msg() ::
            log @ 'msg'
          async on_ready() ::
            log @ 'ready 0'
            await 0
            log @ 'ready 1'

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'init 0'
        'ep_created'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'init 0'
        'ep_created'
        'init 1'
        'ready 0'
        'ready 1'

  describe @ 'object async init', @=> ::

    it @ 'normal ready', @=>> ::
      const tgt = hub.endpoint @:
        async on_init() ::
          log @ 'on_init 0'
          await 0
          log @ 'on_init 1'
        on_msg() :: log @ 'msg'
        on_ready() :: log @ 'ready'

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'on_init 0'
        'ep_created'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'on_init 0'
        'ep_created'
        'on_init 1'
        'ready'


    it @ 'async ready', @=>> ::
      const tgt = hub.endpoint @:
        async on_init() ::
          log @ 'on_init 0'
          await 0
          log @ 'on_init 1'
        on_msg() ::
          log @ 'msg'
        async on_ready() ::
          log @ 'ready 0'
          await 0
          log @ 'ready 1'

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'on_init 0'
        'ep_created'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'on_init 0'
        'ep_created'
        'on_init 1'
        'ready 0'
        'ready 1'


  it @ 'normal arguments', @=>> ::
    const tgt = hub.endpoint @ (ep_i, hub_i) => ::
      expect(hub_i).to.equal(hub)
      log @ 'init', {ep: ep_i.toJSON()}

      return @{}
        on_msg({ep: ep_r, hub: hub_r}) ::
          expect(ep_r).to.equal(ep_i)
          expect(hub_r).to.equal(hub)
          expect(hub_r).to.equal(hub_i)
          log @ 'msg'
        on_ready(ep_r, hub_r) ::
          expect(ep_r).to.equal(ep_i)
          expect(hub_r).to.equal(hub)
          expect(hub_r).to.equal(hub_i)
          log @ 'ready', {ep: ep_r.toJSON()}

    log @ 'ep_created', tgt.toJSON()

    expect(log.calls)
    .to.deep.equal @#
      @[] 'init', {ep: tgt.toJSON()}
      @[] 'ep_created', tgt.toJSON()

    await tgt.ready

    expect(log.calls)
    .to.deep.equal @#
      @[] 'init', {ep: tgt.toJSON()}
      @[] 'ep_created', tgt.toJSON()
      @[] 'ready', {ep: tgt.toJSON()}


  it @ 'object arguments', @=>> ::
    const tgt = hub.endpoint @:
      on_init(ep_i, hub_i) ::
        expect(hub_i).to.equal(hub)
        log @ 'init', {ep: ep_i.toJSON()}
        this.hub_i = hub_i
        this.ep_i = ep_i

      on_msg() ::
        log @ 'msg'

      on_ready(ep_r, hub_r) ::
        expect(ep_r).to.equal(this.ep_i)
        expect(hub_r).to.equal(hub)
        expect(hub_r).to.equal(this.hub_i)
        log @ 'ready', {ep: ep_r.toJSON()}

    log @ 'ep_created', tgt.toJSON()

    expect(log.calls)
    .to.deep.equal @#
      @[] 'init', {ep: tgt.toJSON()}
      @[] 'ep_created', tgt.toJSON()

    await tgt.ready

    expect(log.calls)
    .to.deep.equal @#
      @[] 'init', {ep: tgt.toJSON()}
      @[] 'ep_created', tgt.toJSON()
      @[] 'ready', {ep: tgt.toJSON()}


  it @ 'function object arguments', @=>> ::
    const tgt = hub.endpoint @ async (ep_i, hub_i) => ::
      expect(hub_i).to.equal(hub)
      log @ 'init 0'
      await 0
      log @ 'init 1'
      on_msg.on_ready = on_ready
      return on_msg

      async function on_msg() ::
        log @ 'msg 0'
        await 0
        log @ 'msg 1'

      async function on_ready(ep_r, hub_r) ::
        expect(ep_r).to.equal(ep_i)
        expect(hub_r).to.equal(hub)
        expect(hub_r).to.equal(hub_i)
        log @ 'ready 0'
        await 0
        log @ 'ready 1'

    log @ 'ep_created'

    expect(log.calls).to.deep.equal @#
      'init 0'
      'ep_created'

    await tgt.ready

    expect(log.calls).to.deep.equal @#
      'init 0'
      'ep_created'
      'init 1'
      'ready 0'
      'ready 1'


