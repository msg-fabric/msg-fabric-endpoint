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

  stateFor(pkt, ifAbsent) {
    const msgid = pkt.info.msgid;
    let entry = this.by_msgid.get(msgid);
    if (undefined === entry) {
      if (!msgid) {
        throw new Error(`Invalid msgid: ${msgid}`);
      }
      if ('function' === typeof ifAbsent) {
        entry = ifAbsent(pkt, this, msgid);
      } else entry = ifAbsent;
      this.by_msgid.set(msgid, entry);
    }
    return entry;
  }

  deleteStateFor(msgid) {
    return this.by_msgid.delete(msgid);
  }

  json_unpack(obj) {
    throw new Error(`Endpoint bindSink() responsibility`);
  }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2V4dGVuc2lvbnMuanN5IiwiLi4vY29kZS9lcF9raW5kcy9jbGllbnQuanN5IiwiLi4vY29kZS9lcF9raW5kcy9hcGkuanN5IiwiLi4vY29kZS9lcF9raW5kcy9pbmRleC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG5cbiAganNvbl91bnBhY2sob2JqKSA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgRW5kcG9pbnQgYmluZFNpbmsoKSByZXNwb25zaWJpbGl0eWBcblxuIiwiZXhwb3J0IGRlZmF1bHQgRVBUYXJnZXRcbmV4cG9ydCBjbGFzcyBFUFRhcmdldCA6OlxuICBjb25zdHJ1Y3RvcihpZCkgOjogdGhpcy5pZCA9IGlkXG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlkLmFzRW5kcG9pbnRJZCA6OlxuICAgICAgaWQgPSBpZC5hc0VuZHBvaW50SWQoKVxuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RfanNvblxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cblxuRVBUYXJnZXQuanNvbl91bnBhY2tfeGZvcm0gPSBqc29uX3VucGFja194Zm9ybVxuZXhwb3J0IGZ1bmN0aW9uIGpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpIDo6XG4gIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXIoKVxuXG4gIGZ1bmN0aW9uIHJldml2ZXIoKSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBzdGF0aWMgZm9ySHViKGh1YiwgY2hhbm5lbCkgOjpcbiAgICBjb25zdCB7c2VuZFJhd30gPSBjaGFubmVsXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuX3NlbmQgPSBhc3luYyBwa3QgPT4gOjpcbiAgICAgIGF3YWl0IHNlbmRSYXcocGt0KVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIHJldHVybiBNc2dDdHhcblxuXG4gIGNvbnN0cnVjdG9yKGlkKSA6OlxuICAgIGlmIG51bGwgIT0gaWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBpZFxuICAgICAgY29uc3QgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIHRoaXMuY3R4ID0gQHt9IGZyb21faWRcblxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG5cbiAgICBjb25zdCByZXMgPSBpbnZva2UgQCB0aGlzLmNoYW5fc2VuZCwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgdGd0ID0gZXBfZGVjb2RlKHRndCkgfHwgdGd0XG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgc2VuZF9qc29uIGFzIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBqc29uX3NlbmQgPSBtc2dDb2RlY3MuanNvbi5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3RfanNvbjogQHt9IGdldCgpIDo6IHJldHVybiBAOlxuICAgICAgICBzZW5kOiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncylcbiAgICAgICAgc2VuZFF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSlcbiAgICAgICAgcXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gICAgcmV0dXJuIHRoaXNcblxuXG4gIHdpdGhSZWplY3RUaW1lb3V0KHBfcmVwbHkpIDo6XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHBfcmVwbHkudGhlbiBAIHJlc29sdmUsIHJlamVjdFxuICAgICAgcF9yZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG5cbiAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcbiAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy5tc190aW1lb3V0KVxuICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG5cbiAgICAgIGZ1bmN0aW9uIGNsZWFyKCkgOjogY2xlYXJUaW1lb3V0IEAgdGlkXG5cblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIE1zZ0N0eC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXQsIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IHtFUFRhcmdldCwgZXBfZW5jb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5lcF9zZWxmKCkudG9KU09OKClcbiAgZXBfc2VsZigpIDo6IHJldHVybiBuZXcgdGhpcy5FUFRhcmdldCh0aGlzLmlkKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuXG4gIGNvbnN0cnVjdG9yKGlkLCBtc2dfY3R4KSA6OlxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBpZDogQHt9IHZhbHVlOiBpZFxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcykudG9cblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUm91dGVDYWNoZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcbiAgICAgIGpzb25fdW5wYWNrOiB0aGlzLkVQVGFyZ2V0LmFzX2pzb25fdW5wYWNrKHRoaXMudG8pXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgYXNfdGFyZ2V0KGlkKSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG9cbiAgYXNfc2VuZGVyKHtmcm9tX2lkOmlkLCBtc2dpZH0pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50bywgbXNnaWRcblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc19zZW5kZXIoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogdGhpcy5wYXJ0cy5qb2luKCcnKTsgLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBwX3NlbnQsIG1zZ19jdHhcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIGxldCByZXBseSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIHBfc2VudC5jYXRjaCBAIHJlamVjdFxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgcmVwbHkgPSBtc2dfY3R4LndpdGhSZWplY3RUaW1lb3V0KHJlcGx5KVxuXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiB0aGlzLmJ5X3Rva2VuLmRlbGV0ZSBAIHRva2VuXG4gICAgcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuICAgIHJldHVybiByZXBseVxuXG5FbmRwb2ludC5wcm90b3R5cGUuRVBUYXJnZXQgPSBFUFRhcmdldFxuIiwiZXhwb3J0IGNvbnN0IGVwX3Byb3RvID0gT2JqZWN0LmNyZWF0ZSBAXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZiBAIGZ1bmN0aW9uKCl7fVxuICBAe30gX3Vud3JhcF86IEB7fSBnZXQ6IF91bndyYXBfXG5cbmZ1bmN0aW9uIF91bndyYXBfKCkgOjpcbiAgY29uc3Qgc2VsZiA9IE9iamVjdC5jcmVhdGUodGhpcylcbiAgc2VsZi5lbmRwb2ludCA9IHYgPT4gdlxuICByZXR1cm4gc2VsZlxuXG5leHBvcnQgZnVuY3Rpb24gYWRkX2VwX2tpbmQoa2luZHMpIDo6XG4gIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywga2luZHNcbmV4cG9ydCBkZWZhdWx0IGFkZF9lcF9raW5kXG5cbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBjbGllbnQoLi4uYXJncykgOjpcbiAgICBpZiAxID09PSBhcmdzLmxlbmd0aCAmJiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXJnc1swXSA6OlxuICAgICAgcmV0dXJuIHRoaXMuY2xpZW50RW5kcG9pbnQgQCBhcmdzWzBdXG5cbiAgICBjb25zdCBtc2dfY3R4ID0gbmV3IHRoaXMuTXNnQ3R4KClcbiAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGggPyBtc2dfY3R4LnRvKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4gIGNsaWVudEVuZHBvaW50KG9uX2NsaWVudCkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpXG4gICAgY29uc3QgZXBfdGd0ID0gdGhpcy5lbmRwb2ludCBAIHRhcmdldFxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG4gIGNsaWVudF9hcGkob25fY2xpZW50LCBhcGkpIDo6XG4gICAgY29uc3QgdGFyZ2V0ID0gY2xpZW50RW5kcG9pbnQob25fY2xpZW50KVxuICAgIGNvbnN0IGVwX2FwaSA9IHRoaXMuX3Vud3JhcF8uYXBpX3BhcmFsbGVsKGFwaSlcbiAgICBjb25zdCBlcF90Z3QgPSB0aGlzLmVuZHBvaW50IEAgKGVwLCBodWIpID0+XG4gICAgICBPYmplY3QuYXNzaWduIEAgdGFyZ2V0LCBlcF9hcGkoZXAsIGh1YilcbiAgICByZXR1cm4gdGFyZ2V0LmRvbmVcblxuXG5jb25zdCBlcF9jbGllbnRfYXBpID0gQHt9XG4gIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgdGhpcy5fcmVzb2x2ZSBAIGF3YWl0IHRoaXMub25fY2xpZW50KGVwLCBodWIpXG4gICAgYXdhaXQgZXAuc2h1dGRvd24oKVxuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgdGhpcy5fcmVqZWN0KGVycilcbiAgb25fc2h1dGRvd24oZXAsIGVycikgOjpcbiAgICBlcnIgPyB0aGlzLl9yZWplY3QoZXJyKSA6IHRoaXMuX3Jlc29sdmUoKVxuXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fY2xpZW50KSA6OlxuICBjb25zdCB0YXJnZXQgPSBPYmplY3QuY3JlYXRlIEAgZXBfY2xpZW50X2FwaVxuICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb25fY2xpZW50IDo6XG4gICAgaWYgb25fY2xpZW50Lm9uX3JlYWR5IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYFVzZSBcIm9uX2NsaWVudCgpXCIgaW5zdGVhZCBvZiBcIm9uX3JlYWR5KClcIiB3aXRoIGNsaWVudEVuZHBvaW50YFxuICAgIE9iamVjdC5hc3NpZ24gQCB0YXJnZXQsIG9uX2NsaWVudFxuICBlbHNlIDo6XG4gICAgdGFyZ2V0Lm9uX2NsaWVudCA9IG9uX2NsaWVudFxuXG4gIHRhcmdldC5kb25lID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgIHRhcmdldC5fcmVzb2x2ZSA9IHJlc29sdmVcbiAgICB0YXJnZXQuX3JlamVjdCA9IHJlamVjdFxuICByZXR1cm4gdGFyZ2V0XG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgYXBpX2JpbmRfcnBjXG4gIGFwaShhcGkpIDo6IHJldHVybiB0aGlzLmFwaV9wYXJhbGxlbChhcGkpXG4gIGFwaV9wYXJhbGxlbChhcGkpIDo6XG4gICAgcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZSBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cbiAgYXBpX2lub3JkZXIoYXBpKSA6OlxuICAgIHJldHVybiB0aGlzLmVuZHBvaW50IEAgZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfYmluZF9ycGMoYXBpLCBlcCwgaHViKVxuICAgICAgcmV0dXJuIEB7fSBycGMsXG4gICAgICAgIGFzeW5jIG9uX21zZyh7bXNnLCBzZW5kZXJ9KSA6OlxuICAgICAgICAgIGF3YWl0IHJwYy5pbnZva2VfZ2F0ZWQgQCBzZW5kZXIsIG1zZy5vcCxcbiAgICAgICAgICAgIGFwaV9mbiA9PiBhcGlfZm4obXNnLmt3LCBtc2cuY3R4KVxuXG5cbmZ1bmN0aW9uIGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpIDo6XG4gIGNvbnN0IHBmeCA9IGFwaS5vcF9wcmVmaXggfHwgJ3JwY18nXG4gIGNvbnN0IGxvb2t1cF9vcCA9IGFwaS5vcF9sb29rdXBcbiAgICA/IG9wID0+IGFwaS5vcF9sb29rdXAocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgOiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXBpXG4gICAgPyBvcCA9PiBhcGkocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgOiBvcCA9PiA6OlxuICAgICAgICBjb25zdCBmbiA9IGFwaVtwZnggKyBvcF1cbiAgICAgICAgcmV0dXJuIGZuID8gZm4uYmluZChhcGkpIDogZm5cblxuICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHJwY19hcGksIEB7fVxuICAgIGxvb2t1cF9vcDogQHt9IHZhbHVlOiBsb29rdXBfb3BcbiAgICBlcnJfZnJvbTogQHt9IHZhbHVlOiBlcC5lcF9zZWxmKClcblxuXG5jb25zdCBycGNfYXBpID0gQDpcbiAgYXN5bmMgaW52b2tlKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgcmV0dXJuIGF3YWl0IHJlc1xuXG4gIGFzeW5jIGludm9rZV9nYXRlZChzZW5kZXIsIG9wLCBjYikgOjpcbiAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLnJlc29sdmVfb3AgQCBzZW5kZXIsIG9wXG4gICAgaWYgdW5kZWZpbmVkID09PSBhcGlfZm4gOjogcmV0dXJuXG5cbiAgICBjb25zdCByZXMgPSBQcm9taXNlLnJlc29sdmUodGhpcy5nYXRlKVxuICAgICAgLnRoZW4gQCAoKSA9PiB0aGlzLmFuc3dlciBAIHNlbmRlciwgYXBpX2ZuLCBjYlxuICAgIHRoaXMuZ2F0ZSA9IHJlcy50aGVuKG5vb3AsIG5vb3ApXG4gICAgcmV0dXJuIGF3YWl0IHJlc1xuXG4gIGFzeW5jIHJlc29sdmVfb3Aoc2VuZGVyLCBvcCkgOjpcbiAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIG9wIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnSW52YWxpZCBvcGVyYXRpb24nLCBjb2RlOiA0MDBcbiAgICAgIHJldHVyblxuXG4gICAgdHJ5IDo6XG4gICAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLmxvb2t1cF9vcChvcClcbiAgICAgIGlmICEgYXBpX2ZuIDo6XG4gICAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogJ1Vua25vd24gb3BlcmF0aW9uJywgY29kZTogNDA0XG4gICAgICByZXR1cm4gYXBpX2ZuXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiBgSW52YWxpZCBvcGVyYXRpb246ICR7ZXJyLm1lc3NhZ2V9YCwgY29kZTogNTAwXG5cbiAgYXN5bmMgYW5zd2VyKHNlbmRlciwgYXBpX2ZuLCBjYikgOjpcbiAgICB0cnkgOjpcbiAgICAgIHZhciBhbnN3ZXIgPSBjYiA/IGF3YWl0IGNiKGFwaV9mbikgOiBhd2FpdCBhcGlfZm4oKVxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogZXJyX2Zyb206IHRoaXMuZXJyX2Zyb20sIGVycm9yOiBlcnJcbiAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgaWYgc2VuZGVyLnJlcGx5RXhwZWN0ZWQgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IGFuc3dlclxuICAgIHJldHVybiB0cnVlXG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbiIsImltcG9ydCB7YWRkX2VwX2tpbmQsIGVwX3Byb3RvfSBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBzZXJ2ZXIob25faW5pdCkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBvbl9pbml0XG5cbmV4cG9ydCAqIGZyb20gJy4vY2xpZW50LmpzeSdcbmV4cG9ydCAqIGZyb20gJy4vYXBpLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZXBfcHJvdG9cbiIsImltcG9ydCBlcF9wcm90byBmcm9tICcuL2VwX2tpbmRzL2luZGV4LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4LCBwcm90b2NvbHN9ID0gY2xhc3Nlc1xuICAgIHJldHVybiBjbGFzc2VzXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBwbHVnaW5fbmFtZSwgY3JlYXRlTWFwXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIGlmIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBwbHVnaW5fb3B0aW9ucy5lcF9raW5kc1xuXG4gIGxldCBlbmRwb2ludF9wbHVnaW5cbiAgcmV0dXJuIEA6XG4gICAgc3ViY2xhc3NcbiAgICBwb3N0KGh1YikgOjpcbiAgICAgIHJldHVybiBodWJbcGx1Z2luX25hbWVdID0gZW5kcG9pbnRfcGx1Z2luKGh1YilcblxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IHBsdWdpbl9vcHRpb25zLnByb3RvY29sc1xuICAgICAgfHwgRmFicmljSHViX1BJLnByb3RvdHlwZS5wcm90b2NvbHNcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4OiBNc2dDdHhfcGl9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuXG4gICAgZW5kcG9pbnRfcGx1Z2luID0gZnVuY3Rpb24gKGh1YikgOjpcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBodWIuY29ubmVjdF9zZWxmKClcbiAgICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eF9waS5mb3JIdWIoaHViLCBjaGFubmVsKVxuXG4gICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YgQCBlbmRwb2ludCwgZXBfcHJvdG9cbiAgICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGVuZHBvaW50LCBjcmVhdGUsIE1zZ0N0eFxuICAgICAgcmV0dXJuIGVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcHJvdG9jb2xzLnJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBpZFxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludCBAIGlkLCBtc2dfY3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQFxuICAgICAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIG9uX2luaXRcbiAgICAgICAgICAgICAgPyBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgICAgIDogb25faW5pdFxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICAvLyBBbGxvdyBmb3IgYm90aCBpbnRlcm5hbCBhbmQgZXh0ZXJuYWwgZXJyb3IgaGFuZGxpbmcgYnkgZm9ya2luZyByZWFkeS5jYXRjaFxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PiBoYW5kbGVycy5vbl9lcnJvciBAIGVyciwgQHt9IHpvbmU6J29uX3JlYWR5J1xuXG4gICAgICAgIDo6XG4gICAgICAgICAgY29uc3QgZXBfdGd0ID0gZXAuZXBfc2VsZigpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuIl0sIm5hbWVzIjpbIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJpbmJvdW5kIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiZW5kcG9pbnQiLCJodWIiLCJpZF90YXJnZXQiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJyb3V0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fbXNnIiwib25fZXJyb3IiLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJlcnIiLCJleHRyYSIsImFzc2lnbiIsImJpbmRTaW5rIiwicGt0IiwicmVjdl9tc2ciLCJ0eXBlIiwidW5kZWZpbmVkIiwiem9uZSIsIm1zZyIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwibXNnaWQiLCJpbmZvIiwiZW50cnkiLCJieV9tc2dpZCIsImdldCIsIkVycm9yIiwic2V0IiwiZGVsZXRlIiwib2JqIiwiRVBUYXJnZXQiLCJpZCIsImVwX2VuY29kZSIsImlkX3JvdXRlciIsImFzX2pzb25fdW5wYWNrIiwibXNnX2N0eF90byIsInhmb3JtQnlLZXkiLCJPYmplY3QiLCJjcmVhdGUiLCJ0b2tlbiIsInYiLCJmcm9tX2N0eCIsImVwX2RlY29kZSIsImpzb25fdW5wYWNrX3hmb3JtIiwiYXNFbmRwb2ludElkIiwiZXBfdGd0IiwiZmFzdCIsImluaXQiLCJmYXN0X2pzb24iLCJkZWZpbmVQcm9wZXJ0aWVzIiwic2VuZCIsInF1ZXJ5IiwidmFsdWUiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwicmVzIiwic3BsaXQiLCJwYXJzZUludCIsInN6IiwiSlNPTiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJrZXkiLCJ4Zm4iLCJ2Zm4iLCJNc2dDdHgiLCJyYW5kb21faWQiLCJjb2RlY3MiLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJmcm9tX2lkIiwiZnJlZXplIiwiY3R4IiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJjb250cm9sIiwicGluZyIsImFyZ3MiLCJfY29kZWMiLCJyZXBseSIsInN0cmVhbSIsImZuT3JLZXkiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwidGhlbiIsInBfc2VudCIsImluaXRSZXBseSIsInRvIiwidGd0Iiwic2VsZiIsImNsb25lIiwicmVwbHlfaWQiLCJsZW5ndGgiLCJ3aXRoIiwiY2hlY2tNb25pdG9yIiwib3B0aW9ucyIsImFjdGl2ZSIsIm1vbml0b3IiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZG9uZSIsInRkIiwidGlkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY29kZWMiLCJjaGVja1BpbmciLCJzZXRJbnRlcnZhbCIsInVucmVmIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwiVHlwZUVycm9yIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJkZWZhdWx0IiwianNvbl9zZW5kIiwianNvbiIsInBfcmVwbHkiLCJ0aW1lb3V0IiwiUmVwbHlUaW1lb3V0Iiwic2V0VGltZW91dCIsIm1zX3RpbWVvdXQiLCJFbmRwb2ludCIsInN1YmNsYXNzIiwiZXh0ZW5zaW9ucyIsImVwX3NlbGYiLCJ0b0pTT04iLCJtc2dfY3R4Iiwid2l0aEVuZHBvaW50IiwiTWFwIiwiY3JlYXRlTWFwIiwic2luayIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIkRhdGUiLCJub3ciLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwicm1zZyIsInJlY3ZDdHJsIiwicmVjdk1zZyIsInJzdHJlYW0iLCJyZWN2U3RyZWFtIiwiaXNfcmVwbHkiLCJzZW5kZXIiLCJhc19zZW5kZXIiLCJ3YXJuIiwiaW5pdFJlcGx5UHJvbWlzZSIsImNhdGNoIiwid2l0aFJlamVjdFRpbWVvdXQiLCJlcF9wcm90byIsImdldFByb3RvdHlwZU9mIiwiX3Vud3JhcF8iLCJhZGRfZXBfa2luZCIsImtpbmRzIiwiY2xpZW50RW5kcG9pbnQiLCJvbl9jbGllbnQiLCJ0YXJnZXQiLCJhcGkiLCJlcF9hcGkiLCJhcGlfcGFyYWxsZWwiLCJlcCIsImVwX2NsaWVudF9hcGkiLCJvbl9yZWFkeSIsIl9yZXNvbHZlIiwiX3JlamVjdCIsInJwYyIsImFwaV9iaW5kX3JwYyIsIm9wIiwiYXBpX2ZuIiwia3ciLCJpbnZva2VfZ2F0ZWQiLCJwZngiLCJvcF9wcmVmaXgiLCJsb29rdXBfb3AiLCJvcF9sb29rdXAiLCJmbiIsImJpbmQiLCJycGNfYXBpIiwiY2IiLCJyZXNvbHZlX29wIiwiYW5zd2VyIiwiZ2F0ZSIsIm5vb3AiLCJlcnJfZnJvbSIsIm1lc3NhZ2UiLCJjb2RlIiwiZXJyb3IiLCJyZXBseUV4cGVjdGVkIiwib25faW5pdCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJjbGFzc2VzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwiZXBfa2luZHMiLCJlbmRwb2ludF9wbHVnaW4iLCJwbHVnaW5fbmFtZSIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwicHJvdG9jb2xzIiwiTXNnQ3R4X3BpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiY29ubmVjdF9zZWxmIiwic2V0UHJvdG90eXBlT2YiLCJ0YXJnZXRzIiwiaGFzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJyZWdpc3RlciJdLCJtYXBwaW5ncyI6IkFBQWUsTUFBTUEsSUFBTixDQUFXO1NBQ2pCQyxZQUFQLENBQW9CLEVBQUNDLE9BQUQsRUFBcEIsRUFBK0I7VUFDdkJGLElBQU4sU0FBbUIsSUFBbkIsQ0FBd0I7U0FDbkJHLFNBQUwsQ0FBZUMsU0FBZixHQUEyQkYsT0FBM0I7V0FDT0YsSUFBUDs7O1dBRU9LLFFBQVQsRUFBbUJDLEdBQW5CLEVBQXdCQyxTQUF4QixFQUFtQ0MsUUFBbkMsRUFBNkM7VUFDckNDLGFBQWEsTUFBTUgsSUFBSUksTUFBSixDQUFXQyxnQkFBWCxDQUE0QkosU0FBNUIsQ0FBekI7O1FBRUlHLE1BQUosQ0FBV0UsY0FBWCxDQUE0QkwsU0FBNUIsRUFDRSxLQUFLTSxhQUFMLENBQXFCUixRQUFyQixFQUErQkksVUFBL0IsRUFBMkNELFFBQTNDLENBREY7V0FFTyxJQUFQOzs7Z0JBRVlILFFBQWQsRUFBd0JJLFVBQXhCLEVBQW9DLEVBQUNLLE1BQUQsRUFBU0MsUUFBVCxFQUFtQkMsV0FBbkIsRUFBcEMsRUFBcUU7UUFDL0RDLFFBQVEsSUFBWjtVQUNNQyxXQUFXLEtBQUtkLFNBQXRCO1VBQ01lLFVBQVUsTUFBTUYsS0FBdEI7VUFDTUcsV0FBVyxDQUFDQyxHQUFELEVBQU1DLEtBQU4sS0FBZ0I7VUFDNUJMLEtBQUgsRUFBVztxQkFDS1IsYUFBYVEsUUFBUSxLQUFyQjtvQkFDRkksR0FBWixFQUFpQkMsS0FBakI7O0tBSEo7O1dBS09DLE1BQVAsQ0FBZ0IsSUFBaEIsRUFBc0JsQixTQUFTbUIsUUFBVCxDQUFrQixJQUFsQixDQUF0QixFQUErQyxFQUFJTCxPQUFKLEVBQWFDLFFBQWIsRUFBL0M7V0FDT0csTUFBUCxDQUFnQmxCLFFBQWhCLEVBQTBCLEVBQUljLE9BQUosRUFBYUMsUUFBYixFQUExQjs7V0FFTyxPQUFPSyxHQUFQLEVBQVlmLE1BQVosS0FBdUI7VUFDekIsVUFBUU8sS0FBUixJQUFpQixRQUFNUSxHQUExQixFQUFnQztlQUFRUixLQUFQOzs7WUFFM0JTLFdBQVdSLFNBQVNPLElBQUlFLElBQWIsQ0FBakI7VUFDR0MsY0FBY0YsUUFBakIsRUFBNEI7ZUFDbkIsS0FBS1gsU0FBVyxLQUFYLEVBQWtCLEVBQUlVLEdBQUosRUFBU0ksTUFBTSxVQUFmLEVBQWxCLENBQVo7OztVQUVFO1lBQ0VDLE1BQU0sTUFBTUosU0FBV0QsR0FBWCxFQUFnQixJQUFoQixFQUFzQmYsTUFBdEIsQ0FBaEI7WUFDRyxDQUFFb0IsR0FBTCxFQUFXO2lCQUFRQSxHQUFQOztPQUZkLENBR0EsT0FBTVQsR0FBTixFQUFZO2VBQ0gsS0FBS04sU0FBV00sR0FBWCxFQUFnQixFQUFJSSxHQUFKLEVBQVNJLE1BQU0sVUFBZixFQUFoQixDQUFaOzs7VUFFQyxVQUFVWixLQUFiLEVBQXFCO2VBQ1pQLE9BQU9ELFVBQWQ7OztVQUVFO2NBQ0lLLE9BQVNnQixHQUFULEVBQWNMLEdBQWQsQ0FBTjtPQURGLENBRUEsT0FBTUosR0FBTixFQUFZO1lBQ047Y0FDRVUsWUFBWWhCLFNBQVdNLEdBQVgsRUFBZ0IsRUFBSVMsR0FBSixFQUFTTCxHQUFULEVBQWNJLE1BQU0sVUFBcEIsRUFBaEIsQ0FBaEI7U0FERixTQUVRO2NBQ0gsVUFBVUUsU0FBYixFQUF5QjtxQkFDZFYsR0FBVCxFQUFjLEVBQUNTLEdBQUQsRUFBTUwsR0FBTixFQUFkO21CQUNPZixPQUFPRCxVQUFkOzs7O0tBeEJSOzs7V0EwQk9nQixHQUFULEVBQWNPLFFBQWQsRUFBd0I7VUFDaEJDLFFBQVFSLElBQUlTLElBQUosQ0FBU0QsS0FBdkI7UUFDSUUsUUFBUSxLQUFLQyxRQUFMLENBQWNDLEdBQWQsQ0FBa0JKLEtBQWxCLENBQVo7UUFDR0wsY0FBY08sS0FBakIsRUFBeUI7VUFDcEIsQ0FBRUYsS0FBTCxFQUFhO2NBQ0wsSUFBSUssS0FBSixDQUFhLGtCQUFpQkwsS0FBTSxFQUFwQyxDQUFOOztVQUNDLGVBQWUsT0FBT0QsUUFBekIsRUFBb0M7Z0JBQzFCQSxTQUFTUCxHQUFULEVBQWMsSUFBZCxFQUFvQlEsS0FBcEIsQ0FBUjtPQURGLE1BRUtFLFFBQVFILFFBQVI7V0FDQUksUUFBTCxDQUFjRyxHQUFkLENBQW9CTixLQUFwQixFQUEyQkUsS0FBM0I7O1dBQ0tBLEtBQVA7OztpQkFFYUYsS0FBZixFQUFzQjtXQUNiLEtBQUtHLFFBQUwsQ0FBY0ksTUFBZCxDQUFxQlAsS0FBckIsQ0FBUDs7O2NBRVVRLEdBQVosRUFBaUI7VUFBUyxJQUFJSCxLQUFKLENBQWEsb0NBQWIsQ0FBTjs7OztBQ2pFZixNQUFNSSxVQUFOLENBQWU7Y0FDUkMsRUFBWixFQUFnQjtTQUFRQSxFQUFMLEdBQVVBLEVBQVY7OztZQUVUO1dBQVcsYUFBWUMsVUFBVSxLQUFLRCxFQUFmLEVBQW1CLElBQW5CLENBQXlCLEdBQTdDOztXQUNKO1dBQVVDLFVBQVUsS0FBS0QsRUFBZixFQUFtQixLQUFuQixDQUFQOztpQkFDRztXQUFVLEtBQUtBLEVBQVo7O2VBQ0w7V0FBVSxJQUFQOzs7TUFFWkUsU0FBSixHQUFnQjtXQUFVLEtBQUtGLEVBQUwsQ0FBUUUsU0FBZjs7TUFDZnRDLFNBQUosR0FBZ0I7V0FBVSxLQUFLb0MsRUFBTCxDQUFRcEMsU0FBZjs7O1NBRVp1QyxjQUFQLENBQXNCQyxVQUF0QixFQUFrQ0MsVUFBbEMsRUFBOEM7aUJBQy9CQyxPQUFPQyxNQUFQLENBQWNGLGNBQWMsSUFBNUIsQ0FBYjtlQUNXRyxLQUFYLElBQW9CQyxLQUFLLEtBQUtDLFFBQUwsQ0FBZ0JDLFVBQVVGLENBQVYsQ0FBaEIsRUFBOEJMLFVBQTlCLENBQXpCO1dBQ08sS0FBS1EsaUJBQUwsQ0FBdUJQLFVBQXZCLENBQVA7OztTQUVLSyxRQUFQLENBQWdCVixFQUFoQixFQUFvQkksVUFBcEIsRUFBZ0NkLEtBQWhDLEVBQXVDO1FBQ2xDLENBQUVVLEVBQUwsRUFBVTs7O1FBQ1AsZUFBZSxPQUFPQSxHQUFHYSxZQUE1QixFQUEyQztXQUNwQ2IsR0FBR2EsWUFBSCxFQUFMOzs7VUFFSUMsU0FBUyxJQUFJLElBQUosQ0FBU2QsRUFBVCxDQUFmO1FBQ0llLElBQUo7UUFBVUMsT0FBTyxNQUFNRCxPQUFPWCxXQUFXVSxNQUFYLEVBQW1CLEVBQUN4QixLQUFELEVBQW5CLEVBQTRCMkIsU0FBMUQ7V0FDT1gsT0FBT1ksZ0JBQVAsQ0FBMEJKLE1BQTFCLEVBQWtDO1lBQ2pDLEVBQUlwQixNQUFNO2lCQUFVLENBQUNxQixRQUFRQyxNQUFULEVBQWlCRyxJQUF4QjtTQUFiLEVBRGlDO2FBRWhDLEVBQUl6QixNQUFNO2lCQUFVLENBQUNxQixRQUFRQyxNQUFULEVBQWlCSSxLQUF4QjtTQUFiLEVBRmdDO3FCQUd4QixFQUFJQyxPQUFPLENBQUMsQ0FBRS9CLEtBQWQsRUFId0IsRUFBbEMsQ0FBUDs7OztBQU1KLE1BQU1rQixRQUFRLFFBQWQ7QUFDQVQsV0FBU1MsS0FBVCxHQUFpQkEsS0FBakI7O0FBRUFULFdBQVNFLFNBQVQsR0FBcUJBLFNBQXJCO0FBQ0EsQUFBTyxTQUFTQSxTQUFULENBQW1CRCxFQUFuQixFQUF1QnNCLE1BQXZCLEVBQStCO01BQ2hDLEVBQUNwQixXQUFVcUIsQ0FBWCxFQUFjM0QsV0FBVTRELENBQXhCLEtBQTZCeEIsRUFBakM7TUFDSSxDQUFDdUIsTUFBSSxDQUFMLEVBQVFFLFFBQVIsQ0FBaUIsRUFBakIsQ0FBSjtNQUNJLENBQUNELE1BQUksQ0FBTCxFQUFRQyxRQUFSLENBQWlCLEVBQWpCLENBQUo7TUFDR0gsTUFBSCxFQUFZO1dBQ0YsR0FBRWQsS0FBTSxJQUFHZSxDQUFFLElBQUdDLENBQUUsRUFBMUI7OztRQUVJRSxNQUFNLEVBQUksQ0FBQ2xCLEtBQUQsR0FBVSxHQUFFZSxDQUFFLElBQUdDLENBQUUsRUFBdkIsRUFBWjtTQUNPNUMsTUFBUCxDQUFnQjhDLEdBQWhCLEVBQXFCMUIsRUFBckI7U0FDTzBCLElBQUl4QixTQUFYLENBQXNCLE9BQU93QixJQUFJOUQsU0FBWDtTQUNmOEQsR0FBUDs7O0FBR0YzQixXQUFTWSxTQUFULEdBQXFCQSxTQUFyQjtBQUNBLEFBQU8sU0FBU0EsU0FBVCxDQUFtQkYsQ0FBbkIsRUFBc0I7UUFDckJULEtBQUssYUFBYSxPQUFPUyxDQUFwQixHQUNQQSxFQUFFa0IsS0FBRixDQUFRbkIsS0FBUixFQUFlLENBQWYsQ0FETyxHQUVQQyxFQUFFRCxLQUFGLENBRko7TUFHRyxDQUFFUixFQUFMLEVBQVU7Ozs7TUFFTixDQUFDdUIsQ0FBRCxFQUFHQyxDQUFILElBQVF4QixHQUFHMkIsS0FBSCxDQUFTLEdBQVQsQ0FBWjtNQUNHMUMsY0FBY3VDLENBQWpCLEVBQXFCOzs7TUFDakIsSUFBSUksU0FBU0wsQ0FBVCxFQUFZLEVBQVosQ0FBUjtNQUNJLElBQUlLLFNBQVNKLENBQVQsRUFBWSxFQUFaLENBQVI7O1NBRU8sRUFBSXRCLFdBQVdxQixDQUFmLEVBQWtCM0QsV0FBVzRELENBQTdCLEVBQVA7OztBQUdGekIsV0FBU2EsaUJBQVQsR0FBNkJBLGlCQUE3QjtBQUNBLEFBQU8sU0FBU0EsaUJBQVQsQ0FBMkJQLFVBQTNCLEVBQXVDO1NBQ3JDd0IsTUFBTUMsS0FBS0MsS0FBTCxDQUFhRixFQUFiLEVBQWlCRyxTQUFqQixDQUFiOztXQUVTQSxPQUFULEdBQW1CO1VBQ1hDLE1BQU0sSUFBSUMsT0FBSixFQUFaO1dBQ08sVUFBU0MsR0FBVCxFQUFjZCxLQUFkLEVBQXFCO1lBQ3BCZSxNQUFNL0IsV0FBVzhCLEdBQVgsQ0FBWjtVQUNHbEQsY0FBY21ELEdBQWpCLEVBQXVCO1lBQ2pCeEMsR0FBSixDQUFRLElBQVIsRUFBY3dDLEdBQWQ7ZUFDT2YsS0FBUDs7O1VBRUMsYUFBYSxPQUFPQSxLQUF2QixFQUErQjtjQUN2QmdCLE1BQU1KLElBQUl2QyxHQUFKLENBQVEyQixLQUFSLENBQVo7WUFDR3BDLGNBQWNvRCxHQUFqQixFQUF1QjtpQkFDZEEsSUFBTWhCLEtBQU4sQ0FBUDs7O2FBQ0dBLEtBQVA7S0FWRjs7OztBQ2xFVyxNQUFNaUIsTUFBTixDQUFhO1NBQ25CaEYsWUFBUCxDQUFvQixFQUFDaUYsU0FBRCxFQUFZQyxNQUFaLEVBQXBCLEVBQXlDO1VBQ2pDRixNQUFOLFNBQXFCLElBQXJCLENBQTBCO1dBQ25COUUsU0FBUCxDQUFpQitFLFNBQWpCLEdBQTZCQSxTQUE3QjtXQUNPRSxVQUFQLENBQW9CRCxNQUFwQjtXQUNPRixNQUFQOzs7U0FFS0ksTUFBUCxDQUFjL0UsR0FBZCxFQUFtQmdGLE9BQW5CLEVBQTRCO1VBQ3BCLEVBQUNDLE9BQUQsS0FBWUQsT0FBbEI7O1VBRU1MLE1BQU4sU0FBcUIsSUFBckIsQ0FBMEI7V0FDbkI5RSxTQUFQLENBQWlCcUYsU0FBakIsR0FBNkIsTUFBTS9ELEdBQU4sSUFBYTtZQUNsQzhELFFBQVE5RCxHQUFSLENBQU47YUFDTyxJQUFQO0tBRkY7O1dBSU93RCxNQUFQOzs7Y0FHVXRDLEVBQVosRUFBZ0I7UUFDWCxRQUFRQSxFQUFYLEVBQWdCO1lBQ1IsRUFBQ3BDLFNBQUQsRUFBWXNDLFNBQVosS0FBeUJGLEVBQS9CO1lBQ004QyxVQUFVeEMsT0FBT3lDLE1BQVAsQ0FBZ0IsRUFBQ25GLFNBQUQsRUFBWXNDLFNBQVosRUFBaEIsQ0FBaEI7V0FDSzhDLEdBQUwsR0FBVyxFQUFJRixPQUFKLEVBQVg7Ozs7ZUFHU3BGLFFBQWIsRUFBdUI7V0FDZDRDLE9BQU9ZLGdCQUFQLENBQTBCLElBQTFCLEVBQWdDO2dCQUMzQixFQUFJRyxPQUFPM0QsUUFBWCxFQUQyQixFQUFoQyxDQUFQOzs7T0FJRzhDLFFBQU0sSUFBWCxFQUFpQjtXQUFVLEtBQUt5QyxVQUFMLENBQWdCLEtBQUtDLFVBQUwsQ0FBZ0JDLE9BQWhCLENBQXdCQyxJQUF4QyxFQUE4QyxFQUE5QyxFQUFrRDVDLEtBQWxELENBQVA7O09BQ2YsR0FBRzZDLElBQVIsRUFBYztXQUFVLEtBQUtKLFVBQUwsQ0FBZ0IsS0FBS0ssTUFBTCxDQUFZbkMsSUFBNUIsRUFBa0NrQyxJQUFsQyxDQUFQOztZQUNQLEdBQUdBLElBQWIsRUFBbUI7V0FBVSxLQUFLSixVQUFMLENBQWdCLEtBQUtLLE1BQUwsQ0FBWW5DLElBQTVCLEVBQWtDa0MsSUFBbEMsRUFBd0MsSUFBeEMsQ0FBUDs7UUFDaEIsR0FBR0EsSUFBVCxFQUFlO1dBQVUsS0FBS0osVUFBTCxDQUFnQixLQUFLSyxNQUFMLENBQVluQyxJQUE1QixFQUFrQ2tDLElBQWxDLEVBQXdDLElBQXhDLEVBQThDRSxLQUFyRDs7O1NBRVgsR0FBR0YsSUFBVixFQUFnQjtXQUFVLEtBQUtKLFVBQUwsQ0FBa0IsS0FBS0ssTUFBTCxDQUFZRSxNQUE5QixFQUFzQ0gsSUFBdEMsQ0FBUDs7U0FDWmxCLEdBQVAsRUFBWSxHQUFHa0IsSUFBZixFQUFxQjtXQUFVLEtBQUtKLFVBQUwsQ0FBa0IsS0FBS0ssTUFBTCxDQUFZbkIsR0FBWixDQUFsQixFQUFvQ2tCLElBQXBDLENBQVA7O2FBQ2JJLE9BQVgsRUFBb0JqRCxLQUFwQixFQUEyQjtRQUN0QixlQUFlLE9BQU9pRCxPQUF6QixFQUFtQztnQkFBVyxLQUFLSCxNQUFmOztXQUM3QixDQUFDLEdBQUdELElBQUosS0FBYSxLQUFLSixVQUFMLENBQWdCUSxPQUFoQixFQUF5QkosSUFBekIsRUFBK0I3QyxLQUEvQixDQUFwQjs7O2FBRVNrRCxNQUFYLEVBQW1CTCxJQUFuQixFQUF5QjdDLEtBQXpCLEVBQWdDO1VBQ3hCVixNQUFNUSxPQUFPMUIsTUFBUCxDQUFnQixFQUFoQixFQUFvQixLQUFLb0UsR0FBekIsQ0FBWjtRQUNHLFFBQVF4QyxLQUFYLEVBQW1CO2NBQVNWLElBQUlVLEtBQVo7S0FBcEIsTUFDS1YsSUFBSVUsS0FBSixHQUFZQSxLQUFaO1FBQ0YsU0FBU0EsS0FBWixFQUFvQjtjQUNWVixJQUFJVSxLQUFKLEdBQVksS0FBSytCLFNBQUwsRUFBcEI7OztTQUVHb0IsYUFBTDs7VUFFTWpDLE1BQU1nQyxPQUFTLEtBQUtiLFNBQWQsRUFBeUIvQyxHQUF6QixFQUE4QixHQUFHdUQsSUFBakMsQ0FBWjtRQUNHLENBQUU3QyxLQUFGLElBQVcsZUFBZSxPQUFPa0IsSUFBSWtDLElBQXhDLEVBQStDO2FBQVFsQyxHQUFQOzs7UUFFNUNtQyxTQUFVbkMsSUFBSWtDLElBQUosRUFBZDtVQUNNTCxRQUFRLEtBQUs3RixRQUFMLENBQWNvRyxTQUFkLENBQXdCdEQsS0FBeEIsRUFBK0JxRCxNQUEvQixFQUF1QyxJQUF2QyxDQUFkO2FBQ1NBLE9BQU9ELElBQVAsQ0FBYyxPQUFRLEVBQUNMLEtBQUQsRUFBUixDQUFkLENBQVQ7V0FDT0EsS0FBUCxHQUFlQSxLQUFmO1dBQ09NLE1BQVA7OztNQUVFRSxFQUFKLEdBQVM7V0FBVSxDQUFDQyxHQUFELEVBQU0sR0FBR1gsSUFBVCxLQUFrQjtVQUNoQyxRQUFRVyxHQUFYLEVBQWlCO2NBQU8sSUFBSXJFLEtBQUosQ0FBYSxzQkFBYixDQUFOOzs7WUFFWnNFLE9BQU8sS0FBS0MsS0FBTCxFQUFiOztZQUVNbEIsTUFBTWlCLEtBQUtqQixHQUFqQjtVQUNHLGFBQWEsT0FBT2dCLEdBQXZCLEVBQTZCO1lBQ3ZCcEcsU0FBSixHQUFnQm9HLEdBQWhCO1lBQ0k5RCxTQUFKLEdBQWdCOEMsSUFBSUYsT0FBSixDQUFZNUMsU0FBNUI7T0FGRixNQUdLO2NBQ0dTLFVBQVVxRCxHQUFWLEtBQWtCQSxHQUF4QjtjQUNNLEVBQUNsQixTQUFTcUIsUUFBVixFQUFvQnZHLFNBQXBCLEVBQStCc0MsU0FBL0IsRUFBMENNLEtBQTFDLEVBQWlEbEIsS0FBakQsS0FBMEQwRSxHQUFoRTs7WUFFRy9FLGNBQWNyQixTQUFqQixFQUE2QjtjQUN2QkEsU0FBSixHQUFnQkEsU0FBaEI7Y0FDSXNDLFNBQUosR0FBZ0JBLFNBQWhCO1NBRkYsTUFHSyxJQUFHakIsY0FBY2tGLFFBQWQsSUFBMEIsQ0FBRW5CLElBQUlwRixTQUFuQyxFQUErQztjQUM5Q0EsU0FBSixHQUFnQnVHLFNBQVN2RyxTQUF6QjtjQUNJc0MsU0FBSixHQUFnQmlFLFNBQVNqRSxTQUF6Qjs7O1lBRUNqQixjQUFjdUIsS0FBakIsRUFBeUI7Y0FBS0EsS0FBSixHQUFZQSxLQUFaOztZQUN2QnZCLGNBQWNLLEtBQWpCLEVBQXlCO2NBQUtBLEtBQUosR0FBWUEsS0FBWjs7OzthQUVyQixNQUFNK0QsS0FBS2UsTUFBWCxHQUFvQkgsSUFBcEIsR0FBMkJBLEtBQUtJLElBQUwsQ0FBWSxHQUFHaEIsSUFBZixDQUFsQztLQXZCVTs7O09BeUJQLEdBQUdBLElBQVIsRUFBYztVQUNOTCxNQUFNLEtBQUtBLEdBQWpCO1NBQ0ksSUFBSWdCLEdBQVIsSUFBZVgsSUFBZixFQUFzQjtVQUNqQixTQUFTVyxHQUFULElBQWdCLFVBQVVBLEdBQTdCLEVBQW1DO1lBQzdCeEQsS0FBSixHQUFZd0QsR0FBWjtPQURGLE1BRUssSUFBRyxRQUFRQSxHQUFYLEVBQWlCO2NBQ2QsRUFBQ3hELEtBQUQsRUFBUWxCLEtBQVIsS0FBaUIwRSxHQUF2QjtZQUNHL0UsY0FBY3VCLEtBQWpCLEVBQXlCO2NBQUtBLEtBQUosR0FBWUEsS0FBWjs7WUFDdkJ2QixjQUFjSyxLQUFqQixFQUF5QjtjQUFLQSxLQUFKLEdBQVlBLEtBQVo7Ozs7V0FDdkIsSUFBUDs7O2NBRVU7V0FDSCxLQUFLNEUsS0FBTCxDQUFhLEVBQUMxRCxPQUFPLElBQVIsRUFBYixDQUFQOzs7UUFFSSxHQUFHNkMsSUFBVCxFQUFlO1dBQ04vQyxPQUFPQyxNQUFQLENBQWdCLElBQWhCLEVBQXNCO1dBQ3BCLEVBQUNjLE9BQU9mLE9BQU8xQixNQUFQLENBQWdCLEVBQWhCLEVBQW9CLEtBQUtvRSxHQUF6QixFQUE4QixHQUFHSyxJQUFqQyxDQUFSLEVBRG9CLEVBQXRCLENBQVA7OztrQkFJYztRQUNYLENBQUUsS0FBS2lCLFlBQUwsRUFBTCxFQUEyQjtZQUNuQixJQUFJM0UsS0FBSixDQUFhLHdCQUFiLENBQU47OztpQkFDVztXQUFVLElBQVA7O1VBQ1Y0RSxVQUFRLEVBQWhCLEVBQW9CO1FBQ2YsU0FBU0EsT0FBVCxJQUFvQixVQUFVQSxPQUFqQyxFQUEyQztnQkFDL0IsRUFBSUMsUUFBUUQsT0FBWixFQUFWOzs7VUFFSUUsVUFBVSxLQUFLL0csUUFBTCxDQUFjZ0gsV0FBZCxDQUEwQixLQUFLMUIsR0FBTCxDQUFTcEYsU0FBbkMsQ0FBaEI7O1VBRU0rRyxjQUFjSixRQUFRSSxXQUFSLElBQXVCLElBQTNDO1FBQ0lDLFlBQVlMLFFBQVFLLFNBQXhCO1FBQ0csU0FBU0EsU0FBWixFQUF3QjtrQkFDVkQsY0FBWSxDQUF4Qjs7O1FBRUVMLFlBQUo7VUFDTU8sVUFBVSxJQUFJQyxPQUFKLENBQWMsQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO1lBQzNDQyxPQUFPVixRQUFRUyxNQUFSLEdBQWlCQSxNQUFqQixHQUEwQkQsT0FBdkM7V0FDS1QsWUFBTCxHQUFvQkEsZUFBZSxNQUNqQ0ssY0FBY0YsUUFBUVMsRUFBUixFQUFkLEdBQ0ksSUFESixJQUNZRCxLQUFLUixPQUFMLEdBQWUsS0FEM0IsQ0FERjtLQUZjLENBQWhCOztRQU1JVSxHQUFKO1VBQ01DLGNBQWNSLGFBQWFELGNBQVksQ0FBN0M7UUFDR0osUUFBUUMsTUFBUixJQUFrQkksU0FBckIsRUFBaUM7WUFDekJTLE9BQU8sS0FBS0MsS0FBTCxDQUFXLFNBQVgsQ0FBYjtZQUNNQyxZQUFZLE1BQU07WUFDbkJILGNBQWNYLFFBQVFTLEVBQVIsRUFBakIsRUFBZ0M7ZUFDekJ4QixNQUFMLENBQVksTUFBWjs7T0FGSjtZQUdNOEIsWUFBY0QsU0FBZCxFQUF5QkgsV0FBekIsQ0FBTjtLQUxGLE1BTUs7WUFDR0ksWUFBY2xCLFlBQWQsRUFBNEJjLFdBQTVCLENBQU47O1FBQ0NELElBQUlNLEtBQVAsRUFBZTtVQUFLQSxLQUFKOztVQUNWQyxRQUFRLE1BQU1DLGNBQWNSLEdBQWQsQ0FBcEI7O1lBRVF2QixJQUFSLENBQWE4QixLQUFiLEVBQW9CQSxLQUFwQjtXQUNPYixPQUFQOzs7UUFHSWUsU0FBTixFQUFpQixHQUFHdkMsSUFBcEIsRUFBMEI7UUFDckIsYUFBYSxPQUFPdUMsU0FBdkIsRUFBbUM7a0JBQ3JCLEtBQUsxQyxVQUFMLENBQWdCMEMsU0FBaEIsQ0FBWjs7O1FBRUMsZUFBZSxPQUFPQSxVQUFVekUsSUFBbkMsRUFBMEM7WUFDbEMsSUFBSTBFLFNBQUosQ0FBaUIsZ0NBQWpCLENBQU47OztXQUVLdkYsT0FBT0MsTUFBUCxDQUFnQixJQUFoQixFQUF3QjtjQUNuQixFQUFDYyxPQUFPdUUsU0FBUixFQURtQjtXQUV0QixFQUFDdkUsT0FBT2YsT0FBTzFCLE1BQVAsQ0FBZ0IsRUFBaEIsRUFBb0IsS0FBS29FLEdBQXpCLEVBQThCLEdBQUdLLElBQWpDLENBQVIsRUFGc0IsRUFBeEIsQ0FBUDs7O1NBSUtaLFVBQVAsQ0FBa0JxRCxTQUFsQixFQUE2QjtTQUN2QixNQUFNLENBQUNDLElBQUQsRUFBT0gsU0FBUCxDQUFWLElBQStCdEYsT0FBTzBGLE9BQVAsQ0FBaUJGLFNBQWpCLENBQS9CLEVBQTREO1dBQ3JEdEksU0FBTCxDQUFldUksSUFBZixJQUF1QixZQUFXO2VBQ3pCLEtBQUtULEtBQUwsQ0FBYU0sU0FBYixDQUFQO09BREY7O1NBRUdwSSxTQUFMLENBQWUwRixVQUFmLEdBQTRCNEMsU0FBNUI7U0FDS3RJLFNBQUwsQ0FBZThGLE1BQWYsR0FBd0J3QyxVQUFVRyxPQUFsQzs7O1VBR01DLFlBQVlKLFVBQVVLLElBQVYsQ0FBZWhGLElBQWpDO1dBQ09ELGdCQUFQLENBQTBCLEtBQUsxRCxTQUEvQixFQUE0QztpQkFDL0IsRUFBSWtDLE1BQU07aUJBQVk7a0JBQ3pCLENBQUMsR0FBRzJELElBQUosS0FBYSxLQUFLSixVQUFMLENBQWdCaUQsU0FBaEIsRUFBMkI3QyxJQUEzQixDQURZO3VCQUVwQixDQUFDLEdBQUdBLElBQUosS0FBYSxLQUFLSixVQUFMLENBQWdCaUQsU0FBaEIsRUFBMkI3QyxJQUEzQixFQUFpQyxJQUFqQyxDQUZPO21CQUd4QixDQUFDLEdBQUdBLElBQUosS0FBYSxLQUFLSixVQUFMLENBQWdCaUQsU0FBaEIsRUFBMkI3QyxJQUEzQixFQUFpQyxJQUFqQyxFQUF1Q0UsS0FINUIsRUFBVDtTQUFiLEVBRCtCLEVBQTVDOztXQU1PLElBQVA7OztvQkFHZ0I2QyxPQUFsQixFQUEyQjtXQUNsQixJQUFJdEIsT0FBSixDQUFjLENBQUNDLE9BQUQsRUFBVUMsTUFBVixLQUFxQjtjQUNoQ3BCLElBQVIsQ0FBZW1CLE9BQWYsRUFBd0JDLE1BQXhCO2NBQ1FwQixJQUFSLENBQWU4QixLQUFmLEVBQXNCQSxLQUF0Qjs7WUFFTVcsVUFBVSxNQUFNckIsT0FBUyxJQUFJLEtBQUtzQixZQUFULEVBQVQsQ0FBdEI7WUFDTW5CLE1BQU1vQixXQUFXRixPQUFYLEVBQW9CLEtBQUtHLFVBQXpCLENBQVo7VUFDR3JCLElBQUlNLEtBQVAsRUFBZTtZQUFLQSxLQUFKOzs7ZUFFUEMsS0FBVCxHQUFpQjtxQkFBa0JQLEdBQWY7O0tBUmYsQ0FBUDs7OztBQVdKLE1BQU1tQixZQUFOLFNBQTJCM0csS0FBM0IsQ0FBaUM7O0FBRWpDVyxPQUFPMUIsTUFBUCxDQUFnQjBELE9BQU85RSxTQUF2QixFQUFrQztjQUFBLEVBQ2xCZ0osWUFBWSxJQURNLEVBQWxDOztBQ3pMZSxNQUFNQyxRQUFOLENBQWU7U0FDckJDLFFBQVAsQ0FBZ0JDLFVBQWhCLEVBQTRCO1VBQ3BCRixRQUFOLFNBQXVCLElBQXZCLENBQTRCO1dBQ3JCN0gsTUFBUCxDQUFnQjZILFNBQVNqSixTQUF6QixFQUFvQ21KLFVBQXBDO1dBQ09GLFFBQVA7OztZQUVRO1dBQVcsYUFBWXhHLFVBQVUsS0FBS0QsRUFBZixFQUFtQixJQUFuQixDQUF5QixHQUE3Qzs7V0FDSjtXQUFVLEtBQUs0RyxPQUFMLEdBQWVDLE1BQWYsRUFBUDs7WUFDRjtXQUFVLElBQUksS0FBSzlHLFFBQVQsQ0FBa0IsS0FBS0MsRUFBdkIsQ0FBUDs7aUJBQ0U7V0FBVSxLQUFLQSxFQUFaOzs7Y0FFTkEsRUFBWixFQUFnQjhHLE9BQWhCLEVBQXlCO1dBQ2hCNUYsZ0JBQVAsQ0FBMEIsSUFBMUIsRUFBZ0M7VUFDMUIsRUFBSUcsT0FBT3JCLEVBQVgsRUFEMEI7VUFFMUIsRUFBSXFCLE9BQU95RixRQUFRQyxZQUFSLENBQXFCLElBQXJCLEVBQTJCaEQsRUFBdEMsRUFGMEIsRUFBaEM7OztjQUlVO1dBQVUsSUFBSWlELEdBQUosRUFBUDs7bUJBQ0U7V0FBVSxLQUFLQyxTQUFMLEVBQVA7O21CQUNIO1dBQVUsS0FBS0EsU0FBTCxFQUFQOztxQkFDRDtXQUFVLEtBQUtBLFNBQUwsRUFBUDs7d0JBQ0E7V0FBVSxLQUFLQSxTQUFMLEVBQVA7OztXQUVoQkMsSUFBVCxFQUFlO1VBQ1BDLFdBQVcsS0FBS0MsY0FBTCxFQUFqQjtVQUNNQyxhQUFhLEtBQUtDLGdCQUFMLEVBQW5CO1dBQ09wRyxnQkFBUCxDQUEwQixJQUExQixFQUFrQztnQkFDdEIsRUFBSUcsT0FBTzhGLFFBQVgsRUFEc0I7a0JBRXBCLEVBQUk5RixPQUFPZ0csVUFBWCxFQUZvQixFQUFsQzs7VUFJTUUsVUFBVSxDQUFDekUsT0FBRCxFQUFVeUUsT0FBVixLQUFzQjtZQUM5QkMsS0FBS0MsS0FBS0MsR0FBTCxFQUFYO1VBQ0c1RSxPQUFILEVBQWE7Y0FDTHRCLElBQUk2RixXQUFXM0gsR0FBWCxDQUFlb0QsUUFBUWxGLFNBQXZCLENBQVY7WUFDR3FCLGNBQWN1QyxDQUFqQixFQUFxQjtZQUNqQmdHLEVBQUYsR0FBT2hHLEVBQUcsTUFBSytGLE9BQVEsRUFBaEIsSUFBcUJDLEVBQTVCOzs7V0FDQ0csV0FBTCxDQUFpQjdFLE9BQWpCLEVBQTBCeUUsT0FBMUIsRUFBbUNDLEVBQW5DO0tBTkY7O1dBUU87Z0JBQ0ssS0FBS0ksY0FBTCxFQURMO21CQUVRLEtBQUs3SCxRQUFMLENBQWNJLGNBQWQsQ0FBNkIsS0FBSzRELEVBQWxDLENBRlI7O2dCQUlLLENBQUM1RSxHQUFELEVBQU1JLElBQU4sS0FBZTtnQkFDZkEsS0FBS3VELE9BQWIsRUFBc0IsTUFBdEI7Y0FDTVMsUUFBUTRELFNBQVN6SCxHQUFULENBQWFILEtBQUtpQixLQUFsQixDQUFkO2NBQ01xSCxPQUFPLEtBQUtDLFFBQUwsQ0FBYzNJLEdBQWQsRUFBbUJJLElBQW5CLEVBQXlCZ0UsS0FBekIsQ0FBYjs7WUFFR3RFLGNBQWNzRSxLQUFqQixFQUF5QjtrQkFDZndCLE9BQVIsQ0FBZ0I4QyxRQUFRLEVBQUMxSSxHQUFELEVBQU1JLElBQU4sRUFBeEIsRUFBcUNxRSxJQUFyQyxDQUEwQ0wsS0FBMUM7U0FERixNQUVLLE9BQU9zRSxJQUFQO09BWEY7O2VBYUksQ0FBQzFJLEdBQUQsRUFBTUksSUFBTixLQUFlO2dCQUNkQSxLQUFLdUQsT0FBYixFQUFzQixLQUF0QjtjQUNNUyxRQUFRNEQsU0FBU3pILEdBQVQsQ0FBYUgsS0FBS2lCLEtBQWxCLENBQWQ7Y0FDTXFILE9BQU8sS0FBS0UsT0FBTCxDQUFhNUksR0FBYixFQUFrQkksSUFBbEIsRUFBd0JnRSxLQUF4QixDQUFiOztZQUVHdEUsY0FBY3NFLEtBQWpCLEVBQXlCO2tCQUNmd0IsT0FBUixDQUFnQjhDLElBQWhCLEVBQXNCakUsSUFBdEIsQ0FBMkJMLEtBQTNCO1NBREYsTUFFSyxPQUFPc0UsSUFBUDtPQXBCRjs7c0JBc0JXLENBQUNHLE9BQUQsRUFBVXpJLElBQVYsS0FBbUI7Z0JBQ3pCQSxLQUFLdUQsT0FBYixFQUFzQixRQUF0QjtPQXZCRztrQkF3Qk8sQ0FBQzNELEdBQUQsRUFBTUksSUFBTixLQUFlO2dCQUNqQkEsS0FBS3VELE9BQWIsRUFBc0IsUUFBdEI7Y0FDTVMsUUFBUTRELFNBQVN6SCxHQUFULENBQWFILEtBQUtpQixLQUFsQixDQUFkO2NBQ013SCxVQUFVLEtBQUtDLFVBQUwsQ0FBZ0I5SSxHQUFoQixFQUFxQkksSUFBckIsRUFBMkJnRSxLQUEzQixDQUFoQjs7WUFFR3RFLGNBQWNzRSxLQUFqQixFQUF5QjtrQkFDZndCLE9BQVIsQ0FBZ0JpRCxPQUFoQixFQUF5QnBFLElBQXpCLENBQThCTCxLQUE5Qjs7ZUFDS3lFLE9BQVA7T0EvQkcsRUFBUDs7O1lBaUNRaEksRUFBVixFQUFjO1FBQ1RBLEVBQUgsRUFBUTthQUFRLEtBQUtELFFBQUwsQ0FBY1csUUFBZCxDQUF5QlYsRUFBekIsRUFBNkIsS0FBSytELEVBQWxDLENBQVA7OztZQUNELEVBQUNqQixTQUFROUMsRUFBVCxFQUFhVixLQUFiLEVBQVYsRUFBK0I7UUFDMUJVLEVBQUgsRUFBUTthQUFRLEtBQUtELFFBQUwsQ0FBY1csUUFBZCxDQUF5QlYsRUFBekIsRUFBNkIsS0FBSytELEVBQWxDLEVBQXNDekUsS0FBdEMsQ0FBUDs7OztjQUVDd0QsT0FBWixFQUFxQnlFLE9BQXJCLEVBQThCQyxFQUE5QixFQUFrQztXQUN6QnJJLEdBQVQsRUFBY0ksSUFBZCxFQUFvQjJJLFFBQXBCLEVBQThCO1FBQ3pCQSxRQUFILEVBQWM7YUFBUS9JLEdBQVA7OztVQUNUQSxHQUFSLEVBQWFJLElBQWIsRUFBbUIySSxRQUFuQixFQUE2QjtRQUN4QkEsUUFBSCxFQUFjO2FBQVEvSSxHQUFQOztXQUNSLEVBQUlBLEdBQUosRUFBU0ksSUFBVCxFQUFlNEksUUFBUSxLQUFLQyxTQUFMLENBQWU3SSxJQUFmLENBQXZCLEVBQVA7O2FBQ1NKLEdBQVgsRUFBZ0JJLElBQWhCLEVBQXNCMkksUUFBdEIsRUFBZ0M7WUFDdEJHLElBQVIsQ0FBZ0IseUJBQXdCOUksSUFBSyxFQUE3QztXQUNPLElBQVA7Ozs7Ozs7R0FRRnVFLFVBQVV0RCxLQUFWLEVBQWlCcUQsTUFBakIsRUFBeUJpRCxPQUF6QixFQUFrQztXQUN6QixLQUFLd0IsZ0JBQUwsQ0FBd0I5SCxLQUF4QixFQUErQnFELE1BQS9CLEVBQXVDaUQsT0FBdkMsQ0FBUDs7O2NBRVVsSixTQUFaLEVBQXVCO1VBQ2Z1RSxNQUFNdkUsVUFBVUEsU0FBVixJQUF1QkEsU0FBbkM7UUFDSTZHLFVBQVUsS0FBSzRDLFVBQUwsQ0FBZ0IzSCxHQUFoQixDQUFzQnlDLEdBQXRCLENBQWQ7UUFDR2xELGNBQWN3RixPQUFqQixFQUEyQjtnQkFDZixFQUFJN0csU0FBSixFQUFlNEosSUFBSUMsS0FBS0MsR0FBTCxFQUFuQjthQUNIO2lCQUFVRCxLQUFLQyxHQUFMLEtBQWEsS0FBS0YsRUFBekI7U0FEQSxFQUFWO1dBRUtILFVBQUwsQ0FBZ0J6SCxHQUFoQixDQUFzQnVDLEdBQXRCLEVBQTJCc0MsT0FBM0I7O1dBQ0tBLE9BQVA7OzttQkFFZWpFLEtBQWpCLEVBQXdCcUQsTUFBeEIsRUFBZ0NpRCxPQUFoQyxFQUF5QztRQUNuQ3ZELFFBQVEsSUFBSXVCLE9BQUosQ0FBYyxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7V0FDeENtQyxRQUFMLENBQWN2SCxHQUFkLENBQW9CWSxLQUFwQixFQUEyQnVFLE9BQTNCO2FBQ093RCxLQUFQLENBQWV2RCxNQUFmO0tBRlUsQ0FBWjs7UUFJRzhCLE9BQUgsRUFBYTtjQUNIQSxRQUFRMEIsaUJBQVIsQ0FBMEJqRixLQUExQixDQUFSOzs7VUFFSW1DLFFBQVEsTUFBTSxLQUFLeUIsUUFBTCxDQUFjdEgsTUFBZCxDQUF1QlcsS0FBdkIsQ0FBcEI7VUFDTW9ELElBQU4sQ0FBYThCLEtBQWIsRUFBb0JBLEtBQXBCO1dBQ09uQyxLQUFQOzs7O0FBRUprRCxTQUFTakosU0FBVCxDQUFtQnVDLFFBQW5CLEdBQThCQSxVQUE5Qjs7QUNySE8sTUFBTTBJLGFBQVduSSxPQUFPQyxNQUFQLENBQ3RCRCxPQUFPb0ksY0FBUCxDQUF3QixZQUFVLEVBQWxDLENBRHNCLEVBRXRCLEVBQUlDLFVBQVUsRUFBSWpKLEtBQUtpSixRQUFULEVBQWQsRUFGc0IsQ0FBakI7O0FBSVAsU0FBU0EsUUFBVCxHQUFvQjtRQUNaMUUsT0FBTzNELE9BQU9DLE1BQVAsQ0FBYyxJQUFkLENBQWI7T0FDSzdDLFFBQUwsR0FBZ0IrQyxLQUFLQSxDQUFyQjtTQUNPd0QsSUFBUDs7O0FBRUYsQUFBTyxTQUFTMkUsV0FBVCxDQUFxQkMsS0FBckIsRUFBNEI7U0FDMUJqSyxNQUFQLENBQWdCNkosVUFBaEIsRUFBMEJJLEtBQTFCOzs7QUNSRkQsWUFBYztTQUNMLEdBQUd2RixJQUFWLEVBQWdCO1FBQ1gsTUFBTUEsS0FBS2UsTUFBWCxJQUFxQixlQUFlLE9BQU9mLEtBQUssQ0FBTCxDQUE5QyxFQUF3RDthQUMvQyxLQUFLeUYsY0FBTCxDQUFzQnpGLEtBQUssQ0FBTCxDQUF0QixDQUFQOzs7VUFFSXlELFVBQVUsSUFBSSxLQUFLeEUsTUFBVCxFQUFoQjtXQUNPLE1BQU1lLEtBQUtlLE1BQVgsR0FBb0IwQyxRQUFRL0MsRUFBUixDQUFXLEdBQUdWLElBQWQsQ0FBcEIsR0FBMEN5RCxPQUFqRDtHQU5VOztpQkFRR2lDLFNBQWYsRUFBMEI7VUFDbEJDLFNBQVNGLGVBQWVDLFNBQWYsQ0FBZjtVQUNNakksU0FBUyxLQUFLcEQsUUFBTCxDQUFnQnNMLE1BQWhCLENBQWY7V0FDT0EsT0FBTy9ELElBQWQ7R0FYVTs7YUFhRDhELFNBQVgsRUFBc0JFLEdBQXRCLEVBQTJCO1VBQ25CRCxTQUFTRixlQUFlQyxTQUFmLENBQWY7VUFDTUcsU0FBUyxLQUFLUCxRQUFMLENBQWNRLFlBQWQsQ0FBMkJGLEdBQTNCLENBQWY7VUFDTW5JLFNBQVMsS0FBS3BELFFBQUwsQ0FBZ0IsQ0FBQzBMLEVBQUQsRUFBS3pMLEdBQUwsS0FDN0IyQyxPQUFPMUIsTUFBUCxDQUFnQm9LLE1BQWhCLEVBQXdCRSxPQUFPRSxFQUFQLEVBQVd6TCxHQUFYLENBQXhCLENBRGEsQ0FBZjtXQUVPcUwsT0FBTy9ELElBQWQ7R0FsQlUsRUFBZDs7QUFxQkEsTUFBTW9FLGdCQUFnQjtRQUNkQyxRQUFOLENBQWVGLEVBQWYsRUFBbUJ6TCxHQUFuQixFQUF3QjtTQUNqQjRMLFFBQUwsRUFBZ0IsTUFBTSxLQUFLUixTQUFMLENBQWVLLEVBQWYsRUFBbUJ6TCxHQUFuQixDQUF0QjtVQUNNeUwsR0FBRzNLLFFBQUgsRUFBTjtHQUhrQjtnQkFJTjJLLEVBQWQsRUFBa0IxSyxHQUFsQixFQUF1QjtTQUNoQjhLLE9BQUwsQ0FBYTlLLEdBQWI7R0FMa0I7Y0FNUjBLLEVBQVosRUFBZ0IxSyxHQUFoQixFQUFxQjtVQUNiLEtBQUs4SyxPQUFMLENBQWE5SyxHQUFiLENBQU4sR0FBMEIsS0FBSzZLLFFBQUwsRUFBMUI7R0FQa0IsRUFBdEI7O0FBU0EsQUFBTyxTQUFTVCxjQUFULENBQXdCQyxTQUF4QixFQUFtQztRQUNsQ0MsU0FBUzFJLE9BQU9DLE1BQVAsQ0FBZ0I4SSxhQUFoQixDQUFmO01BQ0csZUFBZSxPQUFPTixTQUF6QixFQUFxQztRQUNoQ0EsVUFBVU8sUUFBYixFQUF3QjtZQUNoQixJQUFJekQsU0FBSixDQUFpQiwrREFBakIsQ0FBTjs7V0FDS2pILE1BQVAsQ0FBZ0JvSyxNQUFoQixFQUF3QkQsU0FBeEI7R0FIRixNQUlLO1dBQ0lBLFNBQVAsR0FBbUJBLFNBQW5COzs7U0FFSzlELElBQVAsR0FBYyxJQUFJSCxPQUFKLENBQWMsQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO1dBQ3hDdUUsUUFBUCxHQUFrQnhFLE9BQWxCO1dBQ095RSxPQUFQLEdBQWlCeEUsTUFBakI7R0FGWSxDQUFkO1NBR09nRSxNQUFQOzs7QUMxQ0ZKLFlBQWM7Y0FBQTtNQUVSSyxHQUFKLEVBQVM7V0FBVSxLQUFLRSxZQUFMLENBQWtCRixHQUFsQixDQUFQO0dBRkE7ZUFHQ0EsR0FBYixFQUFrQjtXQUNULEtBQUt2TCxRQUFMLENBQWdCLFVBQVUwTCxFQUFWLEVBQWN6TCxHQUFkLEVBQW1CO1lBQ2xDOEwsTUFBTUMsYUFBYVQsR0FBYixFQUFrQkcsRUFBbEIsRUFBc0J6TCxHQUF0QixDQUFaO2FBQ08sRUFBSThMLEdBQUo7Y0FDQ3RMLE1BQU4sQ0FBYSxFQUFDZ0IsR0FBRCxFQUFNZ0osTUFBTixFQUFiLEVBQTRCO2dCQUNwQnNCLElBQUkvRixNQUFKLENBQWF5RSxNQUFiLEVBQXFCaEosSUFBSXdLLEVBQXpCLEVBQ0pDLFVBQVVBLE9BQU96SyxJQUFJMEssRUFBWCxFQUFlMUssSUFBSTZELEdBQW5CLENBRE4sQ0FBTjtTQUZHLEVBQVA7S0FGSyxDQUFQO0dBSlU7O2NBV0FpRyxHQUFaLEVBQWlCO1dBQ1IsS0FBS3ZMLFFBQUwsQ0FBZ0IsVUFBVTBMLEVBQVYsRUFBY3pMLEdBQWQsRUFBbUI7WUFDbEM4TCxNQUFNQyxhQUFhVCxHQUFiLEVBQWtCRyxFQUFsQixFQUFzQnpMLEdBQXRCLENBQVo7YUFDTyxFQUFJOEwsR0FBSjtjQUNDdEwsTUFBTixDQUFhLEVBQUNnQixHQUFELEVBQU1nSixNQUFOLEVBQWIsRUFBNEI7Z0JBQ3BCc0IsSUFBSUssWUFBSixDQUFtQjNCLE1BQW5CLEVBQTJCaEosSUFBSXdLLEVBQS9CLEVBQ0pDLFVBQVVBLE9BQU96SyxJQUFJMEssRUFBWCxFQUFlMUssSUFBSTZELEdBQW5CLENBRE4sQ0FBTjtTQUZHLEVBQVA7S0FGSyxDQUFQO0dBWlUsRUFBZDs7QUFvQkEsU0FBUzBHLFlBQVQsQ0FBc0JULEdBQXRCLEVBQTJCRyxFQUEzQixFQUErQnpMLEdBQS9CLEVBQW9DO1FBQzVCb00sTUFBTWQsSUFBSWUsU0FBSixJQUFpQixNQUE3QjtRQUNNQyxZQUFZaEIsSUFBSWlCLFNBQUosR0FDZFAsTUFBTVYsSUFBSWlCLFNBQUosQ0FBY0gsTUFBTUosRUFBcEIsRUFBd0JQLEVBQXhCLEVBQTRCekwsR0FBNUIsQ0FEUSxHQUVkLGVBQWUsT0FBT3NMLEdBQXRCLEdBQ0FVLE1BQU1WLElBQUljLE1BQU1KLEVBQVYsRUFBY1AsRUFBZCxFQUFrQnpMLEdBQWxCLENBRE4sR0FFQWdNLE1BQU07VUFDRVEsS0FBS2xCLElBQUljLE1BQU1KLEVBQVYsQ0FBWDtXQUNPUSxLQUFLQSxHQUFHQyxJQUFILENBQVFuQixHQUFSLENBQUwsR0FBb0JrQixFQUEzQjtHQU5OOztTQVFPN0osT0FBT0MsTUFBUCxDQUFnQjhKLE9BQWhCLEVBQXlCO2VBQ25CLEVBQUloSixPQUFPNEksU0FBWCxFQURtQjtjQUVwQixFQUFJNUksT0FBTytILEdBQUd4QyxPQUFILEVBQVgsRUFGb0IsRUFBekIsQ0FBUDs7O0FBS0YsTUFBTXlELFVBQVk7UUFDVjNHLE1BQU4sQ0FBYXlFLE1BQWIsRUFBcUJ3QixFQUFyQixFQUF5QlcsRUFBekIsRUFBNkI7VUFDckJWLFNBQVMsTUFBTSxLQUFLVyxVQUFMLENBQWtCcEMsTUFBbEIsRUFBMEJ3QixFQUExQixDQUFyQjtRQUNHMUssY0FBYzJLLE1BQWpCLEVBQTBCOzs7O1VBRXBCbEksTUFBTSxLQUFLOEksTUFBTCxDQUFjckMsTUFBZCxFQUFzQnlCLE1BQXRCLEVBQThCVSxFQUE5QixDQUFaO1dBQ08sTUFBTTVJLEdBQWI7R0FOYzs7UUFRVm9JLFlBQU4sQ0FBbUIzQixNQUFuQixFQUEyQndCLEVBQTNCLEVBQStCVyxFQUEvQixFQUFtQztVQUMzQlYsU0FBUyxNQUFNLEtBQUtXLFVBQUwsQ0FBa0JwQyxNQUFsQixFQUEwQndCLEVBQTFCLENBQXJCO1FBQ0cxSyxjQUFjMkssTUFBakIsRUFBMEI7Ozs7VUFFcEJsSSxNQUFNb0QsUUFBUUMsT0FBUixDQUFnQixLQUFLMEYsSUFBckIsRUFDVDdHLElBRFMsQ0FDRixNQUFNLEtBQUs0RyxNQUFMLENBQWNyQyxNQUFkLEVBQXNCeUIsTUFBdEIsRUFBOEJVLEVBQTlCLENBREosQ0FBWjtTQUVLRyxJQUFMLEdBQVkvSSxJQUFJa0MsSUFBSixDQUFTOEcsSUFBVCxFQUFlQSxJQUFmLENBQVo7V0FDTyxNQUFNaEosR0FBYjtHQWZjOztRQWlCVjZJLFVBQU4sQ0FBaUJwQyxNQUFqQixFQUF5QndCLEVBQXpCLEVBQTZCO1FBQ3hCLGFBQWEsT0FBT0EsRUFBdkIsRUFBNEI7WUFDcEJ4QixPQUFPaEgsSUFBUCxDQUFjLEVBQUN3SSxFQUFELEVBQUtnQixVQUFVLEtBQUtBLFFBQXBCO2VBQ1gsRUFBSUMsU0FBUyxtQkFBYixFQUFrQ0MsTUFBTSxHQUF4QyxFQURXLEVBQWQsQ0FBTjs7OztRQUlFO1lBQ0lqQixTQUFTLE1BQU0sS0FBS0ssU0FBTCxDQUFlTixFQUFmLENBQXJCO1VBQ0csQ0FBRUMsTUFBTCxFQUFjO2NBQ056QixPQUFPaEgsSUFBUCxDQUFjLEVBQUN3SSxFQUFELEVBQUtnQixVQUFVLEtBQUtBLFFBQXBCO2lCQUNYLEVBQUlDLFNBQVMsbUJBQWIsRUFBa0NDLE1BQU0sR0FBeEMsRUFEVyxFQUFkLENBQU47O2FBRUtqQixNQUFQO0tBTEYsQ0FNQSxPQUFNbEwsR0FBTixFQUFZO1lBQ0p5SixPQUFPaEgsSUFBUCxDQUFjLEVBQUN3SSxFQUFELEVBQUtnQixVQUFVLEtBQUtBLFFBQXBCO2VBQ1gsRUFBSUMsU0FBVSxzQkFBcUJsTSxJQUFJa00sT0FBUSxFQUEvQyxFQUFrREMsTUFBTSxHQUF4RCxFQURXLEVBQWQsQ0FBTjs7R0E5Qlk7O1FBaUNWTCxNQUFOLENBQWFyQyxNQUFiLEVBQXFCeUIsTUFBckIsRUFBNkJVLEVBQTdCLEVBQWlDO1FBQzNCO1VBQ0VFLFNBQVNGLEtBQUssTUFBTUEsR0FBR1YsTUFBSCxDQUFYLEdBQXdCLE1BQU1BLFFBQTNDO0tBREYsQ0FFQSxPQUFNbEwsR0FBTixFQUFZO1lBQ0p5SixPQUFPaEgsSUFBUCxDQUFjLEVBQUN3SixVQUFVLEtBQUtBLFFBQWhCLEVBQTBCRyxPQUFPcE0sR0FBakMsRUFBZCxDQUFOO2FBQ08sS0FBUDs7O1FBRUN5SixPQUFPNEMsYUFBVixFQUEwQjtZQUNsQjVDLE9BQU9oSCxJQUFQLENBQWMsRUFBQ3FKLE1BQUQsRUFBZCxDQUFOOztXQUNLLElBQVA7R0ExQ2MsRUFBbEI7O0FBNkNBLFNBQVNFLElBQVQsR0FBZ0I7O0FDaEZoQjlCLFlBQWM7U0FDTG9DLE9BQVAsRUFBZ0I7V0FBVSxLQUFLdE4sUUFBTCxDQUFnQnNOLE9BQWhCLENBQVA7R0FEUCxFQUFkOztBQ0dBLE1BQU1DLHlCQUEyQjtlQUNsQixVQURrQjtjQUVuQjtXQUFVLElBQUlqRSxHQUFKLEVBQVAsQ0FBSDtHQUZtQixFQUkvQjdJLE9BQU8sRUFBQ2dCLEdBQUQsRUFBTW9FLEtBQU4sRUFBYWhFLElBQWIsRUFBUCxFQUEyQjtZQUNqQjhJLElBQVIsQ0FBZSxlQUFmLEVBQWdDLEVBQUlsSixHQUFKLEVBQVNvRSxLQUFULEVBQWdCaEUsSUFBaEIsRUFBaEM7R0FMNkI7V0FNdEI2SixFQUFULEVBQWExSyxHQUFiLEVBQWtCQyxLQUFsQixFQUF5QjtZQUNmbU0sS0FBUixDQUFnQixpQkFBaEIsRUFBbUNwTSxHQUFuQzs7O0dBUDZCLEVBVS9CTCxZQUFZK0ssRUFBWixFQUFnQjFLLEdBQWhCLEVBQXFCQyxLQUFyQixFQUE0Qjs7WUFFbEJtTSxLQUFSLENBQWlCLHNCQUFxQnBNLElBQUlrTSxPQUFRLEVBQWxEO0dBWjZCOztXQWN0Qk0sT0FBVCxFQUFrQjs7V0FFVEEsT0FBUDtHQWhCNkIsRUFBakM7O0FBbUJBLGFBQWUsVUFBU0MsY0FBVCxFQUF5QjttQkFDckI3SyxPQUFPMUIsTUFBUCxDQUFnQixFQUFoQixFQUFvQnFNLHNCQUFwQixFQUE0Q0UsY0FBNUMsQ0FBakI7UUFDTTtlQUFBLEVBQ1NsRSxTQURUO1lBRUltRSxjQUZKO2NBR01DLGdCQUhOO2lCQUlTQyxtQkFKVCxLQUtKSCxjQUxGOztNQU9HQSxlQUFlSSxRQUFsQixFQUE2QjtXQUNwQjNNLE1BQVAsQ0FBZ0I2SixVQUFoQixFQUEwQjBDLGVBQWVJLFFBQXpDOzs7TUFFRUMsZUFBSjtTQUNTO1lBQUE7U0FFRjdOLEdBQUwsRUFBVTthQUNEQSxJQUFJOE4sV0FBSixJQUFtQkQsZ0JBQWdCN04sR0FBaEIsQ0FBMUI7S0FISyxFQUFUOztXQUtTK0ksUUFBVCxDQUFrQmdGLFlBQWxCLEVBQWdDQyxLQUFoQyxFQUF1QztVQUMvQkMsWUFBWVQsZUFBZVMsU0FBZixJQUNiRixhQUFhbE8sU0FBYixDQUF1Qm9PLFNBRDVCOztVQUdNLFlBQUNuRixXQUFELFFBQVdwSixPQUFYLEVBQWlCaUYsUUFBUXVKLFNBQXpCLEtBQ0pWLGVBQWV6RSxRQUFmLENBQTBCO1lBQ2xCb0YsS0FBU3hPLFlBQVQsQ0FBc0JzTyxTQUF0QixDQURrQjtjQUVoQkcsT0FBV3pPLFlBQVgsQ0FBd0JzTyxTQUF4QixDQUZnQjtnQkFHZEksU0FBYXRGLFFBQWIsQ0FBc0IsRUFBQ08sU0FBRCxFQUF0QixDQUhjLEVBQTFCLENBREY7O3NCQU1rQixVQUFVdEosR0FBVixFQUFlO1lBQ3pCZ0YsVUFBVWhGLElBQUlzTyxZQUFKLEVBQWhCO1lBQ00zSixZQUFTdUosVUFBVW5KLE1BQVYsQ0FBaUIvRSxHQUFqQixFQUFzQmdGLE9BQXRCLENBQWY7O2FBRU91SixjQUFQLENBQXdCeE8sUUFBeEIsRUFBa0MrSyxVQUFsQzthQUNPN0osTUFBUCxDQUFnQmxCLFFBQWhCLEVBQTBCLEVBQUlBLFFBQUosRUFBYzZDLE1BQWQsVUFBc0IrQixTQUF0QixFQUExQjthQUNPNUUsUUFBUDs7ZUFHU0EsUUFBVCxDQUFrQnNOLE9BQWxCLEVBQTJCO2NBQ25CbUIsVUFBVXhPLElBQUlJLE1BQUosQ0FBV29PLE9BQTNCO1dBQ0csSUFBSXZPLFlBQVlnTyxVQUFVckosU0FBVixFQUFoQixDQUFILFFBQ000SixRQUFRQyxHQUFSLENBQWN4TyxTQUFkLENBRE47ZUFFTzJDLE9BQVMzQyxTQUFULEVBQW9Cb04sT0FBcEIsQ0FBUDs7O2VBRU96SyxNQUFULENBQWdCM0MsU0FBaEIsRUFBMkJvTixPQUEzQixFQUFvQztjQUM1Qm5OLFdBQVd5QyxPQUFPQyxNQUFQLENBQWMsSUFBZCxDQUFqQjtjQUNNUCxLQUFLLEVBQUlwQyxTQUFKLEVBQWVzQyxXQUFXdkMsSUFBSUksTUFBSixDQUFXc08sT0FBckMsRUFBWDtjQUNNdkYsVUFBVSxJQUFJeEUsU0FBSixDQUFhdEMsRUFBYixDQUFoQjtjQUNNb0osS0FBSyxJQUFJM0MsV0FBSixDQUFlekcsRUFBZixFQUFtQjhHLE9BQW5CLENBQVg7O2NBRU13RixRQUFReEgsUUFDWEMsT0FEVyxDQUVWLGVBQWUsT0FBT2lHLE9BQXRCLEdBQ0lBLFFBQVE1QixFQUFSLEVBQVl6TCxHQUFaLENBREosR0FFSXFOLE9BSk0sRUFLWHBILElBTFcsQ0FLSjJJLFdBTEksQ0FBZDs7O2NBUU1oRSxLQUFOLENBQWM3SixPQUFPYixTQUFTTyxRQUFULENBQW9CTSxHQUFwQixFQUF5QixFQUFJUSxNQUFLLFVBQVQsRUFBekIsQ0FBckI7OztnQkFHUTRCLFNBQVNzSSxHQUFHeEMsT0FBSCxFQUFmO2lCQUNPdEcsT0FBT1ksZ0JBQVAsQ0FBMEJKLE1BQTFCLEVBQWtDO21CQUNoQyxFQUFJTyxPQUFPaUwsTUFBTTFJLElBQU4sQ0FBYSxNQUFNOUMsTUFBbkIsQ0FBWCxFQURnQyxFQUFsQyxDQUFQOzs7aUJBSU95TCxXQUFULENBQXFCdkQsTUFBckIsRUFBNkI7Y0FDeEIsUUFBUUEsTUFBWCxFQUFvQjtrQkFDWixJQUFJbkQsU0FBSixDQUFpQix5REFBakIsQ0FBTjs7O21CQUVPMUgsTUFBVCxHQUFrQixDQUFDNkssT0FBTzdLLE1BQVAsS0FBa0IsZUFBZSxPQUFPNkssTUFBdEIsR0FBK0JBLE1BQS9CLEdBQXdDb0MsY0FBMUQsQ0FBRCxFQUE0RWhCLElBQTVFLENBQWlGcEIsTUFBakYsQ0FBbEI7bUJBQ1M1SyxRQUFULEdBQW9CLENBQUM0SyxPQUFPNUssUUFBUCxJQUFtQmlOLGdCQUFwQixFQUFzQ2pCLElBQXRDLENBQTJDcEIsTUFBM0MsRUFBbURJLEVBQW5ELENBQXBCO21CQUNTL0ssV0FBVCxHQUF1QixDQUFDMkssT0FBTzNLLFdBQVAsSUFBc0JpTixtQkFBdkIsRUFBNENsQixJQUE1QyxDQUFpRHBCLE1BQWpELEVBQXlESSxFQUF6RCxDQUF2Qjs7Y0FFSS9MLE9BQUosR0FBV21QLFFBQVgsQ0FBc0JwRCxFQUF0QixFQUEwQnpMLEdBQTFCLEVBQStCQyxTQUEvQixFQUEwQ0MsUUFBMUM7O2lCQUVPbUwsT0FBT00sUUFBUCxHQUFrQk4sT0FBT00sUUFBUCxDQUFnQkYsRUFBaEIsRUFBb0J6TCxHQUFwQixDQUFsQixHQUE2Q3FMLE1BQXBEOzs7S0EvQ047Ozs7OzsifQ==
