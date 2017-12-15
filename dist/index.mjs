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
    xformByKey[token] = v => this.from_ctx(ep_decode(v, true), msg_ctx_to);
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
function ep_decode(v, inc_extra) {
  const sz_id = 'string' === typeof v ? v.split(token)[1] : v[token];
  if (!sz_id) {
    return;
  }

  let [r, t] = sz_id.split('~');
  if (undefined === t) {
    return;
  }
  r = 0 | parseInt(r, 36);
  t = 0 | parseInt(t, 36);

  const id = { id_router: r, id_target: t };
  if (inc_extra && 'object' === typeof v) {
    Object.assign(id, v);
    delete id[token];
  }
  return id;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2V4dGVuc2lvbnMuanN5IiwiLi4vY29kZS9lcF9raW5kcy9jbGllbnQuanN5IiwiLi4vY29kZS9lcF9raW5kcy9hcGkuanN5IiwiLi4vY29kZS9lcF9raW5kcy9pbmRleC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gIC8vLy8gRW5kcG9pbnQgYmluZFNpbmsoKSByZXNwb25zaWJpbGl0aWVzXG4gIC8vIGJ5X21zZ2lkOiBuZXcgTWFwKClcbiAgLy8ganNvbl91bnBhY2soc3opIDo6IHJldHVybiBKU09OLnBhcnNlKHN6KVxuICAvLyByZWN2Q3RybChtc2csIGluZm8pIDo6XG4gIC8vIHJlY3ZNc2cobXNnLCBpbmZvKSA6OiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAvLyByZWN2U3RyZWFtKG1zZywgaW5mbykgOjpcbiAgLy8gcmVjdlN0cmVhbURhdGEocnN0cmVhbSwgaW5mbykgOjpcblxuIiwiZXhwb3J0IGRlZmF1bHQgRVBUYXJnZXRcbmV4cG9ydCBjbGFzcyBFUFRhcmdldCA6OlxuICBjb25zdHJ1Y3RvcihpZCkgOjogdGhpcy5pZCA9IGlkXG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYsIHRydWUpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlkLmFzRW5kcG9pbnRJZCA6OlxuICAgICAgaWQgPSBpZC5hc0VuZHBvaW50SWQoKVxuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgc2VuZDogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnNlbmRcbiAgICAgIHF1ZXJ5OiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkucXVlcnlcbiAgICAgIHJlcGx5RXhwZWN0ZWQ6IEB7fSB2YWx1ZTogISEgbXNnaWRcblxuXG5jb25zdCB0b2tlbiA9ICdcXHUwM0UwJyAvLyAnz6AnXG5FUFRhcmdldC50b2tlbiA9IHRva2VuXG5cbkVQVGFyZ2V0LmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShpZCwgc2ltcGxlKSA6OlxuICBsZXQge2lkX3JvdXRlcjpyLCBpZF90YXJnZXQ6dH0gPSBpZFxuICByID0gKHI+Pj4wKS50b1N0cmluZygzNilcbiAgdCA9ICh0Pj4+MCkudG9TdHJpbmcoMzYpXG4gIGlmIHNpbXBsZSA6OlxuICAgIHJldHVybiBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuXG4gIGNvbnN0IHJlcyA9IEB7fSBbdG9rZW5dOiBgJHtyfX4ke3R9YFxuICBPYmplY3QuYXNzaWduIEAgcmVzLCBpZFxuICBkZWxldGUgcmVzLmlkX3JvdXRlcjsgZGVsZXRlIHJlcy5pZF90YXJnZXRcbiAgcmV0dXJuIHJlc1xuXG5cbkVQVGFyZ2V0LmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2LCBpbmNfZXh0cmEpIDo6XG4gIGNvbnN0IHN6X2lkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBzel9pZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBzel9pZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICBjb25zdCBpZCA9IEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuICBpZiBpbmNfZXh0cmEgJiYgJ29iamVjdCcgPT09IHR5cGVvZiB2IDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGlkLCB2XG4gICAgZGVsZXRlIGlkW3Rva2VuXVxuICByZXR1cm4gaWRcblxuXG5FUFRhcmdldC5qc29uX3VucGFja194Zm9ybSA9IGpzb25fdW5wYWNrX3hmb3JtXG5leHBvcnQgZnVuY3Rpb24ganNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSkgOjpcbiAgcmV0dXJuIHN6ID0+IEpTT04ucGFyc2UgQCBzeiwgcmV2aXZlcigpXG5cbiAgZnVuY3Rpb24gcmV2aXZlcigpIDo6XG4gICAgY29uc3QgcmVnID0gbmV3IFdlYWtNYXAoKVxuICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlKSA6OlxuICAgICAgY29uc3QgeGZuID0geGZvcm1CeUtleVtrZXldXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHhmbiA6OlxuICAgICAgICByZWcuc2V0KHRoaXMsIHhmbilcbiAgICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICAgIGlmICdvYmplY3QnID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgY29uc3QgdmZuID0gcmVnLmdldCh2YWx1ZSlcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB2Zm4gOjpcbiAgICAgICAgICByZXR1cm4gdmZuIEAgdmFsdWVcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4iLCJpbXBvcnQge2VwX2RlY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIHN0YXRpYyBmb3JIdWIoaHViLCBjaGFubmVsKSA6OlxuICAgIGNvbnN0IHtzZW5kUmF3fSA9IGNoYW5uZWxcbiAgICBhc3luYyBmdW5jdGlvbiBjaGFuX3NlbmQocGt0KSA6OlxuICAgICAgYXdhaXQgc2VuZFJhdyhwa3QpXG4gICAgICByZXR1cm4gdHJ1ZVxuXG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUuY2hhbiA9IE9iamVjdC5jcmVhdGUgQFxuICAgICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuIHx8IG51bGxcbiAgICAgIEB7fSBzZW5kOiBAe30gdmFsdWU6IGNoYW5fc2VuZFxuXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG5cbiAgY29uc3RydWN0b3IoaWQpIDo6XG4gICAgaWYgbnVsbCAhPSBpZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGlkXG4gICAgICBjb25zdCBmcm9tX2lkID0gT2JqZWN0LmZyZWV6ZSBAOiBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgdGhpcy5jdHggPSBAe30gZnJvbV9pZFxuXG5cbiAgd2l0aEVuZHBvaW50KGVuZHBvaW50KSA6OlxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgZW5kcG9pbnQ6IEB7fSB2YWx1ZTogZW5kcG9pbnRcbiAgICAgIGNoYW46IEB7fSB2YWx1ZTogT2JqZWN0LmNyZWF0ZSBAIHRoaXMuY2hhblxuXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlbilcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MpXG4gIHNlbmRRdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjLnN0cmVhbSwgYXJnc1xuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWNba2V5XSwgYXJnc1xuICBiaW5kSW52b2tlKGZuT3JLZXksIHRva2VuKSA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBmbk9yS2V5IDo6IGZuT3JLZXkgPSB0aGlzLl9jb2RlY1xuICAgIHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGZuT3JLZXksIGFyZ3MsIHRva2VuKVxuXG4gIF9pbnZva2VfZXgoaW52b2tlLCBhcmdzLCB0b2tlbikgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgaWYgbnVsbCA9PSB0b2tlbiA6OiB0b2tlbiA9IG9iai50b2tlblxuICAgIGVsc2Ugb2JqLnRva2VuID0gdG9rZW5cbiAgICBpZiB0cnVlID09PSB0b2tlbiA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuXG4gICAgY29uc3QgcmVzID0gaW52b2tlIEAgdGhpcy5jaGFuLCBvYmosIC4uLmFyZ3NcbiAgICBpZiAhIHRva2VuIHx8ICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXMudGhlbiA6OiByZXR1cm4gcmVzXG5cbiAgICBsZXQgcF9zZW50ICA9IHJlcy50aGVuKClcbiAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIHRoaXMpXG4gICAgcF9zZW50ID0gcF9zZW50LnRoZW4gQCAoKSA9PiBAOiByZXBseVxuICAgIHBfc2VudC5yZXBseSA9IHJlcGx5XG4gICAgcmV0dXJuIHBfc2VudFxuXG4gIGdldCB0bygpIDo6IHJldHVybiAodGd0LCAuLi5hcmdzKSA9PiA6OlxuICAgIGlmIG51bGwgPT0gdGd0IDo6IHRocm93IG5ldyBFcnJvciBAIGBOdWxsIHRhcmdldCBlbmRwb2ludGBcblxuICAgIGNvbnN0IHNlbGYgPSB0aGlzLmNsb25lKClcblxuICAgIGNvbnN0IGN0eCA9IHNlbGYuY3R4XG4gICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgIGN0eC5pZF90YXJnZXQgPSB0Z3RcbiAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICBlbHNlIDo6XG4gICAgICBjdHgudG9fdGd0ID0gdGd0XG4gICAgICB0Z3QgPSBlcF9kZWNvZGUodGd0KSB8fCB0Z3RcbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IGlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IHJlcGx5X2lkLmlkX3JvdXRlclxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gMCA9PT0gYXJncy5sZW5ndGggPyBzZWxmIDogc2VsZi53aXRoIEAgLi4uYXJnc1xuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmIHRydWUgPT09IHRndCB8fCBmYWxzZSA9PT0gdGd0IDo6XG4gICAgICAgIGN0eC50b2tlbiA9IHRndFxuICAgICAgZWxzZSBpZiBudWxsICE9IHRndCA6OlxuICAgICAgICBjb25zdCB7dG9rZW4sIG1zZ2lkfSA9IHRndFxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBmcmVxdWVudGx5IHVzZWQgZmFzdC1wYXRoXG4gICAgY29uc3Qgc2VuZCA9IG1zZ0NvZGVjcy5kZWZhdWx0LnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgZmFzdDogQHt9IGdldCgpIDo6IHJldHVybiBAOlxuICAgICAgICBzZW5kOiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KHNlbmQsIGFyZ3MpXG4gICAgICAgIHNlbmRRdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChzZW5kLCBhcmdzLCB0cnVlKVxuICAgICAgICBxdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChzZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gICAgcmV0dXJuIHRoaXNcblxuXG4gIHdpdGhSZWplY3RUaW1lb3V0KHBfcmVwbHkpIDo6XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHBfcmVwbHkudGhlbiBAIHJlc29sdmUsIHJlamVjdFxuICAgICAgcF9yZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG5cbiAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcbiAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy5tc190aW1lb3V0KVxuICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG5cbiAgICAgIGZ1bmN0aW9uIGNsZWFyKCkgOjogY2xlYXJUaW1lb3V0IEAgdGlkXG5cblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIE1zZ0N0eC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXQsIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IHtFUFRhcmdldCwgZXBfZW5jb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5lcF9zZWxmKCkudG9KU09OKClcbiAgZXBfc2VsZigpIDo6IHJldHVybiBuZXcgdGhpcy5FUFRhcmdldCh0aGlzLmlkKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuXG4gIGNvbnN0cnVjdG9yKGlkLCBNc2dDdHgpIDo6XG4gICAgY29uc3QgbXNnX2N0eCA9IHRoaXMuaW5pdE1zZ0N0eCBAIGlkLCBNc2dDdHhcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgaWQ6IEB7fSB2YWx1ZTogaWRcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgudG9cblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBpbml0TXNnQ3R4KGlkLCBNc2dDdHgpIDo6XG4gICAgcmV0dXJuIG5ldyBNc2dDdHgoaWQpLndpdGhFbmRwb2ludCh0aGlzKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBieV90b2tlbjogQHt9IHZhbHVlOiBieV90b2tlblxuICAgICAgYnlfdHJhZmZpYzogQHt9IHZhbHVlOiBieV90cmFmZmljXG5cbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG4gICAgICBqc29uX3VucGFjazogdGhpcy5FUFRhcmdldC5hc19qc29uX3VucGFjayh0aGlzLnRvKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cgfHwge21zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIGFzX3RhcmdldChpZCkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvXG4gIGFzX3NlbmRlcih7ZnJvbV9pZDppZCwgbXNnaWR9KSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG8sIG1zZ2lkXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICByZWN2TXNnKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCBzZW5kZXI6IHRoaXMuYXNfc2VuZGVyKGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHRoaXMucGFydHMuam9pbignJyk7IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgcF9zZW50LCBtc2dfY3R4XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLmJ5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICBsZXQgcmVwbHkgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLmJ5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBwX3NlbnQuY2F0Y2ggQCByZWplY3RcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIHJlcGx5ID0gbXNnX2N0eC53aXRoUmVqZWN0VGltZW91dChyZXBseSlcblxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gdGhpcy5ieV90b2tlbi5kZWxldGUgQCB0b2tlblxuICAgIHJlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcbiAgICByZXR1cm4gcmVwbHlcblxuRW5kcG9pbnQucHJvdG90eXBlLkVQVGFyZ2V0ID0gRVBUYXJnZXRcblxuIiwiZXhwb3J0IGNvbnN0IGVwX3Byb3RvID0gT2JqZWN0LmNyZWF0ZSBAXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZiBAIGZ1bmN0aW9uKCl7fVxuICBAe30gX3Vud3JhcF86IEB7fSBnZXQ6IF91bndyYXBfXG5cbmZ1bmN0aW9uIF91bndyYXBfKCkgOjpcbiAgY29uc3Qgc2VsZiA9IE9iamVjdC5jcmVhdGUodGhpcylcbiAgc2VsZi5lbmRwb2ludCA9IHYgPT4gdlxuICByZXR1cm4gc2VsZlxuXG5leHBvcnQgZnVuY3Rpb24gYWRkX2VwX2tpbmQoa2luZHMpIDo6XG4gIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywga2luZHNcbmV4cG9ydCBkZWZhdWx0IGFkZF9lcF9raW5kXG5cbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBjbGllbnQoLi4uYXJncykgOjpcbiAgICBpZiAxID09PSBhcmdzLmxlbmd0aCAmJiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXJnc1swXSA6OlxuICAgICAgcmV0dXJuIHRoaXMuY2xpZW50RW5kcG9pbnQgQCBhcmdzWzBdXG5cbiAgICBjb25zdCBtc2dfY3R4ID0gbmV3IHRoaXMuTXNnQ3R4KClcbiAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGggPyBtc2dfY3R4LnRvKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4gIGNsaWVudEVuZHBvaW50KG9uX2NsaWVudCkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpXG4gICAgY29uc3QgZXBfdGd0ID0gdGhpcy5lbmRwb2ludCBAIHRhcmdldFxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG4gIGNsaWVudF9hcGkob25fY2xpZW50LCBhcGkpIDo6XG4gICAgY29uc3QgdGFyZ2V0ID0gY2xpZW50RW5kcG9pbnQob25fY2xpZW50KVxuICAgIGNvbnN0IGVwX2FwaSA9IHRoaXMuX3Vud3JhcF8uYXBpX3BhcmFsbGVsKGFwaSlcbiAgICBjb25zdCBlcF90Z3QgPSB0aGlzLmVuZHBvaW50IEAgKGVwLCBodWIpID0+XG4gICAgICBPYmplY3QuYXNzaWduIEAgdGFyZ2V0LCBlcF9hcGkoZXAsIGh1YilcbiAgICByZXR1cm4gdGFyZ2V0LmRvbmVcblxuXG5jb25zdCBlcF9jbGllbnRfYXBpID0gQHt9XG4gIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgdGhpcy5fcmVzb2x2ZSBAIGF3YWl0IHRoaXMub25fY2xpZW50KGVwLCBodWIpXG4gICAgYXdhaXQgZXAuc2h1dGRvd24oKVxuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgdGhpcy5fcmVqZWN0KGVycilcbiAgb25fc2h1dGRvd24oZXAsIGVycikgOjpcbiAgICBlcnIgPyB0aGlzLl9yZWplY3QoZXJyKSA6IHRoaXMuX3Jlc29sdmUoKVxuXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fY2xpZW50KSA6OlxuICBjb25zdCB0YXJnZXQgPSBPYmplY3QuY3JlYXRlIEAgZXBfY2xpZW50X2FwaVxuICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb25fY2xpZW50IDo6XG4gICAgaWYgb25fY2xpZW50Lm9uX3JlYWR5IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYFVzZSBcIm9uX2NsaWVudCgpXCIgaW5zdGVhZCBvZiBcIm9uX3JlYWR5KClcIiB3aXRoIGNsaWVudEVuZHBvaW50YFxuICAgIE9iamVjdC5hc3NpZ24gQCB0YXJnZXQsIG9uX2NsaWVudFxuICBlbHNlIDo6XG4gICAgdGFyZ2V0Lm9uX2NsaWVudCA9IG9uX2NsaWVudFxuXG4gIHRhcmdldC5kb25lID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgIHRhcmdldC5fcmVzb2x2ZSA9IHJlc29sdmVcbiAgICB0YXJnZXQuX3JlamVjdCA9IHJlamVjdFxuICByZXR1cm4gdGFyZ2V0XG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgYXBpX2JpbmRfcnBjXG4gIGFwaShhcGkpIDo6IHJldHVybiB0aGlzLmFwaV9wYXJhbGxlbChhcGkpXG4gIGFwaV9wYXJhbGxlbChhcGkpIDo6XG4gICAgcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZSBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cbiAgYXBpX2lub3JkZXIoYXBpKSA6OlxuICAgIHJldHVybiB0aGlzLmVuZHBvaW50IEAgZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfYmluZF9ycGMoYXBpLCBlcCwgaHViKVxuICAgICAgcmV0dXJuIEB7fSBycGMsXG4gICAgICAgIGFzeW5jIG9uX21zZyh7bXNnLCBzZW5kZXJ9KSA6OlxuICAgICAgICAgIGF3YWl0IHJwYy5pbnZva2VfZ2F0ZWQgQCBzZW5kZXIsIG1zZy5vcCxcbiAgICAgICAgICAgIGFwaV9mbiA9PiBhcGlfZm4obXNnLmt3LCBtc2cuY3R4KVxuXG5cbmZ1bmN0aW9uIGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpIDo6XG4gIGNvbnN0IHBmeCA9IGFwaS5vcF9wcmVmaXggfHwgJ3JwY18nXG4gIGNvbnN0IGxvb2t1cF9vcCA9IGFwaS5vcF9sb29rdXBcbiAgICA/IG9wID0+IGFwaS5vcF9sb29rdXAocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgOiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXBpXG4gICAgPyBvcCA9PiBhcGkocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgOiBvcCA9PiA6OlxuICAgICAgICBjb25zdCBmbiA9IGFwaVtwZnggKyBvcF1cbiAgICAgICAgcmV0dXJuIGZuID8gZm4uYmluZChhcGkpIDogZm5cblxuICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHJwY19hcGksIEB7fVxuICAgIGxvb2t1cF9vcDogQHt9IHZhbHVlOiBsb29rdXBfb3BcbiAgICBlcnJfZnJvbTogQHt9IHZhbHVlOiBlcC5lcF9zZWxmKClcblxuXG5jb25zdCBycGNfYXBpID0gQDpcbiAgYXN5bmMgaW52b2tlKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgcmV0dXJuIGF3YWl0IHJlc1xuXG4gIGFzeW5jIGludm9rZV9nYXRlZChzZW5kZXIsIG9wLCBjYikgOjpcbiAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLnJlc29sdmVfb3AgQCBzZW5kZXIsIG9wXG4gICAgaWYgdW5kZWZpbmVkID09PSBhcGlfZm4gOjogcmV0dXJuXG5cbiAgICBjb25zdCByZXMgPSBQcm9taXNlLnJlc29sdmUodGhpcy5nYXRlKVxuICAgICAgLnRoZW4gQCAoKSA9PiB0aGlzLmFuc3dlciBAIHNlbmRlciwgYXBpX2ZuLCBjYlxuICAgIHRoaXMuZ2F0ZSA9IHJlcy50aGVuKG5vb3AsIG5vb3ApXG4gICAgcmV0dXJuIGF3YWl0IHJlc1xuXG4gIGFzeW5jIHJlc29sdmVfb3Aoc2VuZGVyLCBvcCkgOjpcbiAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIG9wIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnSW52YWxpZCBvcGVyYXRpb24nLCBjb2RlOiA0MDBcbiAgICAgIHJldHVyblxuXG4gICAgdHJ5IDo6XG4gICAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLmxvb2t1cF9vcChvcClcbiAgICAgIGlmICEgYXBpX2ZuIDo6XG4gICAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogJ1Vua25vd24gb3BlcmF0aW9uJywgY29kZTogNDA0XG4gICAgICByZXR1cm4gYXBpX2ZuXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiBgSW52YWxpZCBvcGVyYXRpb246ICR7ZXJyLm1lc3NhZ2V9YCwgY29kZTogNTAwXG5cbiAgYXN5bmMgYW5zd2VyKHNlbmRlciwgYXBpX2ZuLCBjYikgOjpcbiAgICB0cnkgOjpcbiAgICAgIHZhciBhbnN3ZXIgPSBjYiA/IGF3YWl0IGNiKGFwaV9mbikgOiBhd2FpdCBhcGlfZm4oKVxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogZXJyX2Zyb206IHRoaXMuZXJyX2Zyb20sIGVycm9yOiBlcnJcbiAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgaWYgc2VuZGVyLnJlcGx5RXhwZWN0ZWQgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IGFuc3dlclxuICAgIHJldHVybiB0cnVlXG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbiIsImltcG9ydCB7YWRkX2VwX2tpbmQsIGVwX3Byb3RvfSBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBzZXJ2ZXIob25faW5pdCkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBvbl9pbml0XG5cbmV4cG9ydCAqIGZyb20gJy4vY2xpZW50LmpzeSdcbmV4cG9ydCAqIGZyb20gJy4vYXBpLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZXBfcHJvdG9cbiIsImltcG9ydCBlcF9wcm90byBmcm9tICcuL2VwX2tpbmRzL2luZGV4LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIHByb3RvY29sczogJ3Byb3RvY29scydcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG5cbiAgb25fbXNnKHttc2csIHJlcGx5LCBpbmZvfSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCAnRU5EUE9JTlQgTVNHOicsIEB7fSBtc2csIHJlcGx5LCBpbmZvXG4gIG9uX2Vycm9yKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgRVJST1I6JywgZXJyXG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgLy8gcmV0dXJuIGZhbHNlIHRvIHByZXZlbnQgYXV0by1zaHV0ZG93blxuICBvbl9zaHV0ZG93bihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICBjb25zb2xlLmVycm9yIEAgYEVORFBPSU5UIFNIVVRET1dOOiAke2Vyci5tZXNzYWdlfWBcblxuICBzdWJjbGFzcyhjbGFzc2VzKSA6OlxuICAgIC8vY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc30gPSBjbGFzc2VzXG4gICAgcmV0dXJuIGNsYXNzZXNcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIGNyZWF0ZU1hcFxuICAgIG9uX21zZzogZGVmYXVsdF9vbl9tc2dcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICBpZiBwbHVnaW5fb3B0aW9ucy5lcF9raW5kcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywgcGx1Z2luX29wdGlvbnMuZXBfa2luZHNcblxuICBsZXQgZW5kcG9pbnRfcGx1Z2luXG4gIHJldHVybiBAOlxuICAgIG9yZGVyOiAxXG4gICAgc3ViY2xhc3NcbiAgICBwb3N0KGh1YikgOjpcbiAgICAgIHJldHVybiBodWJbcGx1Z2luX29wdGlvbnMucGx1Z2luX25hbWVdID0gZW5kcG9pbnRfcGx1Z2luKGh1YilcblxuXG4gIGZ1bmN0aW9uIGdldF9wcm90b2NvbHMoaHViX3Byb3RvdHlwZSkgOjpcbiAgICBjb25zdCByZXMgPSBwbHVnaW5fb3B0aW9ucy5wcm90b2NvbHNcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHJlcyA6OlxuICAgICAgcmV0dXJuIGh1Yl9wcm90b3R5cGVbcmVzXVxuICAgIGVsc2UgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHJlcyA6OlxuICAgICAgcmV0dXJuIHBsdWdpbl9vcHRpb25zLnByb3RvY29scyBAXG4gICAgICAgIGh1Yl9wcm90b3R5cGUucHJvdG9jb2xzLCBodWJfcHJvdG90eXBlXG4gICAgZWxzZSBpZiBudWxsID09IHJlcyA6OlxuICAgICAgcmV0dXJuIGh1Yl9wcm90b3R5cGUucHJvdG9jb2xzXG4gICAgZWxzZSByZXR1cm4gcmVzXG5cblxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGdldF9wcm90b2NvbHMgQCBGYWJyaWNIdWJfUEkucHJvdG90eXBlXG5cbiAgICBjb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eDogTXNnQ3R4X3BpfSA9XG4gICAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOlxuICAgICAgICBTaW5rOiBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBNc2dDdHg6IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgRW5kcG9pbnQ6IEVuZHBvaW50QmFzZS5zdWJjbGFzcyh7Y3JlYXRlTWFwfSlcblxuICAgIGVuZHBvaW50X3BsdWdpbiA9IGZ1bmN0aW9uIChodWIpIDo6XG4gICAgICBjb25zdCBjaGFubmVsID0gaHViLmNvbm5lY3Rfc2VsZigpXG4gICAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhfcGkuZm9ySHViKGh1YiwgY2hhbm5lbClcblxuICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mIEAgZW5kcG9pbnQsIGVwX3Byb3RvXG4gICAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBlbmRwb2ludCwgY3JlYXRlLCBNc2dDdHhcbiAgICAgIHJldHVybiBlbmRwb2ludFxuXG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBodWIucm91dGVyLnRhcmdldHNcbiAgICAgICAgZG8gdmFyIGlkX3RhcmdldCA9IHByb3RvY29scy5yYW5kb21faWQoKVxuICAgICAgICB3aGlsZSB0YXJnZXRzLmhhcyBAIGlkX3RhcmdldFxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgaWRfdGFyZ2V0LCBvbl9pbml0XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZShpZF90YXJnZXQsIG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGhhbmRsZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKVxuICAgICAgICBjb25zdCBpZCA9IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgICAgIGNvbnN0IGVwID0gbmV3IEVuZHBvaW50IEAgaWQsIE1zZ0N0eFxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEBcbiAgICAgICAgICAgICdmdW5jdGlvbicgPT09IHR5cGVvZiBvbl9pbml0XG4gICAgICAgICAgICAgID8gb25faW5pdChlcCwgaHViKVxuICAgICAgICAgICAgICA6IG9uX2luaXRcbiAgICAgICAgICAudGhlbiBAIF9hZnRlcl9pbml0XG5cbiAgICAgICAgLy8gQWxsb3cgZm9yIGJvdGggaW50ZXJuYWwgYW5kIGV4dGVybmFsIGVycm9yIGhhbmRsaW5nIGJ5IGZvcmtpbmcgcmVhZHkuY2F0Y2hcbiAgICAgICAgcmVhZHkuY2F0Y2ggQCBlcnIgPT4gaGFuZGxlcnMub25fZXJyb3IgQCBlcnIsIEB7fSB6b25lOidvbl9yZWFkeSdcblxuICAgICAgICA6OlxuICAgICAgICAgIGNvbnN0IGVwX3RndCA9IGVwLmVwX3NlbGYoKVxuICAgICAgICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gZXBfdGd0XG5cblxuICAgICAgICBmdW5jdGlvbiBfYWZ0ZXJfaW5pdCh0YXJnZXQpIDo6XG4gICAgICAgICAgaWYgbnVsbCA9PSB0YXJnZXQgOjpcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgZW5kcG9pbnQgaW5pdCB0byByZXR1cm4gYSBjbG9zdXJlIG9yIGludGVyZmFjZWBcblxuICAgICAgICAgIGhhbmRsZXJzLm9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8ICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGFyZ2V0ID8gdGFyZ2V0IDogZGVmYXVsdF9vbl9tc2cpKS5iaW5kKHRhcmdldClcbiAgICAgICAgICBoYW5kbGVycy5vbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQsIGVwKVxuICAgICAgICAgIGhhbmRsZXJzLm9uX3NodXRkb3duID0gKHRhcmdldC5vbl9zaHV0ZG93biB8fCBkZWZhdWx0X29uX3NodXRkb3duKS5iaW5kKHRhcmdldCwgZXApXG5cbiAgICAgICAgICBuZXcgU2luaygpLnJlZ2lzdGVyIEAgZXAsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVyc1xuXG4gICAgICAgICAgcmV0dXJuIHRhcmdldC5vbl9yZWFkeSA/IHRhcmdldC5vbl9yZWFkeShlcCwgaHViKSA6IHRhcmdldFxuXG5cbiJdLCJuYW1lcyI6WyJTaW5rIiwiZm9yUHJvdG9jb2xzIiwiaW5ib3VuZCIsInByb3RvdHlwZSIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaHViIiwiaWRfdGFyZ2V0IiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwicm91dGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX2Vycm9yIiwib25fc2h1dGRvd24iLCJhbGl2ZSIsInByb3RvY29sIiwiaXNBbGl2ZSIsInNodXRkb3duIiwiZXJyIiwiZXh0cmEiLCJhc3NpZ24iLCJiaW5kU2luayIsInBrdCIsInJlY3ZfbXNnIiwidHlwZSIsInVuZGVmaW5lZCIsInpvbmUiLCJtc2ciLCJ0ZXJtaW5hdGUiLCJFUFRhcmdldCIsImlkIiwiZXBfZW5jb2RlIiwiaWRfcm91dGVyIiwiYXNfanNvbl91bnBhY2siLCJtc2dfY3R4X3RvIiwieGZvcm1CeUtleSIsIk9iamVjdCIsImNyZWF0ZSIsInRva2VuIiwidiIsImZyb21fY3R4IiwiZXBfZGVjb2RlIiwianNvbl91bnBhY2tfeGZvcm0iLCJtc2dpZCIsImFzRW5kcG9pbnRJZCIsImVwX3RndCIsImZhc3QiLCJpbml0IiwiZGVmaW5lUHJvcGVydGllcyIsImdldCIsInNlbmQiLCJxdWVyeSIsInZhbHVlIiwic2ltcGxlIiwiciIsInQiLCJ0b1N0cmluZyIsInJlcyIsImluY19leHRyYSIsInN6X2lkIiwic3BsaXQiLCJwYXJzZUludCIsInN6IiwiSlNPTiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJrZXkiLCJ4Zm4iLCJzZXQiLCJ2Zm4iLCJNc2dDdHgiLCJyYW5kb21faWQiLCJjb2RlY3MiLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJjaGFuIiwiZnJvbV9pZCIsImZyZWV6ZSIsImN0eCIsIl9pbnZva2VfZXgiLCJfbXNnQ29kZWNzIiwiY29udHJvbCIsInBpbmciLCJhcmdzIiwiX2NvZGVjIiwicmVwbHkiLCJzdHJlYW0iLCJmbk9yS2V5IiwiaW52b2tlIiwib2JqIiwiYXNzZXJ0TW9uaXRvciIsInRoZW4iLCJwX3NlbnQiLCJpbml0UmVwbHkiLCJ0byIsInRndCIsIkVycm9yIiwic2VsZiIsImNsb25lIiwidG9fdGd0IiwicmVwbHlfaWQiLCJsZW5ndGgiLCJ3aXRoIiwiY2hlY2tNb25pdG9yIiwib3B0aW9ucyIsImFjdGl2ZSIsIm1vbml0b3IiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZG9uZSIsInRkIiwidGlkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY29kZWMiLCJjaGVja1BpbmciLCJzZXRJbnRlcnZhbCIsInVucmVmIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwiVHlwZUVycm9yIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJkZWZhdWx0IiwicF9yZXBseSIsInRpbWVvdXQiLCJSZXBseVRpbWVvdXQiLCJzZXRUaW1lb3V0IiwibXNfdGltZW91dCIsIkVuZHBvaW50Iiwic3ViY2xhc3MiLCJleHRlbnNpb25zIiwiZXBfc2VsZiIsInRvSlNPTiIsIm1zZ19jdHgiLCJpbml0TXNnQ3R4IiwiTWFwIiwiY3JlYXRlTWFwIiwid2l0aEVuZHBvaW50Iiwic2luayIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIkRhdGUiLCJub3ciLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwiaW5mbyIsInJtc2ciLCJyZWN2Q3RybCIsInJlY3ZNc2ciLCJyc3RyZWFtIiwicmVjdlN0cmVhbSIsImlzX3JlcGx5Iiwic2VuZGVyIiwiYXNfc2VuZGVyIiwid2FybiIsImluaXRSZXBseVByb21pc2UiLCJjYXRjaCIsIndpdGhSZWplY3RUaW1lb3V0IiwiZGVsZXRlIiwiZXBfcHJvdG8iLCJnZXRQcm90b3R5cGVPZiIsIl91bndyYXBfIiwiYWRkX2VwX2tpbmQiLCJraW5kcyIsImNsaWVudEVuZHBvaW50Iiwib25fY2xpZW50IiwidGFyZ2V0IiwiYXBpIiwiZXBfYXBpIiwiYXBpX3BhcmFsbGVsIiwiZXAiLCJlcF9jbGllbnRfYXBpIiwib25fcmVhZHkiLCJfcmVzb2x2ZSIsIl9yZWplY3QiLCJycGMiLCJhcGlfYmluZF9ycGMiLCJvcCIsImFwaV9mbiIsImt3IiwiaW52b2tlX2dhdGVkIiwicGZ4Iiwib3BfcHJlZml4IiwibG9va3VwX29wIiwib3BfbG9va3VwIiwiZm4iLCJiaW5kIiwicnBjX2FwaSIsImNiIiwicmVzb2x2ZV9vcCIsImFuc3dlciIsImdhdGUiLCJub29wIiwiZXJyX2Zyb20iLCJtZXNzYWdlIiwiY29kZSIsImVycm9yIiwicmVwbHlFeHBlY3RlZCIsIm9uX2luaXQiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiY2xhc3NlcyIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsImVwX2tpbmRzIiwiZW5kcG9pbnRfcGx1Z2luIiwicGx1Z2luX25hbWUiLCJnZXRfcHJvdG9jb2xzIiwiaHViX3Byb3RvdHlwZSIsInByb3RvY29scyIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiTXNnQ3R4X3BpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiY29ubmVjdF9zZWxmIiwic2V0UHJvdG90eXBlT2YiLCJ0YXJnZXRzIiwiaGFzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJyZWdpc3RlciJdLCJtYXBwaW5ncyI6IkFBQWUsTUFBTUEsSUFBTixDQUFXO1NBQ2pCQyxZQUFQLENBQW9CLEVBQUNDLE9BQUQsRUFBcEIsRUFBK0I7VUFDdkJGLElBQU4sU0FBbUIsSUFBbkIsQ0FBd0I7U0FDbkJHLFNBQUwsQ0FBZUMsU0FBZixHQUEyQkYsT0FBM0I7V0FDT0YsSUFBUDs7O1dBRU9LLFFBQVQsRUFBbUJDLEdBQW5CLEVBQXdCQyxTQUF4QixFQUFtQ0MsUUFBbkMsRUFBNkM7VUFDckNDLGFBQWEsTUFBTUgsSUFBSUksTUFBSixDQUFXQyxn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
