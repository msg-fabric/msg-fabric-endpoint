import { Hub, assert, expect, newLog } from './_setup'

describe @ 'ep_kinds.api', @=> ::
  var hub, log
  beforeEach @=> ::
    hub = Hub.create('$unit$')
    log = newLog()

  describe @ 'api', @=> ::
    it @ 'basic create', @=>> ::
      const tgt = hub.endpoint.api @:
        /* ... api ... */

  describe @ 'parallel', @=> ::
    it @ 'basic create', @=>> ::
      const tgt = hub.endpoint.api_parallel @:
        /* ... api ... */

  describe @ 'inorder', @=> ::
    it @ 'basic create', @=>> ::
      const tgt = hub.endpoint.api_inorder @:
        /* ... api ... */
      
