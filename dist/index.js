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

exports['default'] = plugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL2VwX3RhcmdldC5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvZXh0ZW5zaW9ucy5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2NsaWVudC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2FwaS5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2luZGV4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgLy8vLyBFbmRwb2ludCBiaW5kU2luaygpIHJlc3BvbnNpYmlsaXRpZXNcbiAgLy8gYnlfbXNnaWQ6IG5ldyBNYXAoKVxuICAvLyBqc29uX3VucGFjayhzeikgOjogcmV0dXJuIEpTT04ucGFyc2Uoc3opXG4gIC8vIHJlY3ZDdHJsKG1zZywgaW5mbykgOjpcbiAgLy8gcmVjdk1zZyhtc2csIGluZm8pIDo6IHJldHVybiBAe30gbXNnLCBpbmZvXG4gIC8vIHJlY3ZTdHJlYW0obXNnLCBpbmZvKSA6OlxuICAvLyByZWN2U3RyZWFtRGF0YShyc3RyZWFtLCBpbmZvKSA6OlxuXG4iLCJleHBvcnQgZGVmYXVsdCBFUFRhcmdldFxuZXhwb3J0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIGNvbnN0cnVjdG9yKGlkKSA6OiB0aGlzLmlkID0gaWRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VQVGFyZ2V0ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gZXBfZW5jb2RlKHRoaXMuaWQsIGZhbHNlKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuICBpc0VQVGFyZ2V0KCkgOjogcmV0dXJuIHRydWVcblxuICBnZXQgaWRfcm91dGVyKCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfcm91dGVyXG4gIGdldCBpZF90YXJnZXQoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF90YXJnZXRcblxuICBzdGF0aWMgYXNfanNvbl91bnBhY2sobXNnX2N0eF90bywgeGZvcm1CeUtleSkgOjpcbiAgICB4Zm9ybUJ5S2V5ID0gT2JqZWN0LmNyZWF0ZSh4Zm9ybUJ5S2V5IHx8IG51bGwpXG4gICAgeGZvcm1CeUtleVt0b2tlbl0gPSB2ID0+IHRoaXMuZnJvbV9jdHggQCBlcF9kZWNvZGUodiksIG1zZ19jdHhfdG9cbiAgICByZXR1cm4gdGhpcy5qc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBmcm9tX2N0eChpZCwgbXNnX2N0eF90bywgbXNnaWQpIDo6XG4gICAgaWYgISBpZCA6OiByZXR1cm5cbiAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWQuYXNFbmRwb2ludElkIDo6XG4gICAgICBpZCA9IGlkLmFzRW5kcG9pbnRJZCgpXG5cbiAgICBjb25zdCBlcF90Z3QgPSBuZXcgdGhpcyhpZClcbiAgICBsZXQgZmFzdCwgaW5pdCA9ICgpID0+IGZhc3QgPSBtc2dfY3R4X3RvKGVwX3RndCwge21zZ2lkfSkuZmFzdF9qc29uXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgIHNlbmQ6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5zZW5kXG4gICAgICBxdWVyeTogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnF1ZXJ5XG4gICAgICByZXBseUV4cGVjdGVkOiBAe30gdmFsdWU6ICEhIG1zZ2lkXG5cblxuY29uc3QgdG9rZW4gPSAnXFx1MDNFMCcgLy8gJ8+gJ1xuRVBUYXJnZXQudG9rZW4gPSB0b2tlblxuXG5FUFRhcmdldC5lcF9lbmNvZGUgPSBlcF9lbmNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9lbmNvZGUoaWQsIHNpbXBsZSkgOjpcbiAgbGV0IHtpZF9yb3V0ZXI6ciwgaWRfdGFyZ2V0OnR9ID0gaWRcbiAgciA9IChyPj4+MCkudG9TdHJpbmcoMzYpXG4gIHQgPSAodD4+PjApLnRvU3RyaW5nKDM2KVxuICBpZiBzaW1wbGUgOjpcbiAgICByZXR1cm4gYCR7dG9rZW59ICR7cn1+JHt0fWBcblxuICBjb25zdCByZXMgPSBAe30gW3Rva2VuXTogYCR7cn1+JHt0fWBcbiAgT2JqZWN0LmFzc2lnbiBAIHJlcywgaWRcbiAgZGVsZXRlIHJlcy5pZF9yb3V0ZXI7IGRlbGV0ZSByZXMuaWRfdGFyZ2V0XG4gIHJldHVybiByZXNcblxuXG5FUFRhcmdldC5lcF9kZWNvZGUgPSBlcF9kZWNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9kZWNvZGUodikgOjpcbiAgY29uc3QgaWQgPSAnc3RyaW5nJyA9PT0gdHlwZW9mIHZcbiAgICA/IHYuc3BsaXQodG9rZW4pWzFdXG4gICAgOiB2W3Rva2VuXVxuICBpZiAhIGlkIDo6IHJldHVyblxuXG4gIGxldCBbcix0XSA9IGlkLnNwbGl0KCd+JylcbiAgaWYgdW5kZWZpbmVkID09PSB0IDo6IHJldHVyblxuICByID0gMCB8IHBhcnNlSW50KHIsIDM2KVxuICB0ID0gMCB8IHBhcnNlSW50KHQsIDM2KVxuXG4gIHJldHVybiBAe30gaWRfcm91dGVyOiByLCBpZF90YXJnZXQ6IHRcblxuXG5FUFRhcmdldC5qc29uX3VucGFja194Zm9ybSA9IGpzb25fdW5wYWNrX3hmb3JtXG5leHBvcnQgZnVuY3Rpb24ganNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSkgOjpcbiAgcmV0dXJuIHN6ID0+IEpTT04ucGFyc2UgQCBzeiwgcmV2aXZlcigpXG5cbiAgZnVuY3Rpb24gcmV2aXZlcigpIDo6XG4gICAgY29uc3QgcmVnID0gbmV3IFdlYWtNYXAoKVxuICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlKSA6OlxuICAgICAgY29uc3QgeGZuID0geGZvcm1CeUtleVtrZXldXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHhmbiA6OlxuICAgICAgICByZWcuc2V0KHRoaXMsIHhmbilcbiAgICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICAgIGlmICdvYmplY3QnID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgY29uc3QgdmZuID0gcmVnLmdldCh2YWx1ZSlcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB2Zm4gOjpcbiAgICAgICAgICByZXR1cm4gdmZuIEAgdmFsdWVcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4iLCJpbXBvcnQge2VwX2RlY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIHN0YXRpYyBmb3JIdWIoaHViLCBjaGFubmVsKSA6OlxuICAgIGNvbnN0IHtzZW5kUmF3fSA9IGNoYW5uZWxcblxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLmNoYW5fc2VuZCA9IGFzeW5jIHBrdCA9PiA6OlxuICAgICAgYXdhaXQgc2VuZFJhdyhwa3QpXG4gICAgICByZXR1cm4gdHJ1ZVxuXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG5cbiAgY29uc3RydWN0b3IoaWQpIDo6XG4gICAgaWYgbnVsbCAhPSBpZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGlkXG4gICAgICBjb25zdCBmcm9tX2lkID0gT2JqZWN0LmZyZWV6ZSBAOiBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgdGhpcy5jdHggPSBAe30gZnJvbV9pZFxuXG5cbiAgd2l0aEVuZHBvaW50KGVuZHBvaW50KSA6OlxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgZW5kcG9pbnQ6IEB7fSB2YWx1ZTogZW5kcG9pbnRcblxuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9tc2dDb2RlY3MuY29udHJvbC5waW5nLCBbXSwgdG9rZW4pXG4gIHNlbmQoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzKVxuICBzZW5kUXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKVxuICBxdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgc3RyZWFtKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zdHJlYW0sIGFyZ3NcbiAgaW52b2tlKGtleSwgLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjW2tleV0sIGFyZ3NcbiAgYmluZEludm9rZShmbk9yS2V5LCB0b2tlbikgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgZm5PcktleSA6OiBmbk9yS2V5ID0gdGhpcy5fY29kZWNcbiAgICByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChmbk9yS2V5LCBhcmdzLCB0b2tlbilcblxuICBfaW52b2tlX2V4KGludm9rZSwgYXJncywgdG9rZW4pIDo6XG4gICAgY29uc3Qgb2JqID0gT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eFxuICAgIGlmIG51bGwgPT0gdG9rZW4gOjogdG9rZW4gPSBvYmoudG9rZW5cbiAgICBlbHNlIG9iai50b2tlbiA9IHRva2VuXG4gICAgaWYgdHJ1ZSA9PT0gdG9rZW4gOjpcbiAgICAgIHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuXG4gICAgdGhpcy5hc3NlcnRNb25pdG9yKClcblxuICAgIGNvbnN0IHJlcyA9IGludm9rZSBAIHRoaXMuY2hhbl9zZW5kLCBvYmosIC4uLmFyZ3NcbiAgICBpZiAhIHRva2VuIHx8ICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXMudGhlbiA6OiByZXR1cm4gcmVzXG5cbiAgICBsZXQgcF9zZW50ICA9IHJlcy50aGVuKClcbiAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIHRoaXMpXG4gICAgcF9zZW50ID0gcF9zZW50LnRoZW4gQCAoKSA9PiBAOiByZXBseVxuICAgIHBfc2VudC5yZXBseSA9IHJlcGx5XG4gICAgcmV0dXJuIHBfc2VudFxuXG4gIGdldCB0bygpIDo6IHJldHVybiAodGd0LCAuLi5hcmdzKSA9PiA6OlxuICAgIGlmIG51bGwgPT0gdGd0IDo6IHRocm93IG5ldyBFcnJvciBAIGBOdWxsIHRhcmdldCBlbmRwb2ludGBcblxuICAgIGNvbnN0IHNlbGYgPSB0aGlzLmNsb25lKClcblxuICAgIGNvbnN0IGN0eCA9IHNlbGYuY3R4XG4gICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgIGN0eC5pZF90YXJnZXQgPSB0Z3RcbiAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICBlbHNlIDo6XG4gICAgICB0Z3QgPSBlcF9kZWNvZGUodGd0KSB8fCB0Z3RcbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IGlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IHJlcGx5X2lkLmlkX3JvdXRlclxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gMCA9PT0gYXJncy5sZW5ndGggPyBzZWxmIDogc2VsZi53aXRoIEAgLi4uYXJnc1xuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmIHRydWUgPT09IHRndCB8fCBmYWxzZSA9PT0gdGd0IDo6XG4gICAgICAgIGN0eC50b2tlbiA9IHRndFxuICAgICAgZWxzZSBpZiBudWxsICE9IHRndCA6OlxuICAgICAgICBjb25zdCB7dG9rZW4sIG1zZ2lkfSA9IHRndFxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBzZW5kX2pzb24gYXMgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IGpzb25fc2VuZCA9IG1zZ0NvZGVjcy5qc29uLnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgZmFzdF9qc29uOiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzKVxuICAgICAgICBzZW5kUXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKVxuICAgICAgICBxdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgICByZXR1cm4gdGhpc1xuXG5cbiAgd2l0aFJlamVjdFRpbWVvdXQocF9yZXBseSkgOjpcbiAgICByZXR1cm4gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgcF9yZXBseS50aGVuIEAgcmVzb2x2ZSwgcmVqZWN0XG4gICAgICBwX3JlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcblxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLm1zX3RpbWVvdXQpXG4gICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcblxuICAgICAgZnVuY3Rpb24gY2xlYXIoKSA6OiBjbGVhclRpbWVvdXQgQCB0aWRcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dCwgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQge0VQVGFyZ2V0LCBlcF9lbmNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIHN1YmNsYXNzKGV4dGVuc2lvbnMpIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgZXh0ZW5zaW9uc1xuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVwX3NlbGYoKS50b0pTT04oKVxuICBlcF9zZWxmKCkgOjogcmV0dXJuIG5ldyB0aGlzLkVQVGFyZ2V0KHRoaXMuaWQpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgpIDo6XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGlkOiBAe30gdmFsdWU6IGlkXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKS50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSb3V0ZUNhY2hlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuICAgICAganNvbl91bnBhY2s6IHRoaXMuRVBUYXJnZXQuYXNfanNvbl91bnBhY2sodGhpcy50bylcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnIHx8IHttc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICBhc190YXJnZXQoaWQpIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50b1xuICBhc19zZW5kZXIoe2Zyb21faWQ6aWQsIG1zZ2lkfSkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvLCBtc2dpZFxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgcmVjdk1zZyhtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mbywgc2VuZGVyOiB0aGlzLmFzX3NlbmRlcihpbmZvKVxuICByZWN2U3RyZWFtKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiB0aGlzLnBhcnRzLmpvaW4oJycpOyAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIHBfc2VudCwgbXNnX2N0eFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgbGV0IHJlcGx5ID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcF9zZW50LmNhdGNoIEAgcmVqZWN0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICByZXBseSA9IG1zZ19jdHgud2l0aFJlamVjdFRpbWVvdXQocmVwbHkpXG5cbiAgICBjb25zdCBjbGVhciA9ICgpID0+IHRoaXMuYnlfdG9rZW4uZGVsZXRlIEAgdG9rZW5cbiAgICByZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG4gICAgcmV0dXJuIHJlcGx5XG5cbkVuZHBvaW50LnByb3RvdHlwZS5FUFRhcmdldCA9IEVQVGFyZ2V0XG4iLCJleHBvcnQgY29uc3QgZXBfcHJvdG8gPSBPYmplY3QuY3JlYXRlIEBcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mIEAgZnVuY3Rpb24oKXt9XG4gIEB7fSBfdW53cmFwXzogQHt9IGdldDogX3Vud3JhcF9cblxuZnVuY3Rpb24gX3Vud3JhcF8oKSA6OlxuICBjb25zdCBzZWxmID0gT2JqZWN0LmNyZWF0ZSh0aGlzKVxuICBzZWxmLmVuZHBvaW50ID0gdiA9PiB2XG4gIHJldHVybiBzZWxmXG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRfZXBfa2luZChraW5kcykgOjpcbiAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBraW5kc1xuZXhwb3J0IGRlZmF1bHQgYWRkX2VwX2tpbmRcblxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGNsaWVudCguLi5hcmdzKSA6OlxuICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICByZXR1cm4gdGhpcy5jbGllbnRFbmRwb2ludCBAIGFyZ3NbMF1cblxuICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgdGhpcy5Nc2dDdHgoKVxuICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cbiAgY2xpZW50RW5kcG9pbnQob25fY2xpZW50KSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KG9uX2NsaWVudClcbiAgICBjb25zdCBlcF90Z3QgPSB0aGlzLmVuZHBvaW50IEAgdGFyZ2V0XG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cbiAgY2xpZW50X2FwaShvbl9jbGllbnQsIGFwaSkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpXG4gICAgY29uc3QgZXBfYXBpID0gdGhpcy5fdW53cmFwXy5hcGlfcGFyYWxsZWwoYXBpKVxuICAgIGNvbnN0IGVwX3RndCA9IHRoaXMuZW5kcG9pbnQgQCAoZXAsIGh1YikgPT5cbiAgICAgIE9iamVjdC5hc3NpZ24gQCB0YXJnZXQsIGVwX2FwaShlcCwgaHViKVxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG5cbmNvbnN0IGVwX2NsaWVudF9hcGkgPSBAe31cbiAgYXN5bmMgb25fcmVhZHkoZXAsIGh1YikgOjpcbiAgICB0aGlzLl9yZXNvbHZlIEAgYXdhaXQgdGhpcy5vbl9jbGllbnQoZXAsIGh1YilcbiAgICBhd2FpdCBlcC5zaHV0ZG93bigpXG4gIG9uX3NlbmRfZXJyb3IoZXAsIGVycikgOjpcbiAgICB0aGlzLl9yZWplY3QoZXJyKVxuICBvbl9zaHV0ZG93bihlcCwgZXJyKSA6OlxuICAgIGVyciA/IHRoaXMuX3JlamVjdChlcnIpIDogdGhpcy5fcmVzb2x2ZSgpXG5cbmV4cG9ydCBmdW5jdGlvbiBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpIDo6XG4gIGNvbnN0IHRhcmdldCA9IE9iamVjdC5jcmVhdGUgQCBlcF9jbGllbnRfYXBpXG4gIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvbl9jbGllbnQgOjpcbiAgICBpZiBvbl9jbGllbnQub25fcmVhZHkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgVXNlIFwib25fY2xpZW50KClcIiBpbnN0ZWFkIG9mIFwib25fcmVhZHkoKVwiIHdpdGggY2xpZW50RW5kcG9pbnRgXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRhcmdldCwgb25fY2xpZW50XG4gIGVsc2UgOjpcbiAgICB0YXJnZXQub25fY2xpZW50ID0gb25fY2xpZW50XG5cbiAgdGFyZ2V0LmRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgdGFyZ2V0Ll9yZXNvbHZlID0gcmVzb2x2ZVxuICAgIHRhcmdldC5fcmVqZWN0ID0gcmVqZWN0XG4gIHJldHVybiB0YXJnZXRcbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBhcGlfYmluZF9ycGNcbiAgYXBpKGFwaSkgOjogcmV0dXJuIHRoaXMuYXBpX3BhcmFsbGVsKGFwaSlcbiAgYXBpX3BhcmFsbGVsKGFwaSkgOjpcbiAgICByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuICBhcGlfaW5vcmRlcihhcGkpIDo6XG4gICAgcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZV9nYXRlZCBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cblxuZnVuY3Rpb24gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YikgOjpcbiAgY29uc3QgcGZ4ID0gYXBpLm9wX3ByZWZpeCB8fCAncnBjXydcbiAgY29uc3QgbG9va3VwX29wID0gYXBpLm9wX2xvb2t1cFxuICAgID8gb3AgPT4gYXBpLm9wX2xvb2t1cChwZnggKyBvcCwgZXAsIGh1YilcbiAgICA6ICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcGlcbiAgICA/IG9wID0+IGFwaShwZnggKyBvcCwgZXAsIGh1YilcbiAgICA6IG9wID0+IDo6XG4gICAgICAgIGNvbnN0IGZuID0gYXBpW3BmeCArIG9wXVxuICAgICAgICByZXR1cm4gZm4gPyBmbi5iaW5kKGFwaSkgOiBmblxuXG4gIHJldHVybiBPYmplY3QuY3JlYXRlIEAgcnBjX2FwaSwgQHt9XG4gICAgbG9va3VwX29wOiBAe30gdmFsdWU6IGxvb2t1cF9vcFxuICAgIGVycl9mcm9tOiBAe30gdmFsdWU6IGVwLmVwX3NlbGYoKVxuXG5cbmNvbnN0IHJwY19hcGkgPSBAOlxuICBhc3luYyBpbnZva2Uoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgaW52b2tlX2dhdGVkKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IFByb21pc2UucmVzb2x2ZSh0aGlzLmdhdGUpXG4gICAgICAudGhlbiBAICgpID0+IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgdGhpcy5nYXRlID0gcmVzLnRoZW4obm9vcCwgbm9vcClcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgcmVzb2x2ZV9vcChzZW5kZXIsIG9wKSA6OlxuICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Ygb3AgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdJbnZhbGlkIG9wZXJhdGlvbicsIGNvZGU6IDQwMFxuICAgICAgcmV0dXJuXG5cbiAgICB0cnkgOjpcbiAgICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMubG9va3VwX29wKG9wKVxuICAgICAgaWYgISBhcGlfZm4gOjpcbiAgICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnVW5rbm93biBvcGVyYXRpb24nLCBjb2RlOiA0MDRcbiAgICAgIHJldHVybiBhcGlfZm5cbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6IGBJbnZhbGlkIG9wZXJhdGlvbjogJHtlcnIubWVzc2FnZX1gLCBjb2RlOiA1MDBcblxuICBhc3luYyBhbnN3ZXIoc2VuZGVyLCBhcGlfZm4sIGNiKSA6OlxuICAgIHRyeSA6OlxuICAgICAgdmFyIGFuc3dlciA9IGNiID8gYXdhaXQgY2IoYXBpX2ZuKSA6IGF3YWl0IGFwaV9mbigpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbSwgZXJyb3I6IGVyclxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiBzZW5kZXIucmVwbHlFeHBlY3RlZCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogYW5zd2VyXG4gICAgcmV0dXJuIHRydWVcblxuXG5mdW5jdGlvbiBub29wKCkge31cblxuIiwiaW1wb3J0IHthZGRfZXBfa2luZCwgZXBfcHJvdG99IGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIHNlcnZlcihvbl9pbml0KSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIG9uX2luaXRcblxuZXhwb3J0ICogZnJvbSAnLi9jbGllbnQuanN5J1xuZXhwb3J0ICogZnJvbSAnLi9hcGkuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBlcF9wcm90b1xuIiwiaW1wb3J0IGVwX3Byb3RvIGZyb20gJy4vZXBfa2luZHMvaW5kZXguanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgcGx1Z2luX25hbWU6ICdlbmRwb2ludCdcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG5cbiAgb25fbXNnKHttc2csIHJlcGx5LCBpbmZvfSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCAnRU5EUE9JTlQgTVNHOicsIEB7fSBtc2csIHJlcGx5LCBpbmZvXG4gIG9uX2Vycm9yKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgRVJST1I6JywgZXJyXG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgLy8gcmV0dXJuIGZhbHNlIHRvIHByZXZlbnQgYXV0by1zaHV0ZG93blxuICBvbl9zaHV0ZG93bihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICBjb25zb2xlLmVycm9yIEAgYEVORFBPSU5UIFNIVVRET1dOOiAke2Vyci5tZXNzYWdlfWBcblxuICBzdWJjbGFzcyhjbGFzc2VzKSA6OlxuICAgIC8vY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc30gPSBjbGFzc2VzXG4gICAgcmV0dXJuIGNsYXNzZXNcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHBsdWdpbl9uYW1lLCBjcmVhdGVNYXBcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgaWYgcGx1Z2luX29wdGlvbnMuZXBfa2luZHMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzXG5cbiAgbGV0IGVuZHBvaW50X3BsdWdpblxuICByZXR1cm4gQDpcbiAgICBzdWJjbGFzc1xuICAgIHBvc3QoaHViKSA6OlxuICAgICAgcmV0dXJuIGh1YltwbHVnaW5fbmFtZV0gPSBlbmRwb2ludF9wbHVnaW4oaHViKVxuXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gcGx1Z2luX29wdGlvbnMucHJvdG9jb2xzXG4gICAgICB8fCBGYWJyaWNIdWJfUEkucHJvdG90eXBlLnByb3RvY29sc1xuXG4gICAgY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHg6IE1zZ0N0eF9waX0gPVxuICAgICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDpcbiAgICAgICAgU2luazogU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgTXNnQ3R4OiBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIEVuZHBvaW50OiBFbmRwb2ludEJhc2Uuc3ViY2xhc3Moe2NyZWF0ZU1hcH0pXG5cbiAgICBlbmRwb2ludF9wbHVnaW4gPSBmdW5jdGlvbiAoaHViKSA6OlxuICAgICAgY29uc3QgY2hhbm5lbCA9IGh1Yi5jb25uZWN0X3NlbGYoKVxuICAgICAgY29uc3QgTXNnQ3R4ID0gTXNnQ3R4X3BpLmZvckh1YihodWIsIGNoYW5uZWwpXG5cbiAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZiBAIGVuZHBvaW50LCBlcF9wcm90b1xuICAgICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gZW5kcG9pbnQsIGNyZWF0ZSwgTXNnQ3R4XG4gICAgICByZXR1cm4gZW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSBwcm90b2NvbHMucmFuZG9tX2lkKClcbiAgICAgICAgd2hpbGUgdGFyZ2V0cy5oYXMgQCBpZF90YXJnZXRcbiAgICAgICAgcmV0dXJuIGNyZWF0ZSBAIGlkX3RhcmdldCwgb25faW5pdFxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGUoaWRfdGFyZ2V0LCBvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBoYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbClcbiAgICAgICAgY29uc3QgaWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIGlkXG4gICAgICAgIGNvbnN0IGVwID0gbmV3IEVuZHBvaW50IEAgaWQsIG1zZ19jdHhcblxuICAgICAgICBjb25zdCByZWFkeSA9IFByb21pc2VcbiAgICAgICAgICAucmVzb2x2ZSBAXG4gICAgICAgICAgICAnZnVuY3Rpb24nID09PSB0eXBlb2Ygb25faW5pdFxuICAgICAgICAgICAgICA/IG9uX2luaXQoZXAsIGh1YilcbiAgICAgICAgICAgICAgOiBvbl9pbml0XG4gICAgICAgICAgLnRoZW4gQCBfYWZ0ZXJfaW5pdFxuXG4gICAgICAgIC8vIEFsbG93IGZvciBib3RoIGludGVybmFsIGFuZCBleHRlcm5hbCBlcnJvciBoYW5kbGluZyBieSBmb3JraW5nIHJlYWR5LmNhdGNoXG4gICAgICAgIHJlYWR5LmNhdGNoIEAgZXJyID0+IGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgOjpcbiAgICAgICAgICBjb25zdCBlcF90Z3QgPSBlcC5lcF9zZWxmKClcbiAgICAgICAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgICAgICAgcmVhZHk6IEB7fSB2YWx1ZTogcmVhZHkudGhlbiBAICgpID0+IGVwX3RndFxuXG5cbiAgICAgICAgZnVuY3Rpb24gX2FmdGVyX2luaXQodGFyZ2V0KSA6OlxuICAgICAgICAgIGlmIG51bGwgPT0gdGFyZ2V0IDo6XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIGVuZHBvaW50IGluaXQgdG8gcmV0dXJuIGEgY2xvc3VyZSBvciBpbnRlcmZhY2VgXG5cbiAgICAgICAgICBoYW5kbGVycy5vbl9tc2cgPSAodGFyZ2V0Lm9uX21zZyB8fCAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRhcmdldCA/IHRhcmdldCA6IGRlZmF1bHRfb25fbXNnKSkuYmluZCh0YXJnZXQpXG4gICAgICAgICAgaGFuZGxlcnMub25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0LCBlcClcbiAgICAgICAgICBoYW5kbGVycy5vbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQsIGVwKVxuXG4gICAgICAgICAgbmV3IFNpbmsoKS5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnNcblxuICAgICAgICAgIHJldHVybiB0YXJnZXQub25fcmVhZHkgPyB0YXJnZXQub25fcmVhZHkoZXAsIGh1YikgOiB0YXJnZXRcblxuXG4iXSwibmFtZXMiOlsiU2luayIsImZvclByb3RvY29scyIsImluYm91bmQiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJlbmRwb2ludCIsImh1YiIsImlkX3RhcmdldCIsImhhbmRsZXJzIiwidW5yZWdpc3RlciIsInJvdXRlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJvbl9tc2ciLCJvbl9lcnJvciIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImVyciIsImV4dHJhIiwiYXNzaWduIiwiYmluZFNpbmsiLCJwa3QiLCJyZWN2X21zZyIsInR5cGUiLCJ1bmRlZmluZWQiLCJ6b25lIiwibXNnIiwidGVybWluYXRlIiwiRVBUYXJnZXQiLCJpZCIsImVwX2VuY29kZSIsImlkX3JvdXRlciIsImFzX2pzb25fdW5wYWNrIiwibXNnX2N0eF90byIsInhmb3JtQnlLZXkiLCJPYmplY3QiLCJjcmVhdGUiLCJ0b2tlbiIsInYiLCJmcm9tX2N0eCIsImVwX2RlY29kZSIsImpzb25fdW5wYWNrX3hmb3JtIiwibXNnaWQiLCJhc0VuZHBvaW50SWQiLCJlcF90Z3QiLCJmYXN0IiwiaW5pdCIsImZhc3RfanNvbiIsImRlZmluZVByb3BlcnRpZXMiLCJnZXQiLCJzZW5kIiwicXVlcnkiLCJ2YWx1ZSIsInNpbXBsZSIsInIiLCJ0IiwidG9TdHJpbmciLCJyZXMiLCJzcGxpdCIsInBhcnNlSW50Iiwic3oiLCJKU09OIiwicGFyc2UiLCJyZXZpdmVyIiwicmVnIiwiV2Vha01hcCIsImtleSIsInhmbiIsInNldCIsInZmbiIsIk1zZ0N0eCIsInJhbmRvbV9pZCIsImNvZGVjcyIsIndpdGhDb2RlY3MiLCJmb3JIdWIiLCJjaGFubmVsIiwic2VuZFJhdyIsImNoYW5fc2VuZCIsImZyb21faWQiLCJmcmVlemUiLCJjdHgiLCJfaW52b2tlX2V4IiwiX21zZ0NvZGVjcyIsImNvbnRyb2wiLCJwaW5nIiwiYXJncyIsIl9jb2RlYyIsInJlcGx5Iiwic3RyZWFtIiwiZm5PcktleSIsImludm9rZSIsIm9iaiIsImFzc2VydE1vbml0b3IiLCJ0aGVuIiwicF9zZW50IiwiaW5pdFJlcGx5IiwidG8iLCJ0Z3QiLCJFcnJvciIsInNlbGYiLCJjbG9uZSIsInJlcGx5X2lkIiwibGVuZ3RoIiwid2l0aCIsImNoZWNrTW9uaXRvciIsIm9wdGlvbnMiLCJhY3RpdmUiLCJtb25pdG9yIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImRvbmUiLCJ0ZCIsInRpZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNvZGVjIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJ1bnJlZiIsImNsZWFyIiwiY2xlYXJJbnRlcnZhbCIsIm1zZ19jb2RlYyIsIlR5cGVFcnJvciIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwiZGVmYXVsdCIsImpzb25fc2VuZCIsImpzb24iLCJwX3JlcGx5IiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInNldFRpbWVvdXQiLCJtc190aW1lb3V0IiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJlcF9zZWxmIiwidG9KU09OIiwibXNnX2N0eCIsIndpdGhFbmRwb2ludCIsIk1hcCIsImNyZWF0ZU1hcCIsInNpbmsiLCJieV90b2tlbiIsImNyZWF0ZVJlcGx5TWFwIiwiYnlfdHJhZmZpYyIsImNyZWF0ZVRyYWZmaWNNYXAiLCJ0cmFmZmljIiwidHMiLCJEYXRlIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsImluZm8iLCJybXNnIiwicmVjdkN0cmwiLCJyZWN2TXNnIiwicnN0cmVhbSIsInJlY3ZTdHJlYW0iLCJpc19yZXBseSIsInNlbmRlciIsImFzX3NlbmRlciIsIndhcm4iLCJpbml0UmVwbHlQcm9taXNlIiwiY2F0Y2giLCJ3aXRoUmVqZWN0VGltZW91dCIsImRlbGV0ZSIsImVwX3Byb3RvIiwiZ2V0UHJvdG90eXBlT2YiLCJfdW53cmFwXyIsImFkZF9lcF9raW5kIiwia2luZHMiLCJjbGllbnRFbmRwb2ludCIsIm9uX2NsaWVudCIsInRhcmdldCIsImFwaSIsImVwX2FwaSIsImFwaV9wYXJhbGxlbCIsImVwIiwiZXBfY2xpZW50X2FwaSIsIm9uX3JlYWR5IiwiX3Jlc29sdmUiLCJfcmVqZWN0IiwicnBjIiwiYXBpX2JpbmRfcnBjIiwib3AiLCJhcGlfZm4iLCJrdyIsImludm9rZV9nYXRlZCIsInBmeCIsIm9wX3ByZWZpeCIsImxvb2t1cF9vcCIsIm9wX2xvb2t1cCIsImZuIiwiYmluZCIsInJwY19hcGkiLCJjYiIsInJlc29sdmVfb3AiLCJhbnN3ZXIiLCJnYXRlIiwibm9vcCIsImVycl9mcm9tIiwibWVzc2FnZSIsImNvZGUiLCJlcnJvciIsInJlcGx5RXhwZWN0ZWQiLCJvbl9pbml0IiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImNsYXNzZXMiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fbXNnIiwiZGVmYXVsdF9vbl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJlcF9raW5kcyIsImVuZHBvaW50X3BsdWdpbiIsInBsdWdpbl9uYW1lIiwiRmFicmljSHViX1BJIiwiYmFzZXMiLCJwcm90b2NvbHMiLCJNc2dDdHhfcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJjb25uZWN0X3NlbGYiLCJzZXRQcm90b3R5cGVPZiIsInRhcmdldHMiLCJoYXMiLCJpZF9zZWxmIiwicmVhZHkiLCJfYWZ0ZXJfaW5pdCIsInJlZ2lzdGVyIl0sIm1hcHBpbmdzIjoiOzs7O0FBQWUsTUFBTUEsSUFBTixDQUFXO1NBQ2pCQyxZQUFQLENBQW9CLEVBQUNDLE9BQUQsRUFBcEIsRUFBK0I7VUFDdkJGLElBQU4sU0FBbUIsSUFBbkIsQ0FBd0I7U0FDbkJHLFNBQUwsQ0FBZUMsU0FBZixHQUEyQkYsT0FBM0I7V0FDT0YsSUFBUDs7O1dBRU9LLFFBQVQsRUFBbUJDLEdBQW5CLEVBQXdCQyxTQUF4QixFQUFtQ0MsUUFBbkMsRUFBNkM7VUFDckNDLGFBQWEsTUFBTUgsSUFBSUksTUFBSixDQUFXQyxnQkFBWCxDQUE0QkosU0FBNUIsQ0FBekI7O1FBRUlHLE1BQUosQ0FBV0UsY0FBWCxDQUE0QkwsU0FBNUIsRUFDRSxLQUFLTSxhQUFMLENBQXFCUixRQUFyQixFQUErQkksVUFBL0IsRUFBMkNELFFBQTNDLENBREY7V0FFTyxJQUFQOzs7Z0JBRVlILFFBQWQsRUFBd0JJLFVBQXhCLEVBQW9DLEVBQUNLLE1BQUQsRUFBU0MsUUFBVCxFQUFtQkMsV0FBbkIsRUFBcEMsRUFBcUU7UUFDL0RDLFFBQVEsSUFBWjtVQUNNQyxXQUFXLEtBQUtkLFNBQXRCO1VBQ01lLFVBQVUsTUFBTUYsS0FBdEI7VUFDTUcsV0FBVyxDQUFDQyxHQUFELEVBQU1DLEtBQU4sS0FBZ0I7VUFDNUJMLEtBQUgsRUFBVztxQkFDS1IsYUFBYVEsUUFBUSxLQUFyQjtvQkFDRkksR0FBWixFQUFpQkMsS0FBakI7O0tBSEo7O1dBS09DLE1BQVAsQ0FBZ0IsSUFBaEIsRUFBc0JsQixTQUFTbUIsUUFBVCxDQUFrQixJQUFsQixDQUF0QixFQUErQyxFQUFJTCxPQUFKLEVBQWFDLFFBQWIsRUFBL0M7V0FDT0csTUFBUCxDQUFnQmxCLFFBQWhCLEVBQTBCLEVBQUljLE9BQUosRUFBYUMsUUFBYixFQUExQjs7V0FFTyxPQUFPSyxHQUFQLEVBQVlmLE1BQVosS0FBdUI7VUFDekIsVUFBUU8sS0FBUixJQUFpQixRQUFNUSxHQUExQixFQUFnQztlQUFRUixLQUFQOzs7WUFFM0JTLFdBQVdSLFNBQVNPLElBQUlFLElBQWIsQ0FBakI7VUFDR0MsY0FBY0YsUUFBakIsRUFBNEI7ZUFDbkIsS0FBS1gsU0FBVyxLQUFYLEVBQWtCLEVBQUlVLEdBQUosRUFBU0ksTUFBTSxVQUFmLEVBQWxCLENBQVo7OztVQUVFO1lBQ0VDLE1BQU0sTUFBTUosU0FBV0QsR0FBWCxFQUFnQixJQUFoQixFQUFzQmYsTUFBdEIsQ0FBaEI7WUFDRyxDQUFFb0IsR0FBTCxFQUFXO2lCQUFRQSxHQUFQOztPQUZkLENBR0EsT0FBTVQsR0FBTixFQUFZO2VBQ0gsS0FBS04sU0FBV00sR0FBWCxFQUFnQixFQUFJSSxHQUFKLEVBQVNJLE1BQU0sVUFBZixFQUFoQixDQUFaOzs7VUFFQyxVQUFVWixLQUFiLEVBQXFCO2VBQ1pQLE9BQU9ELFVBQWQ7OztVQUVFO2NBQ0lLLE9BQVNnQixHQUFULEVBQWNMLEdBQWQsQ0FBTjtPQURGLENBRUEsT0FBTUosR0FBTixFQUFZO1lBQ047Y0FDRVUsWUFBWWhCLFNBQVdNLEdBQVgsRUFBZ0IsRUFBSVMsR0FBSixFQUFTTCxHQUFULEVBQWNJLE1BQU0sVUFBcEIsRUFBaEIsQ0FBaEI7U0FERixTQUVRO2NBQ0gsVUFBVUUsU0FBYixFQUF5QjtxQkFDZFYsR0FBVCxFQUFjLEVBQUNTLEdBQUQsRUFBTUwsR0FBTixFQUFkO21CQUNPZixPQUFPRCxVQUFkOzs7O0tBeEJSOzs7Ozs7Ozs7Ozs7QUN4QkcsTUFBTXVCLFVBQU4sQ0FBZTtjQUNSQyxFQUFaLEVBQWdCO1NBQVFBLEVBQUwsR0FBVUEsRUFBVjs7O1lBRVQ7V0FBVyxhQUFZQyxVQUFVLEtBQUtELEVBQWYsRUFBbUIsSUFBbkIsQ0FBeUIsR0FBN0M7O1dBQ0o7V0FBVUMsVUFBVSxLQUFLRCxFQUFmLEVBQW1CLEtBQW5CLENBQVA7O2lCQUNHO1dBQVUsS0FBS0EsRUFBWjs7ZUFDTDtXQUFVLElBQVA7OztNQUVaRSxTQUFKLEdBQWdCO1dBQVUsS0FBS0YsRUFBTCxDQUFRRSxTQUFmOztNQUNmNUIsU0FBSixHQUFnQjtXQUFVLEtBQUswQixFQUFMLENBQVExQixTQUFmOzs7U0FFWjZCLGNBQVAsQ0FBc0JDLFVBQXRCLEVBQWtDQyxVQUFsQyxFQUE4QztpQkFDL0JDLE9BQU9DLE1BQVAsQ0FBY0YsY0FBYyxJQUE1QixDQUFiO2VBQ1dHLEtBQVgsSUFBb0JDLEtBQUssS0FBS0MsUUFBTCxDQUFnQkMsVUFBVUYsQ0FBVixDQUFoQixFQUE4QkwsVUFBOUIsQ0FBekI7V0FDTyxLQUFLUSxpQkFBTCxDQUF1QlAsVUFBdkIsQ0FBUDs7O1NBRUtLLFFBQVAsQ0FBZ0JWLEVBQWhCLEVBQW9CSSxVQUFwQixFQUFnQ1MsS0FBaEMsRUFBdUM7UUFDbEMsQ0FBRWIsRUFBTCxFQUFVOzs7UUFDUCxlQUFlLE9BQU9BLEdBQUdjLFlBQTVCLEVBQTJDO1dBQ3BDZCxHQUFHYyxZQUFILEVBQUw7OztVQUVJQyxTQUFTLElBQUksSUFBSixDQUFTZixFQUFULENBQWY7UUFDSWdCLElBQUo7UUFBVUMsT0FBTyxNQUFNRCxPQUFPWixXQUFXVyxNQUFYLEVBQW1CLEVBQUNGLEtBQUQsRUFBbkIsRUFBNEJLLFNBQTFEO1dBQ09aLE9BQU9hLGdCQUFQLENBQTBCSixNQUExQixFQUFrQztZQUNqQyxFQUFJSyxNQUFNO2lCQUFVLENBQUNKLFFBQVFDLE1BQVQsRUFBaUJJLElBQXhCO1NBQWIsRUFEaUM7YUFFaEMsRUFBSUQsTUFBTTtpQkFBVSxDQUFDSixRQUFRQyxNQUFULEVBQWlCSyxLQUF4QjtTQUFiLEVBRmdDO3FCQUd4QixFQUFJQyxPQUFPLENBQUMsQ0FBRVYsS0FBZCxFQUh3QixFQUFsQyxDQUFQOzs7O0FBTUosTUFBTUwsUUFBUSxRQUFkO0FBQ0FULFdBQVNTLEtBQVQsR0FBaUJBLEtBQWpCOztBQUVBVCxXQUFTRSxTQUFULEdBQXFCQSxTQUFyQjtBQUNBLEFBQU8sU0FBU0EsU0FBVCxDQUFtQkQsRUFBbkIsRUFBdUJ3QixNQUF2QixFQUErQjtNQUNoQyxFQUFDdEIsV0FBVXVCLENBQVgsRUFBY25ELFdBQVVvRCxDQUF4QixLQUE2QjFCLEVBQWpDO01BQ0ksQ0FBQ3lCLE1BQUksQ0FBTCxFQUFRRSxRQUFSLENBQWlCLEVBQWpCLENBQUo7TUFDSSxDQUFDRCxNQUFJLENBQUwsRUFBUUMsUUFBUixDQUFpQixFQUFqQixDQUFKO01BQ0dILE1BQUgsRUFBWTtXQUNGLEdBQUVoQixLQUFNLElBQUdpQixDQUFFLElBQUdDLENBQUUsRUFBMUI7OztRQUVJRSxNQUFNLEVBQUksQ0FBQ3BCLEtBQUQsR0FBVSxHQUFFaUIsQ0FBRSxJQUFHQyxDQUFFLEVBQXZCLEVBQVo7U0FDT3BDLE1BQVAsQ0FBZ0JzQyxHQUFoQixFQUFxQjVCLEVBQXJCO1NBQ080QixJQUFJMUIsU0FBWCxDQUFzQixPQUFPMEIsSUFBSXRELFNBQVg7U0FDZnNELEdBQVA7OztBQUdGN0IsV0FBU1ksU0FBVCxHQUFxQkEsU0FBckI7QUFDQSxBQUFPLFNBQVNBLFNBQVQsQ0FBbUJGLENBQW5CLEVBQXNCO1FBQ3JCVCxLQUFLLGFBQWEsT0FBT1MsQ0FBcEIsR0FDUEEsRUFBRW9CLEtBQUYsQ0FBUXJCLEtBQVIsRUFBZSxDQUFmLENBRE8sR0FFUEMsRUFBRUQsS0FBRixDQUZKO01BR0csQ0FBRVIsRUFBTCxFQUFVOzs7O01BRU4sQ0FBQ3lCLENBQUQsRUFBR0MsQ0FBSCxJQUFRMUIsR0FBRzZCLEtBQUgsQ0FBUyxHQUFULENBQVo7TUFDR2xDLGNBQWMrQixDQUFqQixFQUFxQjs7O01BQ2pCLElBQUlJLFNBQVNMLENBQVQsRUFBWSxFQUFaLENBQVI7TUFDSSxJQUFJSyxTQUFTSixDQUFULEVBQVksRUFBWixDQUFSOztTQUVPLEVBQUl4QixXQUFXdUIsQ0FBZixFQUFrQm5ELFdBQVdvRCxDQUE3QixFQUFQOzs7QUFHRjNCLFdBQVNhLGlCQUFULEdBQTZCQSxpQkFBN0I7QUFDQSxBQUFPLFNBQVNBLGlCQUFULENBQTJCUCxVQUEzQixFQUF1QztTQUNyQzBCLE1BQU1DLEtBQUtDLEtBQUwsQ0FBYUYsRUFBYixFQUFpQkcsU0FBakIsQ0FBYjs7V0FFU0EsT0FBVCxHQUFtQjtVQUNYQyxNQUFNLElBQUlDLE9BQUosRUFBWjtXQUNPLFVBQVNDLEdBQVQsRUFBY2QsS0FBZCxFQUFxQjtZQUNwQmUsTUFBTWpDLFdBQVdnQyxHQUFYLENBQVo7VUFDRzFDLGNBQWMyQyxHQUFqQixFQUF1QjtZQUNqQkMsR0FBSixDQUFRLElBQVIsRUFBY0QsR0FBZDtlQUNPZixLQUFQOzs7VUFFQyxhQUFhLE9BQU9BLEtBQXZCLEVBQStCO2NBQ3ZCaUIsTUFBTUwsSUFBSWYsR0FBSixDQUFRRyxLQUFSLENBQVo7WUFDRzVCLGNBQWM2QyxHQUFqQixFQUF1QjtpQkFDZEEsSUFBTWpCLEtBQU4sQ0FBUDs7O2FBQ0dBLEtBQVA7S0FWRjs7OztBQ2xFVyxNQUFNa0IsTUFBTixDQUFhO1NBQ25CekUsWUFBUCxDQUFvQixFQUFDMEUsU0FBRCxFQUFZQyxNQUFaLEVBQXBCLEVBQXlDO1VBQ2pDRixNQUFOLFNBQXFCLElBQXJCLENBQTBCO1dBQ25CdkUsU0FBUCxDQUFpQndFLFNBQWpCLEdBQTZCQSxTQUE3QjtXQUNPRSxVQUFQLENBQW9CRCxNQUFwQjtXQUNPRixNQUFQOzs7U0FFS0ksTUFBUCxDQUFjeEUsR0FBZCxFQUFtQnlFLE9BQW5CLEVBQTRCO1VBQ3BCLEVBQUNDLE9BQUQsS0FBWUQsT0FBbEI7O1VBRU1MLE1BQU4sU0FBcUIsSUFBckIsQ0FBMEI7V0FDbkJ2RSxTQUFQLENBQWlCOEUsU0FBakIsR0FBNkIsTUFBTXhELEdBQU4sSUFBYTtZQUNsQ3VELFFBQVF2RCxHQUFSLENBQU47YUFDTyxJQUFQO0tBRkY7O1dBSU9pRCxNQUFQOzs7Y0FHVXpDLEVBQVosRUFBZ0I7UUFDWCxRQUFRQSxFQUFYLEVBQWdCO1lBQ1IsRUFBQzFCLFNBQUQsRUFBWTRCLFNBQVosS0FBeUJGLEVBQS9CO1lBQ01pRCxVQUFVM0MsT0FBTzRDLE1BQVAsQ0FBZ0IsRUFBQzVFLFNBQUQsRUFBWTRCLFNBQVosRUFBaEIsQ0FBaEI7V0FDS2lELEdBQUwsR0FBVyxFQUFJRixPQUFKLEVBQVg7Ozs7ZUFHUzdFLFFBQWIsRUFBdUI7V0FDZGtDLE9BQU9hLGdCQUFQLENBQTBCLElBQTFCLEVBQWdDO2dCQUMzQixFQUFJSSxPQUFPbkQsUUFBWCxFQUQyQixFQUFoQyxDQUFQOzs7T0FJR29DLFFBQU0sSUFBWCxFQUFpQjtXQUFVLEtBQUs0QyxVQUFMLENBQWdCLEtBQUtDLFVBQUwsQ0FBZ0JDLE9BQWhCLENBQXdCQyxJQUF4QyxFQUE4QyxFQUE5QyxFQUFrRC9DLEtBQWxELENBQVA7O09BQ2YsR0FBR2dELElBQVIsRUFBYztXQUFVLEtBQUtKLFVBQUwsQ0FBZ0IsS0FBS0ssTUFBTCxDQUFZcEMsSUFBNUIsRUFBa0NtQyxJQUFsQyxDQUFQOztZQUNQLEdBQUdBLElBQWIsRUFBbUI7V0FBVSxLQUFLSixVQUFMLENBQWdCLEtBQUtLLE1BQUwsQ0FBWXBDLElBQTVCLEVBQWtDbUMsSUFBbEMsRUFBd0MsSUFBeEMsQ0FBUDs7UUFDaEIsR0FBR0EsSUFBVCxFQUFlO1dBQVUsS0FBS0osVUFBTCxDQUFnQixLQUFLSyxNQUFMLENBQVlwQyxJQUE1QixFQUFrQ21DLElBQWxDLEVBQXdDLElBQXhDLEVBQThDRSxLQUFyRDs7O1NBRVgsR0FBR0YsSUFBVixFQUFnQjtXQUFVLEtBQUtKLFVBQUwsQ0FBa0IsS0FBS0ssTUFBTCxDQUFZRSxNQUE5QixFQUFzQ0gsSUFBdEMsQ0FBUDs7U0FDWm5CLEdBQVAsRUFBWSxHQUFHbUIsSUFBZixFQUFxQjtXQUFVLEtBQUtKLFVBQUwsQ0FBa0IsS0FBS0ssTUFBTCxDQUFZcEIsR0FBWixDQUFsQixFQUFvQ21CLElBQXBDLENBQVA7O2FBQ2JJLE9BQVgsRUFBb0JwRCxLQUFwQixFQUEyQjtRQUN0QixlQUFlLE9BQU9vRCxPQUF6QixFQUFtQztnQkFBVyxLQUFLSCxNQUFmOztXQUM3QixDQUFDLEdBQUdELElBQUosS0FBYSxLQUFLSixVQUFMLENBQWdCUSxPQUFoQixFQUF5QkosSUFBekIsRUFBK0JoRCxLQUEvQixDQUFwQjs7O2FBRVNxRCxNQUFYLEVBQW1CTCxJQUFuQixFQUF5QmhELEtBQXpCLEVBQWdDO1VBQ3hCc0QsTUFBTXhELE9BQU9oQixNQUFQLENBQWdCLEVBQWhCLEVBQW9CLEtBQUs2RCxHQUF6QixDQUFaO1FBQ0csUUFBUTNDLEtBQVgsRUFBbUI7Y0FBU3NELElBQUl0RCxLQUFaO0tBQXBCLE1BQ0tzRCxJQUFJdEQsS0FBSixHQUFZQSxLQUFaO1FBQ0YsU0FBU0EsS0FBWixFQUFvQjtjQUNWc0QsSUFBSXRELEtBQUosR0FBWSxLQUFLa0MsU0FBTCxFQUFwQjs7O1NBRUdxQixhQUFMOztVQUVNbkMsTUFBTWlDLE9BQVMsS0FBS2IsU0FBZCxFQUF5QmMsR0FBekIsRUFBOEIsR0FBR04sSUFBakMsQ0FBWjtRQUNHLENBQUVoRCxLQUFGLElBQVcsZUFBZSxPQUFPb0IsSUFBSW9DLElBQXhDLEVBQStDO2FBQVFwQyxHQUFQOzs7UUFFNUNxQyxTQUFVckMsSUFBSW9DLElBQUosRUFBZDtVQUNNTixRQUFRLEtBQUt0RixRQUFMLENBQWM4RixTQUFkLENBQXdCMUQsS0FBeEIsRUFBK0J5RCxNQUEvQixFQUF1QyxJQUF2QyxDQUFkO2FBQ1NBLE9BQU9ELElBQVAsQ0FBYyxPQUFRLEVBQUNOLEtBQUQsRUFBUixDQUFkLENBQVQ7V0FDT0EsS0FBUCxHQUFlQSxLQUFmO1dBQ09PLE1BQVA7OztNQUVFRSxFQUFKLEdBQVM7V0FBVSxDQUFDQyxHQUFELEVBQU0sR0FBR1osSUFBVCxLQUFrQjtVQUNoQyxRQUFRWSxHQUFYLEVBQWlCO2NBQU8sSUFBSUMsS0FBSixDQUFhLHNCQUFiLENBQU47OztZQUVaQyxPQUFPLEtBQUtDLEtBQUwsRUFBYjs7WUFFTXBCLE1BQU1tQixLQUFLbkIsR0FBakI7VUFDRyxhQUFhLE9BQU9pQixHQUF2QixFQUE2QjtZQUN2QjlGLFNBQUosR0FBZ0I4RixHQUFoQjtZQUNJbEUsU0FBSixHQUFnQmlELElBQUlGLE9BQUosQ0FBWS9DLFNBQTVCO09BRkYsTUFHSztjQUNHUyxVQUFVeUQsR0FBVixLQUFrQkEsR0FBeEI7Y0FDTSxFQUFDbkIsU0FBU3VCLFFBQVYsRUFBb0JsRyxTQUFwQixFQUErQjRCLFNBQS9CLEVBQTBDTSxLQUExQyxFQUFpREssS0FBakQsS0FBMER1RCxHQUFoRTs7WUFFR3pFLGNBQWNyQixTQUFqQixFQUE2QjtjQUN2QkEsU0FBSixHQUFnQkEsU0FBaEI7Y0FDSTRCLFNBQUosR0FBZ0JBLFNBQWhCO1NBRkYsTUFHSyxJQUFHUCxjQUFjNkUsUUFBZCxJQUEwQixDQUFFckIsSUFBSTdFLFNBQW5DLEVBQStDO2NBQzlDQSxTQUFKLEdBQWdCa0csU0FBU2xHLFNBQXpCO2NBQ0k0QixTQUFKLEdBQWdCc0UsU0FBU3RFLFNBQXpCOzs7WUFFQ1AsY0FBY2EsS0FBakIsRUFBeUI7Y0FBS0EsS0FBSixHQUFZQSxLQUFaOztZQUN2QmIsY0FBY2tCLEtBQWpCLEVBQXlCO2NBQUtBLEtBQUosR0FBWUEsS0FBWjs7OzthQUVyQixNQUFNMkMsS0FBS2lCLE1BQVgsR0FBb0JILElBQXBCLEdBQTJCQSxLQUFLSSxJQUFMLENBQVksR0FBR2xCLElBQWYsQ0FBbEM7S0F2QlU7OztPQXlCUCxHQUFHQSxJQUFSLEVBQWM7VUFDTkwsTUFBTSxLQUFLQSxHQUFqQjtTQUNJLElBQUlpQixHQUFSLElBQWVaLElBQWYsRUFBc0I7VUFDakIsU0FBU1ksR0FBVCxJQUFnQixVQUFVQSxHQUE3QixFQUFtQztZQUM3QjVELEtBQUosR0FBWTRELEdBQVo7T0FERixNQUVLLElBQUcsUUFBUUEsR0FBWCxFQUFpQjtjQUNkLEVBQUM1RCxLQUFELEVBQVFLLEtBQVIsS0FBaUJ1RCxHQUF2QjtZQUNHekUsY0FBY2EsS0FBakIsRUFBeUI7Y0FBS0EsS0FBSixHQUFZQSxLQUFaOztZQUN2QmIsY0FBY2tCLEtBQWpCLEVBQXlCO2NBQUtBLEtBQUosR0FBWUEsS0FBWjs7OztXQUN2QixJQUFQOzs7Y0FFVTtXQUNILEtBQUswRCxLQUFMLENBQWEsRUFBQy9ELE9BQU8sSUFBUixFQUFiLENBQVA7OztRQUVJLEdBQUdnRCxJQUFULEVBQWU7V0FDTmxELE9BQU9DLE1BQVAsQ0FBZ0IsSUFBaEIsRUFBc0I7V0FDcEIsRUFBQ2dCLE9BQU9qQixPQUFPaEIsTUFBUCxDQUFnQixFQUFoQixFQUFvQixLQUFLNkQsR0FBekIsRUFBOEIsR0FBR0ssSUFBakMsQ0FBUixFQURvQixFQUF0QixDQUFQOzs7a0JBSWM7UUFDWCxDQUFFLEtBQUttQixZQUFMLEVBQUwsRUFBMkI7WUFDbkIsSUFBSU4sS0FBSixDQUFhLHdCQUFiLENBQU47OztpQkFDVztXQUFVLElBQVA7O1VBQ1ZPLFVBQVEsRUFBaEIsRUFBb0I7UUFDZixTQUFTQSxPQUFULElBQW9CLFVBQVVBLE9BQWpDLEVBQTJDO2dCQUMvQixFQUFJQyxRQUFRRCxPQUFaLEVBQVY7OztVQUVJRSxVQUFVLEtBQUsxRyxRQUFMLENBQWMyRyxXQUFkLENBQTBCLEtBQUs1QixHQUFMLENBQVM3RSxTQUFuQyxDQUFoQjs7VUFFTTBHLGNBQWNKLFFBQVFJLFdBQVIsSUFBdUIsSUFBM0M7UUFDSUMsWUFBWUwsUUFBUUssU0FBeEI7UUFDRyxTQUFTQSxTQUFaLEVBQXdCO2tCQUNWRCxjQUFZLENBQXhCOzs7UUFFRUwsWUFBSjtVQUNNTyxVQUFVLElBQUlDLE9BQUosQ0FBYyxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7WUFDM0NDLE9BQU9WLFFBQVFTLE1BQVIsR0FBaUJBLE1BQWpCLEdBQTBCRCxPQUF2QztXQUNLVCxZQUFMLEdBQW9CQSxlQUFlLE1BQ2pDSyxjQUFjRixRQUFRUyxFQUFSLEVBQWQsR0FDSSxJQURKLElBQ1lELEtBQUtSLE9BQUwsR0FBZSxLQUQzQixDQURGO0tBRmMsQ0FBaEI7O1FBTUlVLEdBQUo7VUFDTUMsY0FBY1IsYUFBYUQsY0FBWSxDQUE3QztRQUNHSixRQUFRQyxNQUFSLElBQWtCSSxTQUFyQixFQUFpQztZQUN6QlMsT0FBTyxLQUFLQyxLQUFMLENBQVcsU0FBWCxDQUFiO1lBQ01DLFlBQVksTUFBTTtZQUNuQkgsY0FBY1gsUUFBUVMsRUFBUixFQUFqQixFQUFnQztlQUN6QjFCLE1BQUwsQ0FBWSxNQUFaOztPQUZKO1lBR01nQyxZQUFjRCxTQUFkLEVBQXlCSCxXQUF6QixDQUFOO0tBTEYsTUFNSztZQUNHSSxZQUFjbEIsWUFBZCxFQUE0QmMsV0FBNUIsQ0FBTjs7UUFDQ0QsSUFBSU0sS0FBUCxFQUFlO1VBQUtBLEtBQUo7O1VBQ1ZDLFFBQVEsTUFBTUMsY0FBY1IsR0FBZCxDQUFwQjs7WUFFUXhCLElBQVIsQ0FBYStCLEtBQWIsRUFBb0JBLEtBQXBCO1dBQ09iLE9BQVA7OztRQUdJZSxTQUFOLEVBQWlCLEdBQUd6QyxJQUFwQixFQUEwQjtRQUNyQixhQUFhLE9BQU95QyxTQUF2QixFQUFtQztrQkFDckIsS0FBSzVDLFVBQUwsQ0FBZ0I0QyxTQUFoQixDQUFaOzs7UUFFQyxlQUFlLE9BQU9BLFVBQVU1RSxJQUFuQyxFQUEwQztZQUNsQyxJQUFJNkUsU0FBSixDQUFpQixnQ0FBakIsQ0FBTjs7O1dBRUs1RixPQUFPQyxNQUFQLENBQWdCLElBQWhCLEVBQXdCO2NBQ25CLEVBQUNnQixPQUFPMEUsU0FBUixFQURtQjtXQUV0QixFQUFDMUUsT0FBT2pCLE9BQU9oQixNQUFQLENBQWdCLEVBQWhCLEVBQW9CLEtBQUs2RCxHQUF6QixFQUE4QixHQUFHSyxJQUFqQyxDQUFSLEVBRnNCLEVBQXhCLENBQVA7OztTQUlLWixVQUFQLENBQWtCdUQsU0FBbEIsRUFBNkI7U0FDdkIsTUFBTSxDQUFDQyxJQUFELEVBQU9ILFNBQVAsQ0FBVixJQUErQjNGLE9BQU8rRixPQUFQLENBQWlCRixTQUFqQixDQUEvQixFQUE0RDtXQUNyRGpJLFNBQUwsQ0FBZWtJLElBQWYsSUFBdUIsWUFBVztlQUN6QixLQUFLVCxLQUFMLENBQWFNLFNBQWIsQ0FBUDtPQURGOztTQUVHL0gsU0FBTCxDQUFlbUYsVUFBZixHQUE0QjhDLFNBQTVCO1NBQ0tqSSxTQUFMLENBQWV1RixNQUFmLEdBQXdCMEMsVUFBVUcsT0FBbEM7OztVQUdNQyxZQUFZSixVQUFVSyxJQUFWLENBQWVuRixJQUFqQztXQUNPRixnQkFBUCxDQUEwQixLQUFLakQsU0FBL0IsRUFBNEM7aUJBQy9CLEVBQUlrRCxNQUFNO2lCQUFZO2tCQUN6QixDQUFDLEdBQUdvQyxJQUFKLEtBQWEsS0FBS0osVUFBTCxDQUFnQm1ELFNBQWhCLEVBQTJCL0MsSUFBM0IsQ0FEWTt1QkFFcEIsQ0FBQyxHQUFHQSxJQUFKLEtBQWEsS0FBS0osVUFBTCxDQUFnQm1ELFNBQWhCLEVBQTJCL0MsSUFBM0IsRUFBaUMsSUFBakMsQ0FGTzttQkFHeEIsQ0FBQyxHQUFHQSxJQUFKLEtBQWEsS0FBS0osVUFBTCxDQUFnQm1ELFNBQWhCLEVBQTJCL0MsSUFBM0IsRUFBaUMsSUFBakMsRUFBdUNFLEtBSDVCLEVBQVQ7U0FBYixFQUQrQixFQUE1Qzs7V0FNTyxJQUFQOzs7b0JBR2dCK0MsT0FBbEIsRUFBMkI7V0FDbEIsSUFBSXRCLE9BQUosQ0FBYyxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7Y0FDaENyQixJQUFSLENBQWVvQixPQUFmLEVBQXdCQyxNQUF4QjtjQUNRckIsSUFBUixDQUFlK0IsS0FBZixFQUFzQkEsS0FBdEI7O1lBRU1XLFVBQVUsTUFBTXJCLE9BQVMsSUFBSSxLQUFLc0IsWUFBVCxFQUFULENBQXRCO1lBQ01uQixNQUFNb0IsV0FBV0YsT0FBWCxFQUFvQixLQUFLRyxVQUF6QixDQUFaO1VBQ0dyQixJQUFJTSxLQUFQLEVBQWU7WUFBS0EsS0FBSjs7O2VBRVBDLEtBQVQsR0FBaUI7cUJBQWtCUCxHQUFmOztLQVJmLENBQVA7Ozs7QUFXSixNQUFNbUIsWUFBTixTQUEyQnRDLEtBQTNCLENBQWlDOztBQUVqQy9ELE9BQU9oQixNQUFQLENBQWdCbUQsT0FBT3ZFLFNBQXZCLEVBQWtDO2NBQUEsRUFDbEIySSxZQUFZLElBRE0sRUFBbEM7O0FDekxlLE1BQU1DLFFBQU4sQ0FBZTtTQUNyQkMsUUFBUCxDQUFnQkMsVUFBaEIsRUFBNEI7VUFDcEJGLFFBQU4sU0FBdUIsSUFBdkIsQ0FBNEI7V0FDckJ4SCxNQUFQLENBQWdCd0gsU0FBUzVJLFNBQXpCLEVBQW9DOEksVUFBcEM7V0FDT0YsUUFBUDs7O1lBRVE7V0FBVyxhQUFZN0csVUFBVSxLQUFLRCxFQUFmLEVBQW1CLElBQW5CLENBQXlCLEdBQTdDOztXQUNKO1dBQVUsS0FBS2lILE9BQUwsR0FBZUMsTUFBZixFQUFQOztZQUNGO1dBQVUsSUFBSSxLQUFLbkgsUUFBVCxDQUFrQixLQUFLQyxFQUF2QixDQUFQOztpQkFDRTtXQUFVLEtBQUtBLEVBQVo7OztjQUVOQSxFQUFaLEVBQWdCbUgsT0FBaEIsRUFBeUI7V0FDaEJoRyxnQkFBUCxDQUEwQixJQUExQixFQUFnQztVQUMxQixFQUFJSSxPQUFPdkIsRUFBWCxFQUQwQjtVQUUxQixFQUFJdUIsT0FBTzRGLFFBQVFDLFlBQVIsQ0FBcUIsSUFBckIsRUFBMkJqRCxFQUF0QyxFQUYwQixFQUFoQzs7O2NBSVU7V0FBVSxJQUFJa0QsR0FBSixFQUFQOzttQkFDRTtXQUFVLEtBQUtDLFNBQUwsRUFBUDs7bUJBQ0g7V0FBVSxLQUFLQSxTQUFMLEVBQVA7O3FCQUNEO1dBQVUsS0FBS0EsU0FBTCxFQUFQOzt3QkFDQTtXQUFVLEtBQUtBLFNBQUwsRUFBUDs7O1dBRWhCQyxJQUFULEVBQWU7VUFDUEMsV0FBVyxLQUFLQyxjQUFMLEVBQWpCO1VBQ01DLGFBQWEsS0FBS0MsZ0JBQUwsRUFBbkI7V0FDT3hHLGdCQUFQLENBQTBCLElBQTFCLEVBQWtDO2dCQUN0QixFQUFJSSxPQUFPaUcsUUFBWCxFQURzQjtrQkFFcEIsRUFBSWpHLE9BQU9tRyxVQUFYLEVBRm9CLEVBQWxDOztVQUlNRSxVQUFVLENBQUMzRSxPQUFELEVBQVUyRSxPQUFWLEtBQXNCO1lBQzlCQyxLQUFLQyxLQUFLQyxHQUFMLEVBQVg7VUFDRzlFLE9BQUgsRUFBYTtjQUNMdkIsSUFBSWdHLFdBQVd0RyxHQUFYLENBQWU2QixRQUFRM0UsU0FBdkIsQ0FBVjtZQUNHcUIsY0FBYytCLENBQWpCLEVBQXFCO1lBQ2pCbUcsRUFBRixHQUFPbkcsRUFBRyxNQUFLa0csT0FBUSxFQUFoQixJQUFxQkMsRUFBNUI7OztXQUNDRyxXQUFMLENBQWlCL0UsT0FBakIsRUFBMEIyRSxPQUExQixFQUFtQ0MsRUFBbkM7S0FORjs7V0FRTztnQkFDSyxLQUFLSSxjQUFMLEVBREw7bUJBRVEsS0FBS2xJLFFBQUwsQ0FBY0ksY0FBZCxDQUE2QixLQUFLZ0UsRUFBbEMsQ0FGUjs7Z0JBSUssQ0FBQ3RFLEdBQUQsRUFBTXFJLElBQU4sS0FBZTtnQkFDZkEsS0FBS2pGLE9BQWIsRUFBc0IsTUFBdEI7Y0FDTVMsUUFBUThELFNBQVNwRyxHQUFULENBQWE4RyxLQUFLMUgsS0FBbEIsQ0FBZDtjQUNNMkgsT0FBTyxLQUFLQyxRQUFMLENBQWN2SSxHQUFkLEVBQW1CcUksSUFBbkIsRUFBeUJ4RSxLQUF6QixDQUFiOztZQUVHL0QsY0FBYytELEtBQWpCLEVBQXlCO2tCQUNmMEIsT0FBUixDQUFnQitDLFFBQVEsRUFBQ3RJLEdBQUQsRUFBTXFJLElBQU4sRUFBeEIsRUFBcUNsRSxJQUFyQyxDQUEwQ04sS0FBMUM7U0FERixNQUVLLE9BQU95RSxJQUFQO09BWEY7O2VBYUksQ0FBQ3RJLEdBQUQsRUFBTXFJLElBQU4sS0FBZTtnQkFDZEEsS0FBS2pGLE9BQWIsRUFBc0IsS0FBdEI7Y0FDTVMsUUFBUThELFNBQVNwRyxHQUFULENBQWE4RyxLQUFLMUgsS0FBbEIsQ0FBZDtjQUNNMkgsT0FBTyxLQUFLRSxPQUFMLENBQWF4SSxHQUFiLEVBQWtCcUksSUFBbEIsRUFBd0J4RSxLQUF4QixDQUFiOztZQUVHL0QsY0FBYytELEtBQWpCLEVBQXlCO2tCQUNmMEIsT0FBUixDQUFnQitDLElBQWhCLEVBQXNCbkUsSUFBdEIsQ0FBMkJOLEtBQTNCO1NBREYsTUFFSyxPQUFPeUUsSUFBUDtPQXBCRjs7c0JBc0JXLENBQUNHLE9BQUQsRUFBVUosSUFBVixLQUFtQjtnQkFDekJBLEtBQUtqRixPQUFiLEVBQXNCLFFBQXRCO09BdkJHO2tCQXdCTyxDQUFDcEQsR0FBRCxFQUFNcUksSUFBTixLQUFlO2dCQUNqQkEsS0FBS2pGLE9BQWIsRUFBc0IsUUFBdEI7Y0FDTVMsUUFBUThELFNBQVNwRyxHQUFULENBQWE4RyxLQUFLMUgsS0FBbEIsQ0FBZDtjQUNNOEgsVUFBVSxLQUFLQyxVQUFMLENBQWdCMUksR0FBaEIsRUFBcUJxSSxJQUFyQixFQUEyQnhFLEtBQTNCLENBQWhCOztZQUVHL0QsY0FBYytELEtBQWpCLEVBQXlCO2tCQUNmMEIsT0FBUixDQUFnQmtELE9BQWhCLEVBQXlCdEUsSUFBekIsQ0FBOEJOLEtBQTlCOztlQUNLNEUsT0FBUDtPQS9CRyxFQUFQOzs7WUFpQ1F0SSxFQUFWLEVBQWM7UUFDVEEsRUFBSCxFQUFRO2FBQVEsS0FBS0QsUUFBTCxDQUFjVyxRQUFkLENBQXlCVixFQUF6QixFQUE2QixLQUFLbUUsRUFBbEMsQ0FBUDs7O1lBQ0QsRUFBQ2xCLFNBQVFqRCxFQUFULEVBQWFhLEtBQWIsRUFBVixFQUErQjtRQUMxQmIsRUFBSCxFQUFRO2FBQVEsS0FBS0QsUUFBTCxDQUFjVyxRQUFkLENBQXlCVixFQUF6QixFQUE2QixLQUFLbUUsRUFBbEMsRUFBc0N0RCxLQUF0QyxDQUFQOzs7O2NBRUNvQyxPQUFaLEVBQXFCMkUsT0FBckIsRUFBOEJDLEVBQTlCLEVBQWtDO1dBQ3pCaEksR0FBVCxFQUFjcUksSUFBZCxFQUFvQk0sUUFBcEIsRUFBOEI7UUFDekJBLFFBQUgsRUFBYzthQUFRM0ksR0FBUDs7O1VBQ1RBLEdBQVIsRUFBYXFJLElBQWIsRUFBbUJNLFFBQW5CLEVBQTZCO1FBQ3hCQSxRQUFILEVBQWM7YUFBUTNJLEdBQVA7O1dBQ1IsRUFBSUEsR0FBSixFQUFTcUksSUFBVCxFQUFlTyxRQUFRLEtBQUtDLFNBQUwsQ0FBZVIsSUFBZixDQUF2QixFQUFQOzthQUNTckksR0FBWCxFQUFnQnFJLElBQWhCLEVBQXNCTSxRQUF0QixFQUFnQztZQUN0QkcsSUFBUixDQUFnQix5QkFBd0JULElBQUssRUFBN0M7V0FDTyxJQUFQOzs7Ozs7O0dBUUZoRSxVQUFVMUQsS0FBVixFQUFpQnlELE1BQWpCLEVBQXlCa0QsT0FBekIsRUFBa0M7V0FDekIsS0FBS3lCLGdCQUFMLENBQXdCcEksS0FBeEIsRUFBK0J5RCxNQUEvQixFQUF1Q2tELE9BQXZDLENBQVA7OztjQUVVN0ksU0FBWixFQUF1QjtVQUNmK0QsTUFBTS9ELFVBQVVBLFNBQVYsSUFBdUJBLFNBQW5DO1FBQ0l3RyxVQUFVLEtBQUs0QyxVQUFMLENBQWdCdEcsR0FBaEIsQ0FBc0JpQixHQUF0QixDQUFkO1FBQ0cxQyxjQUFjbUYsT0FBakIsRUFBMkI7Z0JBQ2YsRUFBSXhHLFNBQUosRUFBZXVKLElBQUlDLEtBQUtDLEdBQUwsRUFBbkI7YUFDSDtpQkFBVUQsS0FBS0MsR0FBTCxLQUFhLEtBQUtGLEVBQXpCO1NBREEsRUFBVjtXQUVLSCxVQUFMLENBQWdCbkYsR0FBaEIsQ0FBc0JGLEdBQXRCLEVBQTJCeUMsT0FBM0I7O1dBQ0tBLE9BQVA7OzttQkFFZXRFLEtBQWpCLEVBQXdCeUQsTUFBeEIsRUFBZ0NrRCxPQUFoQyxFQUF5QztRQUNuQ3pELFFBQVEsSUFBSXlCLE9BQUosQ0FBYyxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7V0FDeENtQyxRQUFMLENBQWNqRixHQUFkLENBQW9CL0IsS0FBcEIsRUFBMkI0RSxPQUEzQjthQUNPeUQsS0FBUCxDQUFleEQsTUFBZjtLQUZVLENBQVo7O1FBSUc4QixPQUFILEVBQWE7Y0FDSEEsUUFBUTJCLGlCQUFSLENBQTBCcEYsS0FBMUIsQ0FBUjs7O1VBRUlxQyxRQUFRLE1BQU0sS0FBS3lCLFFBQUwsQ0FBY3VCLE1BQWQsQ0FBdUJ2SSxLQUF2QixDQUFwQjtVQUNNd0QsSUFBTixDQUFhK0IsS0FBYixFQUFvQkEsS0FBcEI7V0FDT3JDLEtBQVA7Ozs7QUFFSm9ELFNBQVM1SSxTQUFULENBQW1CNkIsUUFBbkIsR0FBOEJBLFVBQTlCOztBQ3JITyxNQUFNaUosYUFBVzFJLE9BQU9DLE1BQVAsQ0FDdEJELE9BQU8ySSxjQUFQLENBQXdCLFlBQVUsRUFBbEMsQ0FEc0IsRUFFdEIsRUFBSUMsVUFBVSxFQUFJOUgsS0FBSzhILFFBQVQsRUFBZCxFQUZzQixDQUFqQjs7QUFJUCxTQUFTQSxRQUFULEdBQW9CO1FBQ1o1RSxPQUFPaEUsT0FBT0MsTUFBUCxDQUFjLElBQWQsQ0FBYjtPQUNLbkMsUUFBTCxHQUFnQnFDLEtBQUtBLENBQXJCO1NBQ082RCxJQUFQOzs7QUFFRixBQUFPLFNBQVM2RSxXQUFULENBQXFCQyxLQUFyQixFQUE0QjtTQUMxQjlKLE1BQVAsQ0FBZ0IwSixVQUFoQixFQUEwQkksS0FBMUI7OztBQ1JGRCxZQUFjO1NBQ0wsR0FBRzNGLElBQVYsRUFBZ0I7UUFDWCxNQUFNQSxLQUFLaUIsTUFBWCxJQUFxQixlQUFlLE9BQU9qQixLQUFLLENBQUwsQ0FBOUMsRUFBd0Q7YUFDL0MsS0FBSzZGLGNBQUwsQ0FBc0I3RixLQUFLLENBQUwsQ0FBdEIsQ0FBUDs7O1VBRUkyRCxVQUFVLElBQUksS0FBSzFFLE1BQVQsRUFBaEI7V0FDTyxNQUFNZSxLQUFLaUIsTUFBWCxHQUFvQjBDLFFBQVFoRCxFQUFSLENBQVcsR0FBR1gsSUFBZCxDQUFwQixHQUEwQzJELE9BQWpEO0dBTlU7O2lCQVFHbUMsU0FBZixFQUEwQjtVQUNsQkMsU0FBU0YsZUFBZUMsU0FBZixDQUFmO1VBQ012SSxTQUFTLEtBQUszQyxRQUFMLENBQWdCbUwsTUFBaEIsQ0FBZjtXQUNPQSxPQUFPakUsSUFBZDtHQVhVOzthQWFEZ0UsU0FBWCxFQUFzQkUsR0FBdEIsRUFBMkI7VUFDbkJELFNBQVNGLGVBQWVDLFNBQWYsQ0FBZjtVQUNNRyxTQUFTLEtBQUtQLFFBQUwsQ0FBY1EsWUFBZCxDQUEyQkYsR0FBM0IsQ0FBZjtVQUNNekksU0FBUyxLQUFLM0MsUUFBTCxDQUFnQixDQUFDdUwsRUFBRCxFQUFLdEwsR0FBTCxLQUM3QmlDLE9BQU9oQixNQUFQLENBQWdCaUssTUFBaEIsRUFBd0JFLE9BQU9FLEVBQVAsRUFBV3RMLEdBQVgsQ0FBeEIsQ0FEYSxDQUFmO1dBRU9rTCxPQUFPakUsSUFBZDtHQWxCVSxFQUFkOztBQXFCQSxNQUFNc0UsZ0JBQWdCO1FBQ2RDLFFBQU4sQ0FBZUYsRUFBZixFQUFtQnRMLEdBQW5CLEVBQXdCO1NBQ2pCeUwsUUFBTCxFQUFnQixNQUFNLEtBQUtSLFNBQUwsQ0FBZUssRUFBZixFQUFtQnRMLEdBQW5CLENBQXRCO1VBQ01zTCxHQUFHeEssUUFBSCxFQUFOO0dBSGtCO2dCQUlOd0ssRUFBZCxFQUFrQnZLLEdBQWxCLEVBQXVCO1NBQ2hCMkssT0FBTCxDQUFhM0ssR0FBYjtHQUxrQjtjQU1SdUssRUFBWixFQUFnQnZLLEdBQWhCLEVBQXFCO1VBQ2IsS0FBSzJLLE9BQUwsQ0FBYTNLLEdBQWIsQ0FBTixHQUEwQixLQUFLMEssUUFBTCxFQUExQjtHQVBrQixFQUF0Qjs7QUFTQSxBQUFPLFNBQVNULGNBQVQsQ0FBd0JDLFNBQXhCLEVBQW1DO1FBQ2xDQyxTQUFTakosT0FBT0MsTUFBUCxDQUFnQnFKLGFBQWhCLENBQWY7TUFDRyxlQUFlLE9BQU9OLFNBQXpCLEVBQXFDO1FBQ2hDQSxVQUFVTyxRQUFiLEVBQXdCO1lBQ2hCLElBQUkzRCxTQUFKLENBQWlCLCtEQUFqQixDQUFOOztXQUNLNUcsTUFBUCxDQUFnQmlLLE1BQWhCLEVBQXdCRCxTQUF4QjtHQUhGLE1BSUs7V0FDSUEsU0FBUCxHQUFtQkEsU0FBbkI7OztTQUVLaEUsSUFBUCxHQUFjLElBQUlILE9BQUosQ0FBYyxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7V0FDeEN5RSxRQUFQLEdBQWtCMUUsT0FBbEI7V0FDTzJFLE9BQVAsR0FBaUIxRSxNQUFqQjtHQUZZLENBQWQ7U0FHT2tFLE1BQVA7OztBQzFDRkosWUFBYztjQUFBO01BRVJLLEdBQUosRUFBUztXQUFVLEtBQUtFLFlBQUwsQ0FBa0JGLEdBQWxCLENBQVA7R0FGQTtlQUdDQSxHQUFiLEVBQWtCO1dBQ1QsS0FBS3BMLFFBQUwsQ0FBZ0IsVUFBVXVMLEVBQVYsRUFBY3RMLEdBQWQsRUFBbUI7WUFDbEMyTCxNQUFNQyxhQUFhVCxHQUFiLEVBQWtCRyxFQUFsQixFQUFzQnRMLEdBQXRCLENBQVo7YUFDTyxFQUFJMkwsR0FBSjtjQUNDbkwsTUFBTixDQUFhLEVBQUNnQixHQUFELEVBQU00SSxNQUFOLEVBQWIsRUFBNEI7Z0JBQ3BCdUIsSUFBSW5HLE1BQUosQ0FBYTRFLE1BQWIsRUFBcUI1SSxJQUFJcUssRUFBekIsRUFDSkMsVUFBVUEsT0FBT3RLLElBQUl1SyxFQUFYLEVBQWV2SyxJQUFJc0QsR0FBbkIsQ0FETixDQUFOO1NBRkcsRUFBUDtLQUZLLENBQVA7R0FKVTs7Y0FXQXFHLEdBQVosRUFBaUI7V0FDUixLQUFLcEwsUUFBTCxDQUFnQixVQUFVdUwsRUFBVixFQUFjdEwsR0FBZCxFQUFtQjtZQUNsQzJMLE1BQU1DLGFBQWFULEdBQWIsRUFBa0JHLEVBQWxCLEVBQXNCdEwsR0FBdEIsQ0FBWjthQUNPLEVBQUkyTCxHQUFKO2NBQ0NuTCxNQUFOLENBQWEsRUFBQ2dCLEdBQUQsRUFBTTRJLE1BQU4sRUFBYixFQUE0QjtnQkFDcEJ1QixJQUFJSyxZQUFKLENBQW1CNUIsTUFBbkIsRUFBMkI1SSxJQUFJcUssRUFBL0IsRUFDSkMsVUFBVUEsT0FBT3RLLElBQUl1SyxFQUFYLEVBQWV2SyxJQUFJc0QsR0FBbkIsQ0FETixDQUFOO1NBRkcsRUFBUDtLQUZLLENBQVA7R0FaVSxFQUFkOztBQW9CQSxTQUFTOEcsWUFBVCxDQUFzQlQsR0FBdEIsRUFBMkJHLEVBQTNCLEVBQStCdEwsR0FBL0IsRUFBb0M7UUFDNUJpTSxNQUFNZCxJQUFJZSxTQUFKLElBQWlCLE1BQTdCO1FBQ01DLFlBQVloQixJQUFJaUIsU0FBSixHQUNkUCxNQUFNVixJQUFJaUIsU0FBSixDQUFjSCxNQUFNSixFQUFwQixFQUF3QlAsRUFBeEIsRUFBNEJ0TCxHQUE1QixDQURRLEdBRWQsZUFBZSxPQUFPbUwsR0FBdEIsR0FDQVUsTUFBTVYsSUFBSWMsTUFBTUosRUFBVixFQUFjUCxFQUFkLEVBQWtCdEwsR0FBbEIsQ0FETixHQUVBNkwsTUFBTTtVQUNFUSxLQUFLbEIsSUFBSWMsTUFBTUosRUFBVixDQUFYO1dBQ09RLEtBQUtBLEdBQUdDLElBQUgsQ0FBUW5CLEdBQVIsQ0FBTCxHQUFvQmtCLEVBQTNCO0dBTk47O1NBUU9wSyxPQUFPQyxNQUFQLENBQWdCcUssT0FBaEIsRUFBeUI7ZUFDbkIsRUFBSXJKLE9BQU9pSixTQUFYLEVBRG1CO2NBRXBCLEVBQUlqSixPQUFPb0ksR0FBRzFDLE9BQUgsRUFBWCxFQUZvQixFQUF6QixDQUFQOzs7QUFLRixNQUFNMkQsVUFBWTtRQUNWL0csTUFBTixDQUFhNEUsTUFBYixFQUFxQnlCLEVBQXJCLEVBQXlCVyxFQUF6QixFQUE2QjtVQUNyQlYsU0FBUyxNQUFNLEtBQUtXLFVBQUwsQ0FBa0JyQyxNQUFsQixFQUEwQnlCLEVBQTFCLENBQXJCO1FBQ0d2SyxjQUFjd0ssTUFBakIsRUFBMEI7Ozs7VUFFcEJ2SSxNQUFNLEtBQUttSixNQUFMLENBQWN0QyxNQUFkLEVBQXNCMEIsTUFBdEIsRUFBOEJVLEVBQTlCLENBQVo7V0FDTyxNQUFNakosR0FBYjtHQU5jOztRQVFWeUksWUFBTixDQUFtQjVCLE1BQW5CLEVBQTJCeUIsRUFBM0IsRUFBK0JXLEVBQS9CLEVBQW1DO1VBQzNCVixTQUFTLE1BQU0sS0FBS1csVUFBTCxDQUFrQnJDLE1BQWxCLEVBQTBCeUIsRUFBMUIsQ0FBckI7UUFDR3ZLLGNBQWN3SyxNQUFqQixFQUEwQjs7OztVQUVwQnZJLE1BQU11RCxRQUFRQyxPQUFSLENBQWdCLEtBQUs0RixJQUFyQixFQUNUaEgsSUFEUyxDQUNGLE1BQU0sS0FBSytHLE1BQUwsQ0FBY3RDLE1BQWQsRUFBc0IwQixNQUF0QixFQUE4QlUsRUFBOUIsQ0FESixDQUFaO1NBRUtHLElBQUwsR0FBWXBKLElBQUlvQyxJQUFKLENBQVNpSCxJQUFULEVBQWVBLElBQWYsQ0FBWjtXQUNPLE1BQU1ySixHQUFiO0dBZmM7O1FBaUJWa0osVUFBTixDQUFpQnJDLE1BQWpCLEVBQXlCeUIsRUFBekIsRUFBNkI7UUFDeEIsYUFBYSxPQUFPQSxFQUF2QixFQUE0QjtZQUNwQnpCLE9BQU9wSCxJQUFQLENBQWMsRUFBQzZJLEVBQUQsRUFBS2dCLFVBQVUsS0FBS0EsUUFBcEI7ZUFDWCxFQUFJQyxTQUFTLG1CQUFiLEVBQWtDQyxNQUFNLEdBQXhDLEVBRFcsRUFBZCxDQUFOOzs7O1FBSUU7WUFDSWpCLFNBQVMsTUFBTSxLQUFLSyxTQUFMLENBQWVOLEVBQWYsQ0FBckI7VUFDRyxDQUFFQyxNQUFMLEVBQWM7Y0FDTjFCLE9BQU9wSCxJQUFQLENBQWMsRUFBQzZJLEVBQUQsRUFBS2dCLFVBQVUsS0FBS0EsUUFBcEI7aUJBQ1gsRUFBSUMsU0FBUyxtQkFBYixFQUFrQ0MsTUFBTSxHQUF4QyxFQURXLEVBQWQsQ0FBTjs7YUFFS2pCLE1BQVA7S0FMRixDQU1BLE9BQU0vSyxHQUFOLEVBQVk7WUFDSnFKLE9BQU9wSCxJQUFQLENBQWMsRUFBQzZJLEVBQUQsRUFBS2dCLFVBQVUsS0FBS0EsUUFBcEI7ZUFDWCxFQUFJQyxTQUFVLHNCQUFxQi9MLElBQUkrTCxPQUFRLEVBQS9DLEVBQWtEQyxNQUFNLEdBQXhELEVBRFcsRUFBZCxDQUFOOztHQTlCWTs7UUFpQ1ZMLE1BQU4sQ0FBYXRDLE1BQWIsRUFBcUIwQixNQUFyQixFQUE2QlUsRUFBN0IsRUFBaUM7UUFDM0I7VUFDRUUsU0FBU0YsS0FBSyxNQUFNQSxHQUFHVixNQUFILENBQVgsR0FBd0IsTUFBTUEsUUFBM0M7S0FERixDQUVBLE9BQU0vSyxHQUFOLEVBQVk7WUFDSnFKLE9BQU9wSCxJQUFQLENBQWMsRUFBQzZKLFVBQVUsS0FBS0EsUUFBaEIsRUFBMEJHLE9BQU9qTSxHQUFqQyxFQUFkLENBQU47YUFDTyxLQUFQOzs7UUFFQ3FKLE9BQU82QyxhQUFWLEVBQTBCO1lBQ2xCN0MsT0FBT3BILElBQVAsQ0FBYyxFQUFDMEosTUFBRCxFQUFkLENBQU47O1dBQ0ssSUFBUDtHQTFDYyxFQUFsQjs7QUE2Q0EsU0FBU0UsSUFBVCxHQUFnQjs7QUNoRmhCOUIsWUFBYztTQUNMb0MsT0FBUCxFQUFnQjtXQUFVLEtBQUtuTixRQUFMLENBQWdCbU4sT0FBaEIsQ0FBUDtHQURQLEVBQWQ7O0FDR0EsTUFBTUMseUJBQTJCO2VBQ2xCLFVBRGtCO2NBRW5CO1dBQVUsSUFBSW5FLEdBQUosRUFBUCxDQUFIO0dBRm1CLEVBSS9CeEksT0FBTyxFQUFDZ0IsR0FBRCxFQUFNNkQsS0FBTixFQUFhd0UsSUFBYixFQUFQLEVBQTJCO1lBQ2pCUyxJQUFSLENBQWUsZUFBZixFQUFnQyxFQUFJOUksR0FBSixFQUFTNkQsS0FBVCxFQUFnQndFLElBQWhCLEVBQWhDO0dBTDZCO1dBTXRCeUIsRUFBVCxFQUFhdkssR0FBYixFQUFrQkMsS0FBbEIsRUFBeUI7WUFDZmdNLEtBQVIsQ0FBZ0IsaUJBQWhCLEVBQW1Dak0sR0FBbkM7OztHQVA2QixFQVUvQkwsWUFBWTRLLEVBQVosRUFBZ0J2SyxHQUFoQixFQUFxQkMsS0FBckIsRUFBNEI7O1lBRWxCZ00sS0FBUixDQUFpQixzQkFBcUJqTSxJQUFJK0wsT0FBUSxFQUFsRDtHQVo2Qjs7V0FjdEJNLE9BQVQsRUFBa0I7O1dBRVRBLE9BQVA7R0FoQjZCLEVBQWpDOztBQW1CQSxhQUFlLFVBQVNDLGNBQVQsRUFBeUI7bUJBQ3JCcEwsT0FBT2hCLE1BQVAsQ0FBZ0IsRUFBaEIsRUFBb0JrTSxzQkFBcEIsRUFBNENFLGNBQTVDLENBQWpCO1FBQ007ZUFBQSxFQUNTcEUsU0FEVDtZQUVJcUUsY0FGSjtjQUdNQyxnQkFITjtpQkFJU0MsbUJBSlQsS0FLSkgsY0FMRjs7TUFPR0EsZUFBZUksUUFBbEIsRUFBNkI7V0FDcEJ4TSxNQUFQLENBQWdCMEosVUFBaEIsRUFBMEIwQyxlQUFlSSxRQUF6Qzs7O01BRUVDLGVBQUo7U0FDUztZQUFBO1NBRUYxTixHQUFMLEVBQVU7YUFDREEsSUFBSTJOLFdBQUosSUFBbUJELGdCQUFnQjFOLEdBQWhCLENBQTFCO0tBSEssRUFBVDs7V0FLUzBJLFFBQVQsQ0FBa0JrRixZQUFsQixFQUFnQ0MsS0FBaEMsRUFBdUM7VUFDL0JDLFlBQVlULGVBQWVTLFNBQWYsSUFDYkYsYUFBYS9OLFNBQWIsQ0FBdUJpTyxTQUQ1Qjs7VUFHTSxZQUFDckYsV0FBRCxRQUFXL0ksT0FBWCxFQUFpQjBFLFFBQVEySixTQUF6QixLQUNKVixlQUFlM0UsUUFBZixDQUEwQjtZQUNsQnNGLEtBQVNyTyxZQUFULENBQXNCbU8sU0FBdEIsQ0FEa0I7Y0FFaEJHLE9BQVd0TyxZQUFYLENBQXdCbU8sU0FBeEIsQ0FGZ0I7Z0JBR2RJLFNBQWF4RixRQUFiLENBQXNCLEVBQUNPLFNBQUQsRUFBdEIsQ0FIYyxFQUExQixDQURGOztzQkFNa0IsVUFBVWpKLEdBQVYsRUFBZTtZQUN6QnlFLFVBQVV6RSxJQUFJbU8sWUFBSixFQUFoQjtZQUNNL0osWUFBUzJKLFVBQVV2SixNQUFWLENBQWlCeEUsR0FBakIsRUFBc0J5RSxPQUF0QixDQUFmOzthQUVPMkosY0FBUCxDQUF3QnJPLFFBQXhCLEVBQWtDNEssVUFBbEM7YUFDTzFKLE1BQVAsQ0FBZ0JsQixRQUFoQixFQUEwQixFQUFJQSxRQUFKLEVBQWNtQyxNQUFkLFVBQXNCa0MsU0FBdEIsRUFBMUI7YUFDT3JFLFFBQVA7O2VBR1NBLFFBQVQsQ0FBa0JtTixPQUFsQixFQUEyQjtjQUNuQm1CLFVBQVVyTyxJQUFJSSxNQUFKLENBQVdpTyxPQUEzQjtXQUNHLElBQUlwTyxZQUFZNk4sVUFBVXpKLFNBQVYsRUFBaEIsQ0FBSCxRQUNNZ0ssUUFBUUMsR0FBUixDQUFjck8sU0FBZCxDQUROO2VBRU9pQyxPQUFTakMsU0FBVCxFQUFvQmlOLE9BQXBCLENBQVA7OztlQUVPaEwsTUFBVCxDQUFnQmpDLFNBQWhCLEVBQTJCaU4sT0FBM0IsRUFBb0M7Y0FDNUJoTixXQUFXK0IsT0FBT0MsTUFBUCxDQUFjLElBQWQsQ0FBakI7Y0FDTVAsS0FBSyxFQUFJMUIsU0FBSixFQUFlNEIsV0FBVzdCLElBQUlJLE1BQUosQ0FBV21PLE9BQXJDLEVBQVg7Y0FDTXpGLFVBQVUsSUFBSTFFLFNBQUosQ0FBYXpDLEVBQWIsQ0FBaEI7Y0FDTTJKLEtBQUssSUFBSTdDLFdBQUosQ0FBZTlHLEVBQWYsRUFBbUJtSCxPQUFuQixDQUFYOztjQUVNMEYsUUFBUTFILFFBQ1hDLE9BRFcsQ0FFVixlQUFlLE9BQU9tRyxPQUF0QixHQUNJQSxRQUFRNUIsRUFBUixFQUFZdEwsR0FBWixDQURKLEdBRUlrTixPQUpNLEVBS1h2SCxJQUxXLENBS0o4SSxXQUxJLENBQWQ7OztjQVFNakUsS0FBTixDQUFjekosT0FBT2IsU0FBU08sUUFBVCxDQUFvQk0sR0FBcEIsRUFBeUIsRUFBSVEsTUFBSyxVQUFULEVBQXpCLENBQXJCOzs7Z0JBR1FtQixTQUFTNEksR0FBRzFDLE9BQUgsRUFBZjtpQkFDTzNHLE9BQU9hLGdCQUFQLENBQTBCSixNQUExQixFQUFrQzttQkFDaEMsRUFBSVEsT0FBT3NMLE1BQU03SSxJQUFOLENBQWEsTUFBTWpELE1BQW5CLENBQVgsRUFEZ0MsRUFBbEMsQ0FBUDs7O2lCQUlPK0wsV0FBVCxDQUFxQnZELE1BQXJCLEVBQTZCO2NBQ3hCLFFBQVFBLE1BQVgsRUFBb0I7a0JBQ1osSUFBSXJELFNBQUosQ0FBaUIseURBQWpCLENBQU47OzttQkFFT3JILE1BQVQsR0FBa0IsQ0FBQzBLLE9BQU8xSyxNQUFQLEtBQWtCLGVBQWUsT0FBTzBLLE1BQXRCLEdBQStCQSxNQUEvQixHQUF3Q29DLGNBQTFELENBQUQsRUFBNEVoQixJQUE1RSxDQUFpRnBCLE1BQWpGLENBQWxCO21CQUNTekssUUFBVCxHQUFvQixDQUFDeUssT0FBT3pLLFFBQVAsSUFBbUI4TSxnQkFBcEIsRUFBc0NqQixJQUF0QyxDQUEyQ3BCLE1BQTNDLEVBQW1ESSxFQUFuRCxDQUFwQjttQkFDUzVLLFdBQVQsR0FBdUIsQ0FBQ3dLLE9BQU94SyxXQUFQLElBQXNCOE0sbUJBQXZCLEVBQTRDbEIsSUFBNUMsQ0FBaURwQixNQUFqRCxFQUF5REksRUFBekQsQ0FBdkI7O2NBRUk1TCxPQUFKLEdBQVdnUCxRQUFYLENBQXNCcEQsRUFBdEIsRUFBMEJ0TCxHQUExQixFQUErQkMsU0FBL0IsRUFBMENDLFFBQTFDOztpQkFFT2dMLE9BQU9NLFFBQVAsR0FBa0JOLE9BQU9NLFFBQVAsQ0FBZ0JGLEVBQWhCLEVBQW9CdEwsR0FBcEIsQ0FBbEIsR0FBNkNrTCxNQUFwRDs7O0tBL0NOOzs7Ozs7In0=
