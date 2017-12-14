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
        init = () => fast = msg_ctx_to(ep_tgt, { msgid }).fast_json;
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

    // bind send_json as frequently used fast-path
    const json_send = msgCodecs.json.send;
    Object.defineProperties(this.prototype, {
      fast_json: { get() {
          return {
            send: (...args) => this._invoke_ex(json_send, args),
            sendQuery: (...args) => this._invoke_ex(json_send, args, true),
            query: (...args) => this._invoke_ex(json_send, args, true).reply };
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
    plugin_name, createMap,
    on_msg: default_on_msg,
    on_error: default_on_error,
    on_shutdown: default_on_shutdown } = plugin_options;

  if (plugin_options.ep_kinds) {
    Object.assign(ep_proto$1, plugin_options.ep_kinds);
  }

  let endpoint_plugin;
  return {
    subclass,
    post(hub) {
      return hub[plugin_name] = endpoint_plugin(hub);
    } };

  function subclass(FabricHub_PI, bases) {
    const protocols = plugin_options.protocols || FabricHub_PI.prototype.protocols;

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2V4dGVuc2lvbnMuanN5IiwiLi4vY29kZS9lcF9raW5kcy9jbGllbnQuanN5IiwiLi4vY29kZS9lcF9raW5kcy9hcGkuanN5IiwiLi4vY29kZS9lcF9raW5kcy9pbmRleC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gIC8vLy8gRW5kcG9pbnQgYmluZFNpbmsoKSByZXNwb25zaWJpbGl0aWVzXG4gIC8vIGJ5X21zZ2lkOiBuZXcgTWFwKClcbiAgLy8ganNvbl91bnBhY2soc3opIDo6IHJldHVybiBKU09OLnBhcnNlKHN6KVxuICAvLyByZWN2Q3RybChtc2csIGluZm8pIDo6XG4gIC8vIHJlY3ZNc2cobXNnLCBpbmZvKSA6OiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAvLyByZWN2U3RyZWFtKG1zZywgaW5mbykgOjpcbiAgLy8gcmVjdlN0cmVhbURhdGEocnN0cmVhbSwgaW5mbykgOjpcblxuIiwiZXhwb3J0IGRlZmF1bHQgRVBUYXJnZXRcbmV4cG9ydCBjbGFzcyBFUFRhcmdldCA6OlxuICBjb25zdHJ1Y3RvcihpZCkgOjogdGhpcy5pZCA9IGlkXG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlkLmFzRW5kcG9pbnRJZCA6OlxuICAgICAgaWQgPSBpZC5hc0VuZHBvaW50SWQoKVxuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RfanNvblxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cblxuRVBUYXJnZXQuanNvbl91bnBhY2tfeGZvcm0gPSBqc29uX3VucGFja194Zm9ybVxuZXhwb3J0IGZ1bmN0aW9uIGpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpIDo6XG4gIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXIoKVxuXG4gIGZ1bmN0aW9uIHJldml2ZXIoKSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBzdGF0aWMgZm9ySHViKGh1YiwgY2hhbm5lbCkgOjpcbiAgICBjb25zdCB7c2VuZFJhd30gPSBjaGFubmVsXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuX3NlbmQgPSBhc3luYyBwa3QgPT4gOjpcbiAgICAgIGF3YWl0IHNlbmRSYXcocGt0KVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIHJldHVybiBNc2dDdHhcblxuXG4gIGNvbnN0cnVjdG9yKGlkKSA6OlxuICAgIGlmIG51bGwgIT0gaWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBpZFxuICAgICAgY29uc3QgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIHRoaXMuY3R4ID0gQHt9IGZyb21faWRcblxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG5cbiAgICBjb25zdCByZXMgPSBpbnZva2UgQCB0aGlzLmNoYW5fc2VuZCwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgdGd0ID0gZXBfZGVjb2RlKHRndCkgfHwgdGd0XG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgc2VuZF9qc29uIGFzIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBqc29uX3NlbmQgPSBtc2dDb2RlY3MuanNvbi5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3RfanNvbjogQHt9IGdldCgpIDo6IHJldHVybiBAOlxuICAgICAgICBzZW5kOiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncylcbiAgICAgICAgc2VuZFF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSlcbiAgICAgICAgcXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gICAgcmV0dXJuIHRoaXNcblxuXG4gIHdpdGhSZWplY3RUaW1lb3V0KHBfcmVwbHkpIDo6XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHBfcmVwbHkudGhlbiBAIHJlc29sdmUsIHJlamVjdFxuICAgICAgcF9yZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG5cbiAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcbiAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy5tc190aW1lb3V0KVxuICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG5cbiAgICAgIGZ1bmN0aW9uIGNsZWFyKCkgOjogY2xlYXJUaW1lb3V0IEAgdGlkXG5cblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIE1zZ0N0eC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXQsIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IHtFUFRhcmdldCwgZXBfZW5jb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5lcF9zZWxmKCkudG9KU09OKClcbiAgZXBfc2VsZigpIDo6IHJldHVybiBuZXcgdGhpcy5FUFRhcmdldCh0aGlzLmlkKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuXG4gIGNvbnN0cnVjdG9yKGlkLCBtc2dfY3R4KSA6OlxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBpZDogQHt9IHZhbHVlOiBpZFxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcykudG9cblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUm91dGVDYWNoZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcbiAgICAgIGpzb25fdW5wYWNrOiB0aGlzLkVQVGFyZ2V0LmFzX2pzb25fdW5wYWNrKHRoaXMudG8pXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgYXNfdGFyZ2V0KGlkKSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG9cbiAgYXNfc2VuZGVyKHtmcm9tX2lkOmlkLCBtc2dpZH0pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50bywgbXNnaWRcblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc19zZW5kZXIoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogdGhpcy5wYXJ0cy5qb2luKCcnKTsgLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBwX3NlbnQsIG1zZ19jdHhcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIGxldCByZXBseSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIHBfc2VudC5jYXRjaCBAIHJlamVjdFxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgcmVwbHkgPSBtc2dfY3R4LndpdGhSZWplY3RUaW1lb3V0KHJlcGx5KVxuXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiB0aGlzLmJ5X3Rva2VuLmRlbGV0ZSBAIHRva2VuXG4gICAgcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuICAgIHJldHVybiByZXBseVxuXG5FbmRwb2ludC5wcm90b3R5cGUuRVBUYXJnZXQgPSBFUFRhcmdldFxuIiwiZXhwb3J0IGNvbnN0IGVwX3Byb3RvID0gT2JqZWN0LmNyZWF0ZSBAXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZiBAIGZ1bmN0aW9uKCl7fVxuICBAe30gX3Vud3JhcF86IEB7fSBnZXQ6IF91bndyYXBfXG5cbmZ1bmN0aW9uIF91bndyYXBfKCkgOjpcbiAgY29uc3Qgc2VsZiA9IE9iamVjdC5jcmVhdGUodGhpcylcbiAgc2VsZi5lbmRwb2ludCA9IHYgPT4gdlxuICByZXR1cm4gc2VsZlxuXG5leHBvcnQgZnVuY3Rpb24gYWRkX2VwX2tpbmQoa2luZHMpIDo6XG4gIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywga2luZHNcbmV4cG9ydCBkZWZhdWx0IGFkZF9lcF9raW5kXG5cbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBjbGllbnQoLi4uYXJncykgOjpcbiAgICBpZiAxID09PSBhcmdzLmxlbmd0aCAmJiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXJnc1swXSA6OlxuICAgICAgcmV0dXJuIHRoaXMuY2xpZW50RW5kcG9pbnQgQCBhcmdzWzBdXG5cbiAgICBjb25zdCBtc2dfY3R4ID0gbmV3IHRoaXMuTXNnQ3R4KClcbiAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGggPyBtc2dfY3R4LnRvKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4gIGNsaWVudEVuZHBvaW50KG9uX2NsaWVudCkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpXG4gICAgY29uc3QgZXBfdGd0ID0gdGhpcy5lbmRwb2ludCBAIHRhcmdldFxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG4gIGNsaWVudF9hcGkob25fY2xpZW50LCBhcGkpIDo6XG4gICAgY29uc3QgdGFyZ2V0ID0gY2xpZW50RW5kcG9pbnQob25fY2xpZW50KVxuICAgIGNvbnN0IGVwX2FwaSA9IHRoaXMuX3Vud3JhcF8uYXBpX3BhcmFsbGVsKGFwaSlcbiAgICBjb25zdCBlcF90Z3QgPSB0aGlzLmVuZHBvaW50IEAgKGVwLCBodWIpID0+XG4gICAgICBPYmplY3QuYXNzaWduIEAgdGFyZ2V0LCBlcF9hcGkoZXAsIGh1YilcbiAgICByZXR1cm4gdGFyZ2V0LmRvbmVcblxuXG5jb25zdCBlcF9jbGllbnRfYXBpID0gQHt9XG4gIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgdGhpcy5fcmVzb2x2ZSBAIGF3YWl0IHRoaXMub25fY2xpZW50KGVwLCBodWIpXG4gICAgYXdhaXQgZXAuc2h1dGRvd24oKVxuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgdGhpcy5fcmVqZWN0KGVycilcbiAgb25fc2h1dGRvd24oZXAsIGVycikgOjpcbiAgICBlcnIgPyB0aGlzLl9yZWplY3QoZXJyKSA6IHRoaXMuX3Jlc29sdmUoKVxuXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fY2xpZW50KSA6OlxuICBjb25zdCB0YXJnZXQgPSBPYmplY3QuY3JlYXRlIEAgZXBfY2xpZW50X2FwaVxuICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb25fY2xpZW50IDo6XG4gICAgaWYgb25fY2xpZW50Lm9uX3JlYWR5IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYFVzZSBcIm9uX2NsaWVudCgpXCIgaW5zdGVhZCBvZiBcIm9uX3JlYWR5KClcIiB3aXRoIGNsaWVudEVuZHBvaW50YFxuICAgIE9iamVjdC5hc3NpZ24gQCB0YXJnZXQsIG9uX2NsaWVudFxuICBlbHNlIDo6XG4gICAgdGFyZ2V0Lm9uX2NsaWVudCA9IG9uX2NsaWVudFxuXG4gIHRhcmdldC5kb25lID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgIHRhcmdldC5fcmVzb2x2ZSA9IHJlc29sdmVcbiAgICB0YXJnZXQuX3JlamVjdCA9IHJlamVjdFxuICByZXR1cm4gdGFyZ2V0XG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgYXBpX2JpbmRfcnBjXG4gIGFwaShhcGkpIDo6IHJldHVybiB0aGlzLmFwaV9wYXJhbGxlbChhcGkpXG4gIGFwaV9wYXJhbGxlbChhcGkpIDo6XG4gICAgcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZSBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cbiAgYXBpX2lub3JkZXIoYXBpKSA6OlxuICAgIHJldHVybiB0aGlzLmVuZHBvaW50IEAgZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfYmluZF9ycGMoYXBpLCBlcCwgaHViKVxuICAgICAgcmV0dXJuIEB7fSBycGMsXG4gICAgICAgIGFzeW5jIG9uX21zZyh7bXNnLCBzZW5kZXJ9KSA6OlxuICAgICAgICAgIGF3YWl0IHJwYy5pbnZva2VfZ2F0ZWQgQCBzZW5kZXIsIG1zZy5vcCxcbiAgICAgICAgICAgIGFwaV9mbiA9PiBhcGlfZm4obXNnLmt3LCBtc2cuY3R4KVxuXG5cbmZ1bmN0aW9uIGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpIDo6XG4gIGNvbnN0IHBmeCA9IGFwaS5vcF9wcmVmaXggfHwgJ3JwY18nXG4gIGNvbnN0IGxvb2t1cF9vcCA9IGFwaS5vcF9sb29rdXBcbiAgICA/IG9wID0+IGFwaS5vcF9sb29rdXAocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgOiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXBpXG4gICAgPyBvcCA9PiBhcGkocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgOiBvcCA9PiA6OlxuICAgICAgICBjb25zdCBmbiA9IGFwaVtwZnggKyBvcF1cbiAgICAgICAgcmV0dXJuIGZuID8gZm4uYmluZChhcGkpIDogZm5cblxuICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHJwY19hcGksIEB7fVxuICAgIGxvb2t1cF9vcDogQHt9IHZhbHVlOiBsb29rdXBfb3BcbiAgICBlcnJfZnJvbTogQHt9IHZhbHVlOiBlcC5lcF9zZWxmKClcblxuXG5jb25zdCBycGNfYXBpID0gQDpcbiAgYXN5bmMgaW52b2tlKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgcmV0dXJuIGF3YWl0IHJlc1xuXG4gIGFzeW5jIGludm9rZV9nYXRlZChzZW5kZXIsIG9wLCBjYikgOjpcbiAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLnJlc29sdmVfb3AgQCBzZW5kZXIsIG9wXG4gICAgaWYgdW5kZWZpbmVkID09PSBhcGlfZm4gOjogcmV0dXJuXG5cbiAgICBjb25zdCByZXMgPSBQcm9taXNlLnJlc29sdmUodGhpcy5nYXRlKVxuICAgICAgLnRoZW4gQCAoKSA9PiB0aGlzLmFuc3dlciBAIHNlbmRlciwgYXBpX2ZuLCBjYlxuICAgIHRoaXMuZ2F0ZSA9IHJlcy50aGVuKG5vb3AsIG5vb3ApXG4gICAgcmV0dXJuIGF3YWl0IHJlc1xuXG4gIGFzeW5jIHJlc29sdmVfb3Aoc2VuZGVyLCBvcCkgOjpcbiAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIG9wIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnSW52YWxpZCBvcGVyYXRpb24nLCBjb2RlOiA0MDBcbiAgICAgIHJldHVyblxuXG4gICAgdHJ5IDo6XG4gICAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLmxvb2t1cF9vcChvcClcbiAgICAgIGlmICEgYXBpX2ZuIDo6XG4gICAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogJ1Vua25vd24gb3BlcmF0aW9uJywgY29kZTogNDA0XG4gICAgICByZXR1cm4gYXBpX2ZuXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiBgSW52YWxpZCBvcGVyYXRpb246ICR7ZXJyLm1lc3NhZ2V9YCwgY29kZTogNTAwXG5cbiAgYXN5bmMgYW5zd2VyKHNlbmRlciwgYXBpX2ZuLCBjYikgOjpcbiAgICB0cnkgOjpcbiAgICAgIHZhciBhbnN3ZXIgPSBjYiA/IGF3YWl0IGNiKGFwaV9mbikgOiBhd2FpdCBhcGlfZm4oKVxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogZXJyX2Zyb206IHRoaXMuZXJyX2Zyb20sIGVycm9yOiBlcnJcbiAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgaWYgc2VuZGVyLnJlcGx5RXhwZWN0ZWQgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IGFuc3dlclxuICAgIHJldHVybiB0cnVlXG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbiIsImltcG9ydCB7YWRkX2VwX2tpbmQsIGVwX3Byb3RvfSBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBzZXJ2ZXIob25faW5pdCkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBvbl9pbml0XG5cbmV4cG9ydCAqIGZyb20gJy4vY2xpZW50LmpzeSdcbmV4cG9ydCAqIGZyb20gJy4vYXBpLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZXBfcHJvdG9cbiIsImltcG9ydCBlcF9wcm90byBmcm9tICcuL2VwX2tpbmRzL2luZGV4LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4LCBwcm90b2NvbHN9ID0gY2xhc3Nlc1xuICAgIHJldHVybiBjbGFzc2VzXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBwbHVnaW5fbmFtZSwgY3JlYXRlTWFwXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIGlmIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBwbHVnaW5fb3B0aW9ucy5lcF9raW5kc1xuXG4gIGxldCBlbmRwb2ludF9wbHVnaW5cbiAgcmV0dXJuIEA6XG4gICAgc3ViY2xhc3NcbiAgICBwb3N0KGh1YikgOjpcbiAgICAgIHJldHVybiBodWJbcGx1Z2luX25hbWVdID0gZW5kcG9pbnRfcGx1Z2luKGh1YilcblxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IHBsdWdpbl9vcHRpb25zLnByb3RvY29sc1xuICAgICAgfHwgRmFicmljSHViX1BJLnByb3RvdHlwZS5wcm90b2NvbHNcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4OiBNc2dDdHhfcGl9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuXG4gICAgZW5kcG9pbnRfcGx1Z2luID0gZnVuY3Rpb24gKGh1YikgOjpcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBodWIuY29ubmVjdF9zZWxmKClcbiAgICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eF9waS5mb3JIdWIoaHViLCBjaGFubmVsKVxuXG4gICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YgQCBlbmRwb2ludCwgZXBfcHJvdG9cbiAgICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGVuZHBvaW50LCBjcmVhdGUsIE1zZ0N0eFxuICAgICAgcmV0dXJuIGVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcHJvdG9jb2xzLnJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBpZFxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludCBAIGlkLCBtc2dfY3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQFxuICAgICAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIG9uX2luaXRcbiAgICAgICAgICAgICAgPyBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgICAgIDogb25faW5pdFxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICAvLyBBbGxvdyBmb3IgYm90aCBpbnRlcm5hbCBhbmQgZXh0ZXJuYWwgZXJyb3IgaGFuZGxpbmcgYnkgZm9ya2luZyByZWFkeS5jYXRjaFxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PiBoYW5kbGVycy5vbl9lcnJvciBAIGVyciwgQHt9IHpvbmU6J29uX3JlYWR5J1xuXG4gICAgICAgIDo6XG4gICAgICAgICAgY29uc3QgZXBfdGd0ID0gZXAuZXBfc2VsZigpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuIl0sIm5hbWVzIjpbIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJpbmJvdW5kIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiZW5kcG9pbnQiLCJodWIiLCJpZF90YXJnZXQiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJyb3V0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fbXNnIiwib25fZXJyb3IiLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJlcnIiLCJleHRyYSIsImFzc2lnbiIsImJpbmRTaW5rIiwicGt0IiwicmVjdl9tc2ciLCJ0eXBlIiwidW5kZWZpbmVkIiwiem9uZSIsIm1zZyIsInRlcm1pbmF0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJlcF9lbmNvZGUiLCJpZF9yb3V0ZXIiLCJhc19qc29uX3VucGFjayIsIm1zZ19jdHhfdG8iLCJ4Zm9ybUJ5S2V5IiwiT2JqZWN0IiwiY3JlYXRlIiwidG9rZW4iLCJ2IiwiZnJvbV9jdHgiLCJlcF9kZWNvZGUiLCJqc29uX3VucGFja194Zm9ybSIsIm1zZ2lkIiwiYXNFbmRwb2ludElkIiwiZXBfdGd0IiwiZmFzdCIsImluaXQiLCJmYXN0X2pzb24iLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZ2V0Iiwic2VuZCIsInF1ZXJ5IiwidmFsdWUiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwicmVzIiwic3BsaXQiLCJwYXJzZUludCIsInN6IiwiSlNPTiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJrZXkiLCJ4Zm4iLCJzZXQiLCJ2Zm4iLCJNc2dDdHgiLCJyYW5kb21faWQiLCJjb2RlY3MiLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJmcm9tX2lkIiwiZnJlZXplIiwiY3R4IiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJjb250cm9sIiwicGluZyIsImFyZ3MiLCJfY29kZWMiLCJyZXBseSIsInN0cmVhbSIsImZuT3JLZXkiLCJpbnZva2UiLCJvYmoiLCJhc3NlcnRNb25pdG9yIiwidGhlbiIsInBfc2VudCIsImluaXRSZXBseSIsInRvIiwidGd0IiwiRXJyb3IiLCJzZWxmIiwiY2xvbmUiLCJyZXBseV9pZCIsImxlbmd0aCIsIndpdGgiLCJjaGVja01vbml0b3IiLCJvcHRpb25zIiwiYWN0aXZlIiwibW9uaXRvciIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJkb25lIiwidGQiLCJ0aWQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwidW5yZWYiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJUeXBlRXJyb3IiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImRlZmF1bHQiLCJqc29uX3NlbmQiLCJqc29uIiwicF9yZXBseSIsInRpbWVvdXQiLCJSZXBseVRpbWVvdXQiLCJzZXRUaW1lb3V0IiwibXNfdGltZW91dCIsIkVuZHBvaW50Iiwic3ViY2xhc3MiLCJleHRlbnNpb25zIiwiZXBfc2VsZiIsInRvSlNPTiIsIm1zZ19jdHgiLCJ3aXRoRW5kcG9pbnQiLCJNYXAiLCJjcmVhdGVNYXAiLCJzaW5rIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwiRGF0ZSIsIm5vdyIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJpbmZvIiwicm1zZyIsInJlY3ZDdHJsIiwicmVjdk1zZyIsInJzdHJlYW0iLCJyZWN2U3RyZWFtIiwiaXNfcmVwbHkiLCJzZW5kZXIiLCJhc19zZW5kZXIiLCJ3YXJuIiwiaW5pdFJlcGx5UHJvbWlzZSIsImNhdGNoIiwid2l0aFJlamVjdFRpbWVvdXQiLCJkZWxldGUiLCJlcF9wcm90byIsImdldFByb3RvdHlwZU9mIiwiX3Vud3JhcF8iLCJhZGRfZXBfa2luZCIsImtpbmRzIiwiY2xpZW50RW5kcG9pbnQiLCJvbl9jbGllbnQiLCJ0YXJnZXQiLCJhcGkiLCJlcF9hcGkiLCJhcGlfcGFyYWxsZWwiLCJlcCIsImVwX2NsaWVudF9hcGkiLCJvbl9yZWFkeSIsIl9yZXNvbHZlIiwiX3JlamVjdCIsInJwYyIsImFwaV9iaW5kX3JwYyIsIm9wIiwiYXBpX2ZuIiwia3ciLCJpbnZva2VfZ2F0ZWQiLCJwZngiLCJvcF9wcmVmaXgiLCJsb29rdXBfb3AiLCJvcF9sb29rdXAiLCJmbiIsImJpbmQiLCJycGNfYXBpIiwiY2IiLCJyZXNvbHZlX29wIiwiYW5zd2VyIiwiZ2F0ZSIsIm5vb3AiLCJlcnJfZnJvbSIsIm1lc3NhZ2UiLCJjb2RlIiwiZXJyb3IiLCJyZXBseUV4cGVjdGVkIiwib25faW5pdCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJjbGFzc2VzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwiZXBfa2luZHMiLCJlbmRwb2ludF9wbHVnaW4iLCJwbHVnaW5fbmFtZSIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwicHJvdG9jb2xzIiwiTXNnQ3R4X3BpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiY29ubmVjdF9zZWxmIiwic2V0UHJvdG90eXBlT2YiLCJ0YXJnZXRzIiwiaGFzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJyZWdpc3RlciJdLCJtYXBwaW5ncyI6IkFBQWUsTUFBTUEsSUFBTixDQUFXO1NBQ2pCQyxZQUFQLENBQW9CLEVBQUNDLE9BQUQsRUFBcEIsRUFBK0I7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
