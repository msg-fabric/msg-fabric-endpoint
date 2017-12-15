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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL2VwX3RhcmdldC5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvZXh0ZW5zaW9ucy5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2NsaWVudC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2FwaS5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2luZGV4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgLy8vLyBFbmRwb2ludCBiaW5kU2luaygpIHJlc3BvbnNpYmlsaXRpZXNcbiAgLy8gYnlfbXNnaWQ6IG5ldyBNYXAoKVxuICAvLyBqc29uX3VucGFjayhzeikgOjogcmV0dXJuIEpTT04ucGFyc2Uoc3opXG4gIC8vIHJlY3ZDdHJsKG1zZywgaW5mbykgOjpcbiAgLy8gcmVjdk1zZyhtc2csIGluZm8pIDo6IHJldHVybiBAe30gbXNnLCBpbmZvXG4gIC8vIHJlY3ZTdHJlYW0obXNnLCBpbmZvKSA6OlxuICAvLyByZWN2U3RyZWFtRGF0YShyc3RyZWFtLCBpbmZvKSA6OlxuXG4iLCJleHBvcnQgZGVmYXVsdCBFUFRhcmdldFxuZXhwb3J0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIGNvbnN0cnVjdG9yKGlkKSA6OiB0aGlzLmlkID0gaWRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VQVGFyZ2V0ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gZXBfZW5jb2RlKHRoaXMuaWQsIGZhbHNlKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuICBpc0VQVGFyZ2V0KCkgOjogcmV0dXJuIHRydWVcblxuICBnZXQgaWRfcm91dGVyKCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfcm91dGVyXG4gIGdldCBpZF90YXJnZXQoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF90YXJnZXRcblxuICBzdGF0aWMgYXNfanNvbl91bnBhY2sobXNnX2N0eF90bywgeGZvcm1CeUtleSkgOjpcbiAgICB4Zm9ybUJ5S2V5ID0gT2JqZWN0LmNyZWF0ZSh4Zm9ybUJ5S2V5IHx8IG51bGwpXG4gICAgeGZvcm1CeUtleVt0b2tlbl0gPSB2ID0+IHRoaXMuZnJvbV9jdHggQCBlcF9kZWNvZGUodiksIG1zZ19jdHhfdG9cbiAgICByZXR1cm4gdGhpcy5qc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBmcm9tX2N0eChpZCwgbXNnX2N0eF90bywgbXNnaWQpIDo6XG4gICAgaWYgISBpZCA6OiByZXR1cm5cbiAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWQuYXNFbmRwb2ludElkIDo6XG4gICAgICBpZCA9IGlkLmFzRW5kcG9pbnRJZCgpXG5cbiAgICBjb25zdCBlcF90Z3QgPSBuZXcgdGhpcyhpZClcbiAgICBsZXQgZmFzdCwgaW5pdCA9ICgpID0+IGZhc3QgPSBtc2dfY3R4X3RvKGVwX3RndCwge21zZ2lkfSkuZmFzdFxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cblxuRVBUYXJnZXQuanNvbl91bnBhY2tfeGZvcm0gPSBqc29uX3VucGFja194Zm9ybVxuZXhwb3J0IGZ1bmN0aW9uIGpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpIDo6XG4gIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXIoKVxuXG4gIGZ1bmN0aW9uIHJldml2ZXIoKSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBzdGF0aWMgZm9ySHViKGh1YiwgY2hhbm5lbCkgOjpcbiAgICBjb25zdCB7c2VuZFJhd30gPSBjaGFubmVsXG4gICAgYXN5bmMgZnVuY3Rpb24gY2hhbl9zZW5kKHBrdCkgOjpcbiAgICAgIGF3YWl0IHNlbmRSYXcocGt0KVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLmNoYW4gPSBPYmplY3QuY3JlYXRlIEBcbiAgICAgIE1zZ0N0eC5wcm90b3R5cGUuY2hhbiB8fCBudWxsXG4gICAgICBAe30gc2VuZDogQHt9IHZhbHVlOiBjaGFuX3NlbmRcblxuICAgIHJldHVybiBNc2dDdHhcblxuXG4gIGNvbnN0cnVjdG9yKGlkKSA6OlxuICAgIGlmIG51bGwgIT0gaWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBpZFxuICAgICAgY29uc3QgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIHRoaXMuY3R4ID0gQHt9IGZyb21faWRcblxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG4gICAgICBjaGFuOiBAe30gdmFsdWU6IE9iamVjdC5jcmVhdGUgQCB0aGlzLmNoYW5cblxuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9tc2dDb2RlY3MuY29udHJvbC5waW5nLCBbXSwgdG9rZW4pXG4gIHNlbmQoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzKVxuICBzZW5kUXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKVxuICBxdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgc3RyZWFtKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zdHJlYW0sIGFyZ3NcbiAgaW52b2tlKGtleSwgLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjW2tleV0sIGFyZ3NcbiAgYmluZEludm9rZShmbk9yS2V5LCB0b2tlbikgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgZm5PcktleSA6OiBmbk9yS2V5ID0gdGhpcy5fY29kZWNcbiAgICByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChmbk9yS2V5LCBhcmdzLCB0b2tlbilcblxuICBfaW52b2tlX2V4KGludm9rZSwgYXJncywgdG9rZW4pIDo6XG4gICAgY29uc3Qgb2JqID0gT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eFxuICAgIGlmIG51bGwgPT0gdG9rZW4gOjogdG9rZW4gPSBvYmoudG9rZW5cbiAgICBlbHNlIG9iai50b2tlbiA9IHRva2VuXG4gICAgaWYgdHJ1ZSA9PT0gdG9rZW4gOjpcbiAgICAgIHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuXG4gICAgdGhpcy5hc3NlcnRNb25pdG9yKClcblxuICAgIGNvbnN0IHJlcyA9IGludm9rZSBAIHRoaXMuY2hhbiwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgY3R4LnRvX3RndCA9IHRndFxuICAgICAgdGd0ID0gZXBfZGVjb2RlKHRndCkgfHwgdGd0XG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IHNlbmQgPSBtc2dDb2RlY3MuZGVmYXVsdC5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3Q6IEB7fSBnZXQoKSA6OiByZXR1cm4gQDpcbiAgICAgICAgc2VuZDogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChzZW5kLCBhcmdzKVxuICAgICAgICBzZW5kUXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoc2VuZCwgYXJncywgdHJ1ZSlcbiAgICAgICAgcXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICAgIHJldHVybiB0aGlzXG5cblxuICB3aXRoUmVqZWN0VGltZW91dChwX3JlcGx5KSA6OlxuICAgIHJldHVybiBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBwX3JlcGx5LnRoZW4gQCByZXNvbHZlLCByZWplY3RcbiAgICAgIHBfcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4gcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG4gICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMubXNfdGltZW91dClcbiAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCBAIHRpZFxuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0LCBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCB7RVBUYXJnZXQsIGVwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfc2VsZigpLnRvSlNPTigpXG4gIGVwX3NlbGYoKSA6OiByZXR1cm4gbmV3IHRoaXMuRVBUYXJnZXQodGhpcy5pZClcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcblxuICBjb25zdHJ1Y3RvcihpZCwgTXNnQ3R4KSA6OlxuICAgIGNvbnN0IG1zZ19jdHggPSB0aGlzLmluaXRNc2dDdHggQCBpZCwgTXNnQ3R4XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGlkOiBAe30gdmFsdWU6IGlkXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgaW5pdE1zZ0N0eChpZCwgTXNnQ3R4KSA6OlxuICAgIHJldHVybiBuZXcgTXNnQ3R4KGlkKS53aXRoRW5kcG9pbnQodGhpcylcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuICAgICAganNvbl91bnBhY2s6IHRoaXMuRVBUYXJnZXQuYXNfanNvbl91bnBhY2sodGhpcy50bylcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnIHx8IHttc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICBhc190YXJnZXQoaWQpIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50b1xuICBhc19zZW5kZXIoe2Zyb21faWQ6aWQsIG1zZ2lkfSkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvLCBtc2dpZFxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgcmVjdk1zZyhtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mbywgc2VuZGVyOiB0aGlzLmFzX3NlbmRlcihpbmZvKVxuICByZWN2U3RyZWFtKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiB0aGlzLnBhcnRzLmpvaW4oJycpOyAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIHBfc2VudCwgbXNnX2N0eFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgbGV0IHJlcGx5ID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcF9zZW50LmNhdGNoIEAgcmVqZWN0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICByZXBseSA9IG1zZ19jdHgud2l0aFJlamVjdFRpbWVvdXQocmVwbHkpXG5cbiAgICBjb25zdCBjbGVhciA9ICgpID0+IHRoaXMuYnlfdG9rZW4uZGVsZXRlIEAgdG9rZW5cbiAgICByZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG4gICAgcmV0dXJuIHJlcGx5XG5cbkVuZHBvaW50LnByb3RvdHlwZS5FUFRhcmdldCA9IEVQVGFyZ2V0XG5cbiIsImV4cG9ydCBjb25zdCBlcF9wcm90byA9IE9iamVjdC5jcmVhdGUgQFxuICBPYmplY3QuZ2V0UHJvdG90eXBlT2YgQCBmdW5jdGlvbigpe31cbiAgQHt9IF91bndyYXBfOiBAe30gZ2V0OiBfdW53cmFwX1xuXG5mdW5jdGlvbiBfdW53cmFwXygpIDo6XG4gIGNvbnN0IHNlbGYgPSBPYmplY3QuY3JlYXRlKHRoaXMpXG4gIHNlbGYuZW5kcG9pbnQgPSB2ID0+IHZcbiAgcmV0dXJuIHNlbGZcblxuZXhwb3J0IGZ1bmN0aW9uIGFkZF9lcF9raW5kKGtpbmRzKSA6OlxuICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIGtpbmRzXG5leHBvcnQgZGVmYXVsdCBhZGRfZXBfa2luZFxuXG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudEVuZHBvaW50IEAgYXJnc1swXVxuXG4gICAgY29uc3QgbXNnX2N0eCA9IG5ldyB0aGlzLk1zZ0N0eCgpXG4gICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoID8gbXNnX2N0eC50byguLi5hcmdzKSA6IG1zZ19jdHhcblxuICBjbGllbnRFbmRwb2ludChvbl9jbGllbnQpIDo6XG4gICAgY29uc3QgdGFyZ2V0ID0gY2xpZW50RW5kcG9pbnQob25fY2xpZW50KVxuICAgIGNvbnN0IGVwX3RndCA9IHRoaXMuZW5kcG9pbnQgQCB0YXJnZXRcbiAgICByZXR1cm4gdGFyZ2V0LmRvbmVcblxuICBjbGllbnRfYXBpKG9uX2NsaWVudCwgYXBpKSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KG9uX2NsaWVudClcbiAgICBjb25zdCBlcF9hcGkgPSB0aGlzLl91bndyYXBfLmFwaV9wYXJhbGxlbChhcGkpXG4gICAgY29uc3QgZXBfdGd0ID0gdGhpcy5lbmRwb2ludCBAIChlcCwgaHViKSA9PlxuICAgICAgT2JqZWN0LmFzc2lnbiBAIHRhcmdldCwgZXBfYXBpKGVwLCBodWIpXG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cblxuY29uc3QgZXBfY2xpZW50X2FwaSA9IEB7fVxuICBhc3luYyBvbl9yZWFkeShlcCwgaHViKSA6OlxuICAgIHRoaXMuX3Jlc29sdmUgQCBhd2FpdCB0aGlzLm9uX2NsaWVudChlcCwgaHViKVxuICAgIGF3YWl0IGVwLnNodXRkb3duKClcbiAgb25fc2VuZF9lcnJvcihlcCwgZXJyKSA6OlxuICAgIHRoaXMuX3JlamVjdChlcnIpXG4gIG9uX3NodXRkb3duKGVwLCBlcnIpIDo6XG4gICAgZXJyID8gdGhpcy5fcmVqZWN0KGVycikgOiB0aGlzLl9yZXNvbHZlKClcblxuZXhwb3J0IGZ1bmN0aW9uIGNsaWVudEVuZHBvaW50KG9uX2NsaWVudCkgOjpcbiAgY29uc3QgdGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSBAIGVwX2NsaWVudF9hcGlcbiAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9uX2NsaWVudCA6OlxuICAgIGlmIG9uX2NsaWVudC5vbl9yZWFkeSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBVc2UgXCJvbl9jbGllbnQoKVwiIGluc3RlYWQgb2YgXCJvbl9yZWFkeSgpXCIgd2l0aCBjbGllbnRFbmRwb2ludGBcbiAgICBPYmplY3QuYXNzaWduIEAgdGFyZ2V0LCBvbl9jbGllbnRcbiAgZWxzZSA6OlxuICAgIHRhcmdldC5vbl9jbGllbnQgPSBvbl9jbGllbnRcblxuICB0YXJnZXQuZG9uZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICB0YXJnZXQuX3Jlc29sdmUgPSByZXNvbHZlXG4gICAgdGFyZ2V0Ll9yZWplY3QgPSByZWplY3RcbiAgcmV0dXJuIHRhcmdldFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGFwaV9iaW5kX3JwY1xuICBhcGkoYXBpKSA6OiByZXR1cm4gdGhpcy5hcGlfcGFyYWxsZWwoYXBpKVxuICBhcGlfcGFyYWxsZWwoYXBpKSA6OlxuICAgIHJldHVybiB0aGlzLmVuZHBvaW50IEAgZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfYmluZF9ycGMoYXBpLCBlcCwgaHViKVxuICAgICAgcmV0dXJuIEB7fSBycGMsXG4gICAgICAgIGFzeW5jIG9uX21zZyh7bXNnLCBzZW5kZXJ9KSA6OlxuICAgICAgICAgIGF3YWl0IHJwYy5pbnZva2UgQCBzZW5kZXIsIG1zZy5vcCxcbiAgICAgICAgICAgIGFwaV9mbiA9PiBhcGlfZm4obXNnLmt3LCBtc2cuY3R4KVxuXG4gIGFwaV9pbm9yZGVyKGFwaSkgOjpcbiAgICByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2JpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlX2dhdGVkIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuXG5mdW5jdGlvbiBhcGlfYmluZF9ycGMoYXBpLCBlcCwgaHViKSA6OlxuICBjb25zdCBwZnggPSBhcGkub3BfcHJlZml4IHx8ICdycGNfJ1xuICBjb25zdCBsb29rdXBfb3AgPSBhcGkub3BfbG9va3VwXG4gICAgPyBvcCA9PiBhcGkub3BfbG9va3VwKHBmeCArIG9wLCBlcCwgaHViKVxuICAgIDogJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFwaVxuICAgID8gb3AgPT4gYXBpKHBmeCArIG9wLCBlcCwgaHViKVxuICAgIDogb3AgPT4gOjpcbiAgICAgICAgY29uc3QgZm4gPSBhcGlbcGZ4ICsgb3BdXG4gICAgICAgIHJldHVybiBmbiA/IGZuLmJpbmQoYXBpKSA6IGZuXG5cbiAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCBycGNfYXBpLCBAe31cbiAgICBsb29rdXBfb3A6IEB7fSB2YWx1ZTogbG9va3VwX29wXG4gICAgZXJyX2Zyb206IEB7fSB2YWx1ZTogZXAuZXBfc2VsZigpXG5cblxuY29uc3QgcnBjX2FwaSA9IEA6XG4gIGFzeW5jIGludm9rZShzZW5kZXIsIG9wLCBjYikgOjpcbiAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLnJlc29sdmVfb3AgQCBzZW5kZXIsIG9wXG4gICAgaWYgdW5kZWZpbmVkID09PSBhcGlfZm4gOjogcmV0dXJuXG5cbiAgICBjb25zdCByZXMgPSB0aGlzLmFuc3dlciBAIHNlbmRlciwgYXBpX2ZuLCBjYlxuICAgIHJldHVybiBhd2FpdCByZXNcblxuICBhc3luYyBpbnZva2VfZ2F0ZWQoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZ2F0ZSlcbiAgICAgIC50aGVuIEAgKCkgPT4gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICB0aGlzLmdhdGUgPSByZXMudGhlbihub29wLCBub29wKVxuICAgIHJldHVybiBhd2FpdCByZXNcblxuICBhc3luYyByZXNvbHZlX29wKHNlbmRlciwgb3ApIDo6XG4gICAgaWYgJ3N0cmluZycgIT09IHR5cGVvZiBvcCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogJ0ludmFsaWQgb3BlcmF0aW9uJywgY29kZTogNDAwXG4gICAgICByZXR1cm5cblxuICAgIHRyeSA6OlxuICAgICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5sb29rdXBfb3Aob3ApXG4gICAgICBpZiAhIGFwaV9mbiA6OlxuICAgICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdVbmtub3duIG9wZXJhdGlvbicsIGNvZGU6IDQwNFxuICAgICAgcmV0dXJuIGFwaV9mblxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogYEludmFsaWQgb3BlcmF0aW9uOiAke2Vyci5tZXNzYWdlfWAsIGNvZGU6IDUwMFxuXG4gIGFzeW5jIGFuc3dlcihzZW5kZXIsIGFwaV9mbiwgY2IpIDo6XG4gICAgdHJ5IDo6XG4gICAgICB2YXIgYW5zd2VyID0gY2IgPyBhd2FpdCBjYihhcGlfZm4pIDogYXdhaXQgYXBpX2ZuKClcbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IGVycl9mcm9tOiB0aGlzLmVycl9mcm9tLCBlcnJvcjogZXJyXG4gICAgICByZXR1cm4gZmFsc2VcblxuICAgIGlmIHNlbmRlci5yZXBseUV4cGVjdGVkIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBhbnN3ZXJcbiAgICByZXR1cm4gdHJ1ZVxuXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG4iLCJpbXBvcnQge2FkZF9lcF9raW5kLCBlcF9wcm90b30gZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgc2VydmVyKG9uX2luaXQpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgb25faW5pdFxuXG5leHBvcnQgKiBmcm9tICcuL2NsaWVudC5qc3knXG5leHBvcnQgKiBmcm9tICcuL2FwaS5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGVwX3Byb3RvXG4iLCJpbXBvcnQgZXBfcHJvdG8gZnJvbSAnLi9lcF9raW5kcy9pbmRleC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBwbHVnaW5fbmFtZTogJ2VuZHBvaW50J1xuICBwcm90b2NvbHM6ICdwcm90b2NvbHMnXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4LCBwcm90b2NvbHN9ID0gY2xhc3Nlc1xuICAgIHJldHVybiBjbGFzc2VzXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBjcmVhdGVNYXBcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgaWYgcGx1Z2luX29wdGlvbnMuZXBfa2luZHMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzXG5cbiAgbGV0IGVuZHBvaW50X3BsdWdpblxuICByZXR1cm4gQDpcbiAgICBvcmRlcjogMVxuICAgIHN1YmNsYXNzXG4gICAgcG9zdChodWIpIDo6XG4gICAgICByZXR1cm4gaHViW3BsdWdpbl9vcHRpb25zLnBsdWdpbl9uYW1lXSA9IGVuZHBvaW50X3BsdWdpbihodWIpXG5cblxuICBmdW5jdGlvbiBnZXRfcHJvdG9jb2xzKGh1Yl9wcm90b3R5cGUpIDo6XG4gICAgY29uc3QgcmVzID0gcGx1Z2luX29wdGlvbnMucHJvdG9jb2xzXG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiByZXMgOjpcbiAgICAgIHJldHVybiBodWJfcHJvdG90eXBlW3Jlc11cbiAgICBlbHNlIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiByZXMgOjpcbiAgICAgIHJldHVybiBwbHVnaW5fb3B0aW9ucy5wcm90b2NvbHMgQFxuICAgICAgICBodWJfcHJvdG90eXBlLnByb3RvY29scywgaHViX3Byb3RvdHlwZVxuICAgIGVsc2UgaWYgbnVsbCA9PSByZXMgOjpcbiAgICAgIHJldHVybiBodWJfcHJvdG90eXBlLnByb3RvY29sc1xuICAgIGVsc2UgcmV0dXJuIHJlc1xuXG5cbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBnZXRfcHJvdG9jb2xzIEAgRmFicmljSHViX1BJLnByb3RvdHlwZVxuXG4gICAgY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHg6IE1zZ0N0eF9waX0gPVxuICAgICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDpcbiAgICAgICAgU2luazogU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgTXNnQ3R4OiBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIEVuZHBvaW50OiBFbmRwb2ludEJhc2Uuc3ViY2xhc3Moe2NyZWF0ZU1hcH0pXG5cbiAgICBlbmRwb2ludF9wbHVnaW4gPSBmdW5jdGlvbiAoaHViKSA6OlxuICAgICAgY29uc3QgY2hhbm5lbCA9IGh1Yi5jb25uZWN0X3NlbGYoKVxuICAgICAgY29uc3QgTXNnQ3R4ID0gTXNnQ3R4X3BpLmZvckh1YihodWIsIGNoYW5uZWwpXG5cbiAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZiBAIGVuZHBvaW50LCBlcF9wcm90b1xuICAgICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gZW5kcG9pbnQsIGNyZWF0ZSwgTXNnQ3R4XG4gICAgICByZXR1cm4gZW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSBwcm90b2NvbHMucmFuZG9tX2lkKClcbiAgICAgICAgd2hpbGUgdGFyZ2V0cy5oYXMgQCBpZF90YXJnZXRcbiAgICAgICAgcmV0dXJuIGNyZWF0ZSBAIGlkX3RhcmdldCwgb25faW5pdFxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGUoaWRfdGFyZ2V0LCBvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBoYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbClcbiAgICAgICAgY29uc3QgaWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludCBAIGlkLCBNc2dDdHhcblxuICAgICAgICBjb25zdCByZWFkeSA9IFByb21pc2VcbiAgICAgICAgICAucmVzb2x2ZSBAXG4gICAgICAgICAgICAnZnVuY3Rpb24nID09PSB0eXBlb2Ygb25faW5pdFxuICAgICAgICAgICAgICA/IG9uX2luaXQoZXAsIGh1YilcbiAgICAgICAgICAgICAgOiBvbl9pbml0XG4gICAgICAgICAgLnRoZW4gQCBfYWZ0ZXJfaW5pdFxuXG4gICAgICAgIC8vIEFsbG93IGZvciBib3RoIGludGVybmFsIGFuZCBleHRlcm5hbCBlcnJvciBoYW5kbGluZyBieSBmb3JraW5nIHJlYWR5LmNhdGNoXG4gICAgICAgIHJlYWR5LmNhdGNoIEAgZXJyID0+IGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgOjpcbiAgICAgICAgICBjb25zdCBlcF90Z3QgPSBlcC5lcF9zZWxmKClcbiAgICAgICAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgICAgICAgcmVhZHk6IEB7fSB2YWx1ZTogcmVhZHkudGhlbiBAICgpID0+IGVwX3RndFxuXG5cbiAgICAgICAgZnVuY3Rpb24gX2FmdGVyX2luaXQodGFyZ2V0KSA6OlxuICAgICAgICAgIGlmIG51bGwgPT0gdGFyZ2V0IDo6XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIGVuZHBvaW50IGluaXQgdG8gcmV0dXJuIGEgY2xvc3VyZSBvciBpbnRlcmZhY2VgXG5cbiAgICAgICAgICBoYW5kbGVycy5vbl9tc2cgPSAodGFyZ2V0Lm9uX21zZyB8fCAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRhcmdldCA/IHRhcmdldCA6IGRlZmF1bHRfb25fbXNnKSkuYmluZCh0YXJnZXQpXG4gICAgICAgICAgaGFuZGxlcnMub25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0LCBlcClcbiAgICAgICAgICBoYW5kbGVycy5vbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQsIGVwKVxuXG4gICAgICAgICAgbmV3IFNpbmsoKS5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnNcblxuICAgICAgICAgIHJldHVybiB0YXJnZXQub25fcmVhZHkgPyB0YXJnZXQub25fcmVhZHkoZXAsIGh1YikgOiB0YXJnZXRcblxuXG4iXSwibmFtZXMiOlsiU2luayIsImZvclByb3RvY29scyIsImluYm91bmQiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJlbmRwb2ludCIsImh1YiIsImlkX3RhcmdldCIsImhhbmRsZXJzIiwidW5yZWdpc3RlciIsInJvdXRlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJvbl9tc2ciLCJvbl9lcnJvciIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImVyciIsImV4dHJhIiwiYXNzaWduIiwiYmluZFNpbmsiLCJwa3QiLCJyZWN2X21zZyIsInR5cGUiLCJ1bmRlZmluZWQiLCJ6b25lIiwibXNnIiwidGVybWluYXRlIiwiRVBUYXJnZXQiLCJpZCIsImVwX2VuY29kZSIsImlkX3JvdXRlciIsImFzX2pzb25fdW5wYWNrIiwibXNnX2N0eF90byIsInhmb3JtQnlLZXkiLCJPYmplY3QiLCJjcmVhdGUiLCJ0b2tlbiIsInYiLCJmcm9tX2N0eCIsImVwX2RlY29kZSIsImpzb25fdW5wYWNrX3hmb3JtIiwibXNnaWQiLCJhc0VuZHBvaW50SWQiLCJlcF90Z3QiLCJmYXN0IiwiaW5pdCIsImRlZmluZVByb3BlcnRpZXMiLCJnZXQiLCJzZW5kIiwicXVlcnkiLCJ2YWx1ZSIsInNpbXBsZSIsInIiLCJ0IiwidG9TdHJpbmciLCJyZXMiLCJzcGxpdCIsInBhcnNlSW50Iiwic3oiLCJKU09OIiwicGFyc2UiLCJyZXZpdmVyIiwicmVnIiwiV2Vha01hcCIsImtleSIsInhmbiIsInNldCIsInZmbiIsIk1zZ0N0eCIsInJhbmRvbV9pZCIsImNvZGVjcyIsIndpdGhDb2RlY3MiLCJmb3JIdWIiLCJjaGFubmVsIiwic2VuZFJhdyIsImNoYW5fc2VuZCIsImNoYW4iLCJmcm9tX2lkIiwiZnJlZXplIiwiY3R4IiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJjb250cm9sIiwicGluZyIsImFyZ3MiLCJfY29kZWMiLCJyZXBseSIsInN0cmVhbSIsImZuT3JLZXkiLCJpbnZva2UiLCJvYmoiLCJhc3NlcnRNb25pdG9yIiwidGhlbiIsInBfc2VudCIsImluaXRSZXBseSIsInRvIiwidGd0IiwiRXJyb3IiLCJzZWxmIiwiY2xvbmUiLCJ0b190Z3QiLCJyZXBseV9pZCIsImxlbmd0aCIsIndpdGgiLCJjaGVja01vbml0b3IiLCJvcHRpb25zIiwiYWN0aXZlIiwibW9uaXRvciIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJkb25lIiwidGQiLCJ0aWQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwidW5yZWYiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJUeXBlRXJyb3IiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImRlZmF1bHQiLCJwX3JlcGx5IiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInNldFRpbWVvdXQiLCJtc190aW1lb3V0IiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJlcF9zZWxmIiwidG9KU09OIiwibXNnX2N0eCIsImluaXRNc2dDdHgiLCJNYXAiLCJjcmVhdGVNYXAiLCJ3aXRoRW5kcG9pbnQiLCJzaW5rIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwiRGF0ZSIsIm5vdyIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJpbmZvIiwicm1zZyIsInJlY3ZDdHJsIiwicmVjdk1zZyIsInJzdHJlYW0iLCJyZWN2U3RyZWFtIiwiaXNfcmVwbHkiLCJzZW5kZXIiLCJhc19zZW5kZXIiLCJ3YXJuIiwiaW5pdFJlcGx5UHJvbWlzZSIsImNhdGNoIiwid2l0aFJlamVjdFRpbWVvdXQiLCJkZWxldGUiLCJlcF9wcm90byIsImdldFByb3RvdHlwZU9mIiwiX3Vud3JhcF8iLCJhZGRfZXBfa2luZCIsImtpbmRzIiwiY2xpZW50RW5kcG9pbnQiLCJvbl9jbGllbnQiLCJ0YXJnZXQiLCJhcGkiLCJlcF9hcGkiLCJhcGlfcGFyYWxsZWwiLCJlcCIsImVwX2NsaWVudF9hcGkiLCJvbl9yZWFkeSIsIl9yZXNvbHZlIiwiX3JlamVjdCIsInJwYyIsImFwaV9iaW5kX3JwYyIsIm9wIiwiYXBpX2ZuIiwia3ciLCJpbnZva2VfZ2F0ZWQiLCJwZngiLCJvcF9wcmVmaXgiLCJsb29rdXBfb3AiLCJvcF9sb29rdXAiLCJmbiIsImJpbmQiLCJycGNfYXBpIiwiY2IiLCJyZXNvbHZlX29wIiwiYW5zd2VyIiwiZ2F0ZSIsIm5vb3AiLCJlcnJfZnJvbSIsIm1lc3NhZ2UiLCJjb2RlIiwiZXJyb3IiLCJyZXBseUV4cGVjdGVkIiwib25faW5pdCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJjbGFzc2VzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwiZXBfa2luZHMiLCJlbmRwb2ludF9wbHVnaW4iLCJwbHVnaW5fbmFtZSIsImdldF9wcm90b2NvbHMiLCJodWJfcHJvdG90eXBlIiwicHJvdG9jb2xzIiwiRmFicmljSHViX1BJIiwiYmFzZXMiLCJNc2dDdHhfcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJjb25uZWN0X3NlbGYiLCJzZXRQcm90b3R5cGVPZiIsInRhcmdldHMiLCJoYXMiLCJpZF9zZWxmIiwicmVhZHkiLCJfYWZ0ZXJfaW5pdCIsInJlZ2lzdGVyIl0sIm1hcHBpbmdzIjoiOzs7O0FBQWUsTUFBTUEsSUFBTixDQUFXO1NBQ2pCQyxZQUFQLENBQW9CLEVBQUNDLE9BQUQsRUFBcEIsRUFBK0I7VUFDdkJGLElBQU4sU0FBbUIsSUFBbkIsQ0FBd0I7U0FDbkJHLFNBQUwsQ0FBZUMsU0FBZixHQUEyQkYsT0FBM0I7V0FDT0YsSUFBUDs7O1dBRU9LLFFBQVQsRUFBbUJDLEdBQW5CLEVBQXdCQyxTQUF4QixFQUFtQ0MsUUFBbkMsRUFBNkM7VUFDckNDLGFBQWEsTUFBTUgsSUFBSUksTUFBSixDQUFXQyxnQkFBWCxDQUE0QkosU0FBNUIsQ0FBekI7O1FBRUlHLE1BQUosQ0FBV0UsY0FBWCxDQUE0QkwsU0FBNUIsRUFDRSxLQUFLTSxhQUFMLENBQXFCUixRQUFyQixFQUErQkksVUFBL0IsRUFBMkNELFFBQTNDLENBREY7V0FFTyxJQUFQOzs7Z0JBRVlILFFBQWQsRUFBd0JJLFVB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
