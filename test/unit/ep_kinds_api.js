import { Hub, sym_sampi, expect, newLog } from './_setup'

describe @ 'ep_kinds.api', @=> ::
  var hub, log, api_log, test_api
  beforeEach @=> ::
    hub = Hub.create('$unit$')
    log = newLog()
    api_log = newLog()

    test_api = @=> @:
      rpc_one(kw, ctx) ::
        api_log @: fn:'rpc_one', kw, ctx
        return 'ans rpc_one'
      async rpc_two(kw, ctx) ::
        api_log @: fn: 'rpc_two', kw, ctx
        await 0
        api_log @ 'two await 0'
        return 'ans rpc_two'
      rpc_three(kw, ctx) ::
        api_log @: fn: 'rpc_three', kw, ctx
        return 'ans rpc_three'


  describe @ 'api', @=> ::
    it @ 'basic create', @=>> ::
      const tgt = hub.endpoint.api @:
        /* ... api ... */

    it @ 'call one', @=>> ::
      const tgt = hub.endpoint.api @ test_api()
      await tgt.ready

      const c = hub.endpoint.clientOf @ tgt, '$ctx$', async invoke => ::
        log @ 'top of client'

        let a1 = invoke @ 'one', @{} sz:'a', list: [1,2,3], obj: {ans: 1942}
        log @ 'after a1 invoke', 'function' === typeof a1.then

        a1 = await a1
        log @ 'after await a1', a1

        log @ 'end of client'


      expect(log.calls).to.deep.equal @ []
      expect(api_log.calls).to.deep.equal @#

      await c

      expect(log.calls).to.deep.equal @#
        'top of client'
        @[] 'after a1 invoke', true
        @[] 'after await a1', @{} answer: 'ans rpc_one'
        'end of client'

      expect(api_log.calls).to.deep.equal @#
        @{} fn: 'rpc_one', kw: {sz: 'a', list: [1,2,3], obj: {ans: 1942}}, ctx: '$ctx$'



    it @ 'call non-existant method', @=>> ::
      const tgt = hub.endpoint.api @ test_api()
      expect(tgt).to.have.a.property @ sym_sampi

      await tgt.ready

      const c = await hub.endpoint.clientOf @ tgt, '$ctx$', async invoke => ::
        const a1 = await invoke @ 'this-should-not-exist'
        log @ 'error', a1.op, a1.error

        expect @ a1.err_from
        .to.be.a @ 'function'
        .to.have.a.property @ sym_sampi

        expect @ a1.err_from[sym_sampi]
        .to.be.a @ 'string'
        .to.equal @ tgt[sym_sampi]


      expect(api_log.calls).to.deep.equal @#

      expect(log.calls).to.deep.equal @#
        @[] 'error', 'this-should-not-exist', @{} code: 404, message: 'Unknown operation'



  describe @ 'parallel', @=> ::
    it @ 'basic create', @=>> ::
      const tgt = hub.endpoint.api_parallel @:
        /* ... api ... */


    it @ 'call parallel one two three', @=>> ::
      const tgt = hub.endpoint.api_parallel @ test_api()
      await tgt.ready

      const c = await hub.endpoint.clientOf @ tgt, '$ctx$', async invoke => ::
        api_log @ 'top'
        const p_one = invoke @ 'one', @{} order: 1
        api_log @ 'invoked one'
        const p_two = invoke @ 'two', @{} order: 2
        api_log @ 'invoked two'
        const p_three = invoke @ 'three', @{} order: 3
        api_log @ 'invoked three'

        api_log @ 'awaited one', await p_one
        api_log @ 'awaited two', await p_two
        api_log @ 'awaited three', await p_three


      expect(api_log.calls).to.deep.equal @#
        'top'
        'invoked one'
        'invoked two'
        'invoked three'
        @{} fn: 'rpc_one', kw: { order: 1 }, ctx: '$ctx$'
        @{} fn: 'rpc_two', kw: { order: 2 }, ctx: '$ctx$'
        @{} fn: 'rpc_three', kw: {order: 3}, ctx: '$ctx$'
        'two await 0'
        @[] 'awaited one', @{} answer: 'ans rpc_one'
        @[] 'awaited two', @{} answer: 'ans rpc_two'
        @[] 'awaited three', @{} answer: 'ans rpc_three'


    it @ 'call serial one two three', @=>> ::
      const tgt = hub.endpoint.api_parallel @ test_api()
      await tgt.ready

      const c = await hub.endpoint.clientOf @ tgt, '$ctx$', async invoke => ::
        api_log @ 'top'
        const p_one = invoke @ 'one', @{} order: 1
        api_log @ 'invoked one'
        api_log @ 'awaited one', await p_one

        const p_two = invoke @ 'two', @{} order: 2
        api_log @ 'invoked two'
        api_log @ 'awaited two', await p_two

        const p_three = invoke @ 'three', @{} order: 3
        api_log @ 'invoked three'
        api_log @ 'awaited three', await p_three


      expect(api_log.calls).to.deep.equal @#
        'top'
        'invoked one'
        @{} fn: 'rpc_one', kw: { order: 1 }, ctx: '$ctx$'
        @[] 'awaited one', @{} answer: 'ans rpc_one'

        'invoked two'
        @{} fn: 'rpc_two', kw: { order: 2 }, ctx: '$ctx$'
        'two await 0'
        @[] 'awaited two', @{} answer: 'ans rpc_two'

        'invoked three'
        @{} fn: 'rpc_three', kw: {order: 3}, ctx: '$ctx$'
        @[] 'awaited three', @{} answer: 'ans rpc_three'



  describe @ 'inorder', @=> ::
    it @ 'basic create', @=>> ::
      const tgt = hub.endpoint.api_inorder @:
        /* ... api ... */


    it @ 'call parallel one two three', @=>> ::
      const tgt = hub.endpoint.api_inorder @ test_api()
      await tgt.ready

      const c = await hub.endpoint.clientOf @ tgt, '$ctx$', async invoke => ::
        api_log @ 'top'
        const p_one = invoke @ 'one', @{} order: 1
        api_log @ 'invoked one'
        const p_two = invoke @ 'two', @{} order: 2
        api_log @ 'invoked two'
        const p_three = invoke @ 'three', @{} order: 3
        api_log @ 'invoked three'

        api_log @ 'awaited one', await p_one
        api_log @ 'awaited two', await p_two
        api_log @ 'awaited three', await p_three


      expect(api_log.calls).to.deep.equal @#
        'top'
        'invoked one'
        'invoked two'
        'invoked three'

        @{} fn: 'rpc_one', kw: { order: 1 }, ctx: '$ctx$'
        @[] 'awaited one', @{} answer: 'ans rpc_one'

        @{} fn: 'rpc_two', kw: { order: 2 }, ctx: '$ctx$'
        'two await 0'
        @[] 'awaited two', @{} answer: 'ans rpc_two'

        @{} fn: 'rpc_three', kw: {order: 3}, ctx: '$ctx$'
        @[] 'awaited three', @{} answer: 'ans rpc_three'


    it @ 'call serial one two three', @=>> ::
      const tgt = hub.endpoint.api_inorder @ test_api()
      await tgt.ready

      const c = await hub.endpoint.clientOf @ tgt, '$ctx$', async invoke => ::
        api_log @ 'top'
        const p_one = invoke @ 'one', @{} order: 1
        api_log @ 'invoked one'
        api_log @ 'awaited one', await p_one

        const p_two = invoke @ 'two', @{} order: 2
        api_log @ 'invoked two'
        api_log @ 'awaited two', await p_two

        const p_three = invoke @ 'three', @{} order: 3
        api_log @ 'invoked three'
        api_log @ 'awaited three', await p_three


      expect(api_log.calls).to.deep.equal @#
        'top'
        'invoked one'
        @{} fn: 'rpc_one', kw: { order: 1 }, ctx: '$ctx$'
        @[] 'awaited one', @{} answer: 'ans rpc_one'

        'invoked two'
        @{} fn: 'rpc_two', kw: { order: 2 }, ctx: '$ctx$'
        'two await 0'
        @[] 'awaited two', @{} answer: 'ans rpc_two'

        'invoked three'
        @{} fn: 'rpc_three', kw: {order: 3}, ctx: '$ctx$'
        @[] 'awaited three', @{} answer: 'ans rpc_three'
