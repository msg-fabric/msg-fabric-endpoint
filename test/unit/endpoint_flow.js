import { assert, expect, newLog } from './_utils'
import { Hub } from './_setup'

describe @ 'Endpoint flow', @=> ::
  var hub, log
  beforeEach @=> ::
    hub = Hub.create('$unit$')
    log = newLog()

  describe @ 'normal init', @=> ::

    it @ 'normal ready', @=>> ::
      const tgt = hub.endpoint @ (ep_i, hub_i) => ::
        log @ 'init', {ep: ep_i.toJSON()}
        expect(hub_i).to.equal(hub)

        return @{}
          on_ready(ep_r, hub_r) ::
            log @ 'ready', {ep: ep_r.toJSON()}
            expect(ep_r).to.equal(ep_i)
            expect(hub_r).to.equal(hub)
            expect(hub_r).to.equal(hub_i)

      log @ 'after call', tgt

      expect(log.calls)
      .to.deep.equal @#
        @[] 'init', {ep: tgt}
        @[] 'after call', tgt

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        @[] 'init', {ep: tgt}
        @[] 'after call', tgt
        @[] 'ready', {ep: tgt}


    it @ 'async ready', @=>> ::
      const tgt = hub.endpoint @ (ep_i, hub_i) => ::
        log @ 'init'
        return @{}
          async on_ready(ep_r, hub_r) ::
            log @ 'ready 0'
            await 0
            log @ 'ready 1'

      log @ 'after call'

      expect(log.calls)
      .to.deep.equal @#
        'init'
        'after call'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'init'
        'after call'
        'ready 0'
        'ready 1'


  describe @ 'async init', @=> ::

    it @ 'normal ready', @=>> ::
      const tgt = hub.endpoint @ async (ep_i, hub_i) => ::
        log @ 'init 0'
        await 0
        log @ 'init 1'

        return @{}
          on_ready(ep_r, hub_r) ::
            log @ 'ready'

      log @ 'after call'

      expect(log.calls)
      .to.deep.equal @#
        'init 0'
        'after call'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'init 0'
        'after call'
        'init 1'
        'ready'


    it @ 'async ready', @=>> ::
      const tgt = hub.endpoint @ async (ep_i, hub_i) => ::
        log @ 'init 0'
        await 0
        log @ 'init 1'
        return @{}
          async on_ready(ep_r, hub_r) ::
            log @ 'ready 0'
            await 0
            log @ 'ready 1'

      log @ 'after call'

      expect(log.calls)
      .to.deep.equal @#
        'init 0'
        'after call'

      await tgt.ready

      expect(log.calls)
      .to.deep.equal @#
        'init 0'
        'after call'
        'init 1'
        'ready 0'
        'ready 1'

