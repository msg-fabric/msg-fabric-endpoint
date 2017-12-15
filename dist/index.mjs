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

    class MsgCtx extends this {}
    MsgCtx.prototype.chan_send = async pkt => {
      await sendRaw(pkt);
      return true;
    };

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
      endpoint: { value: endpoint } });
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

    const res = invoke(this.chan_send, obj, ...args);
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

  constructor(id, msg_ctx) {
    Object.defineProperties(this, {
      id: { value: id },
      to: { value: msg_ctx.withEndpoint(this).to } });
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
  createRouteCacheMap() {
    return this.createMap();
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
        const msg_ctx = new MsgCtx$$1(id);
        const ep = new Endpoint$$1(id, msg_ctx);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2V4dGVuc2lvbnMuanN5IiwiLi4vY29kZS9lcF9raW5kcy9jbGllbnQuanN5IiwiLi4vY29kZS9lcF9raW5kcy9hcGkuanN5IiwiLi4vY29kZS9lcF9raW5kcy9pbmRleC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gIC8vLy8gRW5kcG9pbnQgYmluZFNpbmsoKSByZXNwb25zaWJpbGl0aWVzXG4gIC8vIGJ5X21zZ2lkOiBuZXcgTWFwKClcbiAgLy8ganNvbl91bnBhY2soc3opIDo6IHJldHVybiBKU09OLnBhcnNlKHN6KVxuICAvLyByZWN2Q3RybChtc2csIGluZm8pIDo6XG4gIC8vIHJlY3ZNc2cobXNnLCBpbmZvKSA6OiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAvLyByZWN2U3RyZWFtKG1zZywgaW5mbykgOjpcbiAgLy8gcmVjdlN0cmVhbURhdGEocnN0cmVhbSwgaW5mbykgOjpcblxuIiwiZXhwb3J0IGRlZmF1bHQgRVBUYXJnZXRcbmV4cG9ydCBjbGFzcyBFUFRhcmdldCA6OlxuICBjb25zdHJ1Y3RvcihpZCkgOjogdGhpcy5pZCA9IGlkXG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlkLmFzRW5kcG9pbnRJZCA6OlxuICAgICAgaWQgPSBpZC5hc0VuZHBvaW50SWQoKVxuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgc2VuZDogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnNlbmRcbiAgICAgIHF1ZXJ5OiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkucXVlcnlcbiAgICAgIHJlcGx5RXhwZWN0ZWQ6IEB7fSB2YWx1ZTogISEgbXNnaWRcblxuXG5jb25zdCB0b2tlbiA9ICdcXHUwM0UwJyAvLyAnz6AnXG5FUFRhcmdldC50b2tlbiA9IHRva2VuXG5cbkVQVGFyZ2V0LmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShpZCwgc2ltcGxlKSA6OlxuICBsZXQge2lkX3JvdXRlcjpyLCBpZF90YXJnZXQ6dH0gPSBpZFxuICByID0gKHI+Pj4wKS50b1N0cmluZygzNilcbiAgdCA9ICh0Pj4+MCkudG9TdHJpbmcoMzYpXG4gIGlmIHNpbXBsZSA6OlxuICAgIHJldHVybiBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuXG4gIGNvbnN0IHJlcyA9IEB7fSBbdG9rZW5dOiBgJHtyfX4ke3R9YFxuICBPYmplY3QuYXNzaWduIEAgcmVzLCBpZFxuICBkZWxldGUgcmVzLmlkX3JvdXRlcjsgZGVsZXRlIHJlcy5pZF90YXJnZXRcbiAgcmV0dXJuIHJlc1xuXG5cbkVQVGFyZ2V0LmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBpZCA9ICdzdHJpbmcnID09PSB0eXBlb2YgdlxuICAgID8gdi5zcGxpdCh0b2tlbilbMV1cbiAgICA6IHZbdG9rZW5dXG4gIGlmICEgaWQgOjogcmV0dXJuXG5cbiAgbGV0IFtyLHRdID0gaWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG5cbkVQVGFyZ2V0Lmpzb25fdW5wYWNrX3hmb3JtID0ganNvbl91bnBhY2tfeGZvcm1cbmV4cG9ydCBmdW5jdGlvbiBqc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KSA6OlxuICByZXR1cm4gc3ogPT4gSlNPTi5wYXJzZSBAIHN6LCByZXZpdmVyKClcblxuICBmdW5jdGlvbiByZXZpdmVyKCkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWUpIDo6XG4gICAgICBjb25zdCB4Zm4gPSB4Zm9ybUJ5S2V5W2tleV1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0geGZuIDo6XG4gICAgICAgIHJlZy5zZXQodGhpcywgeGZuKVxuICAgICAgICByZXR1cm4gdmFsdWVcblxuICAgICAgaWYgJ29iamVjdCcgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICBjb25zdCB2Zm4gPSByZWcuZ2V0KHZhbHVlKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHZmbiA6OlxuICAgICAgICAgIHJldHVybiB2Zm4gQCB2YWx1ZVxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiIsImltcG9ydCB7ZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgc3RhdGljIGZvckh1YihodWIsIGNoYW5uZWwpIDo6XG4gICAgY29uc3Qge3NlbmRSYXd9ID0gY2hhbm5lbFxuXG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUuY2hhbl9zZW5kID0gYXN5bmMgcGt0ID0+IDo6XG4gICAgICBhd2FpdCBzZW5kUmF3KHBrdClcbiAgICAgIHJldHVybiB0cnVlXG5cbiAgICByZXR1cm4gTXNnQ3R4XG5cblxuICBjb25zdHJ1Y3RvcihpZCkgOjpcbiAgICBpZiBudWxsICE9IGlkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gaWRcbiAgICAgIGNvbnN0IGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICB0aGlzLmN0eCA9IEB7fSBmcm9tX2lkXG5cblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlbilcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MpXG4gIHNlbmRRdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjLnN0cmVhbSwgYXJnc1xuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWNba2V5XSwgYXJnc1xuICBiaW5kSW52b2tlKGZuT3JLZXksIHRva2VuKSA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBmbk9yS2V5IDo6IGZuT3JLZXkgPSB0aGlzLl9jb2RlY1xuICAgIHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGZuT3JLZXksIGFyZ3MsIHRva2VuKVxuXG4gIF9pbnZva2VfZXgoaW52b2tlLCBhcmdzLCB0b2tlbikgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgaWYgbnVsbCA9PSB0b2tlbiA6OiB0b2tlbiA9IG9iai50b2tlblxuICAgIGVsc2Ugb2JqLnRva2VuID0gdG9rZW5cbiAgICBpZiB0cnVlID09PSB0b2tlbiA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuXG4gICAgY29uc3QgcmVzID0gaW52b2tlIEAgdGhpcy5jaGFuX3NlbmQsIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIGN0eC50b190Z3QgPSB0Z3RcbiAgICAgIHRndCA9IGVwX2RlY29kZSh0Z3QpIHx8IHRndFxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiAwID09PSBhcmdzLmxlbmd0aCA/IHNlbGYgOiBzZWxmLndpdGggQCAuLi5hcmdzXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgdHJ1ZSA9PT0gdGd0IHx8IGZhbHNlID09PSB0Z3QgOjpcbiAgICAgICAgY3R4LnRva2VuID0gdGd0XG4gICAgICBlbHNlIGlmIG51bGwgIT0gdGd0IDo6XG4gICAgICAgIGNvbnN0IHt0b2tlbiwgbXNnaWR9ID0gdGd0XG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG5cbiAgICAvLyBiaW5kIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBzZW5kID0gbXNnQ29kZWNzLmRlZmF1bHQuc2VuZFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcy5wcm90b3R5cGUsIEA6XG4gICAgICBmYXN0OiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoc2VuZCwgYXJncylcbiAgICAgICAgc2VuZFF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KHNlbmQsIGFyZ3MsIHRydWUpXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KHNlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgICByZXR1cm4gdGhpc1xuXG5cbiAgd2l0aFJlamVjdFRpbWVvdXQocF9yZXBseSkgOjpcbiAgICByZXR1cm4gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgcF9yZXBseS50aGVuIEAgcmVzb2x2ZSwgcmVqZWN0XG4gICAgICBwX3JlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcblxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLm1zX3RpbWVvdXQpXG4gICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcblxuICAgICAgZnVuY3Rpb24gY2xlYXIoKSA6OiBjbGVhclRpbWVvdXQgQCB0aWRcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dCwgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQge0VQVGFyZ2V0LCBlcF9lbmNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIHN1YmNsYXNzKGV4dGVuc2lvbnMpIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgZXh0ZW5zaW9uc1xuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVwX3NlbGYoKS50b0pTT04oKVxuICBlcF9zZWxmKCkgOjogcmV0dXJuIG5ldyB0aGlzLkVQVGFyZ2V0KHRoaXMuaWQpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgpIDo6XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGlkOiBAe30gdmFsdWU6IGlkXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKS50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSb3V0ZUNhY2hlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuICAgICAganNvbl91bnBhY2s6IHRoaXMuRVBUYXJnZXQuYXNfanNvbl91bnBhY2sodGhpcy50bylcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnIHx8IHttc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICBhc190YXJnZXQoaWQpIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50b1xuICBhc19zZW5kZXIoe2Zyb21faWQ6aWQsIG1zZ2lkfSkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvLCBtc2dpZFxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgcmVjdk1zZyhtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mbywgc2VuZGVyOiB0aGlzLmFzX3NlbmRlcihpbmZvKVxuICByZWN2U3RyZWFtKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiB0aGlzLnBhcnRzLmpvaW4oJycpOyAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIHBfc2VudCwgbXNnX2N0eFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgbGV0IHJlcGx5ID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcF9zZW50LmNhdGNoIEAgcmVqZWN0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICByZXBseSA9IG1zZ19jdHgud2l0aFJlamVjdFRpbWVvdXQocmVwbHkpXG5cbiAgICBjb25zdCBjbGVhciA9ICgpID0+IHRoaXMuYnlfdG9rZW4uZGVsZXRlIEAgdG9rZW5cbiAgICByZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG4gICAgcmV0dXJuIHJlcGx5XG5cbkVuZHBvaW50LnByb3RvdHlwZS5FUFRhcmdldCA9IEVQVGFyZ2V0XG4iLCJleHBvcnQgY29uc3QgZXBfcHJvdG8gPSBPYmplY3QuY3JlYXRlIEBcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mIEAgZnVuY3Rpb24oKXt9XG4gIEB7fSBfdW53cmFwXzogQHt9IGdldDogX3Vud3JhcF9cblxuZnVuY3Rpb24gX3Vud3JhcF8oKSA6OlxuICBjb25zdCBzZWxmID0gT2JqZWN0LmNyZWF0ZSh0aGlzKVxuICBzZWxmLmVuZHBvaW50ID0gdiA9PiB2XG4gIHJldHVybiBzZWxmXG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRfZXBfa2luZChraW5kcykgOjpcbiAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBraW5kc1xuZXhwb3J0IGRlZmF1bHQgYWRkX2VwX2tpbmRcblxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGNsaWVudCguLi5hcmdzKSA6OlxuICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICByZXR1cm4gdGhpcy5jbGllbnRFbmRwb2ludCBAIGFyZ3NbMF1cblxuICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgdGhpcy5Nc2dDdHgoKVxuICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cbiAgY2xpZW50RW5kcG9pbnQob25fY2xpZW50KSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KG9uX2NsaWVudClcbiAgICBjb25zdCBlcF90Z3QgPSB0aGlzLmVuZHBvaW50IEAgdGFyZ2V0XG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cbiAgY2xpZW50X2FwaShvbl9jbGllbnQsIGFwaSkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpXG4gICAgY29uc3QgZXBfYXBpID0gdGhpcy5fdW53cmFwXy5hcGlfcGFyYWxsZWwoYXBpKVxuICAgIGNvbnN0IGVwX3RndCA9IHRoaXMuZW5kcG9pbnQgQCAoZXAsIGh1YikgPT5cbiAgICAgIE9iamVjdC5hc3NpZ24gQCB0YXJnZXQsIGVwX2FwaShlcCwgaHViKVxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG5cbmNvbnN0IGVwX2NsaWVudF9hcGkgPSBAe31cbiAgYXN5bmMgb25fcmVhZHkoZXAsIGh1YikgOjpcbiAgICB0aGlzLl9yZXNvbHZlIEAgYXdhaXQgdGhpcy5vbl9jbGllbnQoZXAsIGh1YilcbiAgICBhd2FpdCBlcC5zaHV0ZG93bigpXG4gIG9uX3NlbmRfZXJyb3IoZXAsIGVycikgOjpcbiAgICB0aGlzLl9yZWplY3QoZXJyKVxuICBvbl9zaHV0ZG93bihlcCwgZXJyKSA6OlxuICAgIGVyciA/IHRoaXMuX3JlamVjdChlcnIpIDogdGhpcy5fcmVzb2x2ZSgpXG5cbmV4cG9ydCBmdW5jdGlvbiBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpIDo6XG4gIGNvbnN0IHRhcmdldCA9IE9iamVjdC5jcmVhdGUgQCBlcF9jbGllbnRfYXBpXG4gIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvbl9jbGllbnQgOjpcbiAgICBpZiBvbl9jbGllbnQub25fcmVhZHkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgVXNlIFwib25fY2xpZW50KClcIiBpbnN0ZWFkIG9mIFwib25fcmVhZHkoKVwiIHdpdGggY2xpZW50RW5kcG9pbnRgXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRhcmdldCwgb25fY2xpZW50XG4gIGVsc2UgOjpcbiAgICB0YXJnZXQub25fY2xpZW50ID0gb25fY2xpZW50XG5cbiAgdGFyZ2V0LmRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgdGFyZ2V0Ll9yZXNvbHZlID0gcmVzb2x2ZVxuICAgIHRhcmdldC5fcmVqZWN0ID0gcmVqZWN0XG4gIHJldHVybiB0YXJnZXRcbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBhcGlfYmluZF9ycGNcbiAgYXBpKGFwaSkgOjogcmV0dXJuIHRoaXMuYXBpX3BhcmFsbGVsKGFwaSlcbiAgYXBpX3BhcmFsbGVsKGFwaSkgOjpcbiAgICByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuICBhcGlfaW5vcmRlcihhcGkpIDo6XG4gICAgcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZV9nYXRlZCBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cblxuZnVuY3Rpb24gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YikgOjpcbiAgY29uc3QgcGZ4ID0gYXBpLm9wX3ByZWZpeCB8fCAncnBjXydcbiAgY29uc3QgbG9va3VwX29wID0gYXBpLm9wX2xvb2t1cFxuICAgID8gb3AgPT4gYXBpLm9wX2xvb2t1cChwZnggKyBvcCwgZXAsIGh1YilcbiAgICA6ICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcGlcbiAgICA/IG9wID0+IGFwaShwZnggKyBvcCwgZXAsIGh1YilcbiAgICA6IG9wID0+IDo6XG4gICAgICAgIGNvbnN0IGZuID0gYXBpW3BmeCArIG9wXVxuICAgICAgICByZXR1cm4gZm4gPyBmbi5iaW5kKGFwaSkgOiBmblxuXG4gIHJldHVybiBPYmplY3QuY3JlYXRlIEAgcnBjX2FwaSwgQHt9XG4gICAgbG9va3VwX29wOiBAe30gdmFsdWU6IGxvb2t1cF9vcFxuICAgIGVycl9mcm9tOiBAe30gdmFsdWU6IGVwLmVwX3NlbGYoKVxuXG5cbmNvbnN0IHJwY19hcGkgPSBAOlxuICBhc3luYyBpbnZva2Uoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgaW52b2tlX2dhdGVkKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IFByb21pc2UucmVzb2x2ZSh0aGlzLmdhdGUpXG4gICAgICAudGhlbiBAICgpID0+IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgdGhpcy5nYXRlID0gcmVzLnRoZW4obm9vcCwgbm9vcClcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgcmVzb2x2ZV9vcChzZW5kZXIsIG9wKSA6OlxuICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Ygb3AgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdJbnZhbGlkIG9wZXJhdGlvbicsIGNvZGU6IDQwMFxuICAgICAgcmV0dXJuXG5cbiAgICB0cnkgOjpcbiAgICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMubG9va3VwX29wKG9wKVxuICAgICAgaWYgISBhcGlfZm4gOjpcbiAgICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnVW5rbm93biBvcGVyYXRpb24nLCBjb2RlOiA0MDRcbiAgICAgIHJldHVybiBhcGlfZm5cbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6IGBJbnZhbGlkIG9wZXJhdGlvbjogJHtlcnIubWVzc2FnZX1gLCBjb2RlOiA1MDBcblxuICBhc3luYyBhbnN3ZXIoc2VuZGVyLCBhcGlfZm4sIGNiKSA6OlxuICAgIHRyeSA6OlxuICAgICAgdmFyIGFuc3dlciA9IGNiID8gYXdhaXQgY2IoYXBpX2ZuKSA6IGF3YWl0IGFwaV9mbigpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbSwgZXJyb3I6IGVyclxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiBzZW5kZXIucmVwbHlFeHBlY3RlZCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogYW5zd2VyXG4gICAgcmV0dXJuIHRydWVcblxuXG5mdW5jdGlvbiBub29wKCkge31cblxuIiwiaW1wb3J0IHthZGRfZXBfa2luZCwgZXBfcHJvdG99IGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIHNlcnZlcihvbl9pbml0KSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIG9uX2luaXRcblxuZXhwb3J0ICogZnJvbSAnLi9jbGllbnQuanN5J1xuZXhwb3J0ICogZnJvbSAnLi9hcGkuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBlcF9wcm90b1xuIiwiaW1wb3J0IGVwX3Byb3RvIGZyb20gJy4vZXBfa2luZHMvaW5kZXguanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgcGx1Z2luX25hbWU6ICdlbmRwb2ludCdcbiAgcHJvdG9jb2xzOiAncHJvdG9jb2xzJ1xuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcblxuICBvbl9tc2coe21zZywgcmVwbHksIGluZm99KSA6OlxuICAgIGNvbnNvbGUud2FybiBAICdFTkRQT0lOVCBNU0c6JywgQHt9IG1zZywgcmVwbHksIGluZm9cbiAgb25fZXJyb3IoZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnJcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIGNvbnNvbGUuZXJyb3IgQCBgRU5EUE9JTlQgU0hVVERPV046ICR7ZXJyLm1lc3NhZ2V9YFxuXG4gIHN1YmNsYXNzKGNsYXNzZXMpIDo6XG4gICAgLy9jb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgY3JlYXRlTWFwXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIGlmIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBwbHVnaW5fb3B0aW9ucy5lcF9raW5kc1xuXG4gIGxldCBlbmRwb2ludF9wbHVnaW5cbiAgcmV0dXJuIEA6XG4gICAgb3JkZXI6IDFcbiAgICBzdWJjbGFzc1xuICAgIHBvc3QoaHViKSA6OlxuICAgICAgcmV0dXJuIGh1YltwbHVnaW5fb3B0aW9ucy5wbHVnaW5fbmFtZV0gPSBlbmRwb2ludF9wbHVnaW4oaHViKVxuXG5cbiAgZnVuY3Rpb24gZ2V0X3Byb3RvY29scyhodWJfcHJvdG90eXBlKSA6OlxuICAgIGNvbnN0IHJlcyA9IHBsdWdpbl9vcHRpb25zLnByb3RvY29sc1xuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgcmVzIDo6XG4gICAgICByZXR1cm4gaHViX3Byb3RvdHlwZVtyZXNdXG4gICAgZWxzZSBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgcmVzIDo6XG4gICAgICByZXR1cm4gcGx1Z2luX29wdGlvbnMucHJvdG9jb2xzIEBcbiAgICAgICAgaHViX3Byb3RvdHlwZS5wcm90b2NvbHMsIGh1Yl9wcm90b3R5cGVcbiAgICBlbHNlIGlmIG51bGwgPT0gcmVzIDo6XG4gICAgICByZXR1cm4gaHViX3Byb3RvdHlwZS5wcm90b2NvbHNcbiAgICBlbHNlIHJldHVybiByZXNcblxuXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gZ2V0X3Byb3RvY29scyBAIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4OiBNc2dDdHhfcGl9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuXG4gICAgZW5kcG9pbnRfcGx1Z2luID0gZnVuY3Rpb24gKGh1YikgOjpcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBodWIuY29ubmVjdF9zZWxmKClcbiAgICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eF9waS5mb3JIdWIoaHViLCBjaGFubmVsKVxuXG4gICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YgQCBlbmRwb2ludCwgZXBfcHJvdG9cbiAgICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGVuZHBvaW50LCBjcmVhdGUsIE1zZ0N0eFxuICAgICAgcmV0dXJuIGVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcHJvdG9jb2xzLnJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBpZFxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludCBAIGlkLCBtc2dfY3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQFxuICAgICAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIG9uX2luaXRcbiAgICAgICAgICAgICAgPyBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgICAgIDogb25faW5pdFxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICAvLyBBbGxvdyBmb3IgYm90aCBpbnRlcm5hbCBhbmQgZXh0ZXJuYWwgZXJyb3IgaGFuZGxpbmcgYnkgZm9ya2luZyByZWFkeS5jYXRjaFxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PiBoYW5kbGVycy5vbl9lcnJvciBAIGVyciwgQHt9IHpvbmU6J29uX3JlYWR5J1xuXG4gICAgICAgIDo6XG4gICAgICAgICAgY29uc3QgZXBfdGd0ID0gZXAuZXBfc2VsZigpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuIl0sIm5hbWVzIjpbIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJpbmJvdW5kIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiZW5kcG9pbnQiLCJodWIiLCJpZF90YXJnZXQiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJyb3V0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fbXNnIiwib25fZXJyb3IiLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJlcnIiLCJleHRyYSIsImFzc2lnbiIsImJpbmRTaW5rIiwicGt0IiwicmVjdl9tc2ciLCJ0eXBlIiwidW5kZWZpbmVkIiwiem9uZSIsIm1zZyIsInRlcm1pbmF0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJlcF9lbmNvZGUiLCJpZF9yb3V0ZXIiLCJhc19qc29uX3VucGFjayIsIm1zZ19jdHhfdG8iLCJ4Zm9ybUJ5S2V5IiwiT2JqZWN0IiwiY3JlYXRlIiwidG9rZW4iLCJ2IiwiZnJvbV9jdHgiLCJlcF9kZWNvZGUiLCJqc29uX3VucGFja194Zm9ybSIsIm1zZ2lkIiwiYXNFbmRwb2ludElkIiwiZXBfdGd0IiwiZmFzdCIsImluaXQiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZ2V0Iiwic2VuZCIsInF1ZXJ5IiwidmFsdWUiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwicmVzIiwic3BsaXQiLCJwYXJzZUludCIsInN6IiwiSlNPTiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJrZXkiLCJ4Zm4iLCJzZXQiLCJ2Zm4iLCJNc2dDdHgiLCJyYW5kb21faWQiLCJjb2RlY3MiLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJmcm9tX2lkIiwiZnJlZXplIiwiY3R4IiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJjb250cm9sIiwicGluZyIsImFyZ3MiLCJfY29kZWMiLCJyZXBseSIsInN0cmVhbSIsImZuT3JLZXkiLCJpbnZva2UiLCJvYmoiLCJhc3NlcnRNb25pdG9yIiwidGhlbiIsInBfc2VudCIsImluaXRSZXBseSIsInRvIiwidGd0IiwiRXJyb3IiLCJzZWxmIiwiY2xvbmUiLCJ0b190Z3QiLCJyZXBseV9pZCIsImxlbmd0aCIsIndpdGgiLCJjaGVja01vbml0b3IiLCJvcHRpb25zIiwiYWN0aXZlIiwibW9uaXRvciIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJkb25lIiwidGQiLCJ0aWQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwidW5yZWYiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJUeXBlRXJyb3IiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImRlZmF1bHQiLCJwX3JlcGx5IiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInNldFRpbWVvdXQiLCJtc190aW1lb3V0IiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJlcF9zZWxmIiwidG9KU09OIiwibXNnX2N0eCIsIndpdGhFbmRwb2ludCIsIk1hcCIsImNyZWF0ZU1hcCIsInNpbmsiLCJieV90b2tlbiIsImNyZWF0ZVJlcGx5TWFwIiwiYnlfdHJhZmZpYyIsImNyZWF0ZVRyYWZmaWNNYXAiLCJ0cmFmZmljIiwidHMiLCJEYXRlIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsImluZm8iLCJybXNnIiwicmVjdkN0cmwiLCJyZWN2TXNnIiwicnN0cmVhbSIsInJlY3ZTdHJlYW0iLCJpc19yZXBseSIsInNlbmRlciIsImFzX3NlbmRlciIsIndhcm4iLCJpbml0UmVwbHlQcm9taXNlIiwiY2F0Y2giLCJ3aXRoUmVqZWN0VGltZW91dCIsImRlbGV0ZSIsImVwX3Byb3RvIiwiZ2V0UHJvdG90eXBlT2YiLCJfdW53cmFwXyIsImFkZF9lcF9raW5kIiwia2luZHMiLCJjbGllbnRFbmRwb2ludCIsIm9uX2NsaWVudCIsInRhcmdldCIsImFwaSIsImVwX2FwaSIsImFwaV9wYXJhbGxlbCIsImVwIiwiZXBfY2xpZW50X2FwaSIsIm9uX3JlYWR5IiwiX3Jlc29sdmUiLCJfcmVqZWN0IiwicnBjIiwiYXBpX2JpbmRfcnBjIiwib3AiLCJhcGlfZm4iLCJrdyIsImludm9rZV9nYXRlZCIsInBmeCIsIm9wX3ByZWZpeCIsImxvb2t1cF9vcCIsIm9wX2xvb2t1cCIsImZuIiwiYmluZCIsInJwY19hcGkiLCJjYiIsInJlc29sdmVfb3AiLCJhbnN3ZXIiLCJnYXRlIiwibm9vcCIsImVycl9mcm9tIiwibWVzc2FnZSIsImNvZGUiLCJlcnJvciIsInJlcGx5RXhwZWN0ZWQiLCJvbl9pbml0IiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImNsYXNzZXMiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fbXNnIiwiZGVmYXVsdF9vbl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJlcF9raW5kcyIsImVuZHBvaW50X3BsdWdpbiIsInBsdWdpbl9uYW1lIiwiZ2V0X3Byb3RvY29scyIsImh1Yl9wcm90b3R5cGUiLCJwcm90b2NvbHMiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsIk1zZ0N0eF9waSIsIlNpbmtCYXNlIiwiTXNnQ3R4QmFzZSIsIkVuZHBvaW50QmFzZSIsImNvbm5lY3Rfc2VsZiIsInNldFByb3RvdHlwZU9mIiwidGFyZ2V0cyIsImhhcyIsImlkX3NlbGYiLCJyZWFkeSIsIl9hZnRlcl9pbml0IiwicmVnaXN0ZXIiXSwibWFwcGluZ3MiOiJBQUFlLE1BQU1BLElBQU4sQ0FBVztTQUNqQkMsWUFBUCxDQUFvQixFQUFDQyxPQUFELEVBQXBCLEVBQStCO1VBQ3ZCRixJQUFOLFNBQW1CLElBQW5CLENBQXdCO1NBQ25CRyxTQUFMLENBQWVDLFNBQWYsR0FBMkJGLE9BQTNCO1dBQ09GLElBQVA7OztXQUVPSyxRQUFULEVBQW1CQyxHQUFuQixFQUF3QkMsU0FBeEIsRUFBbUNDLFFBQW5DLEVBQTZDO1VBQ3JDQyxhQUFhLE1BQU1ILElBQUlJLE1BQUosQ0FBV0MsZ0JBQVgsQ0FBNEJKLFNBQTVCLENBQXpCOztRQUVJRyxNQUFKLENBQVdFLGNBQVgsQ0FBNEJMLFNBQTVCLEVBQ0UsS0FBS00sYUFBTCxDQUFxQlIsUUFBckIsRUFBK0JJLFVBQS9CLEVBQTJDRCxRQUEzQyxDQURGO1dBRU8sSUFBUDs7O2dCQUVZSCxRQUFkLEVBQXdCSSxVQUF4QixFQUFvQyxFQUFDSyxNQUFELEVBQVNDLFFBQVQsRUFBbUJDLFdBQW5CLEVBQXBDLEVBQXFFO1FBQy9EQyxRQUFRLElBQVo7VUFDTUMsV0FBVyxLQUFLZCxTQUF0QjtVQUNNZSxVQUFVLE1BQU1GLEtBQXRCO1VBQ01HLFdBQVcsQ0FBQ0MsR0FBRCxFQUFNQyxLQUFOLEtBQWdCO1VBQzVCTCxLQUFILEVBQVc7cUJBQ0tSLGFBQWFRLFFB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
