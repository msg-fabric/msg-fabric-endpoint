class Sink {
  static forProtocols({ inbound }) {
    class Sink extends this {}
    Sink.prototype._protocol = inbound;
    return Sink;
  }

  register(endpoint, hub, id_target, handlers) {
    const unregister = () => hub.router.unregisterTarget(id_target);

    hub.router.registerTarget(id_target, this._bindDispatch(endpoint, unregister, handlers));
    return this;
  }

  _bindDispatch(endpoint, unregister, { on_msg, on_error, on_shutdown }) {
    let alive = true;
    const protocol = this._protocol;
    const isAlive = () => alive;
    const shutdown = (err, extra) => {
      if (alive) {
        unregister();unregister = alive = false;
        on_shutdown(err, extra);
      }
    };

    Object.assign(this, endpoint.bindSink(this), { isAlive, shutdown });
    Object.assign(endpoint, { isAlive, shutdown });

    return async (pkt, router) => {
      if (false === alive || null == pkt) {
        return alive;
      }

      const recv_msg = protocol[pkt.type];
      if (undefined === recv_msg) {
        return void on_error(false, { pkt, zone: 'pkt.type' });
      }

      try {
        var msg = await recv_msg(pkt, this, router);
        if (!msg) {
          return msg;
        }
      } catch (err) {
        return void on_error(err, { pkt, zone: 'protocol' });
      }

      if (false === alive) {
        return router.unregister;
      }

      try {
        await on_msg(msg, pkt);
      } catch (err) {
        try {
          var terminate = on_error(err, { msg, pkt, zone: 'dispatch' });
        } finally {
          if (false !== terminate) {
            shutdown(err, { msg, pkt });
            return router.unregister;
          }
        }
      }
    };
  }

  //// Endpoint bindSink() responsibilities
  // by_msgid: new Map()
  // json_unpack(sz) :: return JSON.parse(sz)
  // recvCtrl(msg, info) ::
  // recvMsg(msg, info) :: return @{} msg, info
  // recvStream(msg, info) ::
  // recvStreamData(rstream, info) ::
}

class EPTarget$1 {
  constructor(id) {
    this.id = id;
  }

  inspect() {
    return `«EPTarget ${ep_encode(this.id, true)}»`;
  }
  toJSON() {
    return ep_encode(this.id, false);
  }
  asEndpointId() {
    return this.id;
  }
  isEPTarget() {
    return true;
  }

  get id_router() {
    return this.id.id_router;
  }
  get id_target() {
    return this.id.id_target;
  }

  static as_json_unpack(msg_ctx_to, xformByKey) {
    xformByKey = Object.create(xformByKey || null);
    xformByKey[token] = v => this.from_ctx(ep_decode(v), msg_ctx_to);
    return this.json_unpack_xform(xformByKey);
  }

  static from_ctx(id, msg_ctx_to, msgid) {
    if (!id) {
      return;
    }
    if ('function' === typeof id.asEndpointId) {
      id = id.asEndpointId();
    }

    const ep_tgt = new this(id);
    let fast,
        init = () => fast = msg_ctx_to(ep_tgt, { msgid }).fast;
    return Object.defineProperties(ep_tgt, {
      send: { get() {
          return (fast || init()).send;
        } },
      query: { get() {
          return (fast || init()).query;
        } },
      replyExpected: { value: !!msgid } });
  }
}

const token = '\u03E0'; // 'Ϡ'
EPTarget$1.token = token;

EPTarget$1.ep_encode = ep_encode;
function ep_encode(id, simple) {
  let { id_router: r, id_target: t } = id;
  r = (r >>> 0).toString(36);
  t = (t >>> 0).toString(36);
  if (simple) {
    return `${token} ${r}~${t}`;
  }

  const res = { [token]: `${r}~${t}` };
  Object.assign(res, id);
  delete res.id_router;delete res.id_target;
  return res;
}

EPTarget$1.ep_decode = ep_decode;
function ep_decode(v) {
  const id = 'string' === typeof v ? v.split(token)[1] : v[token];
  if (!id) {
    return;
  }

  let [r, t] = id.split('~');
  if (undefined === t) {
    return;
  }
  r = 0 | parseInt(r, 36);
  t = 0 | parseInt(t, 36);

  return { id_router: r, id_target: t };
}

EPTarget$1.json_unpack_xform = json_unpack_xform;
function json_unpack_xform(xformByKey) {
  return sz => JSON.parse(sz, reviver());

  function reviver() {
    const reg = new WeakMap();
    return function (key, value) {
      const xfn = xformByKey[key];
      if (undefined !== xfn) {
        reg.set(this, xfn);
        return value;
      }

      if ('object' === typeof value) {
        const vfn = reg.get(value);
        if (undefined !== vfn) {
          return vfn(value);
        }
      }
      return value;
    };
  }
}

class MsgCtx {
  static forProtocols({ random_id, codecs }) {
    class MsgCtx extends this {}
    MsgCtx.prototype.random_id = random_id;
    MsgCtx.withCodecs(codecs);
    return MsgCtx;
  }

  static forHub(hub, channel) {
    const { sendRaw } = channel;
    async function chan_send(pkt) {
      await sendRaw(pkt);
      return true;
    }

    class MsgCtx extends this {}
    MsgCtx.prototype.chan = Object.create(MsgCtx.prototype.chan || null, { send: { value: chan_send } });

    return MsgCtx;
  }

  constructor(id) {
    if (null != id) {
      const { id_target, id_router } = id;
      const from_id = Object.freeze({ id_target, id_router });
      this.ctx = { from_id };
    }
  }

  withEndpoint(endpoint) {
    return Object.defineProperties(this, {
      endpoint: { value: endpoint },
      chan: { value: Object.create(this.chan) } });
  }

  ping(token = true) {
    return this._invoke_ex(this._msgCodecs.control.ping, [], token);
  }
  send(...args) {
    return this._invoke_ex(this._codec.send, args);
  }
  sendQuery(...args) {
    return this._invoke_ex(this._codec.send, args, true);
  }
  query(...args) {
    return this._invoke_ex(this._codec.send, args, true).reply;
  }

  stream(...args) {
    return this._invoke_ex(this._codec.stream, args);
  }
  invoke(key, ...args) {
    return this._invoke_ex(this._codec[key], args);
  }
  bindInvoke(fnOrKey, token) {
    if ('function' !== typeof fnOrKey) {
      fnOrKey = this._codec;
    }
    return (...args) => this._invoke_ex(fnOrKey, args, token);
  }

  _invoke_ex(invoke, args, token) {
    const obj = Object.assign({}, this.ctx);
    if (null == token) {
      token = obj.token;
    } else obj.token = token;
    if (true === token) {
      token = obj.token = this.random_id();
    }

    this.assertMonitor();

    const res = invoke(this.chan, obj, ...args);
    if (!token || 'function' !== typeof res.then) {
      return res;
    }

    let p_sent = res.then();
    const reply = this.endpoint.initReply(token, p_sent, this);
    p_sent = p_sent.then(() => ({ reply }));
    p_sent.reply = reply;
    return p_sent;
  }

  get to() {
    return (tgt, ...args) => {
      if (null == tgt) {
        throw new Error(`Null target endpoint`);
      }

      const self = this.clone();

      const ctx = self.ctx;
      if ('number' === typeof tgt) {
        ctx.id_target = tgt;
        ctx.id_router = ctx.from_id.id_router;
      } else {
        ctx.to_tgt = tgt;
        tgt = ep_decode(tgt) || tgt;
        const { from_id: reply_id, id_target, id_router, token, msgid } = tgt;

        if (undefined !== id_target) {
          ctx.id_target = id_target;
          ctx.id_router = id_router;
        } else if (undefined !== reply_id && !ctx.id_target) {
          ctx.id_target = reply_id.id_target;
          ctx.id_router = reply_id.id_router;
        }

        if (undefined !== token) {
          ctx.token = token;
        }
        if (undefined !== msgid) {
          ctx.msgid = msgid;
        }
      }

      return 0 === args.length ? self : self.with(...args);
    };
  }

  with(...args) {
    const ctx = this.ctx;
    for (let tgt of args) {
      if (true === tgt || false === tgt) {
        ctx.token = tgt;
      } else if (null != tgt) {
        const { token, msgid } = tgt;
        if (undefined !== token) {
          ctx.token = token;
        }
        if (undefined !== msgid) {
          ctx.msgid = msgid;
        }
      }
    }
    return this;
  }

  withReply() {
    return this.clone({ token: true });
  }

  clone(...args) {
    return Object.create(this, {
      ctx: { value: Object.assign({}, this.ctx, ...args) } });
  }

  assertMonitor() {
    if (!this.checkMonitor()) {
      throw new Error(`Target monitor expired`);
    }
  }
  checkMonitor() {
    return true;
  }
  monitor(options = {}) {
    if (true === options || false === options) {
      options = { active: options };
    }

    const monitor = this.endpoint.initMonitor(this.ctx.id_target);

    const ts_duration = options.ts_duration || 5000;
    let ts_active = options.ts_active;
    if (true === ts_active) {
      ts_active = ts_duration / 4;
    }

    let checkMonitor;
    const promise = new Promise((resolve, reject) => {
      const done = options.reject ? reject : resolve;
      this.checkMonitor = checkMonitor = () => ts_duration > monitor.td() ? true : (done(monitor), false);
    });

    let tid;
    const ts_interval = ts_active || ts_duration / 4;
    if (options.active || ts_active) {
      const ctrl = this.codec('control');
      const checkPing = () => {
        if (ts_interval > monitor.td()) {
          ctrl.invoke('ping');
        }
      };
      tid = setInterval(checkPing, ts_interval);
    } else {
      tid = setInterval(checkMonitor, ts_interval);
    }
    if (tid.unref) {
      tid.unref();
    }
    const clear = () => clearInterval(tid);

    promise.then(clear, clear);
    return promise;
  }

  codec(msg_codec, ...args) {
    if ('string' === typeof msg_codec) {
      msg_codec = this._msgCodecs[msg_codec];
    }

    if ('function' !== typeof msg_codec.send) {
      throw new TypeError(`Expected packet codec protocol`);
    }

    return Object.create(this, {
      _codec: { value: msg_codec },
      ctx: { value: Object.assign({}, this.ctx, ...args) } });
  }

  static withCodecs(msgCodecs) {
    for (const [name, msg_codec] of Object.entries(msgCodecs)) {
      this.prototype[name] = function () {
        return this.codec(msg_codec);
      };
    }
    this.prototype._msgCodecs = msgCodecs;
    this.prototype._codec = msgCodecs.default;

    // bind frequently used fast-path
    const send = msgCodecs.default.send;
    Object.defineProperties(this.prototype, {
      fast: { get() {
          return {
            send: (...args) => this._invoke_ex(send, args),
            sendQuery: (...args) => this._invoke_ex(send, args, true),
            query: (...args) => this._invoke_ex(send, args, true).reply };
        } } });

    return this;
  }

  withRejectTimeout(p_reply) {
    return new Promise((resolve, reject) => {
      p_reply.then(resolve, reject);
      p_reply.then(clear, clear);

      const timeout = () => reject(new this.ReplyTimeout());
      const tid = setTimeout(timeout, this.ms_timeout);
      if (tid.unref) {
        tid.unref();
      }

      function clear() {
        clearTimeout(tid);
      }
    });
  }
}

class ReplyTimeout extends Error {}

Object.assign(MsgCtx.prototype, {
  ReplyTimeout, ms_timeout: 5000 });

class Endpoint {
  static subclass(extensions) {
    class Endpoint extends this {}
    Object.assign(Endpoint.prototype, extensions);
    return Endpoint;
  }

  inspect() {
    return `«Endpoint ${ep_encode(this.id, true)}»`;
  }
  toJSON() {
    return this.ep_self().toJSON();
  }
  ep_self() {
    return new this.EPTarget(this.id);
  }
  asEndpointId() {
    return this.id;
  }

  constructor(id, MsgCtx) {
    const msg_ctx = this.initMsgCtx(id, MsgCtx);
    Object.defineProperties(this, {
      id: { value: id },
      to: { value: msg_ctx.to } });
  }

  createMap() {
    return new Map();
  }
  createStateMap() {
    return this.createMap();
  }
  createReplyMap() {
    return this.createMap();
  }
  createTrafficMap() {
    return this.createMap();
  }

  initMsgCtx(id, MsgCtx) {
    return new MsgCtx(id).withEndpoint(this);
  }

  bindSink(sink) {
    const by_token = this.createReplyMap();
    const by_traffic = this.createTrafficMap();
    Object.defineProperties(this, {
      by_token: { value: by_token },
      by_traffic: { value: by_traffic } });

    const traffic = (from_id, traffic) => {
      const ts = Date.now();
      if (from_id) {
        const t = by_traffic.get(from_id.id_target);
        if (undefined !== t) {
          t.ts = t[`ts_${traffic}`] = ts;
        }
      }
      this.recvTraffic(from_id, traffic, ts);
    };

    return {
      by_msgid: this.createStateMap(),
      json_unpack: this.EPTarget.as_json_unpack(this.to),

      recvCtrl: (msg, info) => {
        traffic(info.from_id, 'ctrl');
        const reply = by_token.get(info.token);
        const rmsg = this.recvCtrl(msg, info, reply);

        if (undefined !== reply) {
          Promise.resolve(rmsg || { msg, info }).then(reply);
        } else return rmsg;
      },

      recvMsg: (msg, info) => {
        traffic(info.from_id, 'msg');
        const reply = by_token.get(info.token);
        const rmsg = this.recvMsg(msg, info, reply);

        if (undefined !== reply) {
          Promise.resolve(rmsg).then(reply);
        } else return rmsg;
      },

      recvStreamData: (rstream, info) => {
        traffic(info.from_id, 'stream');
      },
      recvStream: (msg, info) => {
        traffic(info.from_id, 'stream');
        const reply = by_token.get(info.token);
        const rstream = this.recvStream(msg, info, reply);

        if (undefined !== reply) {
          Promise.resolve(rstream).then(reply);
        }
        return rstream;
      } };
  }

  as_target(id) {
    if (id) {
      return this.EPTarget.from_ctx(id, this.to);
    }
  }
  as_sender({ from_id: id, msgid }) {
    if (id) {
      return this.EPTarget.from_ctx(id, this.to, msgid);
    }
  }

  recvTraffic(from_id, traffic, ts) {}
  recvCtrl(msg, info, is_reply) {
    if (is_reply) {
      return msg;
    }
  }
  recvMsg(msg, info, is_reply) {
    if (is_reply) {
      return msg;
    }
    return { msg, info, sender: this.as_sender(info) };
  }
  recvStream(msg, info, is_reply) {
    console.warn(`Unhandle recv stream: ${info}`);
    return null;
    /* return @{} msg, info
         on_init(msg, pkt) :: // return this
         on_data(data, pkt) :: this.parts.push @ data
         on_end(result, pkt) :: this.parts.join(''); // return this
         on_error(err, pkt) :: console.log @ err
    */
  }initReply(token, p_sent, msg_ctx) {
    return this.initReplyPromise(token, p_sent, msg_ctx);
  }

  initMonitor(id_target) {
    const key = id_target.id_target || id_target;
    let monitor = this.by_traffic.get(key);
    if (undefined === monitor) {
      monitor = { id_target, ts: Date.now(),
        td() {
          return Date.now() - this.ts;
        } };
      this.by_traffic.set(key, monitor);
    }
    return monitor;
  }

  initReplyPromise(token, p_sent, msg_ctx) {
    let reply = new Promise((resolve, reject) => {
      this.by_token.set(token, resolve);
      p_sent.catch(reject);
    });

    if (msg_ctx) {
      reply = msg_ctx.withRejectTimeout(reply);
    }

    const clear = () => this.by_token.delete(token);
    reply.then(clear, clear);
    return reply;
  }
}

Endpoint.prototype.EPTarget = EPTarget$1;

const ep_proto$1 = Object.create(Object.getPrototypeOf(function () {}), { _unwrap_: { get: _unwrap_ } });

function _unwrap_() {
  const self = Object.create(this);
  self.endpoint = v => v;
  return self;
}

function add_ep_kind(kinds) {
  Object.assign(ep_proto$1, kinds);
}

add_ep_kind({
  client(...args) {
    if (1 === args.length && 'function' === typeof args[0]) {
      return this.clientEndpoint(args[0]);
    }

    const msg_ctx = new this.MsgCtx();
    return 0 !== args.length ? msg_ctx.to(...args) : msg_ctx;
  },

  clientEndpoint(on_client) {
    const target = clientEndpoint(on_client);
    const ep_tgt = this.endpoint(target);
    return target.done;
  },

  client_api(on_client, api) {
    const target = clientEndpoint(on_client);
    const ep_api = this._unwrap_.api_parallel(api);
    const ep_tgt = this.endpoint((ep, hub) => Object.assign(target, ep_api(ep, hub)));
    return target.done;
  } });

const ep_client_api = {
  async on_ready(ep, hub) {
    this._resolve((await this.on_client(ep, hub)));
    await ep.shutdown();
  },
  on_send_error(ep, err) {
    this._reject(err);
  },
  on_shutdown(ep, err) {
    err ? this._reject(err) : this._resolve();
  } };

function clientEndpoint(on_client) {
  const target = Object.create(ep_client_api);
  if ('function' !== typeof on_client) {
    if (on_client.on_ready) {
      throw new TypeError(`Use "on_client()" instead of "on_ready()" with clientEndpoint`);
    }
    Object.assign(target, on_client);
  } else {
    target.on_client = on_client;
  }

  target.done = new Promise((resolve, reject) => {
    target._resolve = resolve;
    target._reject = reject;
  });
  return target;
}

add_ep_kind({
  api_bind_rpc,
  api(api) {
    return this.api_parallel(api);
  },
  api_parallel(api) {
    return this.endpoint(function (ep, hub) {
      const rpc = api_bind_rpc(api, ep, hub);
      return { rpc,
        async on_msg({ msg, sender }) {
          await rpc.invoke(sender, msg.op, api_fn => api_fn(msg.kw, msg.ctx));
        } };
    });
  },

  api_inorder(api) {
    return this.endpoint(function (ep, hub) {
      const rpc = api_bind_rpc(api, ep, hub);
      return { rpc,
        async on_msg({ msg, sender }) {
          await rpc.invoke_gated(sender, msg.op, api_fn => api_fn(msg.kw, msg.ctx));
        } };
    });
  } });

function api_bind_rpc(api, ep, hub) {
  const pfx = api.op_prefix || 'rpc_';
  const lookup_op = api.op_lookup ? op => api.op_lookup(pfx + op, ep, hub) : 'function' === typeof api ? op => api(pfx + op, ep, hub) : op => {
    const fn = api[pfx + op];
    return fn ? fn.bind(api) : fn;
  };

  return Object.create(rpc_api, {
    lookup_op: { value: lookup_op },
    err_from: { value: ep.ep_self() } });
}

const rpc_api = {
  async invoke(sender, op, cb) {
    const api_fn = await this.resolve_op(sender, op);
    if (undefined === api_fn) {
      return;
    }

    const res = this.answer(sender, api_fn, cb);
    return await res;
  },

  async invoke_gated(sender, op, cb) {
    const api_fn = await this.resolve_op(sender, op);
    if (undefined === api_fn) {
      return;
    }

    const res = Promise.resolve(this.gate).then(() => this.answer(sender, api_fn, cb));
    this.gate = res.then(noop, noop);
    return await res;
  },

  async resolve_op(sender, op) {
    if ('string' !== typeof op) {
      await sender.send({ op, err_from: this.err_from,
        error: { message: 'Invalid operation', code: 400 } });
      return;
    }

    try {
      const api_fn = await this.lookup_op(op);
      if (!api_fn) {
        await sender.send({ op, err_from: this.err_from,
          error: { message: 'Unknown operation', code: 404 } });
      }
      return api_fn;
    } catch (err) {
      await sender.send({ op, err_from: this.err_from,
        error: { message: `Invalid operation: ${err.message}`, code: 500 } });
    }
  },

  async answer(sender, api_fn, cb) {
    try {
      var answer = cb ? await cb(api_fn) : await api_fn();
    } catch (err) {
      await sender.send({ err_from: this.err_from, error: err });
      return false;
    }

    if (sender.replyExpected) {
      await sender.send({ answer });
    }
    return true;
  } };

function noop() {}

add_ep_kind({
  server(on_init) {
    return this.endpoint(on_init);
  } });

const default_plugin_options = {
  plugin_name: 'endpoint',
  protocols: 'protocols',
  createMap() {
    return new Map(); // LRUMap, HashbeltMap
  }, on_msg({ msg, reply, info }) {
    console.warn('ENDPOINT MSG:', { msg, reply, info });
  },
  on_error(ep, err, extra) {
    console.error('ENDPOINT ERROR:', err);
    // const {msg, pkt} = extra
    // return false to prevent auto-shutdown
  }, on_shutdown(ep, err, extra) {
    // const {msg, pkt} = extra
    console.error(`ENDPOINT SHUTDOWN: ${err.message}`);
  },

  subclass(classes) {
    //const {Endpoint, Sink, MsgCtx, protocols} = classes
    return classes;
  } };

var plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    createMap,
    on_msg: default_on_msg,
    on_error: default_on_error,
    on_shutdown: default_on_shutdown } = plugin_options;

  if (plugin_options.ep_kinds) {
    Object.assign(ep_proto$1, plugin_options.ep_kinds);
  }

  let endpoint_plugin;
  return {
    order: 1,
    subclass,
    post(hub) {
      return hub[plugin_options.plugin_name] = endpoint_plugin(hub);
    } };

  function get_protocols(hub_prototype) {
    const res = plugin_options.protocols;
    if ('string' === typeof res) {
      return hub_prototype[res];
    } else if ('function' === typeof res) {
      return plugin_options.protocols(hub_prototype.protocols, hub_prototype);
    } else if (null == res) {
      return hub_prototype.protocols;
    } else return res;
  }

  function subclass(FabricHub_PI, bases) {
    const protocols = get_protocols(FabricHub_PI.prototype);

    const { Endpoint: Endpoint$$1, Sink: Sink$$1, MsgCtx: MsgCtx_pi } = plugin_options.subclass({
      Sink: Sink.forProtocols(protocols),
      MsgCtx: MsgCtx.forProtocols(protocols),
      Endpoint: Endpoint.subclass({ createMap }) });

    endpoint_plugin = function (hub) {
      const channel = hub.connect_self();
      const MsgCtx$$1 = MsgCtx_pi.forHub(hub, channel);

      Object.setPrototypeOf(endpoint, ep_proto$1);
      Object.assign(endpoint, { endpoint, create, MsgCtx: MsgCtx$$1 });
      return endpoint;

      function endpoint(on_init) {
        const targets = hub.router.targets;
        do var id_target = protocols.random_id(); while (targets.has(id_target));
        return create(id_target, on_init);
      }

      function create(id_target, on_init) {
        const handlers = Object.create(null);
        const id = { id_target, id_router: hub.router.id_self };
        const ep = new Endpoint$$1(id, MsgCtx$$1);

        const ready = Promise.resolve('function' === typeof on_init ? on_init(ep, hub) : on_init).then(_after_init);

        // Allow for both internal and external error handling by forking ready.catch
        ready.catch(err => handlers.on_error(err, { zone: 'on_ready' }));

        {
          const ep_tgt = ep.ep_self();
          return Object.defineProperties(ep_tgt, {
            ready: { value: ready.then(() => ep_tgt) } });
        }

        function _after_init(target) {
          if (null == target) {
            throw new TypeError(`Expected endpoint init to return a closure or interface`);
          }

          handlers.on_msg = (target.on_msg || ('function' === typeof target ? target : default_on_msg)).bind(target);
          handlers.on_error = (target.on_error || default_on_error).bind(target, ep);
          handlers.on_shutdown = (target.on_shutdown || default_on_shutdown).bind(target, ep);

          new Sink$$1().register(ep, hub, id_target, handlers);

          return target.on_ready ? target.on_ready(ep, hub) : target;
        }
      }
    };
  }
};

export default plugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2V4dGVuc2lvbnMuanN5IiwiLi4vY29kZS9lcF9raW5kcy9jbGllbnQuanN5IiwiLi4vY29kZS9lcF9raW5kcy9hcGkuanN5IiwiLi4vY29kZS9lcF9raW5kcy9pbmRleC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gIC8vLy8gRW5kcG9pbnQgYmluZFNpbmsoKSByZXNwb25zaWJpbGl0aWVzXG4gIC8vIGJ5X21zZ2lkOiBuZXcgTWFwKClcbiAgLy8ganNvbl91bnBhY2soc3opIDo6IHJldHVybiBKU09OLnBhcnNlKHN6KVxuICAvLyByZWN2Q3RybChtc2csIGluZm8pIDo6XG4gIC8vIHJlY3ZNc2cobXNnLCBpbmZvKSA6OiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAvLyByZWN2U3RyZWFtKG1zZywgaW5mbykgOjpcbiAgLy8gcmVjdlN0cmVhbURhdGEocnN0cmVhbSwgaW5mbykgOjpcblxuIiwiZXhwb3J0IGRlZmF1bHQgRVBUYXJnZXRcbmV4cG9ydCBjbGFzcyBFUFRhcmdldCA6OlxuICBjb25zdHJ1Y3RvcihpZCkgOjogdGhpcy5pZCA9IGlkXG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlkLmFzRW5kcG9pbnRJZCA6OlxuICAgICAgaWQgPSBpZC5hc0VuZHBvaW50SWQoKVxuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgc2VuZDogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnNlbmRcbiAgICAgIHF1ZXJ5OiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkucXVlcnlcbiAgICAgIHJlcGx5RXhwZWN0ZWQ6IEB7fSB2YWx1ZTogISEgbXNnaWRcblxuXG5jb25zdCB0b2tlbiA9ICdcXHUwM0UwJyAvLyAnz6AnXG5FUFRhcmdldC50b2tlbiA9IHRva2VuXG5cbkVQVGFyZ2V0LmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShpZCwgc2ltcGxlKSA6OlxuICBsZXQge2lkX3JvdXRlcjpyLCBpZF90YXJnZXQ6dH0gPSBpZFxuICByID0gKHI+Pj4wKS50b1N0cmluZygzNilcbiAgdCA9ICh0Pj4+MCkudG9TdHJpbmcoMzYpXG4gIGlmIHNpbXBsZSA6OlxuICAgIHJldHVybiBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuXG4gIGNvbnN0IHJlcyA9IEB7fSBbdG9rZW5dOiBgJHtyfX4ke3R9YFxuICBPYmplY3QuYXNzaWduIEAgcmVzLCBpZFxuICBkZWxldGUgcmVzLmlkX3JvdXRlcjsgZGVsZXRlIHJlcy5pZF90YXJnZXRcbiAgcmV0dXJuIHJlc1xuXG5cbkVQVGFyZ2V0LmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBpZCA9ICdzdHJpbmcnID09PSB0eXBlb2YgdlxuICAgID8gdi5zcGxpdCh0b2tlbilbMV1cbiAgICA6IHZbdG9rZW5dXG4gIGlmICEgaWQgOjogcmV0dXJuXG5cbiAgbGV0IFtyLHRdID0gaWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG5cbkVQVGFyZ2V0Lmpzb25fdW5wYWNrX3hmb3JtID0ganNvbl91bnBhY2tfeGZvcm1cbmV4cG9ydCBmdW5jdGlvbiBqc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KSA6OlxuICByZXR1cm4gc3ogPT4gSlNPTi5wYXJzZSBAIHN6LCByZXZpdmVyKClcblxuICBmdW5jdGlvbiByZXZpdmVyKCkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWUpIDo6XG4gICAgICBjb25zdCB4Zm4gPSB4Zm9ybUJ5S2V5W2tleV1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0geGZuIDo6XG4gICAgICAgIHJlZy5zZXQodGhpcywgeGZuKVxuICAgICAgICByZXR1cm4gdmFsdWVcblxuICAgICAgaWYgJ29iamVjdCcgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICBjb25zdCB2Zm4gPSByZWcuZ2V0KHZhbHVlKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHZmbiA6OlxuICAgICAgICAgIHJldHVybiB2Zm4gQCB2YWx1ZVxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiIsImltcG9ydCB7ZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgc3RhdGljIGZvckh1YihodWIsIGNoYW5uZWwpIDo6XG4gICAgY29uc3Qge3NlbmRSYXd9ID0gY2hhbm5lbFxuICAgIGFzeW5jIGZ1bmN0aW9uIGNoYW5fc2VuZChwa3QpIDo6XG4gICAgICBhd2FpdCBzZW5kUmF3KHBrdClcbiAgICAgIHJldHVybiB0cnVlXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuID0gT2JqZWN0LmNyZWF0ZSBAXG4gICAgICBNc2dDdHgucHJvdG90eXBlLmNoYW4gfHwgbnVsbFxuICAgICAgQHt9IHNlbmQ6IEB7fSB2YWx1ZTogY2hhbl9zZW5kXG5cbiAgICByZXR1cm4gTXNnQ3R4XG5cblxuICBjb25zdHJ1Y3RvcihpZCkgOjpcbiAgICBpZiBudWxsICE9IGlkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gaWRcbiAgICAgIGNvbnN0IGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICB0aGlzLmN0eCA9IEB7fSBmcm9tX2lkXG5cblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuICAgICAgY2hhbjogQHt9IHZhbHVlOiBPYmplY3QuY3JlYXRlIEAgdGhpcy5jaGFuXG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG5cbiAgICBjb25zdCByZXMgPSBpbnZva2UgQCB0aGlzLmNoYW4sIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIGN0eC50b190Z3QgPSB0Z3RcbiAgICAgIHRndCA9IGVwX2RlY29kZSh0Z3QpIHx8IHRndFxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiAwID09PSBhcmdzLmxlbmd0aCA/IHNlbGYgOiBzZWxmLndpdGggQCAuLi5hcmdzXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgdHJ1ZSA9PT0gdGd0IHx8IGZhbHNlID09PSB0Z3QgOjpcbiAgICAgICAgY3R4LnRva2VuID0gdGd0XG4gICAgICBlbHNlIGlmIG51bGwgIT0gdGd0IDo6XG4gICAgICAgIGNvbnN0IHt0b2tlbiwgbXNnaWR9ID0gdGd0XG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG5cbiAgICAvLyBiaW5kIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBzZW5kID0gbXNnQ29kZWNzLmRlZmF1bHQuc2VuZFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcy5wcm90b3R5cGUsIEA6XG4gICAgICBmYXN0OiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoc2VuZCwgYXJncylcbiAgICAgICAgc2VuZFF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KHNlbmQsIGFyZ3MsIHRydWUpXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KHNlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgICByZXR1cm4gdGhpc1xuXG5cbiAgd2l0aFJlamVjdFRpbWVvdXQocF9yZXBseSkgOjpcbiAgICByZXR1cm4gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgcF9yZXBseS50aGVuIEAgcmVzb2x2ZSwgcmVqZWN0XG4gICAgICBwX3JlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcblxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLm1zX3RpbWVvdXQpXG4gICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcblxuICAgICAgZnVuY3Rpb24gY2xlYXIoKSA6OiBjbGVhclRpbWVvdXQgQCB0aWRcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dCwgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQge0VQVGFyZ2V0LCBlcF9lbmNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIHN1YmNsYXNzKGV4dGVuc2lvbnMpIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgZXh0ZW5zaW9uc1xuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVwX3NlbGYoKS50b0pTT04oKVxuICBlcF9zZWxmKCkgOjogcmV0dXJuIG5ldyB0aGlzLkVQVGFyZ2V0KHRoaXMuaWQpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG5cbiAgY29uc3RydWN0b3IoaWQsIE1zZ0N0eCkgOjpcbiAgICBjb25zdCBtc2dfY3R4ID0gdGhpcy5pbml0TXNnQ3R4IEAgaWQsIE1zZ0N0eFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBpZDogQHt9IHZhbHVlOiBpZFxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGluaXRNc2dDdHgoaWQsIE1zZ0N0eCkgOjpcbiAgICByZXR1cm4gbmV3IE1zZ0N0eChpZCkud2l0aEVuZHBvaW50KHRoaXMpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcbiAgICAgIGpzb25fdW5wYWNrOiB0aGlzLkVQVGFyZ2V0LmFzX2pzb25fdW5wYWNrKHRoaXMudG8pXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgYXNfdGFyZ2V0KGlkKSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG9cbiAgYXNfc2VuZGVyKHtmcm9tX2lkOmlkLCBtc2dpZH0pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50bywgbXNnaWRcblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc19zZW5kZXIoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogdGhpcy5wYXJ0cy5qb2luKCcnKTsgLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBwX3NlbnQsIG1zZ19jdHhcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIGxldCByZXBseSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIHBfc2VudC5jYXRjaCBAIHJlamVjdFxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgcmVwbHkgPSBtc2dfY3R4LndpdGhSZWplY3RUaW1lb3V0KHJlcGx5KVxuXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiB0aGlzLmJ5X3Rva2VuLmRlbGV0ZSBAIHRva2VuXG4gICAgcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuICAgIHJldHVybiByZXBseVxuXG5FbmRwb2ludC5wcm90b3R5cGUuRVBUYXJnZXQgPSBFUFRhcmdldFxuXG4iLCJleHBvcnQgY29uc3QgZXBfcHJvdG8gPSBPYmplY3QuY3JlYXRlIEBcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mIEAgZnVuY3Rpb24oKXt9XG4gIEB7fSBfdW53cmFwXzogQHt9IGdldDogX3Vud3JhcF9cblxuZnVuY3Rpb24gX3Vud3JhcF8oKSA6OlxuICBjb25zdCBzZWxmID0gT2JqZWN0LmNyZWF0ZSh0aGlzKVxuICBzZWxmLmVuZHBvaW50ID0gdiA9PiB2XG4gIHJldHVybiBzZWxmXG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRfZXBfa2luZChraW5kcykgOjpcbiAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBraW5kc1xuZXhwb3J0IGRlZmF1bHQgYWRkX2VwX2tpbmRcblxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGNsaWVudCguLi5hcmdzKSA6OlxuICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICByZXR1cm4gdGhpcy5jbGllbnRFbmRwb2ludCBAIGFyZ3NbMF1cblxuICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgdGhpcy5Nc2dDdHgoKVxuICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cbiAgY2xpZW50RW5kcG9pbnQob25fY2xpZW50KSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KG9uX2NsaWVudClcbiAgICBjb25zdCBlcF90Z3QgPSB0aGlzLmVuZHBvaW50IEAgdGFyZ2V0XG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cbiAgY2xpZW50X2FwaShvbl9jbGllbnQsIGFwaSkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpXG4gICAgY29uc3QgZXBfYXBpID0gdGhpcy5fdW53cmFwXy5hcGlfcGFyYWxsZWwoYXBpKVxuICAgIGNvbnN0IGVwX3RndCA9IHRoaXMuZW5kcG9pbnQgQCAoZXAsIGh1YikgPT5cbiAgICAgIE9iamVjdC5hc3NpZ24gQCB0YXJnZXQsIGVwX2FwaShlcCwgaHViKVxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG5cbmNvbnN0IGVwX2NsaWVudF9hcGkgPSBAe31cbiAgYXN5bmMgb25fcmVhZHkoZXAsIGh1YikgOjpcbiAgICB0aGlzLl9yZXNvbHZlIEAgYXdhaXQgdGhpcy5vbl9jbGllbnQoZXAsIGh1YilcbiAgICBhd2FpdCBlcC5zaHV0ZG93bigpXG4gIG9uX3NlbmRfZXJyb3IoZXAsIGVycikgOjpcbiAgICB0aGlzLl9yZWplY3QoZXJyKVxuICBvbl9zaHV0ZG93bihlcCwgZXJyKSA6OlxuICAgIGVyciA/IHRoaXMuX3JlamVjdChlcnIpIDogdGhpcy5fcmVzb2x2ZSgpXG5cbmV4cG9ydCBmdW5jdGlvbiBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpIDo6XG4gIGNvbnN0IHRhcmdldCA9IE9iamVjdC5jcmVhdGUgQCBlcF9jbGllbnRfYXBpXG4gIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvbl9jbGllbnQgOjpcbiAgICBpZiBvbl9jbGllbnQub25fcmVhZHkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgVXNlIFwib25fY2xpZW50KClcIiBpbnN0ZWFkIG9mIFwib25fcmVhZHkoKVwiIHdpdGggY2xpZW50RW5kcG9pbnRgXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRhcmdldCwgb25fY2xpZW50XG4gIGVsc2UgOjpcbiAgICB0YXJnZXQub25fY2xpZW50ID0gb25fY2xpZW50XG5cbiAgdGFyZ2V0LmRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgdGFyZ2V0Ll9yZXNvbHZlID0gcmVzb2x2ZVxuICAgIHRhcmdldC5fcmVqZWN0ID0gcmVqZWN0XG4gIHJldHVybiB0YXJnZXRcbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBhcGlfYmluZF9ycGNcbiAgYXBpKGFwaSkgOjogcmV0dXJuIHRoaXMuYXBpX3BhcmFsbGVsKGFwaSlcbiAgYXBpX3BhcmFsbGVsKGFwaSkgOjpcbiAgICByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuICBhcGlfaW5vcmRlcihhcGkpIDo6XG4gICAgcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZV9nYXRlZCBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cblxuZnVuY3Rpb24gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YikgOjpcbiAgY29uc3QgcGZ4ID0gYXBpLm9wX3ByZWZpeCB8fCAncnBjXydcbiAgY29uc3QgbG9va3VwX29wID0gYXBpLm9wX2xvb2t1cFxuICAgID8gb3AgPT4gYXBpLm9wX2xvb2t1cChwZnggKyBvcCwgZXAsIGh1YilcbiAgICA6ICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcGlcbiAgICA/IG9wID0+IGFwaShwZnggKyBvcCwgZXAsIGh1YilcbiAgICA6IG9wID0+IDo6XG4gICAgICAgIGNvbnN0IGZuID0gYXBpW3BmeCArIG9wXVxuICAgICAgICByZXR1cm4gZm4gPyBmbi5iaW5kKGFwaSkgOiBmblxuXG4gIHJldHVybiBPYmplY3QuY3JlYXRlIEAgcnBjX2FwaSwgQHt9XG4gICAgbG9va3VwX29wOiBAe30gdmFsdWU6IGxvb2t1cF9vcFxuICAgIGVycl9mcm9tOiBAe30gdmFsdWU6IGVwLmVwX3NlbGYoKVxuXG5cbmNvbnN0IHJwY19hcGkgPSBAOlxuICBhc3luYyBpbnZva2Uoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgaW52b2tlX2dhdGVkKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IFByb21pc2UucmVzb2x2ZSh0aGlzLmdhdGUpXG4gICAgICAudGhlbiBAICgpID0+IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgdGhpcy5nYXRlID0gcmVzLnRoZW4obm9vcCwgbm9vcClcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgcmVzb2x2ZV9vcChzZW5kZXIsIG9wKSA6OlxuICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Ygb3AgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdJbnZhbGlkIG9wZXJhdGlvbicsIGNvZGU6IDQwMFxuICAgICAgcmV0dXJuXG5cbiAgICB0cnkgOjpcbiAgICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMubG9va3VwX29wKG9wKVxuICAgICAgaWYgISBhcGlfZm4gOjpcbiAgICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnVW5rbm93biBvcGVyYXRpb24nLCBjb2RlOiA0MDRcbiAgICAgIHJldHVybiBhcGlfZm5cbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6IGBJbnZhbGlkIG9wZXJhdGlvbjogJHtlcnIubWVzc2FnZX1gLCBjb2RlOiA1MDBcblxuICBhc3luYyBhbnN3ZXIoc2VuZGVyLCBhcGlfZm4sIGNiKSA6OlxuICAgIHRyeSA6OlxuICAgICAgdmFyIGFuc3dlciA9IGNiID8gYXdhaXQgY2IoYXBpX2ZuKSA6IGF3YWl0IGFwaV9mbigpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbSwgZXJyb3I6IGVyclxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiBzZW5kZXIucmVwbHlFeHBlY3RlZCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogYW5zd2VyXG4gICAgcmV0dXJuIHRydWVcblxuXG5mdW5jdGlvbiBub29wKCkge31cblxuIiwiaW1wb3J0IHthZGRfZXBfa2luZCwgZXBfcHJvdG99IGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIHNlcnZlcihvbl9pbml0KSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIG9uX2luaXRcblxuZXhwb3J0ICogZnJvbSAnLi9jbGllbnQuanN5J1xuZXhwb3J0ICogZnJvbSAnLi9hcGkuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBlcF9wcm90b1xuIiwiaW1wb3J0IGVwX3Byb3RvIGZyb20gJy4vZXBfa2luZHMvaW5kZXguanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgcGx1Z2luX25hbWU6ICdlbmRwb2ludCdcbiAgcHJvdG9jb2xzOiAncHJvdG9jb2xzJ1xuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcblxuICBvbl9tc2coe21zZywgcmVwbHksIGluZm99KSA6OlxuICAgIGNvbnNvbGUud2FybiBAICdFTkRQT0lOVCBNU0c6JywgQHt9IG1zZywgcmVwbHksIGluZm9cbiAgb25fZXJyb3IoZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnJcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIGNvbnNvbGUuZXJyb3IgQCBgRU5EUE9JTlQgU0hVVERPV046ICR7ZXJyLm1lc3NhZ2V9YFxuXG4gIHN1YmNsYXNzKGNsYXNzZXMpIDo6XG4gICAgLy9jb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgY3JlYXRlTWFwXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIGlmIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBwbHVnaW5fb3B0aW9ucy5lcF9raW5kc1xuXG4gIGxldCBlbmRwb2ludF9wbHVnaW5cbiAgcmV0dXJuIEA6XG4gICAgb3JkZXI6IDFcbiAgICBzdWJjbGFzc1xuICAgIHBvc3QoaHViKSA6OlxuICAgICAgcmV0dXJuIGh1YltwbHVnaW5fb3B0aW9ucy5wbHVnaW5fbmFtZV0gPSBlbmRwb2ludF9wbHVnaW4oaHViKVxuXG5cbiAgZnVuY3Rpb24gZ2V0X3Byb3RvY29scyhodWJfcHJvdG90eXBlKSA6OlxuICAgIGNvbnN0IHJlcyA9IHBsdWdpbl9vcHRpb25zLnByb3RvY29sc1xuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgcmVzIDo6XG4gICAgICByZXR1cm4gaHViX3Byb3RvdHlwZVtyZXNdXG4gICAgZWxzZSBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgcmVzIDo6XG4gICAgICByZXR1cm4gcGx1Z2luX29wdGlvbnMucHJvdG9jb2xzIEBcbiAgICAgICAgaHViX3Byb3RvdHlwZS5wcm90b2NvbHMsIGh1Yl9wcm90b3R5cGVcbiAgICBlbHNlIGlmIG51bGwgPT0gcmVzIDo6XG4gICAgICByZXR1cm4gaHViX3Byb3RvdHlwZS5wcm90b2NvbHNcbiAgICBlbHNlIHJldHVybiByZXNcblxuXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gZ2V0X3Byb3RvY29scyBAIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4OiBNc2dDdHhfcGl9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuXG4gICAgZW5kcG9pbnRfcGx1Z2luID0gZnVuY3Rpb24gKGh1YikgOjpcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBodWIuY29ubmVjdF9zZWxmKClcbiAgICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eF9waS5mb3JIdWIoaHViLCBjaGFubmVsKVxuXG4gICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YgQCBlbmRwb2ludCwgZXBfcHJvdG9cbiAgICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGVuZHBvaW50LCBjcmVhdGUsIE1zZ0N0eFxuICAgICAgcmV0dXJuIGVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcHJvdG9jb2xzLnJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQgQCBpZCwgTXNnQ3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQFxuICAgICAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIG9uX2luaXRcbiAgICAgICAgICAgICAgPyBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgICAgIDogb25faW5pdFxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICAvLyBBbGxvdyBmb3IgYm90aCBpbnRlcm5hbCBhbmQgZXh0ZXJuYWwgZXJyb3IgaGFuZGxpbmcgYnkgZm9ya2luZyByZWFkeS5jYXRjaFxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PiBoYW5kbGVycy5vbl9lcnJvciBAIGVyciwgQHt9IHpvbmU6J29uX3JlYWR5J1xuXG4gICAgICAgIDo6XG4gICAgICAgICAgY29uc3QgZXBfdGd0ID0gZXAuZXBfc2VsZigpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuIl0sIm5hbWVzIjpbIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJpbmJvdW5kIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiZW5kcG9pbnQiLCJodWIiLCJpZF90YXJnZXQiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJyb3V0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fbXNnIiwib25fZXJyb3IiLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJlcnIiLCJleHRyYSIsImFzc2lnbiIsImJpbmRTaW5rIiwicGt0IiwicmVjdl9tc2ciLCJ0eXBlIiwidW5kZWZpbmVkIiwiem9uZSIsIm1zZyIsInRlcm1pbmF0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJlcF9lbmNvZGUiLCJpZF9yb3V0ZXIiLCJhc19qc29uX3VucGFjayIsIm1zZ19jdHhfdG8iLCJ4Zm9ybUJ5S2V5IiwiT2JqZWN0IiwiY3JlYXRlIiwidG9rZW4iLCJ2IiwiZnJvbV9jdHgiLCJlcF9kZWNvZGUiLCJqc29uX3VucGFja194Zm9ybSIsIm1zZ2lkIiwiYXNFbmRwb2ludElkIiwiZXBfdGd0IiwiZmFzdCIsImluaXQiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZ2V0Iiwic2VuZCIsInF1ZXJ5IiwidmFsdWUiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwicmVzIiwic3BsaXQiLCJwYXJzZUludCIsInN6IiwiSlNPTiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJrZXkiLCJ4Zm4iLCJzZXQiLCJ2Zm4iLCJNc2dDdHgiLCJyYW5kb21faWQiLCJjb2RlY3MiLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJjaGFuIiwiZnJvbV9pZCIsImZyZWV6ZSIsImN0eCIsIl9pbnZva2VfZXgiLCJfbXNnQ29kZWNzIiwiY29udHJvbCIsInBpbmciLCJhcmdzIiwiX2NvZGVjIiwicmVwbHkiLCJzdHJlYW0iLCJmbk9yS2V5IiwiaW52b2tlIiwib2JqIiwiYXNzZXJ0TW9uaXRvciIsInRoZW4iLCJwX3NlbnQiLCJpbml0UmVwbHkiLCJ0byIsInRndCIsIkVycm9yIiwic2VsZiIsImNsb25lIiwidG9fdGd0IiwicmVwbHlfaWQiLCJsZW5ndGgiLCJ3aXRoIiwiY2hlY2tNb25pdG9yIiwib3B0aW9ucyIsImFjdGl2ZSIsIm1vbml0b3IiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZG9uZSIsInRkIiwidGlkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY29kZWMiLCJjaGVja1BpbmciLCJzZXRJbnRlcnZhbCIsInVucmVmIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwiVHlwZUVycm9yIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJkZWZhdWx0IiwicF9yZXBseSIsInRpbWVvdXQiLCJSZXBseVRpbWVvdXQiLCJzZXRUaW1lb3V0IiwibXNfdGltZW91dCIsIkVuZHBvaW50Iiwic3ViY2xhc3MiLCJleHRlbnNpb25zIiwiZXBfc2VsZiIsInRvSlNPTiIsIm1zZ19jdHgiLCJpbml0TXNnQ3R4IiwiTWFwIiwiY3JlYXRlTWFwIiwid2l0aEVuZHBvaW50Iiwic2luayIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIkRhdGUiLCJub3ciLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwiaW5mbyIsInJtc2ciLCJyZWN2Q3RybCIsInJlY3ZNc2ciLCJyc3RyZWFtIiwicmVjdlN0cmVhbSIsImlzX3JlcGx5Iiwic2VuZGVyIiwiYXNfc2VuZGVyIiwid2FybiIsImluaXRSZXBseVByb21pc2UiLCJjYXRjaCIsIndpdGhSZWplY3RUaW1lb3V0IiwiZGVsZXRlIiwiZXBfcHJvdG8iLCJnZXRQcm90b3R5cGVPZiIsIl91bndyYXBfIiwiYWRkX2VwX2tpbmQiLCJraW5kcyIsImNsaWVudEVuZHBvaW50Iiwib25fY2xpZW50IiwidGFyZ2V0IiwiYXBpIiwiZXBfYXBpIiwiYXBpX3BhcmFsbGVsIiwiZXAiLCJlcF9jbGllbnRfYXBpIiwib25fcmVhZHkiLCJfcmVzb2x2ZSIsIl9yZWplY3QiLCJycGMiLCJhcGlfYmluZF9ycGMiLCJvcCIsImFwaV9mbiIsImt3IiwiaW52b2tlX2dhdGVkIiwicGZ4Iiwib3BfcHJlZml4IiwibG9va3VwX29wIiwib3BfbG9va3VwIiwiZm4iLCJiaW5kIiwicnBjX2FwaSIsImNiIiwicmVzb2x2ZV9vcCIsImFuc3dlciIsImdhdGUiLCJub29wIiwiZXJyX2Zyb20iLCJtZXNzYWdlIiwiY29kZSIsImVycm9yIiwicmVwbHlFeHBlY3RlZCIsIm9uX2luaXQiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiY2xhc3NlcyIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsImVwX2tpbmRzIiwiZW5kcG9pbnRfcGx1Z2luIiwicGx1Z2luX25hbWUiLCJnZXRfcHJvdG9jb2xzIiwiaHViX3Byb3RvdHlwZSIsInByb3RvY29scyIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiTXNnQ3R4X3BpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiY29ubmVjdF9zZWxmIiwic2V0UHJvdG90eXBlT2YiLCJ0YXJnZXRzIiwiaGFzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJyZWdpc3RlciJdLCJtYXBwaW5ncyI6IkFBQWUsTUFBTUEsSUFBTixDQUFXO1NBQ2pCQyxZQUFQLENBQW9CLEVBQUNDLE9BQUQsRUFBcEIsRUFBK0I7VUFDdkJGLElBQU4sU0FBbUIsSUFBbkIsQ0FBd0I7U0FDbkJHLFNBQUwsQ0FBZUMsU0FBZixHQUEyQkYsT0FBM0I7V0FDT0YsSUFBUDs7O1dBRU9LLFFBQVQsRUFBbUJDLEdBQW5CLEVBQXdCQyxTQUF4QixFQUFtQ0MsUUFBbkMsRUFBNkM7VUFDckNDLGFBQWEsTUFBTUgsSUFBSUksTUFBSixDQUFXQyxnQkFBWCxDQUE0QkosU0FBNUIsQ0FBekI7O1FBRUlHLE1BQUosQ0FBV0UsY0FBWCxDQUE0QkwsU0FBNUIsRUFDRSxLQUFLTSxhQUFMLENBQXFCUixRQUFyQixFQUErQkksVUFBL0IsRUFBMkNELFFBQTNDLENBREY7V0FFTyxJQUFQOzs7Z0JBRVlILFFBQWQsRUFBd0JJLFVBQXhC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
