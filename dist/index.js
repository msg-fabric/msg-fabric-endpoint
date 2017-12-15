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

exports['default'] = plugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL2VwX3RhcmdldC5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvZXh0ZW5zaW9ucy5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2NsaWVudC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2FwaS5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2luZGV4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgLy8vLyBFbmRwb2ludCBiaW5kU2luaygpIHJlc3BvbnNpYmlsaXRpZXNcbiAgLy8gYnlfbXNnaWQ6IG5ldyBNYXAoKVxuICAvLyBqc29uX3VucGFjayhzeikgOjogcmV0dXJuIEpTT04ucGFyc2Uoc3opXG4gIC8vIHJlY3ZDdHJsKG1zZywgaW5mbykgOjpcbiAgLy8gcmVjdk1zZyhtc2csIGluZm8pIDo6IHJldHVybiBAe30gbXNnLCBpbmZvXG4gIC8vIHJlY3ZTdHJlYW0obXNnLCBpbmZvKSA6OlxuICAvLyByZWN2U3RyZWFtRGF0YShyc3RyZWFtLCBpbmZvKSA6OlxuXG4iLCJleHBvcnQgZGVmYXVsdCBFUFRhcmdldFxuZXhwb3J0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIGNvbnN0cnVjdG9yKGlkKSA6OiB0aGlzLmlkID0gaWRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VQVGFyZ2V0ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gZXBfZW5jb2RlKHRoaXMuaWQsIGZhbHNlKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuICBpc0VQVGFyZ2V0KCkgOjogcmV0dXJuIHRydWVcblxuICBnZXQgaWRfcm91dGVyKCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfcm91dGVyXG4gIGdldCBpZF90YXJnZXQoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF90YXJnZXRcblxuICBzdGF0aWMgYXNfanNvbl91bnBhY2sobXNnX2N0eF90bywgeGZvcm1CeUtleSkgOjpcbiAgICB4Zm9ybUJ5S2V5ID0gT2JqZWN0LmNyZWF0ZSh4Zm9ybUJ5S2V5IHx8IG51bGwpXG4gICAgeGZvcm1CeUtleVt0b2tlbl0gPSB2ID0+IHRoaXMuZnJvbV9jdHggQCBlcF9kZWNvZGUodiwgdHJ1ZSksIG1zZ19jdHhfdG9cbiAgICByZXR1cm4gdGhpcy5qc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBmcm9tX2N0eChpZCwgbXNnX2N0eF90bywgbXNnaWQpIDo6XG4gICAgaWYgISBpZCA6OiByZXR1cm5cbiAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWQuYXNFbmRwb2ludElkIDo6XG4gICAgICBpZCA9IGlkLmFzRW5kcG9pbnRJZCgpXG5cbiAgICBjb25zdCBlcF90Z3QgPSBuZXcgdGhpcyhpZClcbiAgICBsZXQgZmFzdCwgaW5pdCA9ICgpID0+IGZhc3QgPSBtc2dfY3R4X3RvKGVwX3RndCwge21zZ2lkfSkuZmFzdFxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYsIGluY19leHRyYSkgOjpcbiAgY29uc3Qgc3pfaWQgPSAnc3RyaW5nJyA9PT0gdHlwZW9mIHZcbiAgICA/IHYuc3BsaXQodG9rZW4pWzFdXG4gICAgOiB2W3Rva2VuXVxuICBpZiAhIHN6X2lkIDo6IHJldHVyblxuXG4gIGxldCBbcix0XSA9IHN6X2lkLnNwbGl0KCd+JylcbiAgaWYgdW5kZWZpbmVkID09PSB0IDo6IHJldHVyblxuICByID0gMCB8IHBhcnNlSW50KHIsIDM2KVxuICB0ID0gMCB8IHBhcnNlSW50KHQsIDM2KVxuXG4gIGNvbnN0IGlkID0gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG4gIGlmIGluY19leHRyYSAmJiAnb2JqZWN0JyA9PT0gdHlwZW9mIHYgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgaWQsIHZcbiAgICBkZWxldGUgaWRbdG9rZW5dXG4gIHJldHVybiBpZFxuXG5cbkVQVGFyZ2V0Lmpzb25fdW5wYWNrX3hmb3JtID0ganNvbl91bnBhY2tfeGZvcm1cbmV4cG9ydCBmdW5jdGlvbiBqc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KSA6OlxuICByZXR1cm4gc3ogPT4gSlNPTi5wYXJzZSBAIHN6LCByZXZpdmVyKClcblxuICBmdW5jdGlvbiByZXZpdmVyKCkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWUpIDo6XG4gICAgICBjb25zdCB4Zm4gPSB4Zm9ybUJ5S2V5W2tleV1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0geGZuIDo6XG4gICAgICAgIHJlZy5zZXQodGhpcywgeGZuKVxuICAgICAgICByZXR1cm4gdmFsdWVcblxuICAgICAgaWYgJ29iamVjdCcgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICBjb25zdCB2Zm4gPSByZWcuZ2V0KHZhbHVlKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHZmbiA6OlxuICAgICAgICAgIHJldHVybiB2Zm4gQCB2YWx1ZVxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiIsImltcG9ydCB7ZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgc3RhdGljIGZvckh1YihodWIsIGNoYW5uZWwpIDo6XG4gICAgY29uc3Qge3NlbmRSYXd9ID0gY2hhbm5lbFxuICAgIGFzeW5jIGZ1bmN0aW9uIGNoYW5fc2VuZChwa3QpIDo6XG4gICAgICBhd2FpdCBzZW5kUmF3KHBrdClcbiAgICAgIHJldHVybiB0cnVlXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuID0gT2JqZWN0LmNyZWF0ZSBAXG4gICAgICBNc2dDdHgucHJvdG90eXBlLmNoYW4gfHwgbnVsbFxuICAgICAgQHt9IHNlbmQ6IEB7fSB2YWx1ZTogY2hhbl9zZW5kXG5cbiAgICByZXR1cm4gTXNnQ3R4XG5cblxuICBjb25zdHJ1Y3RvcihpZCkgOjpcbiAgICBpZiBudWxsICE9IGlkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gaWRcbiAgICAgIGNvbnN0IGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICB0aGlzLmN0eCA9IEB7fSBmcm9tX2lkXG5cblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuICAgICAgY2hhbjogQHt9IHZhbHVlOiBPYmplY3QuY3JlYXRlIEAgdGhpcy5jaGFuXG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG5cbiAgICBjb25zdCByZXMgPSBpbnZva2UgQCB0aGlzLmNoYW4sIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIGN0eC50b190Z3QgPSB0Z3RcbiAgICAgIHRndCA9IGVwX2RlY29kZSh0Z3QpIHx8IHRndFxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiAwID09PSBhcmdzLmxlbmd0aCA/IHNlbGYgOiBzZWxmLndpdGggQCAuLi5hcmdzXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgdHJ1ZSA9PT0gdGd0IHx8IGZhbHNlID09PSB0Z3QgOjpcbiAgICAgICAgY3R4LnRva2VuID0gdGd0XG4gICAgICBlbHNlIGlmIG51bGwgIT0gdGd0IDo6XG4gICAgICAgIGNvbnN0IHt0b2tlbiwgbXNnaWR9ID0gdGd0XG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG5cbiAgICAvLyBiaW5kIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBzZW5kID0gbXNnQ29kZWNzLmRlZmF1bHQuc2VuZFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcy5wcm90b3R5cGUsIEA6XG4gICAgICBmYXN0OiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoc2VuZCwgYXJncylcbiAgICAgICAgc2VuZFF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KHNlbmQsIGFyZ3MsIHRydWUpXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KHNlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgICByZXR1cm4gdGhpc1xuXG5cbiAgd2l0aFJlamVjdFRpbWVvdXQocF9yZXBseSkgOjpcbiAgICByZXR1cm4gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgcF9yZXBseS50aGVuIEAgcmVzb2x2ZSwgcmVqZWN0XG4gICAgICBwX3JlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcblxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLm1zX3RpbWVvdXQpXG4gICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcblxuICAgICAgZnVuY3Rpb24gY2xlYXIoKSA6OiBjbGVhclRpbWVvdXQgQCB0aWRcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dCwgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQge0VQVGFyZ2V0LCBlcF9lbmNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIHN1YmNsYXNzKGV4dGVuc2lvbnMpIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgZXh0ZW5zaW9uc1xuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVwX3NlbGYoKS50b0pTT04oKVxuICBlcF9zZWxmKCkgOjogcmV0dXJuIG5ldyB0aGlzLkVQVGFyZ2V0KHRoaXMuaWQpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG5cbiAgY29uc3RydWN0b3IoaWQsIE1zZ0N0eCkgOjpcbiAgICBjb25zdCBtc2dfY3R4ID0gdGhpcy5pbml0TXNnQ3R4IEAgaWQsIE1zZ0N0eFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBpZDogQHt9IHZhbHVlOiBpZFxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGluaXRNc2dDdHgoaWQsIE1zZ0N0eCkgOjpcbiAgICByZXR1cm4gbmV3IE1zZ0N0eChpZCkud2l0aEVuZHBvaW50KHRoaXMpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcbiAgICAgIGpzb25fdW5wYWNrOiB0aGlzLkVQVGFyZ2V0LmFzX2pzb25fdW5wYWNrKHRoaXMudG8pXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgYXNfdGFyZ2V0KGlkKSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG9cbiAgYXNfc2VuZGVyKHtmcm9tX2lkOmlkLCBtc2dpZH0pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50bywgbXNnaWRcblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc19zZW5kZXIoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogdGhpcy5wYXJ0cy5qb2luKCcnKTsgLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBwX3NlbnQsIG1zZ19jdHhcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIGxldCByZXBseSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIHBfc2VudC5jYXRjaCBAIHJlamVjdFxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgcmVwbHkgPSBtc2dfY3R4LndpdGhSZWplY3RUaW1lb3V0KHJlcGx5KVxuXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiB0aGlzLmJ5X3Rva2VuLmRlbGV0ZSBAIHRva2VuXG4gICAgcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuICAgIHJldHVybiByZXBseVxuXG5FbmRwb2ludC5wcm90b3R5cGUuRVBUYXJnZXQgPSBFUFRhcmdldFxuXG4iLCJleHBvcnQgY29uc3QgZXBfcHJvdG8gPSBPYmplY3QuY3JlYXRlIEBcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mIEAgZnVuY3Rpb24oKXt9XG4gIEB7fSBfdW53cmFwXzogQHt9IGdldDogX3Vud3JhcF9cblxuZnVuY3Rpb24gX3Vud3JhcF8oKSA6OlxuICBjb25zdCBzZWxmID0gT2JqZWN0LmNyZWF0ZSh0aGlzKVxuICBzZWxmLmVuZHBvaW50ID0gdiA9PiB2XG4gIHJldHVybiBzZWxmXG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRfZXBfa2luZChraW5kcykgOjpcbiAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBraW5kc1xuZXhwb3J0IGRlZmF1bHQgYWRkX2VwX2tpbmRcblxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGNsaWVudCguLi5hcmdzKSA6OlxuICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICByZXR1cm4gdGhpcy5jbGllbnRFbmRwb2ludCBAIGFyZ3NbMF1cblxuICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgdGhpcy5Nc2dDdHgoKVxuICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cbiAgY2xpZW50RW5kcG9pbnQob25fY2xpZW50KSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KG9uX2NsaWVudClcbiAgICBjb25zdCBlcF90Z3QgPSB0aGlzLmVuZHBvaW50IEAgdGFyZ2V0XG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cbiAgY2xpZW50X2FwaShvbl9jbGllbnQsIGFwaSkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpXG4gICAgY29uc3QgZXBfYXBpID0gdGhpcy5fdW53cmFwXy5hcGlfcGFyYWxsZWwoYXBpKVxuICAgIGNvbnN0IGVwX3RndCA9IHRoaXMuZW5kcG9pbnQgQCAoZXAsIGh1YikgPT5cbiAgICAgIE9iamVjdC5hc3NpZ24gQCB0YXJnZXQsIGVwX2FwaShlcCwgaHViKVxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG5cbmNvbnN0IGVwX2NsaWVudF9hcGkgPSBAe31cbiAgYXN5bmMgb25fcmVhZHkoZXAsIGh1YikgOjpcbiAgICB0aGlzLl9yZXNvbHZlIEAgYXdhaXQgdGhpcy5vbl9jbGllbnQoZXAsIGh1YilcbiAgICBhd2FpdCBlcC5zaHV0ZG93bigpXG4gIG9uX3NlbmRfZXJyb3IoZXAsIGVycikgOjpcbiAgICB0aGlzLl9yZWplY3QoZXJyKVxuICBvbl9zaHV0ZG93bihlcCwgZXJyKSA6OlxuICAgIGVyciA/IHRoaXMuX3JlamVjdChlcnIpIDogdGhpcy5fcmVzb2x2ZSgpXG5cbmV4cG9ydCBmdW5jdGlvbiBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpIDo6XG4gIGNvbnN0IHRhcmdldCA9IE9iamVjdC5jcmVhdGUgQCBlcF9jbGllbnRfYXBpXG4gIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvbl9jbGllbnQgOjpcbiAgICBpZiBvbl9jbGllbnQub25fcmVhZHkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgVXNlIFwib25fY2xpZW50KClcIiBpbnN0ZWFkIG9mIFwib25fcmVhZHkoKVwiIHdpdGggY2xpZW50RW5kcG9pbnRgXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRhcmdldCwgb25fY2xpZW50XG4gIGVsc2UgOjpcbiAgICB0YXJnZXQub25fY2xpZW50ID0gb25fY2xpZW50XG5cbiAgdGFyZ2V0LmRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgdGFyZ2V0Ll9yZXNvbHZlID0gcmVzb2x2ZVxuICAgIHRhcmdldC5fcmVqZWN0ID0gcmVqZWN0XG4gIHJldHVybiB0YXJnZXRcbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBhcGlfYmluZF9ycGNcbiAgYXBpKGFwaSkgOjogcmV0dXJuIHRoaXMuYXBpX3BhcmFsbGVsKGFwaSlcbiAgYXBpX3BhcmFsbGVsKGFwaSkgOjpcbiAgICByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuICBhcGlfaW5vcmRlcihhcGkpIDo6XG4gICAgcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZV9nYXRlZCBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cblxuZnVuY3Rpb24gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YikgOjpcbiAgY29uc3QgcGZ4ID0gYXBpLm9wX3ByZWZpeCB8fCAncnBjXydcbiAgY29uc3QgbG9va3VwX29wID0gYXBpLm9wX2xvb2t1cFxuICAgID8gb3AgPT4gYXBpLm9wX2xvb2t1cChwZnggKyBvcCwgZXAsIGh1YilcbiAgICA6ICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcGlcbiAgICA/IG9wID0+IGFwaShwZnggKyBvcCwgZXAsIGh1YilcbiAgICA6IG9wID0+IDo6XG4gICAgICAgIGNvbnN0IGZuID0gYXBpW3BmeCArIG9wXVxuICAgICAgICByZXR1cm4gZm4gPyBmbi5iaW5kKGFwaSkgOiBmblxuXG4gIHJldHVybiBPYmplY3QuY3JlYXRlIEAgcnBjX2FwaSwgQHt9XG4gICAgbG9va3VwX29wOiBAe30gdmFsdWU6IGxvb2t1cF9vcFxuICAgIGVycl9mcm9tOiBAe30gdmFsdWU6IGVwLmVwX3NlbGYoKVxuXG5cbmNvbnN0IHJwY19hcGkgPSBAOlxuICBhc3luYyBpbnZva2Uoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgaW52b2tlX2dhdGVkKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IFByb21pc2UucmVzb2x2ZSh0aGlzLmdhdGUpXG4gICAgICAudGhlbiBAICgpID0+IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgdGhpcy5nYXRlID0gcmVzLnRoZW4obm9vcCwgbm9vcClcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgcmVzb2x2ZV9vcChzZW5kZXIsIG9wKSA6OlxuICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Ygb3AgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdJbnZhbGlkIG9wZXJhdGlvbicsIGNvZGU6IDQwMFxuICAgICAgcmV0dXJuXG5cbiAgICB0cnkgOjpcbiAgICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMubG9va3VwX29wKG9wKVxuICAgICAgaWYgISBhcGlfZm4gOjpcbiAgICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnVW5rbm93biBvcGVyYXRpb24nLCBjb2RlOiA0MDRcbiAgICAgIHJldHVybiBhcGlfZm5cbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6IGBJbnZhbGlkIG9wZXJhdGlvbjogJHtlcnIubWVzc2FnZX1gLCBjb2RlOiA1MDBcblxuICBhc3luYyBhbnN3ZXIoc2VuZGVyLCBhcGlfZm4sIGNiKSA6OlxuICAgIHRyeSA6OlxuICAgICAgdmFyIGFuc3dlciA9IGNiID8gYXdhaXQgY2IoYXBpX2ZuKSA6IGF3YWl0IGFwaV9mbigpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbSwgZXJyb3I6IGVyclxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiBzZW5kZXIucmVwbHlFeHBlY3RlZCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogYW5zd2VyXG4gICAgcmV0dXJuIHRydWVcblxuXG5mdW5jdGlvbiBub29wKCkge31cblxuIiwiaW1wb3J0IHthZGRfZXBfa2luZCwgZXBfcHJvdG99IGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIHNlcnZlcihvbl9pbml0KSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIG9uX2luaXRcblxuZXhwb3J0ICogZnJvbSAnLi9jbGllbnQuanN5J1xuZXhwb3J0ICogZnJvbSAnLi9hcGkuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBlcF9wcm90b1xuIiwiaW1wb3J0IGVwX3Byb3RvIGZyb20gJy4vZXBfa2luZHMvaW5kZXguanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgcGx1Z2luX25hbWU6ICdlbmRwb2ludCdcbiAgcHJvdG9jb2xzOiAncHJvdG9jb2xzJ1xuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcblxuICBvbl9tc2coe21zZywgcmVwbHksIGluZm99KSA6OlxuICAgIGNvbnNvbGUud2FybiBAICdFTkRQT0lOVCBNU0c6JywgQHt9IG1zZywgcmVwbHksIGluZm9cbiAgb25fZXJyb3IoZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnJcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIGNvbnNvbGUuZXJyb3IgQCBgRU5EUE9JTlQgU0hVVERPV046ICR7ZXJyLm1lc3NhZ2V9YFxuXG4gIHN1YmNsYXNzKGNsYXNzZXMpIDo6XG4gICAgLy9jb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgY3JlYXRlTWFwXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIGlmIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBwbHVnaW5fb3B0aW9ucy5lcF9raW5kc1xuXG4gIGxldCBlbmRwb2ludF9wbHVnaW5cbiAgcmV0dXJuIEA6XG4gICAgb3JkZXI6IDFcbiAgICBzdWJjbGFzc1xuICAgIHBvc3QoaHViKSA6OlxuICAgICAgcmV0dXJuIGh1YltwbHVnaW5fb3B0aW9ucy5wbHVnaW5fbmFtZV0gPSBlbmRwb2ludF9wbHVnaW4oaHViKVxuXG5cbiAgZnVuY3Rpb24gZ2V0X3Byb3RvY29scyhodWJfcHJvdG90eXBlKSA6OlxuICAgIGNvbnN0IHJlcyA9IHBsdWdpbl9vcHRpb25zLnByb3RvY29sc1xuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgcmVzIDo6XG4gICAgICByZXR1cm4gaHViX3Byb3RvdHlwZVtyZXNdXG4gICAgZWxzZSBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgcmVzIDo6XG4gICAgICByZXR1cm4gcGx1Z2luX29wdGlvbnMucHJvdG9jb2xzIEBcbiAgICAgICAgaHViX3Byb3RvdHlwZS5wcm90b2NvbHMsIGh1Yl9wcm90b3R5cGVcbiAgICBlbHNlIGlmIG51bGwgPT0gcmVzIDo6XG4gICAgICByZXR1cm4gaHViX3Byb3RvdHlwZS5wcm90b2NvbHNcbiAgICBlbHNlIHJldHVybiByZXNcblxuXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gZ2V0X3Byb3RvY29scyBAIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4OiBNc2dDdHhfcGl9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuXG4gICAgZW5kcG9pbnRfcGx1Z2luID0gZnVuY3Rpb24gKGh1YikgOjpcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBodWIuY29ubmVjdF9zZWxmKClcbiAgICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eF9waS5mb3JIdWIoaHViLCBjaGFubmVsKVxuXG4gICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YgQCBlbmRwb2ludCwgZXBfcHJvdG9cbiAgICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGVuZHBvaW50LCBjcmVhdGUsIE1zZ0N0eFxuICAgICAgcmV0dXJuIGVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcHJvdG9jb2xzLnJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQgQCBpZCwgTXNnQ3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQFxuICAgICAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIG9uX2luaXRcbiAgICAgICAgICAgICAgPyBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgICAgIDogb25faW5pdFxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICAvLyBBbGxvdyBmb3IgYm90aCBpbnRlcm5hbCBhbmQgZXh0ZXJuYWwgZXJyb3IgaGFuZGxpbmcgYnkgZm9ya2luZyByZWFkeS5jYXRjaFxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PiBoYW5kbGVycy5vbl9lcnJvciBAIGVyciwgQHt9IHpvbmU6J29uX3JlYWR5J1xuXG4gICAgICAgIDo6XG4gICAgICAgICAgY29uc3QgZXBfdGd0ID0gZXAuZXBfc2VsZigpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuIl0sIm5hbWVzIjpbIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJpbmJvdW5kIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiZW5kcG9pbnQiLCJodWIiLCJpZF90YXJnZXQiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJyb3V0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fbXNnIiwib25fZXJyb3IiLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJlcnIiLCJleHRyYSIsImFzc2lnbiIsImJpbmRTaW5rIiwicGt0IiwicmVjdl9tc2ciLCJ0eXBlIiwidW5kZWZpbmVkIiwiem9uZSIsIm1zZyIsInRlcm1pbmF0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJlcF9lbmNvZGUiLCJpZF9yb3V0ZXIiLCJhc19qc29uX3VucGFjayIsIm1zZ19jdHhfdG8iLCJ4Zm9ybUJ5S2V5IiwiT2JqZWN0IiwiY3JlYXRlIiwidG9rZW4iLCJ2IiwiZnJvbV9jdHgiLCJlcF9kZWNvZGUiLCJqc29uX3VucGFja194Zm9ybSIsIm1zZ2lkIiwiYXNFbmRwb2ludElkIiwiZXBfdGd0IiwiZmFzdCIsImluaXQiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZ2V0Iiwic2VuZCIsInF1ZXJ5IiwidmFsdWUiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwicmVzIiwiaW5jX2V4dHJhIiwic3pfaWQiLCJzcGxpdCIsInBhcnNlSW50Iiwic3oiLCJKU09OIiwicGFyc2UiLCJyZXZpdmVyIiwicmVnIiwiV2Vha01hcCIsImtleSIsInhmbiIsInNldCIsInZmbiIsIk1zZ0N0eCIsInJhbmRvbV9pZCIsImNvZGVjcyIsIndpdGhDb2RlY3MiLCJmb3JIdWIiLCJjaGFubmVsIiwic2VuZFJhdyIsImNoYW5fc2VuZCIsImNoYW4iLCJmcm9tX2lkIiwiZnJlZXplIiwiY3R4IiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJjb250cm9sIiwicGluZyIsImFyZ3MiLCJfY29kZWMiLCJyZXBseSIsInN0cmVhbSIsImZuT3JLZXkiLCJpbnZva2UiLCJvYmoiLCJhc3NlcnRNb25pdG9yIiwidGhlbiIsInBfc2VudCIsImluaXRSZXBseSIsInRvIiwidGd0IiwiRXJyb3IiLCJzZWxmIiwiY2xvbmUiLCJ0b190Z3QiLCJyZXBseV9pZCIsImxlbmd0aCIsIndpdGgiLCJjaGVja01vbml0b3IiLCJvcHRpb25zIiwiYWN0aXZlIiwibW9uaXRvciIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJkb25lIiwidGQiLCJ0aWQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwidW5yZWYiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJUeXBlRXJyb3IiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImRlZmF1bHQiLCJwX3JlcGx5IiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInNldFRpbWVvdXQiLCJtc190aW1lb3V0IiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJlcF9zZWxmIiwidG9KU09OIiwibXNnX2N0eCIsImluaXRNc2dDdHgiLCJNYXAiLCJjcmVhdGVNYXAiLCJ3aXRoRW5kcG9pbnQiLCJzaW5rIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwiRGF0ZSIsIm5vdyIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJpbmZvIiwicm1zZyIsInJlY3ZDdHJsIiwicmVjdk1zZyIsInJzdHJlYW0iLCJyZWN2U3RyZWFtIiwiaXNfcmVwbHkiLCJzZW5kZXIiLCJhc19zZW5kZXIiLCJ3YXJuIiwiaW5pdFJlcGx5UHJvbWlzZSIsImNhdGNoIiwid2l0aFJlamVjdFRpbWVvdXQiLCJkZWxldGUiLCJlcF9wcm90byIsImdldFByb3RvdHlwZU9mIiwiX3Vud3JhcF8iLCJhZGRfZXBfa2luZCIsImtpbmRzIiwiY2xpZW50RW5kcG9pbnQiLCJvbl9jbGllbnQiLCJ0YXJnZXQiLCJhcGkiLCJlcF9hcGkiLCJhcGlfcGFyYWxsZWwiLCJlcCIsImVwX2NsaWVudF9hcGkiLCJvbl9yZWFkeSIsIl9yZXNvbHZlIiwiX3JlamVjdCIsInJwYyIsImFwaV9iaW5kX3JwYyIsIm9wIiwiYXBpX2ZuIiwia3ciLCJpbnZva2VfZ2F0ZWQiLCJwZngiLCJvcF9wcmVmaXgiLCJsb29rdXBfb3AiLCJvcF9sb29rdXAiLCJmbiIsImJpbmQiLCJycGNfYXBpIiwiY2IiLCJyZXNvbHZlX29wIiwiYW5zd2VyIiwiZ2F0ZSIsIm5vb3AiLCJlcnJfZnJvbSIsIm1lc3NhZ2UiLCJjb2RlIiwiZXJyb3IiLCJyZXBseUV4cGVjdGVkIiwib25faW5pdCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJjbGFzc2VzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwiZXBfa2luZHMiLCJlbmRwb2ludF9wbHVnaW4iLCJwbHVnaW5fbmFtZSIsImdldF9wcm90b2NvbHMiLCJodWJfcHJvdG90eXBlIiwicHJvdG9jb2xzIiwiRmFicmljSHViX1BJIiwiYmFzZXMiLCJNc2dDdHhfcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJjb25uZWN0X3NlbGYiLCJzZXRQcm90b3R5cGVPZiIsInRhcmdldHMiLCJoYXMiLCJpZF9zZWxmIiwicmVhZHkiLCJfYWZ0ZXJfaW5pdCIsInJlZ2lzdGVyIl0sIm1hcHBpbmdzIjoiOzs7O0FBQWUsTUFBTUEsSUFBTixDQUFXO1NBQ2pCQyxZQUFQLENBQW9CLEVBQUNDLE9BQUQsRUFBcEIsRUFBK0I7VUFDdkJGLElBQU4sU0FBbUIsSUFBbkIsQ0FBd0I7U0FDbkJHLFNBQUwsQ0FBZUMsU0FBZixHQUEyQkYsT0FBM0I7V0FDT0YsSUFBUDs7O1dBRU9LLFFBQVQsRUFBbUJDLEdBQW5CLEVBQXdCQyxTQUF4QixFQUFtQ0MsUUFBbkMsRUFBNkM7VUFDckNDLGFBQWEsTUFBTUgsSUFBSUksTUFBSixDQUFX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
