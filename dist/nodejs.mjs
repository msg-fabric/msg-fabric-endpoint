import { randomBytes } from 'crypto';

const ep_proto$1 = Object.create(Object.getPrototypeOf(function () {}));
function add_ep_kind(kinds) {
  Object.assign(ep_proto$1, kinds);
}

add_ep_kind({
  clientEndpoint(api) {
    const target = clientEndpoint(api);
    this.endpoint(target);
    return target.done;
  },

  client(...args) {
    if (1 === args.length && 'function' === typeof args[0]) {
      return this.clientEndpoint(args[0]);
    }

    const msg_ctx = new this.MsgCtx();
    return 0 !== args.length ? msg_ctx.to(...args) : msg_ctx;
  } });

const ep_client_api = {
  async on_ready(ep, hub) {
    this._resolve((await this.on_client_ready(ep, hub)));
    await ep.shutdown();
  },
  on_send_error(ep, err) {
    this._reject(err);
  },
  on_shutdown(ep, err) {
    err ? this._reject(err) : this._resolve();
  } };

function clientEndpoint(on_client_ready) {
  let target = Object.create(ep_client_api);
  target.on_client_ready = on_client_ready;
  target.done = new Promise((resolve, reject) => {
    target._resolve = resolve;
    target._reject = reject;
  });
  return target;
}

add_ep_kind({
  api(api) {
    return this.endpoint(api_endpoints.parallel(api));
  },
  api_parallel(api) {
    return this.endpoint(api_endpoints.parallel(api));
  },
  api_inorder(api) {
    return this.endpoint(api_endpoints.inorder(api));
  } });

const api_endpoints = {
  parallel(api) {
    return function (ep, hub) {
      const rpc = api_endpoints.bind_rpc(api, ep, hub);
      return { rpc,
        async on_msg({ msg, sender }) {
          await rpc.invoke(sender, msg.op, api_fn => api_fn(msg.kw, msg.ctx));
        } };
    };
  },

  inorder(api) {
    return function (ep, hub) {
      const rpc = api_endpoints.bind_rpc(api, ep, hub);
      return { rpc,
        async on_msg({ msg, sender }) {
          await rpc.invoke_gated(sender, msg.op, api_fn => api_fn(msg.kw, msg.ctx));
        } };
    };
  },

  bind_rpc(api, ep, hub) {
    const pfx = api.op_prefix || 'rpc_';
    const lookup_op = api.op_lookup ? op => api.op_lookup(pfx + op, ep, hub) : 'function' === typeof api ? op => api(pfx + op, ep, hub) : op => {
      const fn = api[pfx + op];
      return fn ? fn.bind(api) : fn;
    };

    return Object.create(rpc_api, {
      lookup_op: { value: lookup_op },
      err_from: { value: ep.ep_self() } });
  } };

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

const little_endian = true;
const c_single = 'single';
const c_datagram = 'datagram';
const c_direct = 'direct';
const c_multipart = 'multipart';
const c_streaming = 'streaming';

const _err_msgid_required = `Response reqires 'msgid'`;
const _err_token_required = `Transport reqires 'token'`;

function frm_routing() {
  const size = 8,
        bits = 0x1,
        mask = 0x1;
  return {
    size, bits, mask,

    f_test(obj) {
      return null != obj.from_id ? bits : false;
    },

    f_pack(obj, dv, offset) {
      const { from_id } = obj;
      dv.setInt32(0 + offset, 0 | from_id.id_router, little_endian);
      dv.setInt32(4 + offset, 0 | from_id.id_target, little_endian);
    },

    f_unpack(obj, dv, offset) {
      const from_id = undefined === obj.from_id ? obj.from_id = {} : obj.from_id;
      from_id.id_router = dv.getInt32(0 + offset, little_endian);
      from_id.id_target = dv.getInt32(4 + offset, little_endian);
    } };
}

function frm_response() {
  const size = 8,
        bits = 0x2,
        mask = 0x2;
  return {
    size, bits, mask,

    f_test(obj) {
      return null != obj.msgid ? bits : false;
    },

    f_pack(obj, dv, offset) {
      if (!obj.msgid) {
        throw new Error(_err_msgid_required);
      }
      dv.setInt32(0 + offset, obj.msgid, little_endian);
      dv.setInt16(4 + offset, 0 | obj.seq_ack, little_endian);
      dv.setInt16(6 + offset, 0 | obj.ack_flags, little_endian);
    },

    f_unpack(obj, dv, offset) {
      obj.token = dv.getInt32(0 + offset, little_endian);
      obj.seq_ack = dv.getInt16(4 + offset, little_endian);
      obj.ack_flags = dv.getInt16(6 + offset, little_endian);
    } };
}

function frm_datagram() {
  const size = 0,
        bits = 0x0,
        mask = 0xc;
  return { transport: c_datagram,
    size, bits, mask,

    f_test(obj) {
      if (c_datagram === obj.transport) {
        return bits;
      }
      if (obj.transport && c_single !== obj.transport) {
        return false;
      }
      return !obj.token ? bits : false;
    },

    f_pack(obj, dv, offset) {},

    f_unpack(obj, dv, offset) {
      obj.transport = c_datagram;
    } };
}

function frm_direct() {
  const size = 4,
        bits = 0x4,
        mask = 0xc;
  return { transport: c_direct,
    size, bits, mask,

    f_test(obj) {
      if (c_direct === obj.transport) {
        return bits;
      }
      if (obj.transport && c_single !== obj.transport) {
        return false;
      }
      return !!obj.token ? bits : false;
    },

    f_pack(obj, dv, offset) {
      if (!obj.token) {
        throw new Error(_err_token_required);
      }
      dv.setInt32(0 + offset, obj.token, little_endian);
    },

    f_unpack(obj, dv, offset) {
      obj.msgid = dv.getInt32(0 + offset, little_endian);
      obj.transport = c_direct;
    } };
}

function frm_multipart() {
  const size = 8,
        bits = 0x8,
        mask = 0xc;
  return { transport: c_multipart,
    size, bits, mask,

    f_test(obj) {
      return c_multipart === obj.transport ? bits : false;
    },

    bind_seq_next, seq_pos: 4,
    f_pack(obj, dv, offset) {
      if (!obj.token) {
        throw new Error(_err_token_required);
      }
      dv.setInt32(0 + offset, obj.token, little_endian);
      if (true == obj.seq) {
        // use seq_next
        dv.setInt16(4 + offset, 0, little_endian);
      } else dv.setInt16(4 + offset, 0 | obj.seq, little_endian);
      dv.setInt16(6 + offset, 0 | obj.seq_flags, little_endian);
    },

    f_unpack(obj, dv, offset) {
      obj.msgid = dv.getInt32(0 + offset, little_endian);
      obj.seq = dv.getInt16(4 + offset, little_endian);
      obj.seq_flags = dv.getInt16(6 + offset, little_endian);
      obj.transport = c_multipart;
    } };
}

function frm_streaming() {
  const size = 8,
        bits = 0xc,
        mask = 0xc;
  return { transport: c_streaming,
    size, bits, mask,

    f_test(obj) {
      return c_streaming === obj.transport ? bits : false;
    },

    bind_seq_next, seq_pos: 4,
    f_pack(obj, dv, offset) {
      if (!obj.token) {
        throw new Error(_err_token_required);
      }
      dv.setInt32(0 + offset, obj.token, little_endian);
      if (true == obj.seq) {
        dv.setInt16(4 + offset, 0, little_endian // use seq_next
        );
      } else dv.setInt16(4 + offset, 0 | obj.seq, little_endian);
      dv.setInt16(6 + offset, 0 | obj.seq_flags, little_endian);
    },

    f_unpack(obj, dv, offset) {
      obj.msgid = dv.getInt32(0 + offset, little_endian);
      obj.seq = dv.getInt16(4 + offset, little_endian);
      obj.seq_flags = dv.getInt16(6 + offset, little_endian);
      obj.transport = c_streaming;
    } };
}

function bind_seq_next(offset) {
  const seq_offset = this.seq_pos + offset;
  let seq = 1;
  return function seq_next({ flags, fin }, dv) {
    if (!fin) {
      dv.setInt16(seq_offset, seq++, little_endian);
      dv.setInt16(2 + seq_offset, 0 | flags, little_endian);
    } else {
      dv.setInt16(seq_offset, -seq, little_endian);
      dv.setInt16(2 + seq_offset, 0 | flags, little_endian);
      seq = NaN;
    }
  };
}

var framings = composeFramings();
function composeFramings() {
  const frm_from = frm_routing(),
        frm_resp = frm_response();
  const frm_transports = [frm_datagram(), frm_direct(), frm_multipart(), frm_streaming()];

  if (8 !== frm_from.size || 8 !== frm_resp.size || 4 != frm_transports.length) {
    throw new Error(`Framing Size change`);
  }

  const byBits = [],
        mask = 0xf;

  {
    const t_from = frm_from.f_test,
          t_resp = frm_resp.f_test;
    const [t0, t1, t2, t3] = frm_transports.map(f => f.f_test);

    const testBits = byBits.testBits = obj => 0 | t_from(obj) | t_resp(obj) | t0(obj) | t1(obj) | t2(obj) | t3(obj);

    byBits.choose = function (obj, lst) {
      if (null == lst) {
        lst = this || byBits;
      }
      return lst[testBits(obj)];
    };
  }

  for (const T of frm_transports) {
    const { bits: b, size, transport } = T;

    byBits[b | 0] = { T, transport, bits: b | 0, mask, size: size, op: '' };
    byBits[b | 1] = { T, transport, bits: b | 1, mask, size: 8 + size, op: 'f' };
    byBits[b | 2] = { T, transport, bits: b | 2, mask, size: 8 + size, op: 'r' };
    byBits[b | 3] = { T, transport, bits: b | 3, mask, size: 16 + size, op: 'fr' };

    for (const fn_key of ['f_pack', 'f_unpack']) {
      const fn_tran = T[fn_key],
            fn_from = frm_from[fn_key],
            fn_resp = frm_resp[fn_key];

      byBits[b | 0][fn_key] = function (obj, dv) {
        fn_tran(obj, dv, 0);
      };
      byBits[b | 1][fn_key] = function (obj, dv) {
        fn_from(obj, dv, 0);fn_tran(obj, dv, 8);
      };
      byBits[b | 2][fn_key] = function (obj, dv) {
        fn_resp(obj, dv, 0);fn_tran(obj, dv, 8);
      };
      byBits[b | 3][fn_key] = function (obj, dv) {
        fn_from(obj, dv, 0);fn_resp(obj, dv, 8);fn_tran(obj, dv, 16);
      };
    }
  }

  for (const frm of byBits) {
    bindAssembled(frm);
  }

  return byBits;
}

function bindAssembled(frm) {
  const { T, size, f_pack, f_unpack } = frm;
  if (T.bind_seq_next) {
    frm.seq_next = T.bind_seq_next(frm.size - T.size);
  }

  delete frm.T;
  frm.pack = pack;frm.unpack = unpack;
  const seq_next = frm.seq_next;

  function pack(pkt_type, pkt_obj) {
    if (!(0 <= pkt_type && pkt_type <= 255)) {
      throw new TypeError(`Expected pkt_type to be [0..255]`);
    }

    pkt_obj.type = pkt_type;
    if (seq_next && null == pkt_obj.seq) {
      pkt_obj.seq = true;
    }

    const dv = new DataView(new ArrayBuffer(size));
    f_pack(pkt_obj, dv, 0);
    pkt_obj.header = dv.buffer;

    if (true === pkt_obj.seq) {
      _bind_iterable(pkt_obj, dv.buffer.slice(0, size));
    }
  }

  function unpack(pkt) {
    const buf = pkt.header_buffer();
    const dv = new DataView(new Uint8Array(buf).buffer);

    const info = {};
    f_unpack(info, dv, 0);
    return pkt.info = info;
  }

  function _bind_iterable(pkt_obj, buf_clone) {
    const { type } = pkt_obj;
    const { id_router, id_target, ttl, token } = pkt_obj;
    pkt_obj.next = next;

    function next(options) {
      if (null == options) {
        options = {};
      }
      const header = buf_clone.slice();
      seq_next(options, new DataView(header));
      return { done: !!options.fin, value: {// pkt_obj
        }, id_router, id_target, type, ttl, token, header };
    }
  }
}

var shared_proto = function (packetParser, options, fragment_size) {
  const { concatBuffers, packPacketObj, pack_utf8, unpack_utf8 } = packetParser;
  fragment_size = Number(fragment_size || 8000);
  if (1024 > fragment_size || 65000 < fragment_size) {
    throw new Error(`Invalid fragment size: ${fragment_size}`);
  }

  const { random_id, json_pack } = options;
  return { packetParser, random_id, json_pack,
    createMultipart, createStream, packetFragments,
    bindTransports };

  function createMultipart(pkt, sink, msgid) {
    let parts = [],
        fin = false;
    return { feed, info: pkt.info };

    function feed(pkt) {
      let seq = pkt.info.seq;
      if (seq < 0) {
        fin = true;seq = -seq;
      }
      parts[seq - 1] = pkt.body_buffer();

      if (!fin) {
        return;
      }
      if (parts.includes(undefined)) {
        return;
      }

      sink.deleteStateFor(msgid);

      const res = concatBuffers(parts);
      parts = null;
      return res;
    }
  }

  function createStream(pkt, sink, msgid) {
    let next = 0,
        fin = false,
        recvData,
        rstream;
    const state = { feed: feed_init, info: pkt.info };
    return state;

    function feed_init(pkt, as_content) {
      state.feed = feed_ignore;

      const info = pkt.info;
      const msg = sink.json_unpack(pkt.body_utf8());
      rstream = sink.recvStream(msg, info);
      if (null == rstream) {
        return;
      }
      check_fns(rstream, 'on_error', 'on_data', 'on_end');
      recvData = sink.recvStreamData.bind(sink, rstream, info);

      try {
        feed_seq(pkt);
      } catch (err) {
        return rstream.on_error(err, pkt);
      }

      state.feed = feed_body;
      if (rstream.on_init) {
        return rstream.on_init(msg, pkt);
      }
    }

    function feed_body(pkt, as_content) {
      recvData();
      let data;
      try {
        feed_seq(pkt);
        data = as_content(pkt, sink);
      } catch (err) {
        return rstream.on_error(err, pkt);
      }

      if (fin) {
        const res = rstream.on_data(data, pkt);
        return rstream.on_end(res, pkt);
      } else {
        return rstream.on_data(data, pkt);
      }
    }

    function feed_ignore(pkt) {
      try {
        feed_seq(pkt);
      } catch (err) {}
    }

    function feed_seq(pkt) {
      let seq = pkt.info.seq;
      if (seq >= 0) {
        if (next++ === seq) {
          return; // in order
        }
      } else {
          fin = true;
          sink.deleteStateFor(msgid);
          if (next === -seq) {
            next = 'done';
            return; // in-order, last packet
          }
        }state.feed = feed_ignore;
      next = 'invalid';
      throw new Error(`Packet out of sequence`);
    }
  }

  function* packetFragments(buf, next_hdr, fin) {
    if (null == buf) {
      const obj = next_hdr({ fin });
      yield obj;
      return;
    }

    let i = 0,
        lastInner = buf.byteLength - fragment_size;
    while (i < lastInner) {
      const i0 = i;
      i += fragment_size;

      const obj = next_hdr();
      obj.body = buf.slice(i0, i);
      yield obj;
    }

    {
      const obj = next_hdr({ fin });
      obj.body = buf.slice(i);
      yield obj;
    }
  }

  function bindTransportImpls(inbound, highbits, transports) {
    const outbound = [];
    outbound.choose = framings.choose;

    for (const frame of framings) {
      const impl = frame ? transports[frame.transport] : null;
      if (!impl) {
        continue;
      }

      const { bits, pack, unpack } = frame;
      const pkt_type = highbits | bits;
      const { t_recv } = impl;

      function pack_hdr(obj) {
        pack(pkt_type, obj);
        return obj;
      }

      function recv_msg(pkt, sink) {
        unpack(pkt);
        return t_recv(pkt, sink);
      }

      pack_hdr.pkt_type = recv_msg.pkt_type = pkt_type;
      outbound[bits] = pack_hdr;
      inbound[pkt_type] = recv_msg;

      
    }

    return outbound;
  }

  function bindTransports(inbound, highbits, transports) {
    const packBody = transports.packBody;
    const outbound = bindTransportImpls(inbound, highbits, transports);
    return transports.streaming ? { send, stream: bind_stream(transports.streaming.mode) } : { send };

    function send(chan, obj, body) {
      body = packBody(body);
      if (fragment_size < body.byteLength) {
        if (!obj.token) {
          obj.token = random_id();
        }
        obj.transport = 'multipart';
        const msend = msend_bytes(chan, obj);
        return msend(true, body);
      }

      obj.transport = 'single';
      obj.body = body;
      const pack_hdr = outbound.choose(obj);
      const pkt = packPacketObj(pack_hdr(obj));
      return chan(pkt);
    }

    function msend_bytes(chan, obj, msg) {
      const pack_hdr = outbound.choose(obj);
      let { next } = pack_hdr(obj);
      if (null !== msg) {
        obj.body = msg;
        const pkt = packPacketObj(obj);
        chan(pkt);
      }

      return async function (fin, body) {
        if (null === next) {
          throw new Error('Write after end');
        }
        let res;
        for (const obj of packetFragments(body, next, fin)) {
          const pkt = packPacketObj(obj);
          res = await chan(pkt);
        }
        if (fin) {
          next = null;
        }
        return res;
      };
    }

    function msend_objects(chan, obj, msg) {
      const pack_hdr = outbound.choose(obj);
      let { next } = pack_hdr(obj);
      if (null !== msg) {
        obj.body = msg;
        const pkt = packPacketObj(obj);
        chan(pkt);
      }

      return function (fin, body) {
        if (null === next) {
          throw new Error('Write after end');
        }
        const obj = next({ fin });
        obj.body = body;
        const pkt = packPacketObj(obj);
        if (fin) {
          next = null;
        }
        return chan(pkt);
      };
    }

    function bind_stream(mode) {
      const msend_impl = { object: msend_objects, bytes: msend_bytes }[mode];
      if (msend_impl) {
        return stream;
      }

      function stream(chan, obj, msg) {
        if (!obj.token) {
          obj.token = random_id();
        }
        obj.transport = 'streaming';
        const msend = msend_impl(chan, obj, json_pack(msg));
        write.write = write;write.end = write.bind(true);
        return write;

        function write(chunk) {
          return chunk != null ? msend(true === this, packBody(chunk)) : msend(true);
        }
      }
    }
  }
};

function check_fns(obj, ...keys) {
  for (const key of keys) {
    if ('function' !== typeof obj[key]) {
      throw new TypeError(`Expected "${key}" to be a function`);
    }
  }
}

function json_protocol(shared) {
  const { createMultipart, createStream, json_pack } = shared;
  const { pack_utf8, unpack_utf8 } = shared.packetParser;

  return {
    packBody,

    get datagram() {
      return this.direct;
    },
    direct: {
      t_recv(pkt, sink) {
        const msg = sink.json_unpack(pkt.body_utf8() || undefined);
        return sink.recvMsg(msg, pkt.info);
      } },

    multipart: {
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createMultipart);
        const body_buf = state.feed(pkt);
        if (undefined !== body_buf) {
          const msg = sink.json_unpack(unpack_utf8(body_buf) || undefined);
          return sink.recvMsg(msg, state.info);
        }
      } },

    streaming: {
      mode: 'object',
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createStream);
        return state.feed(pkt, unpackBody);
      } } };

  function packBody(body) {
    return pack_utf8(json_pack(body));
  }

  function unpackBody(pkt, sink) {
    return sink.json_unpack(pkt.body_utf8());
  }
}

function binary_protocol(shared) {
  const { createMultipart, createStream } = shared;
  const { pack_utf8, unpack_utf8 } = shared.packetParser;
  const { asBuffer } = shared.packetParser;
  return {
    packBody: asBuffer,

    get datagram() {
      return this.direct;
    },
    direct: {
      t_recv(pkt, sink) {
        const msg = pkt.body_buffer();
        return sink.recvMsg(msg, pkt.info);
      } },

    multipart: {
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createMultipart);
        const msg = state.feed(pkt);
        if (undefined !== msg) {
          return sink.recvMsg(msg, state.info);
        }
      } },

    streaming: {
      mode: 'bytes',
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createStream);
        const msg = state.feed(pkt, pkt_buffer);
        if (undefined !== msg) {
          return sink.recvMsg(msg, state.info);
        }
      } } };
}

function pkt_buffer(pkt) {
  return pkt.body_buffer();
}

function control_protocol(inbound, high, shared) {
  const { random_id } = shared;
  const { packPacketObj } = shared.packetParser;

  const ping_frame = framings.choose({ from_id: true, token: true, transport: 'direct' });
  const pong_frame = framings.choose({ from_id: true, msgid: true, transport: 'datagram' });

  const pong_type = high | 0xe;
  inbound[pong_type] = recv_pong;
  const ping_type = high | 0xf;
  inbound[high | 0xf] = recv_ping;

  return { send: ping, ping };

  function ping(chan, obj) {
    if (!obj.token) {
      obj.token = random_id();
    }
    obj.body = JSON.stringify({
      op: 'ping', ts0: new Date() });
    ping_frame.pack(ping_type, obj);
    const pkt = packPacketObj(obj);
    return chan(pkt);
  }

  function recv_ping(pkt, sink, router) {
    ping_frame.unpack(pkt);
    pkt.body = pkt.body_json();
    _send_pong(pkt.body, pkt, router);
    return sink.recvCtrl(pkt.body, pkt.info);
  }

  function _send_pong({ ts0 }, pkt_ping, router) {
    const { msgid, id_target, id_router, from_id: r_id } = pkt_ping.info;
    const obj = { msgid,
      from_id: { id_target, id_router },
      id_router: r_id.id_router, id_target: r_id.id_target,
      body: JSON.stringify({
        op: 'pong', ts0, ts1: new Date() }) };

    pong_frame.pack(pong_type, obj);
    const pkt = packPacketObj(obj);
    return router.dispatch([pkt]);
  }

  function recv_pong(pkt, sink) {
    pong_frame.unpack(pkt);
    pkt.body = pkt.body_json();
    return sink.recvCtrl(pkt.body, pkt.info);
  }
}

function init_protocol(packetParser, options) {
  const shared = shared_proto(packetParser, options);

  const inbound = [];
  const json = shared.bindTransports(inbound, 0x00 // 0x0* — JSON body
  , json_protocol(shared));

  const binary = shared.bindTransports(inbound, 0x10 // 0x1* — binary body
  , binary_protocol(shared));

  const control = control_protocol(inbound, 0xf0 // 0xf* — control
  , shared);

  const codecs = { json, binary, control, default: json };

  const { random_id } = shared;
  return { inbound, codecs, random_id };
}

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

const default_plugin_options = {
  plugin_name: 'endpoint',
  on_msg({ msg, reply, info }) {
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
  },

  json_pack: JSON.stringify,
  createMap() {
    return new Map(); // LRUMap, HashbeltMap
  } };var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    plugin_name, random_id, json_pack,
    on_msg: default_on_msg,
    on_error: default_on_error,
    on_shutdown: default_on_shutdown,
    createMap } = plugin_options;

  if (plugin_options.ep_kinds) {
    Object.assign(ep_proto$1, plugin_options.ep_kinds);
  }

  return { order: 1, subclass, post };

  function subclass(FabricHub_PI, bases) {
    const { packetParser } = FabricHub_PI.prototype;
    if (null == packetParser || !packetParser.isPacketParser()) {
      throw new TypeError(`Invalid packetParser for plugin`);
    }

    FabricHub_PI.prototype[plugin_name] = bindEndpointApi(packetParser);
  }

  function post(hub) {
    return hub[plugin_name] = hub[plugin_name](hub);
  }

  function bindEndpointApi(packetParser) {
    const protocols = init_protocol(packetParser, { random_id, json_pack });

    const { Endpoint: Endpoint$$1, Sink: Sink$$1, MsgCtx: MsgCtx_pi } = plugin_options.subclass({ protocols,
      Sink: Sink.forProtocols(protocols),
      MsgCtx: MsgCtx.forProtocols(protocols),
      Endpoint: Endpoint.subclass({ createMap }) });

    return function (hub) {
      const channel = hub.connect_self();
      const MsgCtx$$1 = MsgCtx_pi.forHub(hub, channel);

      Object.setPrototypeOf(endpoint, ep_proto$1);
      Object.assign(endpoint, { endpoint, create, MsgCtx: MsgCtx$$1 });
      return endpoint;

      function endpoint(on_init) {
        const targets = hub.router.targets;
        do var id_target = random_id(); while (targets.has(id_target));
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

endpoint_nodejs.random_id = random_id;
function random_id() {
  return randomBytes(4).readInt32LE();
}

function endpoint_nodejs(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id;
  }

  return endpoint_plugin(plugin_options);
}

export default endpoint_nodejs;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzLm1qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9lcF9raW5kcy9leHRlbnNpb25zLmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvY2xpZW50LmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvYXBpLmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvaW5kZXguanN5IiwiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiLCIuLi9jb2RlL2luZGV4Lm5vZGVqcy5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IGVwX3Byb3RvID0gT2JqZWN0LmNyZWF0ZSBAIE9iamVjdC5nZXRQcm90b3R5cGVPZiBAIGZ1bmN0aW9uKCl7fVxuZXhwb3J0IGZ1bmN0aW9uIGFkZF9lcF9raW5kKGtpbmRzKSA6OlxuICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIGtpbmRzXG5leHBvcnQgZGVmYXVsdCBhZGRfZXBfa2luZFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGNsaWVudEVuZHBvaW50KGFwaSkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChhcGkpXG4gICAgdGhpcy5lbmRwb2ludCBAIHRhcmdldFxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG4gIGNsaWVudCguLi5hcmdzKSA6OlxuICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICByZXR1cm4gdGhpcy5jbGllbnRFbmRwb2ludCBAIGFyZ3NbMF1cblxuICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgdGhpcy5Nc2dDdHgoKVxuICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cblxuY29uc3QgZXBfY2xpZW50X2FwaSA9IEB7fVxuICBhc3luYyBvbl9yZWFkeShlcCwgaHViKSA6OlxuICAgIHRoaXMuX3Jlc29sdmUgQCBhd2FpdCB0aGlzLm9uX2NsaWVudF9yZWFkeShlcCwgaHViKVxuICAgIGF3YWl0IGVwLnNodXRkb3duKClcbiAgb25fc2VuZF9lcnJvcihlcCwgZXJyKSA6OlxuICAgIHRoaXMuX3JlamVjdChlcnIpXG4gIG9uX3NodXRkb3duKGVwLCBlcnIpIDo6XG4gICAgZXJyID8gdGhpcy5fcmVqZWN0KGVycikgOiB0aGlzLl9yZXNvbHZlKClcblxuZXhwb3J0IGZ1bmN0aW9uIGNsaWVudEVuZHBvaW50KG9uX2NsaWVudF9yZWFkeSkgOjpcbiAgbGV0IHRhcmdldCA9IE9iamVjdC5jcmVhdGUgQCBlcF9jbGllbnRfYXBpXG4gIHRhcmdldC5vbl9jbGllbnRfcmVhZHkgPSBvbl9jbGllbnRfcmVhZHlcbiAgdGFyZ2V0LmRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgdGFyZ2V0Ll9yZXNvbHZlID0gcmVzb2x2ZVxuICAgIHRhcmdldC5fcmVqZWN0ID0gcmVqZWN0XG4gIHJldHVybiB0YXJnZXRcbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBhcGkoYXBpKSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGFwaV9lbmRwb2ludHMucGFyYWxsZWwoYXBpKVxuICBhcGlfcGFyYWxsZWwoYXBpKSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGFwaV9lbmRwb2ludHMucGFyYWxsZWwoYXBpKVxuICBhcGlfaW5vcmRlcihhcGkpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgYXBpX2VuZHBvaW50cy5pbm9yZGVyKGFwaSlcblxuXG5leHBvcnQgY29uc3QgYXBpX2VuZHBvaW50cyA9IEB7fVxuICBwYXJhbGxlbChhcGkpIDo6XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2VuZHBvaW50cy5iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZSBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cbiAgaW5vcmRlcihhcGkpIDo6XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2VuZHBvaW50cy5iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZV9nYXRlZCBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cbiAgYmluZF9ycGMoYXBpLCBlcCwgaHViKSA6OlxuICAgIGNvbnN0IHBmeCA9IGFwaS5vcF9wcmVmaXggfHwgJ3JwY18nXG4gICAgY29uc3QgbG9va3VwX29wID0gYXBpLm9wX2xvb2t1cFxuICAgICAgPyBvcCA9PiBhcGkub3BfbG9va3VwKHBmeCArIG9wLCBlcCwgaHViKVxuICAgICAgOiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXBpXG4gICAgICA/IG9wID0+IGFwaShwZnggKyBvcCwgZXAsIGh1YilcbiAgICAgIDogb3AgPT4gOjpcbiAgICAgICAgICBjb25zdCBmbiA9IGFwaVtwZnggKyBvcF1cbiAgICAgICAgICByZXR1cm4gZm4gPyBmbi5iaW5kKGFwaSkgOiBmblxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCBycGNfYXBpLCBAe31cbiAgICAgIGxvb2t1cF9vcDogQHt9IHZhbHVlOiBsb29rdXBfb3BcbiAgICAgIGVycl9mcm9tOiBAe30gdmFsdWU6IGVwLmVwX3NlbGYoKVxuXG5cbmNvbnN0IHJwY19hcGkgPSBAOlxuICBhc3luYyBpbnZva2Uoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgaW52b2tlX2dhdGVkKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IFByb21pc2UucmVzb2x2ZSh0aGlzLmdhdGUpXG4gICAgICAudGhlbiBAICgpID0+IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgdGhpcy5nYXRlID0gcmVzLnRoZW4obm9vcCwgbm9vcClcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgcmVzb2x2ZV9vcChzZW5kZXIsIG9wKSA6OlxuICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Ygb3AgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdJbnZhbGlkIG9wZXJhdGlvbicsIGNvZGU6IDQwMFxuICAgICAgcmV0dXJuXG5cbiAgICB0cnkgOjpcbiAgICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMubG9va3VwX29wKG9wKVxuICAgICAgaWYgISBhcGlfZm4gOjpcbiAgICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnVW5rbm93biBvcGVyYXRpb24nLCBjb2RlOiA0MDRcbiAgICAgIHJldHVybiBhcGlfZm5cbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6IGBJbnZhbGlkIG9wZXJhdGlvbjogJHtlcnIubWVzc2FnZX1gLCBjb2RlOiA1MDBcblxuICBhc3luYyBhbnN3ZXIoc2VuZGVyLCBhcGlfZm4sIGNiKSA6OlxuICAgIHRyeSA6OlxuICAgICAgdmFyIGFuc3dlciA9IGNiID8gYXdhaXQgY2IoYXBpX2ZuKSA6IGF3YWl0IGFwaV9mbigpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbSwgZXJyb3I6IGVyclxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiBzZW5kZXIucmVwbHlFeHBlY3RlZCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogYW5zd2VyXG4gICAgcmV0dXJuIHRydWVcblxuXG5mdW5jdGlvbiBub29wKCkge31cblxuIiwiaW1wb3J0IHthZGRfZXBfa2luZCwgZXBfcHJvdG99IGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIHNlcnZlcihvbl9pbml0KSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIG9uX2luaXRcblxuZXhwb3J0ICogZnJvbSAnLi9jbGllbnQuanN5J1xuZXhwb3J0ICogZnJvbSAnLi9hcGkuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBlcF9wcm90b1xuIiwiY29uc3QgbGl0dGxlX2VuZGlhbiA9IHRydWVcbmNvbnN0IGNfc2luZ2xlID0gJ3NpbmdsZSdcbmNvbnN0IGNfZGF0YWdyYW0gPSAnZGF0YWdyYW0nXG5jb25zdCBjX2RpcmVjdCA9ICdkaXJlY3QnXG5jb25zdCBjX211bHRpcGFydCA9ICdtdWx0aXBhcnQnXG5jb25zdCBjX3N0cmVhbWluZyA9ICdzdHJlYW1pbmcnXG5cbmNvbnN0IF9lcnJfbXNnaWRfcmVxdWlyZWQgPSBgUmVzcG9uc2UgcmVxaXJlcyAnbXNnaWQnYFxuY29uc3QgX2Vycl90b2tlbl9yZXF1aXJlZCA9IGBUcmFuc3BvcnQgcmVxaXJlcyAndG9rZW4nYFxuXG5cbmZ1bmN0aW9uIGZybV9yb3V0aW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDEsIG1hc2sgPSAweDFcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5mcm9tX2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3Qge2Zyb21faWR9ID0gb2JqXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCAwfGZyb21faWQuaWRfcm91dGVyLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQzMiBAIDQrb2Zmc2V0LCAwfGZyb21faWQuaWRfdGFyZ2V0LCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCBmcm9tX2lkID0gdW5kZWZpbmVkID09PSBvYmouZnJvbV9pZFxuICAgICAgICA/IG9iai5mcm9tX2lkID0ge30gOiBvYmouZnJvbV9pZFxuICAgICAgZnJvbV9pZC5pZF9yb3V0ZXIgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBmcm9tX2lkLmlkX3RhcmdldCA9IGR2LmdldEludDMyIEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuZnVuY3Rpb24gZnJtX3Jlc3BvbnNlKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDIsIG1hc2sgPSAweDJcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5tc2dpZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLm1zZ2lkIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfbXNnaWRfcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai5tc2dpZCwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxX2FjaywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouYWNrX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudG9rZW4gPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2FjayA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5hY2tfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cblxuXG5mdW5jdGlvbiBmcm1fZGF0YWdyYW0oKSA6OlxuICBjb25zdCBzaXplID0gMCwgYml0cyA9IDB4MCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kYXRhZ3JhbVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RhdGFncmFtID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGF0YWdyYW1cblxuZnVuY3Rpb24gZnJtX2RpcmVjdCgpIDo6XG4gIGNvbnN0IHNpemUgPSA0LCBiaXRzID0gMHg0LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RpcmVjdFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RpcmVjdCA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RpcmVjdFxuXG5mdW5jdGlvbiBmcm1fbXVsdGlwYXJ0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDgsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfbXVsdGlwYXJ0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfbXVsdGlwYXJ0ID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6IC8vIHVzZSBzZXFfbmV4dFxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuXG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19tdWx0aXBhcnRcblxuZnVuY3Rpb24gZnJtX3N0cmVhbWluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHhjLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX3N0cmVhbWluZ1xuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX3N0cmVhbWluZyA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OlxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuIC8vIHVzZSBzZXFfbmV4dFxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfc3RyZWFtaW5nXG5cblxuZnVuY3Rpb24gYmluZF9zZXFfbmV4dChvZmZzZXQpIDo6XG4gIGNvbnN0IHNlcV9vZmZzZXQgPSB0aGlzLnNlcV9wb3MgKyBvZmZzZXRcbiAgbGV0IHNlcSA9IDFcbiAgcmV0dXJuIGZ1bmN0aW9uIHNlcV9uZXh0KHtmbGFncywgZmlufSwgZHYpIDo6XG4gICAgaWYgISBmaW4gOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgc2VxKyssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgZWxzZSA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCAtc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgICAgc2VxID0gTmFOXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlRnJhbWluZ3MoKVxuZnVuY3Rpb24gY29tcG9zZUZyYW1pbmdzKCkgOjpcbiAgY29uc3QgZnJtX2Zyb20gPSBmcm1fcm91dGluZygpLCBmcm1fcmVzcCA9IGZybV9yZXNwb25zZSgpXG4gIGNvbnN0IGZybV90cmFuc3BvcnRzID0gQFtdIGZybV9kYXRhZ3JhbSgpLCBmcm1fZGlyZWN0KCksIGZybV9tdWx0aXBhcnQoKSwgZnJtX3N0cmVhbWluZygpXG5cbiAgaWYgOCAhPT0gZnJtX2Zyb20uc2l6ZSB8fCA4ICE9PSBmcm1fcmVzcC5zaXplIHx8IDQgIT0gZnJtX3RyYW5zcG9ydHMubGVuZ3RoIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEZyYW1pbmcgU2l6ZSBjaGFuZ2VgXG5cbiAgY29uc3QgYnlCaXRzID0gW10sIG1hc2s9MHhmXG5cbiAgOjpcbiAgICBjb25zdCB0X2Zyb20gPSBmcm1fZnJvbS5mX3Rlc3QsIHRfcmVzcCA9IGZybV9yZXNwLmZfdGVzdFxuICAgIGNvbnN0IFt0MCx0MSx0Mix0M10gPSBmcm1fdHJhbnNwb3J0cy5tYXAgQCBmPT5mLmZfdGVzdFxuXG4gICAgY29uc3QgdGVzdEJpdHMgPSBieUJpdHMudGVzdEJpdHMgPSBvYmogPT5cbiAgICAgIDAgfCB0X2Zyb20ob2JqKSB8IHRfcmVzcChvYmopIHwgdDAob2JqKSB8IHQxKG9iaikgfCB0MihvYmopIHwgdDMob2JqKVxuXG4gICAgYnlCaXRzLmNob29zZSA9IGZ1bmN0aW9uIChvYmosIGxzdCkgOjpcbiAgICAgIGlmIG51bGwgPT0gbHN0IDo6IGxzdCA9IHRoaXMgfHwgYnlCaXRzXG4gICAgICByZXR1cm4gbHN0W3Rlc3RCaXRzKG9iaildXG5cblxuICBmb3IgY29uc3QgVCBvZiBmcm1fdHJhbnNwb3J0cyA6OlxuICAgIGNvbnN0IHtiaXRzOmIsIHNpemUsIHRyYW5zcG9ydH0gPSBUXG5cbiAgICBieUJpdHNbYnwwXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MCwgbWFzaywgc2l6ZTogc2l6ZSwgb3A6ICcnXG4gICAgYnlCaXRzW2J8MV0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDEsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ2YnXG4gICAgYnlCaXRzW2J8Ml0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDIsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ3InXG4gICAgYnlCaXRzW2J8M10gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDMsIG1hc2ssIHNpemU6IDE2ICsgc2l6ZSwgb3A6ICdmcidcblxuICAgIGZvciBjb25zdCBmbl9rZXkgb2YgWydmX3BhY2snLCAnZl91bnBhY2snXSA6OlxuICAgICAgY29uc3QgZm5fdHJhbiA9IFRbZm5fa2V5XSwgZm5fZnJvbSA9IGZybV9mcm9tW2ZuX2tleV0sIGZuX3Jlc3AgPSBmcm1fcmVzcFtmbl9rZXldXG5cbiAgICAgIGJ5Qml0c1tifDBdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl90cmFuKG9iaiwgZHYsIDApXG4gICAgICBieUJpdHNbYnwxXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8Ml1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3Jlc3Aob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDNdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl9yZXNwKG9iaiwgZHYsIDgpOyBmbl90cmFuKG9iaiwgZHYsIDE2KVxuXG4gIGZvciBjb25zdCBmcm0gb2YgYnlCaXRzIDo6XG4gICAgYmluZEFzc2VtYmxlZCBAIGZybVxuXG4gIHJldHVybiBieUJpdHNcblxuXG5mdW5jdGlvbiBiaW5kQXNzZW1ibGVkKGZybSkgOjpcbiAgY29uc3Qge1QsIHNpemUsIGZfcGFjaywgZl91bnBhY2t9ID0gZnJtXG4gIGlmIFQuYmluZF9zZXFfbmV4dCA6OlxuICAgIGZybS5zZXFfbmV4dCA9IFQuYmluZF9zZXFfbmV4dCBAIGZybS5zaXplIC0gVC5zaXplXG5cbiAgZGVsZXRlIGZybS5UXG4gIGZybS5wYWNrID0gcGFjayA7IGZybS51bnBhY2sgPSB1bnBhY2tcbiAgY29uc3Qgc2VxX25leHQgPSBmcm0uc2VxX25leHRcblxuICBmdW5jdGlvbiBwYWNrKHBrdF90eXBlLCBwa3Rfb2JqKSA6OlxuICAgIGlmICEgQCAwIDw9IHBrdF90eXBlICYmIHBrdF90eXBlIDw9IDI1NSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwa3RfdHlwZSB0byBiZSBbMC4uMjU1XWBcblxuICAgIHBrdF9vYmoudHlwZSA9IHBrdF90eXBlXG4gICAgaWYgc2VxX25leHQgJiYgbnVsbCA9PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgcGt0X29iai5zZXEgPSB0cnVlXG5cbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBBcnJheUJ1ZmZlcihzaXplKVxuICAgIGZfcGFjayhwa3Rfb2JqLCBkdiwgMClcbiAgICBwa3Rfb2JqLmhlYWRlciA9IGR2LmJ1ZmZlclxuXG4gICAgaWYgdHJ1ZSA9PT0gcGt0X29iai5zZXEgOjpcbiAgICAgIF9iaW5kX2l0ZXJhYmxlIEAgcGt0X29iaiwgZHYuYnVmZmVyLnNsaWNlKDAsc2l6ZSlcblxuICBmdW5jdGlvbiB1bnBhY2socGt0KSA6OlxuICAgIGNvbnN0IGJ1ZiA9IHBrdC5oZWFkZXJfYnVmZmVyKClcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBVaW50OEFycmF5KGJ1ZikuYnVmZmVyXG5cbiAgICBjb25zdCBpbmZvID0ge31cbiAgICBmX3VucGFjayhpbmZvLCBkdiwgMClcbiAgICByZXR1cm4gcGt0LmluZm8gPSBpbmZvXG5cbiAgZnVuY3Rpb24gX2JpbmRfaXRlcmFibGUocGt0X29iaiwgYnVmX2Nsb25lKSA6OlxuICAgIGNvbnN0IHt0eXBlfSA9IHBrdF9vYmpcbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXQsIHR0bCwgdG9rZW59ID0gcGt0X29ialxuICAgIHBrdF9vYmoubmV4dCA9IG5leHRcblxuICAgIGZ1bmN0aW9uIG5leHQob3B0aW9ucykgOjpcbiAgICAgIGlmIG51bGwgPT0gb3B0aW9ucyA6OiBvcHRpb25zID0ge31cbiAgICAgIGNvbnN0IGhlYWRlciA9IGJ1Zl9jbG9uZS5zbGljZSgpXG4gICAgICBzZXFfbmV4dCBAIG9wdGlvbnMsIG5ldyBEYXRhVmlldyBAIGhlYWRlclxuICAgICAgcmV0dXJuIEB7fSBkb25lOiAhISBvcHRpb25zLmZpbiwgdmFsdWU6IEB7fSAvLyBwa3Rfb2JqXG4gICAgICAgIGlkX3JvdXRlciwgaWRfdGFyZ2V0LCB0eXBlLCB0dGwsIHRva2VuLCBoZWFkZXJcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBhY2tldFBhcnNlciwgb3B0aW9ucywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIGNvbnN0IHtyYW5kb21faWQsIGpzb25fcGFja30gPSBvcHRpb25zXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgY3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIHBhY2tldEZyYWdtZW50c1xuICAgIGJpbmRUcmFuc3BvcnRzXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgcGFydHMgPSBbXSwgZmluID0gZmFsc2VcbiAgICByZXR1cm4gQHt9IGZlZWQsIGluZm86IHBrdC5pbmZvXG5cbiAgICBmdW5jdGlvbiBmZWVkKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgcGFydHNbc2VxLTFdID0gcGt0LmJvZHlfYnVmZmVyKClcblxuICAgICAgaWYgISBmaW4gOjogcmV0dXJuXG4gICAgICBpZiBwYXJ0cy5pbmNsdWRlcyBAIHVuZGVmaW5lZCA6OiByZXR1cm5cblxuICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcblxuICAgICAgY29uc3QgcmVzID0gY29uY2F0QnVmZmVycyhwYXJ0cylcbiAgICAgIHBhcnRzID0gbnVsbFxuICAgICAgcmV0dXJuIHJlc1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbShwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByZWN2RGF0YSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgaW5mbyA9IHBrdC5pbmZvXG4gICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgaW5mbylcbiAgICAgIGlmIG51bGwgPT0gcnN0cmVhbSA6OiByZXR1cm5cbiAgICAgIGNoZWNrX2ZucyBAIHJzdHJlYW0sICdvbl9lcnJvcicsICdvbl9kYXRhJywgJ29uX2VuZCcgXG4gICAgICByZWN2RGF0YSA9IHNpbmsucmVjdlN0cmVhbURhdGEuYmluZChzaW5rLCByc3RyZWFtLCBpbmZvKVxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfYm9keVxuICAgICAgaWYgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG5cbiAgICBmdW5jdGlvbiBmZWVkX2JvZHkocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgcmVjdkRhdGEoKVxuICAgICAgbGV0IGRhdGFcbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICAgIGRhdGEgPSBhc19jb250ZW50KHBrdCwgc2luaylcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIGlmIGZpbiA6OlxuICAgICAgICBjb25zdCByZXMgPSByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZW5kIEAgcmVzLCBwa3RcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pZ25vcmUocGt0KSA6OlxuICAgICAgdHJ5IDo6IGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuXG4gICAgZnVuY3Rpb24gZmVlZF9zZXEocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxID49IDAgOjpcbiAgICAgICAgaWYgbmV4dCsrID09PSBzZXEgOjpcbiAgICAgICAgICByZXR1cm4gLy8gaW4gb3JkZXJcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgZmluID0gdHJ1ZVxuICAgICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuICAgICAgICBpZiBuZXh0ID09PSAtc2VxIDo6XG4gICAgICAgICAgbmV4dCA9ICdkb25lJ1xuICAgICAgICAgIHJldHVybiAvLyBpbi1vcmRlciwgbGFzdCBwYWNrZXRcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG4gICAgICBuZXh0ID0gJ2ludmFsaWQnXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFja2V0IG91dCBvZiBzZXF1ZW5jZWBcblxuICBmdW5jdGlvbiAqIHBhY2tldEZyYWdtZW50cyhidWYsIG5leHRfaGRyLCBmaW4pIDo6XG4gICAgaWYgbnVsbCA9PSBidWYgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgeWllbGQgb2JqXG4gICAgICByZXR1cm5cblxuICAgIGxldCBpID0gMCwgbGFzdElubmVyID0gYnVmLmJ5dGVMZW5ndGggLSBmcmFnbWVudF9zaXplO1xuICAgIHdoaWxlIGkgPCBsYXN0SW5uZXIgOjpcbiAgICAgIGNvbnN0IGkwID0gaVxuICAgICAgaSArPSBmcmFnbWVudF9zaXplXG5cbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKClcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkwLCBpKVxuICAgICAgeWllbGQgb2JqXG5cbiAgICA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpKVxuICAgICAgeWllbGQgb2JqXG5cblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBvdXRib3VuZCA9IFtdXG4gICAgb3V0Ym91bmQuY2hvb3NlID0gZnJhbWluZ3MuY2hvb3NlXG5cbiAgICBmb3IgY29uc3QgZnJhbWUgb2YgZnJhbWluZ3MgOjpcbiAgICAgIGNvbnN0IGltcGwgPSBmcmFtZSA/IHRyYW5zcG9ydHNbZnJhbWUudHJhbnNwb3J0XSA6IG51bGxcbiAgICAgIGlmICEgaW1wbCA6OiBjb250aW51ZVxuXG4gICAgICBjb25zdCB7Yml0cywgcGFjaywgdW5wYWNrfSA9IGZyYW1lXG4gICAgICBjb25zdCBwa3RfdHlwZSA9IGhpZ2hiaXRzIHwgYml0c1xuICAgICAgY29uc3Qge3RfcmVjdn0gPSBpbXBsXG5cbiAgICAgIGZ1bmN0aW9uIHBhY2tfaGRyKG9iaikgOjpcbiAgICAgICAgcGFjayhwa3RfdHlwZSwgb2JqKVxuICAgICAgICByZXR1cm4gb2JqXG5cbiAgICAgIGZ1bmN0aW9uIHJlY3ZfbXNnKHBrdCwgc2luaykgOjpcbiAgICAgICAgdW5wYWNrKHBrdClcbiAgICAgICAgcmV0dXJuIHRfcmVjdihwa3QsIHNpbmspXG5cbiAgICAgIHBhY2tfaGRyLnBrdF90eXBlID0gcmVjdl9tc2cucGt0X3R5cGUgPSBwa3RfdHlwZVxuICAgICAgb3V0Ym91bmRbYml0c10gPSBwYWNrX2hkclxuICAgICAgaW5ib3VuZFtwa3RfdHlwZV0gPSByZWN2X21zZ1xuXG4gICAgICBpZiAncHJvZHVjdGlvbicgIT09IHByb2Nlc3MuZW52Lk5PREVfRU5WIDo6XG4gICAgICAgIGNvbnN0IG9wID0gcGFja19oZHIub3AgPSByZWN2X21zZy5vcCA9IGZyYW1lLm9wXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHBhY2tfaGRyLCAnbmFtZScsIEB7fSB2YWx1ZTogYHBhY2tfaGRyIMKrJHtvcH3Cu2BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcmVjdl9tc2csICduYW1lJywgQHt9IHZhbHVlOiBgcmVjdl9tc2cgwqske29wfcK7YFxuXG4gICAgcmV0dXJuIG91dGJvdW5kXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0cyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBwYWNrQm9keSA9IHRyYW5zcG9ydHMucGFja0JvZHlcbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICByZXR1cm4gdHJhbnNwb3J0cy5zdHJlYW1pbmdcbiAgICAgID8gQHt9IHNlbmQsIHN0cmVhbTogYmluZF9zdHJlYW0gQCB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICA6IEB7fSBzZW5kXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ211bHRpcGFydCdcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcyhjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gbXNlbmRfYnl0ZXMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gYXN5bmMgZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGxldCByZXNcbiAgICAgICAgZm9yIGNvbnN0IG9iaiBvZiBwYWNrZXRGcmFnbWVudHMgQCBib2R5LCBuZXh0LCBmaW4gOjpcbiAgICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgICAgcmVzID0gYXdhaXQgY2hhbiBAIHBrdFxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIHJlc1xuXG4gICAgZnVuY3Rpb24gbXNlbmRfb2JqZWN0cyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgY29uc3Qgb2JqID0gbmV4dCh7ZmlufSlcbiAgICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBiaW5kX3N0cmVhbShtb2RlKSA6OlxuICAgICAgY29uc3QgbXNlbmRfaW1wbCA9IHtvYmplY3Q6IG1zZW5kX29iamVjdHMsIGJ5dGVzOiBtc2VuZF9ieXRlc31bbW9kZV1cbiAgICAgIGlmIG1zZW5kX2ltcGwgOjogcmV0dXJuIHN0cmVhbVxuXG4gICAgICBmdW5jdGlvbiBzdHJlYW0oY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnc3RyZWFtaW5nJ1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2ltcGwgQCBjaGFuLCBvYmosIGpzb25fcGFjayhtc2cpXG4gICAgICAgIHdyaXRlLndyaXRlID0gd3JpdGU7IHdyaXRlLmVuZCA9IHdyaXRlLmJpbmQodHJ1ZSlcbiAgICAgICAgcmV0dXJuIHdyaXRlXG5cbiAgICAgICAgZnVuY3Rpb24gd3JpdGUoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCB0cnVlPT09dGhpcywgcGFja0JvZHkoY2h1bmspXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuXG5cbmZ1bmN0aW9uIGNoZWNrX2ZucyhvYmosIC4uLmtleXMpIDo6XG4gIGZvciBjb25zdCBrZXkgb2Yga2V5cyA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvYmpba2V5XSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBcIiR7a2V5fVwiIHRvIGJlIGEgZnVuY3Rpb25gXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBqc29uX3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBqc29uX3BhY2t9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHlcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpIHx8IHVuZGVmaW5lZFxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IGJvZHlfYnVmID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gYm9keV9idWYgOjpcbiAgICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgdW5wYWNrX3V0ZjgoYm9keV9idWYpIHx8IHVuZGVmaW5lZFxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnb2JqZWN0J1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgcmV0dXJuIHN0YXRlLmZlZWQocGt0LCB1bnBhY2tCb2R5KVxuXG4gIGZ1bmN0aW9uIHBhY2tCb2R5KGJvZHkpIDo6XG4gICAgcmV0dXJuIHBhY2tfdXRmOCBAIGpzb25fcGFjayhib2R5KVxuXG4gIGZ1bmN0aW9uIHVucGFja0JvZHkocGt0LCBzaW5rKSA6OlxuICAgIHJldHVybiBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCBvYmogPSBAe30gbXNnaWRcbiAgICAgIGZyb21faWQ6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgaWRfcm91dGVyOiByX2lkLmlkX3JvdXRlciwgaWRfdGFyZ2V0OiByX2lkLmlkX3RhcmdldFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICByZWdpc3RlcihlbmRwb2ludCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzKSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCB1bnJlZ2lzdGVyLCBoYW5kbGVyc1xuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgdW5yZWdpc3Rlciwge29uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3dufSkgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVyciwgZXh0cmEpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIG9uX3NodXRkb3duKGVyciwgZXh0cmEpXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3QsIHpvbmU6ICdwa3QudHlwZSdcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGVyciwgQHt9IHBrdCwgem9uZTogJ3Byb3RvY29sJ1xuXG4gICAgICBpZiBmYWxzZSA9PT0gYWxpdmUgOjpcbiAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHRyeSA6OlxuICAgICAgICAgIHZhciB0ZXJtaW5hdGUgPSBvbl9lcnJvciBAIGVyciwgQHt9IG1zZywgcGt0LCB6b25lOiAnZGlzcGF0Y2gnXG4gICAgICAgIGZpbmFsbHkgOjpcbiAgICAgICAgICBpZiBmYWxzZSAhPT0gdGVybWluYXRlIDo6XG4gICAgICAgICAgICBzaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG4gICAgICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICBzdGF0ZUZvcihwa3QsIGlmQWJzZW50KSA6OlxuICAgIGNvbnN0IG1zZ2lkID0gcGt0LmluZm8ubXNnaWRcbiAgICBsZXQgZW50cnkgPSB0aGlzLmJ5X21zZ2lkLmdldChtc2dpZClcbiAgICBpZiB1bmRlZmluZWQgPT09IGVudHJ5IDo6XG4gICAgICBpZiAhIG1zZ2lkIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIG1zZ2lkOiAke21zZ2lkfWBcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZkFic2VudCA6OlxuICAgICAgICBlbnRyeSA9IGlmQWJzZW50KHBrdCwgdGhpcywgbXNnaWQpXG4gICAgICBlbHNlIGVudHJ5ID0gaWZBYnNlbnRcbiAgICAgIHRoaXMuYnlfbXNnaWQuc2V0IEAgbXNnaWQsIGVudHJ5XG4gICAgcmV0dXJuIGVudHJ5XG5cbiAgZGVsZXRlU3RhdGVGb3IobXNnaWQpIDo6XG4gICAgcmV0dXJuIHRoaXMuYnlfbXNnaWQuZGVsZXRlKG1zZ2lkKVxuXG4gIGpzb25fdW5wYWNrKG9iaikgOjogdGhyb3cgbmV3IEVycm9yIEAgYEVuZHBvaW50IGJpbmRTaW5rKCkgcmVzcG9uc2liaWxpdHlgXG5cbiIsImV4cG9ydCBkZWZhdWx0IEVQVGFyZ2V0XG5leHBvcnQgY2xhc3MgRVBUYXJnZXQgOjpcbiAgY29uc3RydWN0b3IoaWQpIDo6IHRoaXMuaWQgPSBpZFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRVBUYXJnZXQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiBlcF9lbmNvZGUodGhpcy5pZCwgZmFsc2UpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG4gIGlzRVBUYXJnZXQoKSA6OiByZXR1cm4gdHJ1ZVxuXG4gIGdldCBpZF9yb3V0ZXIoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF9yb3V0ZXJcbiAgZ2V0IGlkX3RhcmdldCgpIDo6IHJldHVybiB0aGlzLmlkLmlkX3RhcmdldFxuXG4gIHN0YXRpYyBhc19qc29uX3VucGFjayhtc2dfY3R4X3RvLCB4Zm9ybUJ5S2V5KSA6OlxuICAgIHhmb3JtQnlLZXkgPSBPYmplY3QuY3JlYXRlKHhmb3JtQnlLZXkgfHwgbnVsbClcbiAgICB4Zm9ybUJ5S2V5W3Rva2VuXSA9IHYgPT4gdGhpcy5mcm9tX2N0eCBAIGVwX2RlY29kZSh2KSwgbXNnX2N0eF90b1xuICAgIHJldHVybiB0aGlzLmpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpXG5cbiAgc3RhdGljIGZyb21fY3R4KGlkLCBtc2dfY3R4X3RvLCBtc2dpZCkgOjpcbiAgICBpZiAhIGlkIDo6IHJldHVyblxuICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZC5hc0VuZHBvaW50SWQgOjpcbiAgICAgIGlkID0gaWQuYXNFbmRwb2ludElkKClcblxuICAgIGNvbnN0IGVwX3RndCA9IG5ldyB0aGlzKGlkKVxuICAgIGxldCBmYXN0LCBpbml0ID0gKCkgPT4gZmFzdCA9IG1zZ19jdHhfdG8oZXBfdGd0LCB7bXNnaWR9KS5mYXN0X2pzb25cbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgc2VuZDogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnNlbmRcbiAgICAgIHF1ZXJ5OiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkucXVlcnlcbiAgICAgIHJlcGx5RXhwZWN0ZWQ6IEB7fSB2YWx1ZTogISEgbXNnaWRcblxuXG5jb25zdCB0b2tlbiA9ICdcXHUwM0UwJyAvLyAnz6AnXG5FUFRhcmdldC50b2tlbiA9IHRva2VuXG5cbkVQVGFyZ2V0LmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShpZCwgc2ltcGxlKSA6OlxuICBsZXQge2lkX3JvdXRlcjpyLCBpZF90YXJnZXQ6dH0gPSBpZFxuICByID0gKHI+Pj4wKS50b1N0cmluZygzNilcbiAgdCA9ICh0Pj4+MCkudG9TdHJpbmcoMzYpXG4gIGlmIHNpbXBsZSA6OlxuICAgIHJldHVybiBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuXG4gIGNvbnN0IHJlcyA9IEB7fSBbdG9rZW5dOiBgJHtyfX4ke3R9YFxuICBPYmplY3QuYXNzaWduIEAgcmVzLCBpZFxuICBkZWxldGUgcmVzLmlkX3JvdXRlcjsgZGVsZXRlIHJlcy5pZF90YXJnZXRcbiAgcmV0dXJuIHJlc1xuXG5cbkVQVGFyZ2V0LmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBpZCA9ICdzdHJpbmcnID09PSB0eXBlb2YgdlxuICAgID8gdi5zcGxpdCh0b2tlbilbMV1cbiAgICA6IHZbdG9rZW5dXG4gIGlmICEgaWQgOjogcmV0dXJuXG5cbiAgbGV0IFtyLHRdID0gaWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG5cbkVQVGFyZ2V0Lmpzb25fdW5wYWNrX3hmb3JtID0ganNvbl91bnBhY2tfeGZvcm1cbmV4cG9ydCBmdW5jdGlvbiBqc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KSA6OlxuICByZXR1cm4gc3ogPT4gSlNPTi5wYXJzZSBAIHN6LCByZXZpdmVyKClcblxuICBmdW5jdGlvbiByZXZpdmVyKCkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWUpIDo6XG4gICAgICBjb25zdCB4Zm4gPSB4Zm9ybUJ5S2V5W2tleV1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0geGZuIDo6XG4gICAgICAgIHJlZy5zZXQodGhpcywgeGZuKVxuICAgICAgICByZXR1cm4gdmFsdWVcblxuICAgICAgaWYgJ29iamVjdCcgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICBjb25zdCB2Zm4gPSByZWcuZ2V0KHZhbHVlKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHZmbiA6OlxuICAgICAgICAgIHJldHVybiB2Zm4gQCB2YWx1ZVxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiIsImltcG9ydCB7ZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgc3RhdGljIGZvckh1YihodWIsIGNoYW5uZWwpIDo6XG4gICAgY29uc3Qge3NlbmRSYXd9ID0gY2hhbm5lbFxuXG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUuY2hhbl9zZW5kID0gYXN5bmMgcGt0ID0+IDo6XG4gICAgICBhd2FpdCBzZW5kUmF3KHBrdClcbiAgICAgIHJldHVybiB0cnVlXG5cbiAgICByZXR1cm4gTXNnQ3R4XG5cblxuICBjb25zdHJ1Y3RvcihpZCkgOjpcbiAgICBpZiBudWxsICE9IGlkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gaWRcbiAgICAgIGNvbnN0IGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICB0aGlzLmN0eCA9IEB7fSBmcm9tX2lkXG5cblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlbilcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MpXG4gIHNlbmRRdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjLnN0cmVhbSwgYXJnc1xuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWNba2V5XSwgYXJnc1xuICBiaW5kSW52b2tlKGZuT3JLZXksIHRva2VuKSA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBmbk9yS2V5IDo6IGZuT3JLZXkgPSB0aGlzLl9jb2RlY1xuICAgIHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGZuT3JLZXksIGFyZ3MsIHRva2VuKVxuXG4gIF9pbnZva2VfZXgoaW52b2tlLCBhcmdzLCB0b2tlbikgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgaWYgbnVsbCA9PSB0b2tlbiA6OiB0b2tlbiA9IG9iai50b2tlblxuICAgIGVsc2Ugb2JqLnRva2VuID0gdG9rZW5cbiAgICBpZiB0cnVlID09PSB0b2tlbiA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuXG4gICAgY29uc3QgcmVzID0gaW52b2tlIEAgdGhpcy5jaGFuX3NlbmQsIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIHRndCA9IGVwX2RlY29kZSh0Z3QpIHx8IHRndFxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiAwID09PSBhcmdzLmxlbmd0aCA/IHNlbGYgOiBzZWxmLndpdGggQCAuLi5hcmdzXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgdHJ1ZSA9PT0gdGd0IHx8IGZhbHNlID09PSB0Z3QgOjpcbiAgICAgICAgY3R4LnRva2VuID0gdGd0XG4gICAgICBlbHNlIGlmIG51bGwgIT0gdGd0IDo6XG4gICAgICAgIGNvbnN0IHt0b2tlbiwgbXNnaWR9ID0gdGd0XG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG5cbiAgICAvLyBiaW5kIHNlbmRfanNvbiBhcyBmcmVxdWVudGx5IHVzZWQgZmFzdC1wYXRoXG4gICAgY29uc3QganNvbl9zZW5kID0gbXNnQ29kZWNzLmpzb24uc2VuZFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcy5wcm90b3R5cGUsIEA6XG4gICAgICBmYXN0X2pzb246IEB7fSBnZXQoKSA6OiByZXR1cm4gQDpcbiAgICAgICAgc2VuZDogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MpXG4gICAgICAgIHNlbmRRdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICAgIHJldHVybiB0aGlzXG5cblxuICB3aXRoUmVqZWN0VGltZW91dChwX3JlcGx5KSA6OlxuICAgIHJldHVybiBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBwX3JlcGx5LnRoZW4gQCByZXNvbHZlLCByZWplY3RcbiAgICAgIHBfcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4gcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG4gICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMubXNfdGltZW91dClcbiAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCBAIHRpZFxuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0LCBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCB7RVBUYXJnZXQsIGVwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfc2VsZigpLnRvSlNPTigpXG4gIGVwX3NlbGYoKSA6OiByZXR1cm4gbmV3IHRoaXMuRVBUYXJnZXQodGhpcy5pZClcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcblxuICBjb25zdHJ1Y3RvcihpZCwgbXNnX2N0eCkgOjpcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgaWQ6IEB7fSB2YWx1ZTogaWRcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgud2l0aEVuZHBvaW50KHRoaXMpLnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJvdXRlQ2FjaGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBieV90b2tlbjogQHt9IHZhbHVlOiBieV90b2tlblxuICAgICAgYnlfdHJhZmZpYzogQHt9IHZhbHVlOiBieV90cmFmZmljXG5cbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG4gICAgICBqc29uX3VucGFjazogdGhpcy5FUFRhcmdldC5hc19qc29uX3VucGFjayh0aGlzLnRvKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cgfHwge21zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIGFzX3RhcmdldChpZCkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvXG4gIGFzX3NlbmRlcih7ZnJvbV9pZDppZCwgbXNnaWR9KSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG8sIG1zZ2lkXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICByZWN2TXNnKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCBzZW5kZXI6IHRoaXMuYXNfc2VuZGVyKGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHRoaXMucGFydHMuam9pbignJyk7IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgcF9zZW50LCBtc2dfY3R4XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLmJ5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICBsZXQgcmVwbHkgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLmJ5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBwX3NlbnQuY2F0Y2ggQCByZWplY3RcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIHJlcGx5ID0gbXNnX2N0eC53aXRoUmVqZWN0VGltZW91dChyZXBseSlcblxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gdGhpcy5ieV90b2tlbi5kZWxldGUgQCB0b2tlblxuICAgIHJlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcbiAgICByZXR1cm4gcmVwbHlcblxuRW5kcG9pbnQucHJvdG90eXBlLkVQVGFyZ2V0ID0gRVBUYXJnZXRcbiIsImltcG9ydCBlcF9wcm90byBmcm9tICcuL2VwX2tpbmRzL2luZGV4LmpzeSdcbmltcG9ydCBpbml0X3Byb3RvY29sIGZyb20gJy4vcHJvdG9jb2wvaW5kZXguanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgcGx1Z2luX25hbWU6ICdlbmRwb2ludCdcbiAgb25fbXNnKHttc2csIHJlcGx5LCBpbmZvfSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCAnRU5EUE9JTlQgTVNHOicsIEB7fSBtc2csIHJlcGx5LCBpbmZvXG4gIG9uX2Vycm9yKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgRVJST1I6JywgZXJyXG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgLy8gcmV0dXJuIGZhbHNlIHRvIHByZXZlbnQgYXV0by1zaHV0ZG93blxuICBvbl9zaHV0ZG93bihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICBjb25zb2xlLmVycm9yIEAgYEVORFBPSU5UIFNIVVRET1dOOiAke2Vyci5tZXNzYWdlfWBcblxuICBzdWJjbGFzcyhjbGFzc2VzKSA6OlxuICAgIC8vY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc30gPSBjbGFzc2VzXG4gICAgcmV0dXJuIGNsYXNzZXNcblxuICBqc29uX3BhY2s6IEpTT04uc3RyaW5naWZ5XG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcGx1Z2luX25hbWUsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgICBjcmVhdGVNYXBcbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIGlmIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBwbHVnaW5fb3B0aW9ucy5lcF9raW5kc1xuXG4gIHJldHVybiBAOiBvcmRlcjogMSwgc3ViY2xhc3MsIHBvc3RcbiAgXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3Qge3BhY2tldFBhcnNlcn0gPSBGYWJyaWNIdWJfUEkucHJvdG90eXBlXG4gICAgaWYgbnVsbD09cGFja2V0UGFyc2VyIHx8ICEgcGFja2V0UGFyc2VyLmlzUGFja2V0UGFyc2VyKCkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgSW52YWxpZCBwYWNrZXRQYXJzZXIgZm9yIHBsdWdpbmBcbiAgICBcbiAgICBGYWJyaWNIdWJfUEkucHJvdG90eXBlW3BsdWdpbl9uYW1lXSA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViW3BsdWdpbl9uYW1lXSA9IGh1YltwbHVnaW5fbmFtZV0oaHViKVxuXG4gIGZ1bmN0aW9uIGJpbmRFbmRwb2ludEFwaShwYWNrZXRQYXJzZXIpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gaW5pdF9wcm90b2NvbCBAIHBhY2tldFBhcnNlciwgQHt9IHJhbmRvbV9pZCwganNvbl9wYWNrXG5cbiAgICBjb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eDogTXNnQ3R4X3BpfSA9XG4gICAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOiBwcm90b2NvbHNcbiAgICAgICAgU2luazogU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgTXNnQ3R4OiBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIEVuZHBvaW50OiBFbmRwb2ludEJhc2Uuc3ViY2xhc3Moe2NyZWF0ZU1hcH0pXG5cbiAgICByZXR1cm4gZnVuY3Rpb24oaHViKSA6OlxuICAgICAgY29uc3QgY2hhbm5lbCA9IGh1Yi5jb25uZWN0X3NlbGYoKVxuICAgICAgY29uc3QgTXNnQ3R4ID0gTXNnQ3R4X3BpLmZvckh1YihodWIsIGNoYW5uZWwpXG5cbiAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZiBAIGVuZHBvaW50LCBlcF9wcm90b1xuICAgICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gZW5kcG9pbnQsIGNyZWF0ZSwgTXNnQ3R4XG4gICAgICByZXR1cm4gZW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICB3aGlsZSB0YXJnZXRzLmhhcyBAIGlkX3RhcmdldFxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgaWRfdGFyZ2V0LCBvbl9pbml0XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZShpZF90YXJnZXQsIG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGhhbmRsZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKVxuICAgICAgICBjb25zdCBpZCA9IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgTXNnQ3R4IEAgaWRcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQgQCBpZCwgbXNnX2N0eFxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEBcbiAgICAgICAgICAgICdmdW5jdGlvbicgPT09IHR5cGVvZiBvbl9pbml0XG4gICAgICAgICAgICAgID8gb25faW5pdChlcCwgaHViKVxuICAgICAgICAgICAgICA6IG9uX2luaXRcbiAgICAgICAgICAudGhlbiBAIF9hZnRlcl9pbml0XG5cbiAgICAgICAgLy8gQWxsb3cgZm9yIGJvdGggaW50ZXJuYWwgYW5kIGV4dGVybmFsIGVycm9yIGhhbmRsaW5nIGJ5IGZvcmtpbmcgcmVhZHkuY2F0Y2hcbiAgICAgICAgcmVhZHkuY2F0Y2ggQCBlcnIgPT4gaGFuZGxlcnMub25fZXJyb3IgQCBlcnIsIEB7fSB6b25lOidvbl9yZWFkeSdcblxuICAgICAgICA6OlxuICAgICAgICAgIGNvbnN0IGVwX3RndCA9IGVwLmVwX3NlbGYoKVxuICAgICAgICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gZXBfdGd0XG5cblxuICAgICAgICBmdW5jdGlvbiBfYWZ0ZXJfaW5pdCh0YXJnZXQpIDo6XG4gICAgICAgICAgaWYgbnVsbCA9PSB0YXJnZXQgOjpcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgZW5kcG9pbnQgaW5pdCB0byByZXR1cm4gYSBjbG9zdXJlIG9yIGludGVyZmFjZWBcblxuICAgICAgICAgIGhhbmRsZXJzLm9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8ICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGFyZ2V0ID8gdGFyZ2V0IDogZGVmYXVsdF9vbl9tc2cpKS5iaW5kKHRhcmdldClcbiAgICAgICAgICBoYW5kbGVycy5vbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQsIGVwKVxuICAgICAgICAgIGhhbmRsZXJzLm9uX3NodXRkb3duID0gKHRhcmdldC5vbl9zaHV0ZG93biB8fCBkZWZhdWx0X29uX3NodXRkb3duKS5iaW5kKHRhcmdldCwgZXApXG5cbiAgICAgICAgICBuZXcgU2luaygpLnJlZ2lzdGVyIEAgZXAsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVyc1xuXG4gICAgICAgICAgcmV0dXJuIHRhcmdldC5vbl9yZWFkeSA/IHRhcmdldC5vbl9yZWFkeShlcCwgaHViKSA6IHRhcmdldFxuXG5cbiIsImltcG9ydCB7cmFuZG9tQnl0ZXN9IGZyb20gJ2NyeXB0bydcbmltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5lbmRwb2ludF9ub2RlanMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICByZXR1cm4gcmFuZG9tQnl0ZXMoNCkucmVhZEludDMyTEUoKVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9ub2RlanMocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIl0sIm5hbWVzIjpbImVwX3Byb3RvIiwiT2JqZWN0IiwiY3JlYXRlIiwiZ2V0UHJvdG90eXBlT2YiLCJhZGRfZXBfa2luZCIsImtpbmRzIiwiYXNzaWduIiwiYXBpIiwidGFyZ2V0IiwiY2xpZW50RW5kcG9pbnQiLCJlbmRwb2ludCIsImRvbmUiLCJhcmdzIiwibGVuZ3RoIiwibXNnX2N0eCIsIk1zZ0N0eCIsInRvIiwiZXBfY2xpZW50X2FwaSIsIm9uX3JlYWR5IiwiZXAiLCJodWIiLCJfcmVzb2x2ZSIsIm9uX2NsaWVudF9yZWFkeSIsInNodXRkb3duIiwiZXJyIiwiX3JlamVjdCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiYXBpX2VuZHBvaW50cyIsInBhcmFsbGVsIiwiaW5vcmRlciIsInJwYyIsImJpbmRfcnBjIiwib25fbXNnIiwibXNnIiwic2VuZGVyIiwiaW52b2tlIiwib3AiLCJhcGlfZm4iLCJrdyIsImN0eCIsImludm9rZV9nYXRlZCIsInBmeCIsIm9wX3ByZWZpeCIsImxvb2t1cF9vcCIsIm9wX2xvb2t1cCIsImZuIiwiYmluZCIsInJwY19hcGkiLCJ2YWx1ZSIsImVwX3NlbGYiLCJjYiIsInJlc29sdmVfb3AiLCJ1bmRlZmluZWQiLCJyZXMiLCJhbnN3ZXIiLCJnYXRlIiwidGhlbiIsIm5vb3AiLCJzZW5kIiwiZXJyX2Zyb20iLCJtZXNzYWdlIiwiY29kZSIsImVycm9yIiwicmVwbHlFeHBlY3RlZCIsIm9uX2luaXQiLCJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwicGFja2V0UGFyc2VyIiwiZnJhZ21lbnRfc2l6ZSIsImNvbmNhdEJ1ZmZlcnMiLCJwYWNrUGFja2V0T2JqIiwicGFja191dGY4IiwidW5wYWNrX3V0ZjgiLCJOdW1iZXIiLCJyYW5kb21faWQiLCJqc29uX3BhY2siLCJjcmVhdGVTdHJlYW0iLCJwYWNrZXRGcmFnbWVudHMiLCJjcmVhdGVNdWx0aXBhcnQiLCJzaW5rIiwicGFydHMiLCJmZWVkIiwiYm9keV9idWZmZXIiLCJpbmNsdWRlcyIsImRlbGV0ZVN0YXRlRm9yIiwicmVjdkRhdGEiLCJyc3RyZWFtIiwic3RhdGUiLCJmZWVkX2luaXQiLCJhc19jb250ZW50IiwiZmVlZF9pZ25vcmUiLCJqc29uX3VucGFjayIsImJvZHlfdXRmOCIsInJlY3ZTdHJlYW0iLCJyZWN2U3RyZWFtRGF0YSIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic3RyZWFtIiwiYmluZF9zdHJlYW0iLCJtb2RlIiwiY2hhbiIsIm1zZW5kIiwibXNlbmRfYnl0ZXMiLCJtc2VuZF9vYmplY3RzIiwibXNlbmRfaW1wbCIsIm9iamVjdCIsImJ5dGVzIiwid3JpdGUiLCJlbmQiLCJjaHVuayIsImNoZWNrX2ZucyIsImtleXMiLCJrZXkiLCJqc29uX3Byb3RvY29sIiwic2hhcmVkIiwiZGF0YWdyYW0iLCJkaXJlY3QiLCJyZWN2TXNnIiwic3RhdGVGb3IiLCJib2R5X2J1ZiIsInVucGFja0JvZHkiLCJiaW5hcnlfcHJvdG9jb2wiLCJhc0J1ZmZlciIsInBrdF9idWZmZXIiLCJjb250cm9sX3Byb3RvY29sIiwiaGlnaCIsInBpbmdfZnJhbWUiLCJwb25nX2ZyYW1lIiwicG9uZ190eXBlIiwicmVjdl9wb25nIiwicGluZ190eXBlIiwicmVjdl9waW5nIiwicGluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJ0czAiLCJEYXRlIiwicm91dGVyIiwiYm9keV9qc29uIiwicmVjdkN0cmwiLCJfc2VuZF9wb25nIiwicGt0X3BpbmciLCJyX2lkIiwidHMxIiwiZGlzcGF0Y2giLCJpbml0X3Byb3RvY29sIiwic2hhcmVkX3Byb3RvIiwianNvbiIsImpzb25fcHJvdG8iLCJiaW5hcnkiLCJiaW5hcnlfcHJvdG8iLCJjb250cm9sIiwiY29udHJvbF9wcm90byIsImNvZGVjcyIsImRlZmF1bHQiLCJTaW5rIiwiZm9yUHJvdG9jb2xzIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJleHRyYSIsImJpbmRTaW5rIiwiem9uZSIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsImdldCIsInNldCIsImRlbGV0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJlcF9lbmNvZGUiLCJhc19qc29uX3VucGFjayIsIm1zZ19jdHhfdG8iLCJ4Zm9ybUJ5S2V5IiwidiIsImZyb21fY3R4IiwiZXBfZGVjb2RlIiwianNvbl91bnBhY2tfeGZvcm0iLCJhc0VuZHBvaW50SWQiLCJlcF90Z3QiLCJmYXN0IiwiaW5pdCIsImZhc3RfanNvbiIsImRlZmluZVByb3BlcnRpZXMiLCJxdWVyeSIsInNpbXBsZSIsInIiLCJ0IiwidG9TdHJpbmciLCJzcGxpdCIsInBhcnNlSW50Iiwic3oiLCJwYXJzZSIsInJldml2ZXIiLCJyZWciLCJXZWFrTWFwIiwieGZuIiwidmZuIiwid2l0aENvZGVjcyIsImZvckh1YiIsImNoYW5uZWwiLCJzZW5kUmF3IiwiY2hhbl9zZW5kIiwiZnJlZXplIiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJfY29kZWMiLCJyZXBseSIsImZuT3JLZXkiLCJhc3NlcnRNb25pdG9yIiwicF9zZW50IiwiaW5pdFJlcGx5IiwidGd0Iiwic2VsZiIsImNsb25lIiwicmVwbHlfaWQiLCJ3aXRoIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwibW9uaXRvciIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwidGQiLCJ0aWQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwidW5yZWYiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImpzb25fc2VuZCIsInBfcmVwbHkiLCJ0aW1lb3V0IiwiUmVwbHlUaW1lb3V0Iiwic2V0VGltZW91dCIsIm1zX3RpbWVvdXQiLCJFbmRwb2ludCIsInN1YmNsYXNzIiwiZXh0ZW5zaW9ucyIsInRvSlNPTiIsIndpdGhFbmRwb2ludCIsIk1hcCIsImNyZWF0ZU1hcCIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIm5vdyIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJybXNnIiwiaXNfcmVwbHkiLCJhc19zZW5kZXIiLCJ3YXJuIiwiaW5pdFJlcGx5UHJvbWlzZSIsImNhdGNoIiwid2l0aFJlamVjdFRpbWVvdXQiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiY2xhc3NlcyIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsImVwX2tpbmRzIiwib3JkZXIiLCJwb3N0IiwiRmFicmljSHViX1BJIiwiYmFzZXMiLCJpc1BhY2tldFBhcnNlciIsInBsdWdpbl9uYW1lIiwiYmluZEVuZHBvaW50QXBpIiwicHJvdG9jb2xzIiwiTXNnQ3R4X3BpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiY29ubmVjdF9zZWxmIiwic2V0UHJvdG90eXBlT2YiLCJ0YXJnZXRzIiwiaGFzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJyZWdpc3RlciIsImVuZHBvaW50X25vZGVqcyIsInJhbmRvbUJ5dGVz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
