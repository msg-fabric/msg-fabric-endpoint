import { Hub, expect, newLog } from './_setup'
describe @ 'ep_kinds.client_api', @=> ::
  var hub, log
  beforeEach @=> ::
    hub = Hub.create('$unit$')
    log = newLog()

  describe @ 'create', @=> ::

    it.skip @ 'client_api', @=>> ::
      const tgt = hub.endpoint.client_api @
        function () ::
          log @ 'client'

        { /* ... api ... */ }

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'ep_created'

      // TODO: add api tests

      await tgt

      expect(log.calls)
      .to.deep.equal @#
        'ep_created'
        'client'

    it.skip @ 'async client_api', @=>> ::
      const tgt = hub.endpoint.client_api @
        async function () ::
          log @ 'client 0'
          await 0
          log @ 'client 1'

        { /* ... api ... */ }

      log @ 'ep_created'

      expect(log.calls)
      .to.deep.equal @#
        'ep_created'

      // TODO: add api tests

      await tgt

      expect(log.calls)
      .to.deep.equal @#
        'ep_created'
        'client 0'
        'client 1'
