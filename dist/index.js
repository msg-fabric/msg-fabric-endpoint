'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

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

exports['default'] = plugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL2VwX3RhcmdldC5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvZXh0ZW5zaW9ucy5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2NsaWVudC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2FwaS5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2luZGV4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgLy8vLyBFbmRwb2ludCBiaW5kU2luaygpIHJlc3BvbnNpYmlsaXRpZXNcbiAgLy8gYnlfbXNnaWQ6IG5ldyBNYXAoKVxuICAvLyBqc29uX3VucGFjayhzeikgOjogcmV0dXJuIEpTT04ucGFyc2Uoc3opXG4gIC8vIHJlY3ZDdHJsKG1zZywgaW5mbykgOjpcbiAgLy8gcmVjdk1zZyhtc2csIGluZm8pIDo6IHJldHVybiBAe30gbXNnLCBpbmZvXG4gIC8vIHJlY3ZTdHJlYW0obXNnLCBpbmZvKSA6OlxuICAvLyByZWN2U3RyZWFtRGF0YShyc3RyZWFtLCBpbmZvKSA6OlxuXG4iLCJleHBvcnQgZGVmYXVsdCBFUFRhcmdldFxuZXhwb3J0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIGNvbnN0cnVjdG9yKGlkKSA6OiB0aGlzLmlkID0gaWRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VQVGFyZ2V0ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gZXBfZW5jb2RlKHRoaXMuaWQsIGZhbHNlKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuICBpc0VQVGFyZ2V0KCkgOjogcmV0dXJuIHRydWVcblxuICBnZXQgaWRfcm91dGVyKCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfcm91dGVyXG4gIGdldCBpZF90YXJnZXQoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF90YXJnZXRcblxuICBzdGF0aWMgYXNfanNvbl91bnBhY2sobXNnX2N0eF90bywgeGZvcm1CeUtleSkgOjpcbiAgICB4Zm9ybUJ5S2V5ID0gT2JqZWN0LmNyZWF0ZSh4Zm9ybUJ5S2V5IHx8IG51bGwpXG4gICAgeGZvcm1CeUtleVt0b2tlbl0gPSB2ID0+IHRoaXMuZnJvbV9jdHggQCBlcF9kZWNvZGUodiksIG1zZ19jdHhfdG9cbiAgICByZXR1cm4gdGhpcy5qc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBmcm9tX2N0eChpZCwgbXNnX2N0eF90bywgbXNnaWQpIDo6XG4gICAgaWYgISBpZCA6OiByZXR1cm5cbiAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWQuYXNFbmRwb2ludElkIDo6XG4gICAgICBpZCA9IGlkLmFzRW5kcG9pbnRJZCgpXG5cbiAgICBjb25zdCBlcF90Z3QgPSBuZXcgdGhpcyhpZClcbiAgICBsZXQgZmFzdCwgaW5pdCA9ICgpID0+IGZhc3QgPSBtc2dfY3R4X3RvKGVwX3RndCwge21zZ2lkfSkuZmFzdFxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cblxuRVBUYXJnZXQuanNvbl91bnBhY2tfeGZvcm0gPSBqc29uX3VucGFja194Zm9ybVxuZXhwb3J0IGZ1bmN0aW9uIGpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpIDo6XG4gIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXIoKVxuXG4gIGZ1bmN0aW9uIHJldml2ZXIoKSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBzdGF0aWMgZm9ySHViKGh1YiwgY2hhbm5lbCkgOjpcbiAgICBjb25zdCB7c2VuZFJhd30gPSBjaGFubmVsXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuX3NlbmQgPSBhc3luYyBwa3QgPT4gOjpcbiAgICAgIGF3YWl0IHNlbmRSYXcocGt0KVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIHJldHVybiBNc2dDdHhcblxuXG4gIGNvbnN0cnVjdG9yKGlkKSA6OlxuICAgIGlmIG51bGwgIT0gaWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBpZFxuICAgICAgY29uc3QgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIHRoaXMuY3R4ID0gQHt9IGZyb21faWRcblxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG5cbiAgICBjb25zdCByZXMgPSBpbnZva2UgQCB0aGlzLmNoYW5fc2VuZCwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgY3R4LnRvX3RndCA9IHRndFxuICAgICAgdGd0ID0gZXBfZGVjb2RlKHRndCkgfHwgdGd0XG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IHNlbmQgPSBtc2dDb2RlY3MuZGVmYXVsdC5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3Q6IEB7fSBnZXQoKSA6OiByZXR1cm4gQDpcbiAgICAgICAgc2VuZDogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChzZW5kLCBhcmdzKVxuICAgICAgICBzZW5kUXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoc2VuZCwgYXJncywgdHJ1ZSlcbiAgICAgICAgcXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICAgIHJldHVybiB0aGlzXG5cblxuICB3aXRoUmVqZWN0VGltZW91dChwX3JlcGx5KSA6OlxuICAgIHJldHVybiBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBwX3JlcGx5LnRoZW4gQCByZXNvbHZlLCByZWplY3RcbiAgICAgIHBfcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4gcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG4gICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMubXNfdGltZW91dClcbiAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCBAIHRpZFxuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0LCBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCB7RVBUYXJnZXQsIGVwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfc2VsZigpLnRvSlNPTigpXG4gIGVwX3NlbGYoKSA6OiByZXR1cm4gbmV3IHRoaXMuRVBUYXJnZXQodGhpcy5pZClcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcblxuICBjb25zdHJ1Y3RvcihpZCwgbXNnX2N0eCkgOjpcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgaWQ6IEB7fSB2YWx1ZTogaWRcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgud2l0aEVuZHBvaW50KHRoaXMpLnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJvdXRlQ2FjaGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBieV90b2tlbjogQHt9IHZhbHVlOiBieV90b2tlblxuICAgICAgYnlfdHJhZmZpYzogQHt9IHZhbHVlOiBieV90cmFmZmljXG5cbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG4gICAgICBqc29uX3VucGFjazogdGhpcy5FUFRhcmdldC5hc19qc29uX3VucGFjayh0aGlzLnRvKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cgfHwge21zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIGFzX3RhcmdldChpZCkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvXG4gIGFzX3NlbmRlcih7ZnJvbV9pZDppZCwgbXNnaWR9KSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG8sIG1zZ2lkXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICByZWN2TXNnKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCBzZW5kZXI6IHRoaXMuYXNfc2VuZGVyKGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHRoaXMucGFydHMuam9pbignJyk7IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgcF9zZW50LCBtc2dfY3R4XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLmJ5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICBsZXQgcmVwbHkgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLmJ5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBwX3NlbnQuY2F0Y2ggQCByZWplY3RcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIHJlcGx5ID0gbXNnX2N0eC53aXRoUmVqZWN0VGltZW91dChyZXBseSlcblxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gdGhpcy5ieV90b2tlbi5kZWxldGUgQCB0b2tlblxuICAgIHJlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcbiAgICByZXR1cm4gcmVwbHlcblxuRW5kcG9pbnQucHJvdG90eXBlLkVQVGFyZ2V0ID0gRVBUYXJnZXRcbiIsImV4cG9ydCBjb25zdCBlcF9wcm90byA9IE9iamVjdC5jcmVhdGUgQFxuICBPYmplY3QuZ2V0UHJvdG90eXBlT2YgQCBmdW5jdGlvbigpe31cbiAgQHt9IF91bndyYXBfOiBAe30gZ2V0OiBfdW53cmFwX1xuXG5mdW5jdGlvbiBfdW53cmFwXygpIDo6XG4gIGNvbnN0IHNlbGYgPSBPYmplY3QuY3JlYXRlKHRoaXMpXG4gIHNlbGYuZW5kcG9pbnQgPSB2ID0+IHZcbiAgcmV0dXJuIHNlbGZcblxuZXhwb3J0IGZ1bmN0aW9uIGFkZF9lcF9raW5kKGtpbmRzKSA6OlxuICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIGtpbmRzXG5leHBvcnQgZGVmYXVsdCBhZGRfZXBfa2luZFxuXG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudEVuZHBvaW50IEAgYXJnc1swXVxuXG4gICAgY29uc3QgbXNnX2N0eCA9IG5ldyB0aGlzLk1zZ0N0eCgpXG4gICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoID8gbXNnX2N0eC50byguLi5hcmdzKSA6IG1zZ19jdHhcblxuICBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpIDo6XG4gICAgY29uc3QgdGFyZ2V0ID0gY2xpZW50RW5kcG9pbnQob25fY2xpZW50KVxuICAgIGNvbnN0IGVwX3RndCA9IHRoaXMuZW5kcG9pbnQgQCB0YXJnZXRcbiAgICByZXR1cm4gdGFyZ2V0LmRvbmVcblxuICBjbGllbnRfYXBpKG9uX2NsaWVudCwgYXBpKSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KG9uX2NsaWVudClcbiAgICBjb25zdCBlcF9hcGkgPSB0aGlzLl91bndyYXBfLmFwaV9wYXJhbGxlbChhcGkpXG4gICAgY29uc3QgZXBfdGd0ID0gdGhpcy5lbmRwb2ludCBAIChlcCwgaHViKSA9PlxuICAgICAgT2JqZWN0LmFzc2lnbiBAIHRhcmdldCwgZXBfYXBpKGVwLCBodWIpXG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cblxuY29uc3QgZXBfY2xpZW50X2FwaSA9IEB7fVxuICBhc3luYyBvbl9yZWFkeShlcCwgaHViKSA6OlxuICAgIHRoaXMuX3Jlc29sdmUgQCBhd2FpdCB0aGlzLm9uX2NsaWVudChlcCwgaHViKVxuICAgIGF3YWl0IGVwLnNodXRkb3duKClcbiAgb25fc2VuZF9lcnJvcihlcCwgZXJyKSA6OlxuICAgIHRoaXMuX3JlamVjdChlcnIpXG4gIG9uX3NodXRkb3duKGVwLCBlcnIpIDo6XG4gICAgZXJyID8gdGhpcy5fcmVqZWN0KGVycikgOiB0aGlzLl9yZXNvbHZlKClcblxuZXhwb3J0IGZ1bmN0aW9uIGNsaWVudEVuZHBvaW50KG9uX2NsaWVudCkgOjpcbiAgY29uc3QgdGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSBAIGVwX2NsaWVudF9hcGlcbiAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9uX2NsaWVudCA6OlxuICAgIGlmIG9uX2NsaWVudC5vbl9yZWFkeSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBVc2UgXCJvbl9jbGllbnQoKVwiIGluc3RlYWQgb2YgXCJvbl9yZWFkeSgpXCIgd2l0aCBjbGllbnRFbmRwb2ludGBcbiAgICBPYmplY3QuYXNzaWduIEAgdGFyZ2V0LCBvbl9jbGllbnRcbiAgZWxzZSA6OlxuICAgIHRhcmdldC5vbl9jbGllbnQgPSBvbl9jbGllbnRcblxuICB0YXJnZXQuZG9uZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICB0YXJnZXQuX3Jlc29sdmUgPSByZXNvbHZlXG4gICAgdGFyZ2V0Ll9yZWplY3QgPSByZWplY3RcbiAgcmV0dXJuIHRhcmdldFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGFwaV9iaW5kX3JwY1xuICBhcGkoYXBpKSA6OiByZXR1cm4gdGhpcy5hcGlfcGFyYWxsZWwoYXBpKVxuICBhcGlfcGFyYWxsZWwoYXBpKSA6OlxuICAgIHJldHVybiB0aGlzLmVuZHBvaW50IEAgZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfYmluZF9ycGMoYXBpLCBlcCwgaHViKVxuICAgICAgcmV0dXJuIEB7fSBycGMsXG4gICAgICAgIGFzeW5jIG9uX21zZyh7bXNnLCBzZW5kZXJ9KSA6OlxuICAgICAgICAgIGF3YWl0IHJwYy5pbnZva2UgQCBzZW5kZXIsIG1zZy5vcCxcbiAgICAgICAgICAgIGFwaV9mbiA9PiBhcGlfZm4obXNnLmt3LCBtc2cuY3R4KVxuXG4gIGFwaV9pbm9yZGVyKGFwaSkgOjpcbiAgICByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlX2dhdGVkIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuXG5mdW5jdGlvbiBhcGlfYmluZF9ycGMoYXBpLCBlcCwgaHViKSA6OlxuICBjb25zdCBwZnggPSBhcGkub3BfcHJlZml4IHx8ICdycGNfJ1xuICBjb25zdCBsb29rdXBfb3AgPSBhcGkub3BfbG9va3VwXG4gICAgPyBvcCA9PiBhcGkub3BfbG9va3VwKHBmeCArIG9wLCBlcCwgaHViKVxuICAgIDogJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFwaVxuICAgID8gb3AgPT4gYXBpKHBmeCArIG9wLCBlcCwgaHViKVxuICAgIDogb3AgPT4gOjpcbiAgICAgICAgY29uc3QgZm4gPSBhcGlbcGZ4ICsgb3BdXG4gICAgICAgIHJldHVybiBmbiA/IGZuLmJpbmQoYXBpKSA6IGZuXG5cbiAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCBycGNfYXBpLCBAe31cbiAgICBsb29rdXBfb3A6IEB7fSB2YWx1ZTogbG9va3VwX29wXG4gICAgZXJyX2Zyb206IEB7fSB2YWx1ZTogZXAuZXBfc2VsZigpXG5cblxuY29uc3QgcnBjX2FwaSA9IEA6XG4gIGFzeW5jIGludm9rZShzZW5kZXIsIG9wLCBjYikgOjpcbiAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLnJlc29sdmVfb3AgQCBzZW5kZXIsIG9wXG4gICAgaWYgdW5kZWZpbmVkID09PSBhcGlfZm4gOjogcmV0dXJuXG5cbiAgICBjb25zdCByZXMgPSB0aGlzLmFuc3dlciBAIHNlbmRlciwgYXBpX2ZuLCBjYlxuICAgIHJldHVybiBhd2FpdCByZXNcblxuICBhc3luYyBpbnZva2VfZ2F0ZWQoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZ2F0ZSlcbiAgICAgIC50aGVuIEAgKCkgPT4gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICB0aGlzLmdhdGUgPSByZXMudGhlbihub29wLCBub29wKVxuICAgIHJldHVybiBhd2FpdCByZXNcblxuICBhc3luYyByZXNvbHZlX29wKHNlbmRlciwgb3ApIDo6XG4gICAgaWYgJ3N0cmluZycgIT09IHR5cGVvZiBvcCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogJ0ludmFsaWQgb3BlcmF0aW9uJywgY29kZTogNDAwXG4gICAgICByZXR1cm5cblxuICAgIHRyeSA6OlxuICAgICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5sb29rdXBfb3Aob3ApXG4gICAgICBpZiAhIGFwaV9mbiA6OlxuICAgICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdVbmtub3duIG9wZXJhdGlvbicsIGNvZGU6IDQwNFxuICAgICAgcmV0dXJuIGFwaV9mblxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogYEludmFsaWQgb3BlcmF0aW9uOiAke2Vyci5tZXNzYWdlfWAsIGNvZGU6IDUwMFxuXG4gIGFzeW5jIGFuc3dlcihzZW5kZXIsIGFwaV9mbiwgY2IpIDo6XG4gICAgdHJ5IDo6XG4gICAgICB2YXIgYW5zd2VyID0gY2IgPyBhd2FpdCBjYihhcGlfZm4pIDogYXdhaXQgYXBpX2ZuKClcbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IGVycl9mcm9tOiB0aGlzLmVycl9mcm9tLCBlcnJvcjogZXJyXG4gICAgICByZXR1cm4gZmFsc2VcblxuICAgIGlmIHNlbmRlci5yZXBseUV4cGVjdGVkIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBhbnN3ZXJcbiAgICByZXR1cm4gdHJ1ZVxuXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG4iLCJpbXBvcnQge2FkZF9lcF9raW5kLCBlcF9wcm90b30gZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgc2VydmVyKG9uX2luaXQpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgb25faW5pdFxuXG5leHBvcnQgKiBmcm9tICcuL2NsaWVudC5qc3knXG5leHBvcnQgKiBmcm9tICcuL2FwaS5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGVwX3Byb3RvXG4iLCJpbXBvcnQgZXBfcHJvdG8gZnJvbSAnLi9lcF9raW5kcy9pbmRleC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBwbHVnaW5fbmFtZTogJ2VuZHBvaW50J1xuICBwcm90b2NvbHM6ICdwcm90b2NvbHMnXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4LCBwcm90b2NvbHN9ID0gY2xhc3Nlc1xuICAgIHJldHVybiBjbGFzc2VzXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBjcmVhdGVNYXBcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgaWYgcGx1Z2luX29wdGlvbnMuZXBfa2luZHMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzXG5cbiAgbGV0IGVuZHBvaW50X3BsdWdpblxuICByZXR1cm4gQDpcbiAgICBvcmRlcjogMVxuICAgIHN1YmNsYXNzXG4gICAgcG9zdChodWIpIDo6XG4gICAgICByZXR1cm4gaHViW3BsdWdpbl9vcHRpb25zLnBsdWdpbl9uYW1lXSA9IGVuZHBvaW50X3BsdWdpbihodWIpXG5cblxuICBmdW5jdGlvbiBnZXRfcHJvdG9jb2xzKGh1Yl9wcm90b3R5cGUpIDo6XG4gICAgY29uc3QgcmVzID0gcGx1Z2luX29wdGlvbnMucHJvdG9jb2xzXG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiByZXMgOjpcbiAgICAgIHJldHVybiBodWJfcHJvdG90eXBlW3Jlc11cbiAgICBlbHNlIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiByZXMgOjpcbiAgICAgIHJldHVybiBwbHVnaW5fb3B0aW9ucy5wcm90b2NvbHMgQFxuICAgICAgICBodWJfcHJvdG90eXBlLnByb3RvY29scywgaHViX3Byb3RvdHlwZVxuICAgIGVsc2UgaWYgbnVsbCA9PSByZXMgOjpcbiAgICAgIHJldHVybiBodWJfcHJvdG90eXBlLnByb3RvY29sc1xuICAgIGVsc2UgcmV0dXJuIHJlc1xuXG5cbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBnZXRfcHJvdG9jb2xzIEAgRmFicmljSHViX1BJLnByb3RvdHlwZVxuXG4gICAgY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHg6IE1zZ0N0eF9waX0gPVxuICAgICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDpcbiAgICAgICAgU2luazogU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgTXNnQ3R4OiBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIEVuZHBvaW50OiBFbmRwb2ludEJhc2Uuc3ViY2xhc3Moe2NyZWF0ZU1hcH0pXG5cbiAgICBlbmRwb2ludF9wbHVnaW4gPSBmdW5jdGlvbiAoaHViKSA6OlxuICAgICAgY29uc3QgY2hhbm5lbCA9IGh1Yi5jb25uZWN0X3NlbGYoKVxuICAgICAgY29uc3QgTXNnQ3R4ID0gTXNnQ3R4X3BpLmZvckh1YihodWIsIGNoYW5uZWwpXG5cbiAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZiBAIGVuZHBvaW50LCBlcF9wcm90b1xuICAgICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gZW5kcG9pbnQsIGNyZWF0ZSwgTXNnQ3R4XG4gICAgICByZXR1cm4gZW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSBwcm90b2NvbHMucmFuZG9tX2lkKClcbiAgICAgICAgd2hpbGUgdGFyZ2V0cy5oYXMgQCBpZF90YXJnZXRcbiAgICAgICAgcmV0dXJuIGNyZWF0ZSBAIGlkX3RhcmdldCwgb25faW5pdFxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGUoaWRfdGFyZ2V0LCBvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBoYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbClcbiAgICAgICAgY29uc3QgaWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIGlkXG4gICAgICAgIGNvbnN0IGVwID0gbmV3IEVuZHBvaW50IEAgaWQsIG1zZ19jdHhcblxuICAgICAgICBjb25zdCByZWFkeSA9IFByb21pc2VcbiAgICAgICAgICAucmVzb2x2ZSBAXG4gICAgICAgICAgICAnZnVuY3Rpb24nID09PSB0eXBlb2Ygb25faW5pdFxuICAgICAgICAgICAgICA/IG9uX2luaXQoZXAsIGh1YilcbiAgICAgICAgICAgICAgOiBvbl9pbml0XG4gICAgICAgICAgLnRoZW4gQCBfYWZ0ZXJfaW5pdFxuXG4gICAgICAgIC8vIEFsbG93IGZvciBib3RoIGludGVybmFsIGFuZCBleHRlcm5hbCBlcnJvciBoYW5kbGluZyBieSBmb3JraW5nIHJlYWR5LmNhdGNoXG4gICAgICAgIHJlYWR5LmNhdGNoIEAgZXJyID0+IGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgOjpcbiAgICAgICAgICBjb25zdCBlcF90Z3QgPSBlcC5lcF9zZWxmKClcbiAgICAgICAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgICAgICAgcmVhZHk6IEB7fSB2YWx1ZTogcmVhZHkudGhlbiBAICgpID0+IGVwX3RndFxuXG5cbiAgICAgICAgZnVuY3Rpb24gX2FmdGVyX2luaXQodGFyZ2V0KSA6OlxuICAgICAgICAgIGlmIG51bGwgPT0gdGFyZ2V0IDo6XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIGVuZHBvaW50IGluaXQgdG8gcmV0dXJuIGEgY2xvc3VyZSBvciBpbnRlcmZhY2VgXG5cbiAgICAgICAgICBoYW5kbGVycy5vbl9tc2cgPSAodGFyZ2V0Lm9uX21zZyB8fCAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRhcmdldCA/IHRhcmdldCA6IGRlZmF1bHRfb25fbXNnKSkuYmluZCh0YXJnZXQpXG4gICAgICAgICAgaGFuZGxlcnMub25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0LCBlcClcbiAgICAgICAgICBoYW5kbGVycy5vbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQsIGVwKVxuXG4gICAgICAgICAgbmV3IFNpbmsoKS5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnNcblxuICAgICAgICAgIHJldHVybiB0YXJnZXQub25fcmVhZHkgPyB0YXJnZXQub25fcmVhZHkoZXAsIGh1YikgOiB0YXJnZXRcblxuXG4iXSwibmFtZXMiOlsiU2luayIsImZvclByb3RvY29scyIsImluYm91bmQiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJlbmRwb2ludCIsImh1YiIsImlkX3RhcmdldCIsImhhbmRsZXJzIiwidW5yZWdpc3RlciIsInJvdXRlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJvbl9tc2ciLCJvbl9lcnJvciIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImVyciIsImV4dHJhIiwiYXNzaWduIiwiYmluZFNpbmsiLCJwa3QiLCJyZWN2X21zZyIsInR5cGUiLCJ1bmRlZmluZWQiLCJ6b25lIiwibXNnIiwidGVybWluYXRlIiwiRVBUYXJnZXQiLCJpZCIsImVwX2VuY29kZSIsImlkX3JvdXRlciIsImFzX2pzb25fdW5wYWNrIiwibXNnX2N0eF90byIsInhmb3JtQnlLZXkiLCJPYmplY3QiLCJjcmVhdGUiLCJ0b2tlbiIsInYiLCJmcm9tX2N0eCIsImVwX2RlY29kZSIsImpzb25fdW5wYWNrX3hmb3JtIiwibXNnaWQiLCJhc0VuZHBvaW50SWQiLCJlcF90Z3QiLCJmYXN0IiwiaW5pdCIsImRlZmluZVByb3BlcnRpZXMiLCJnZXQiLCJzZW5kIiwicXVlcnkiLCJ2YWx1ZSIsInNpbXBsZSIsInIiLCJ0IiwidG9TdHJpbmciLCJyZXMiLCJzcGxpdCIsInBhcnNlSW50Iiwic3oiLCJKU09OIiwicGFyc2UiLCJyZXZpdmVyIiwicmVnIiwiV2Vha01hcCIsImtleSIsInhmbiIsInNldCIsInZmbiIsIk1zZ0N0eCIsInJhbmRvbV9pZCIsImNvZGVjcyIsIndpdGhDb2RlY3MiLCJmb3JIdWIiLCJjaGFubmVsIiwic2VuZFJhdyIsImNoYW5fc2VuZCIsImZyb21faWQiLCJmcmVlemUiLCJjdHgiLCJfaW52b2tlX2V4IiwiX21zZ0NvZGVjcyIsImNvbnRyb2wiLCJwaW5nIiwiYXJncyIsIl9jb2RlYyIsInJlcGx5Iiwic3RyZWFtIiwiZm5PcktleSIsImludm9rZSIsIm9iaiIsImFzc2VydE1vbml0b3IiLCJ0aGVuIiwicF9zZW50IiwiaW5pdFJlcGx5IiwidG8iLCJ0Z3QiLCJFcnJvciIsInNlbGYiLCJjbG9uZSIsInRvX3RndCIsInJlcGx5X2lkIiwibGVuZ3RoIiwid2l0aCIsImNoZWNrTW9uaXRvciIsIm9wdGlvbnMiLCJhY3RpdmUiLCJtb25pdG9yIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImRvbmUiLCJ0ZCIsInRpZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNvZGVjIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJ1bnJlZiIsImNsZWFyIiwiY2xlYXJJbnRlcnZhbCIsIm1zZ19jb2RlYyIsIlR5cGVFcnJvciIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwiZGVmYXVsdCIsInBfcmVwbHkiLCJ0aW1lb3V0IiwiUmVwbHlUaW1lb3V0Iiwic2V0VGltZW91dCIsIm1zX3RpbWVvdXQiLCJFbmRwb2ludCIsInN1YmNsYXNzIiwiZXh0ZW5zaW9ucyIsImVwX3NlbGYiLCJ0b0pTT04iLCJtc2dfY3R4Iiwid2l0aEVuZHBvaW50IiwiTWFwIiwiY3JlYXRlTWFwIiwic2luayIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIkRhdGUiLCJub3ciLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwiaW5mbyIsInJtc2ciLCJyZWN2Q3RybCIsInJlY3ZNc2ciLCJyc3RyZWFtIiwicmVjdlN0cmVhbSIsImlzX3JlcGx5Iiwic2VuZGVyIiwiYXNfc2VuZGVyIiwid2FybiIsImluaXRSZXBseVByb21pc2UiLCJjYXRjaCIsIndpdGhSZWplY3RUaW1lb3V0IiwiZGVsZXRlIiwiZXBfcHJvdG8iLCJnZXRQcm90b3R5cGVPZiIsIl91bndyYXBfIiwiYWRkX2VwX2tpbmQiLCJraW5kcyIsImNsaWVudEVuZHBvaW50Iiwib25fY2xpZW50IiwidGFyZ2V0IiwiYXBpIiwiZXBfYXBpIiwiYXBpX3BhcmFsbGVsIiwiZXAiLCJlcF9jbGllbnRfYXBpIiwib25fcmVhZHkiLCJfcmVzb2x2ZSIsIl9yZWplY3QiLCJycGMiLCJhcGlfYmluZF9ycGMiLCJvcCIsImFwaV9mbiIsImt3IiwiaW52b2tlX2dhdGVkIiwicGZ4Iiwib3BfcHJlZml4IiwibG9va3VwX29wIiwib3BfbG9va3VwIiwiZm4iLCJiaW5kIiwicnBjX2FwaSIsImNiIiwicmVzb2x2ZV9vcCIsImFuc3dlciIsImdhdGUiLCJub29wIiwiZXJyX2Zyb20iLCJtZXNzYWdlIiwiY29kZSIsImVycm9yIiwicmVwbHlFeHBlY3RlZCIsIm9uX2luaXQiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiY2xhc3NlcyIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsImVwX2tpbmRzIiwiZW5kcG9pbnRfcGx1Z2luIiwicGx1Z2luX25hbWUiLCJnZXRfcHJvdG9jb2xzIiwiaHViX3Byb3RvdHlwZSIsInByb3RvY29scyIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiTXNnQ3R4X3BpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiY29ubmVjdF9zZWxmIiwic2V0UHJvdG90eXBlT2YiLCJ0YXJnZXRzIiwiaGFzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJyZWdpc3RlciJdLCJtYXBwaW5ncyI6Ijs7OztBQUFlLE1BQU1BLElBQU4sQ0FBVztTQUNqQkMsWUFBUCxDQUFvQixFQUFDQyxPQUFELEVBQXBCLEVBQStCO1VBQ3ZCRixJQUFOLFNBQW1CLElBQW5CLENBQXdCO1NBQ25CRyxTQUFMLENBQWVDLFNBQWYsR0FBMkJGLE9BQTNCO1dBQ09GLElBQVA7OztXQUVPSyxRQUFULEVBQW1CQyxHQUFuQixFQUF3QkMsU0FBeEIsRUFBbUNDLFFBQW5DLEVBQTZDO1VBQ3JDQyxhQUFhLE1BQU1ILElBQUlJLE1BQUosQ0FBV0MsZ0JBQVgsQ0FBNEJKLFNBQTVCLENBQXpCOztRQUVJRyxNQUFKLENBQVdFLGNBQVgsQ0FBNEJMLFNBQTVCLEVBQ0UsS0FBS00sYUFBTCxDQUFxQlIsUUFBckIsRUFBK0JJLFVBQS9CLEVBQTJDRCxRQUEzQyxDQURGO1dBRU8sSUFBUDs7O2dCQUVZSCxRQUFkLEVBQXdCSSxVQUF4QixFQUFvQyxFQUFDSyxNQUFELEVBQVNDLFFBQVQsRUFBbUJDLFdBQW5CLEVBQXBDLEVBQXFFO1FBQy9EQyxRQUFRLElBQVo7VUFDTUMsV0FBVyxLQUFLZCxTQUF0QjtVQUNNZSxVQUFVLE1BQU1GLEtBQXRCO1VBQ01HLFdBQVcsQ0FBQ0MsR0FBRCxFQUFNQyxLQUFOLEtBQWdCO1VBQzVCTCxLQUFILEVBQVc7cUJBQ0tSLGFBQWFR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
