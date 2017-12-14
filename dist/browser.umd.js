(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global['msg-fabric-sink'] = factory());
}(this, (function () { 'use strict';

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

const getRandomValues = 'undefined' !== typeof window ? window.crypto.getRandomValues : null;

endpoint_browser.random_id = random_id;
function random_id() {
  const arr = new Int32Array(1);
  getRandomValues(arr);
  return arr[0];
}

function endpoint_browser(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id;
  }

  return endpoint_plugin(plugin_options);
}

return endpoint_browser;

})));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci51bWQuanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvZXBfa2luZHMvZXh0ZW5zaW9ucy5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2NsaWVudC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2FwaS5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2luZGV4LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9zaW5rLmpzeSIsIi4uL2NvZGUvZXBfdGFyZ2V0LmpzeSIsIi4uL2NvZGUvbXNnY3R4LmpzeSIsIi4uL2NvZGUvZW5kcG9pbnQuanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgZXBfcHJvdG8gPSBPYmplY3QuY3JlYXRlIEAgT2JqZWN0LmdldFByb3RvdHlwZU9mIEAgZnVuY3Rpb24oKXt9XG5leHBvcnQgZnVuY3Rpb24gYWRkX2VwX2tpbmQoa2luZHMpIDo6XG4gIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywga2luZHNcbmV4cG9ydCBkZWZhdWx0IGFkZF9lcF9raW5kXG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgY2xpZW50RW5kcG9pbnQoYXBpKSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KGFwaSlcbiAgICB0aGlzLmVuZHBvaW50IEAgdGFyZ2V0XG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cbiAgY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudEVuZHBvaW50IEAgYXJnc1swXVxuXG4gICAgY29uc3QgbXNnX2N0eCA9IG5ldyB0aGlzLk1zZ0N0eCgpXG4gICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoID8gbXNnX2N0eC50byguLi5hcmdzKSA6IG1zZ19jdHhcblxuXG5jb25zdCBlcF9jbGllbnRfYXBpID0gQHt9XG4gIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgdGhpcy5fcmVzb2x2ZSBAIGF3YWl0IHRoaXMub25fY2xpZW50X3JlYWR5KGVwLCBodWIpXG4gICAgYXdhaXQgZXAuc2h1dGRvd24oKVxuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgdGhpcy5fcmVqZWN0KGVycilcbiAgb25fc2h1dGRvd24oZXAsIGVycikgOjpcbiAgICBlcnIgPyB0aGlzLl9yZWplY3QoZXJyKSA6IHRoaXMuX3Jlc29sdmUoKVxuXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fY2xpZW50X3JlYWR5KSA6OlxuICBsZXQgdGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSBAIGVwX2NsaWVudF9hcGlcbiAgdGFyZ2V0Lm9uX2NsaWVudF9yZWFkeSA9IG9uX2NsaWVudF9yZWFkeVxuICB0YXJnZXQuZG9uZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICB0YXJnZXQuX3Jlc29sdmUgPSByZXNvbHZlXG4gICAgdGFyZ2V0Ll9yZWplY3QgPSByZWplY3RcbiAgcmV0dXJuIHRhcmdldFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGFwaShhcGkpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgYXBpX2VuZHBvaW50cy5wYXJhbGxlbChhcGkpXG4gIGFwaV9wYXJhbGxlbChhcGkpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgYXBpX2VuZHBvaW50cy5wYXJhbGxlbChhcGkpXG4gIGFwaV9pbm9yZGVyKGFwaSkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBhcGlfZW5kcG9pbnRzLmlub3JkZXIoYXBpKVxuXG5cbmV4cG9ydCBjb25zdCBhcGlfZW5kcG9pbnRzID0gQHt9XG4gIHBhcmFsbGVsKGFwaSkgOjpcbiAgICByZXR1cm4gZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfZW5kcG9pbnRzLmJpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuICBpbm9yZGVyKGFwaSkgOjpcbiAgICByZXR1cm4gZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfZW5kcG9pbnRzLmJpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlX2dhdGVkIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuICBiaW5kX3JwYyhhcGksIGVwLCBodWIpIDo6XG4gICAgY29uc3QgcGZ4ID0gYXBpLm9wX3ByZWZpeCB8fCAncnBjXydcbiAgICBjb25zdCBsb29rdXBfb3AgPSBhcGkub3BfbG9va3VwXG4gICAgICA/IG9wID0+IGFwaS5vcF9sb29rdXAocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgICA6ICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcGlcbiAgICAgID8gb3AgPT4gYXBpKHBmeCArIG9wLCBlcCwgaHViKVxuICAgICAgOiBvcCA9PiA6OlxuICAgICAgICAgIGNvbnN0IGZuID0gYXBpW3BmeCArIG9wXVxuICAgICAgICAgIHJldHVybiBmbiA/IGZuLmJpbmQoYXBpKSA6IGZuXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHJwY19hcGksIEB7fVxuICAgICAgbG9va3VwX29wOiBAe30gdmFsdWU6IGxvb2t1cF9vcFxuICAgICAgZXJyX2Zyb206IEB7fSB2YWx1ZTogZXAuZXBfc2VsZigpXG5cblxuY29uc3QgcnBjX2FwaSA9IEA6XG4gIGFzeW5jIGludm9rZShzZW5kZXIsIG9wLCBjYikgOjpcbiAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLnJlc29sdmVfb3AgQCBzZW5kZXIsIG9wXG4gICAgaWYgdW5kZWZpbmVkID09PSBhcGlfZm4gOjogcmV0dXJuXG5cbiAgICBjb25zdCByZXMgPSB0aGlzLmFuc3dlciBAIHNlbmRlciwgYXBpX2ZuLCBjYlxuICAgIHJldHVybiBhd2FpdCByZXNcblxuICBhc3luYyBpbnZva2VfZ2F0ZWQoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZ2F0ZSlcbiAgICAgIC50aGVuIEAgKCkgPT4gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICB0aGlzLmdhdGUgPSByZXMudGhlbihub29wLCBub29wKVxuICAgIHJldHVybiBhd2FpdCByZXNcblxuICBhc3luYyByZXNvbHZlX29wKHNlbmRlciwgb3ApIDo6XG4gICAgaWYgJ3N0cmluZycgIT09IHR5cGVvZiBvcCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogJ0ludmFsaWQgb3BlcmF0aW9uJywgY29kZTogNDAwXG4gICAgICByZXR1cm5cblxuICAgIHRyeSA6OlxuICAgICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5sb29rdXBfb3Aob3ApXG4gICAgICBpZiAhIGFwaV9mbiA6OlxuICAgICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdVbmtub3duIG9wZXJhdGlvbicsIGNvZGU6IDQwNFxuICAgICAgcmV0dXJuIGFwaV9mblxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogYEludmFsaWQgb3BlcmF0aW9uOiAke2Vyci5tZXNzYWdlfWAsIGNvZGU6IDUwMFxuXG4gIGFzeW5jIGFuc3dlcihzZW5kZXIsIGFwaV9mbiwgY2IpIDo6XG4gICAgdHJ5IDo6XG4gICAgICB2YXIgYW5zd2VyID0gY2IgPyBhd2FpdCBjYihhcGlfZm4pIDogYXdhaXQgYXBpX2ZuKClcbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IGVycl9mcm9tOiB0aGlzLmVycl9mcm9tLCBlcnJvcjogZXJyXG4gICAgICByZXR1cm4gZmFsc2VcblxuICAgIGlmIHNlbmRlci5yZXBseUV4cGVjdGVkIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBhbnN3ZXJcbiAgICByZXR1cm4gdHJ1ZVxuXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG4iLCJpbXBvcnQge2FkZF9lcF9raW5kLCBlcF9wcm90b30gZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgc2VydmVyKG9uX2luaXQpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgb25faW5pdFxuXG5leHBvcnQgKiBmcm9tICcuL2NsaWVudC5qc3knXG5leHBvcnQgKiBmcm9tICcuL2FwaS5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGVwX3Byb3RvXG4iLCJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIG1zZW5kIEAgdHJ1ZSwgYm9keVxuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gJ3NpbmdsZSdcbiAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIHBhY2tfaGRyKG9iailcbiAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCBmcm9tX2lkOnJfaWR9ID0gcGt0X3BpbmcuaW5mb1xuICAgIGNvbnN0IG9iaiA9IEB7fSBtc2dpZFxuICAgICAgZnJvbV9pZDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICBpZF9yb3V0ZXI6IHJfaWQuaWRfcm91dGVyLCBpZF90YXJnZXQ6IHJfaWQuaWRfdGFyZ2V0XG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgICBvcDogJ3BvbmcnLCB0czAsIHRzMTogbmV3IERhdGUoKVxuXG4gICAgcG9uZ19mcmFtZS5wYWNrKHBvbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gcm91dGVyLmRpc3BhdGNoIEAgW3BrdF1cblxuICBmdW5jdGlvbiByZWN2X3BvbmcocGt0LCBzaW5rKSA6OlxuICAgIHBvbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5pbXBvcnQgc2hhcmVkX3Byb3RvIGZyb20gJy4vc2hhcmVkLmpzeSdcbmltcG9ydCBqc29uX3Byb3RvIGZyb20gJy4vanNvbi5qc3knXG5pbXBvcnQgYmluYXJ5X3Byb3RvIGZyb20gJy4vYmluYXJ5LmpzeSdcbmltcG9ydCBjb250cm9sX3Byb3RvIGZyb20gJy4vY29udHJvbC5qc3knXG5cbmV4cG9ydCAqIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGluaXRfcHJvdG9jb2wocGFja2V0UGFyc2VyLCBvcHRpb25zKSA6OlxuICBjb25zdCBzaGFyZWQgPSBzaGFyZWRfcHJvdG8gQCBwYWNrZXRQYXJzZXIsIG9wdGlvbnNcblxuICBjb25zdCBpbmJvdW5kID0gW11cbiAgY29uc3QganNvbiA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDAwIC8vIDB4MCog4oCUIEpTT04gYm9keVxuICAgIGpzb25fcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGJpbmFyeSA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDEwIC8vIDB4MSog4oCUIGJpbmFyeSBib2R5XG4gICAgYmluYXJ5X3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBjb250cm9sID0gY29udHJvbF9wcm90byBAIGluYm91bmQsXG4gICAgMHhmMCAvLyAweGYqIOKAlCBjb250cm9sXG4gICAgc2hhcmVkXG5cbiAgY29uc3QgY29kZWNzID0gQDoganNvbiwgYmluYXJ5LCBjb250cm9sLCBkZWZhdWx0OiBqc29uXG5cbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgcmV0dXJuIEA6IGluYm91bmQsIGNvZGVjcywgcmFuZG9tX2lkXG5cblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG5cbiAganNvbl91bnBhY2sob2JqKSA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgRW5kcG9pbnQgYmluZFNpbmsoKSByZXNwb25zaWJpbGl0eWBcblxuIiwiZXhwb3J0IGRlZmF1bHQgRVBUYXJnZXRcbmV4cG9ydCBjbGFzcyBFUFRhcmdldCA6OlxuICBjb25zdHJ1Y3RvcihpZCkgOjogdGhpcy5pZCA9IGlkXG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlkLmFzRW5kcG9pbnRJZCA6OlxuICAgICAgaWQgPSBpZC5hc0VuZHBvaW50SWQoKVxuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RfanNvblxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cblxuRVBUYXJnZXQuanNvbl91bnBhY2tfeGZvcm0gPSBqc29uX3VucGFja194Zm9ybVxuZXhwb3J0IGZ1bmN0aW9uIGpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpIDo6XG4gIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXIoKVxuXG4gIGZ1bmN0aW9uIHJldml2ZXIoKSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBzdGF0aWMgZm9ySHViKGh1YiwgY2hhbm5lbCkgOjpcbiAgICBjb25zdCB7c2VuZFJhd30gPSBjaGFubmVsXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuX3NlbmQgPSBhc3luYyBwa3QgPT4gOjpcbiAgICAgIGF3YWl0IHNlbmRSYXcocGt0KVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIHJldHVybiBNc2dDdHhcblxuXG4gIGNvbnN0cnVjdG9yKGlkKSA6OlxuICAgIGlmIG51bGwgIT0gaWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBpZFxuICAgICAgY29uc3QgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIHRoaXMuY3R4ID0gQHt9IGZyb21faWRcblxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG5cbiAgICBjb25zdCByZXMgPSBpbnZva2UgQCB0aGlzLmNoYW5fc2VuZCwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgdGd0ID0gZXBfZGVjb2RlKHRndCkgfHwgdGd0XG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgc2VuZF9qc29uIGFzIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBqc29uX3NlbmQgPSBtc2dDb2RlY3MuanNvbi5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3RfanNvbjogQHt9IGdldCgpIDo6IHJldHVybiBAOlxuICAgICAgICBzZW5kOiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncylcbiAgICAgICAgc2VuZFF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSlcbiAgICAgICAgcXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gICAgcmV0dXJuIHRoaXNcblxuXG4gIHdpdGhSZWplY3RUaW1lb3V0KHBfcmVwbHkpIDo6XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHBfcmVwbHkudGhlbiBAIHJlc29sdmUsIHJlamVjdFxuICAgICAgcF9yZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG5cbiAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcbiAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy5tc190aW1lb3V0KVxuICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG5cbiAgICAgIGZ1bmN0aW9uIGNsZWFyKCkgOjogY2xlYXJUaW1lb3V0IEAgdGlkXG5cblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIE1zZ0N0eC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXQsIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IHtFUFRhcmdldCwgZXBfZW5jb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5lcF9zZWxmKCkudG9KU09OKClcbiAgZXBfc2VsZigpIDo6IHJldHVybiBuZXcgdGhpcy5FUFRhcmdldCh0aGlzLmlkKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuXG4gIGNvbnN0cnVjdG9yKGlkLCBtc2dfY3R4KSA6OlxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBpZDogQHt9IHZhbHVlOiBpZFxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcykudG9cblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUm91dGVDYWNoZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcbiAgICAgIGpzb25fdW5wYWNrOiB0aGlzLkVQVGFyZ2V0LmFzX2pzb25fdW5wYWNrKHRoaXMudG8pXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgYXNfdGFyZ2V0KGlkKSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG9cbiAgYXNfc2VuZGVyKHtmcm9tX2lkOmlkLCBtc2dpZH0pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50bywgbXNnaWRcblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc19zZW5kZXIoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogdGhpcy5wYXJ0cy5qb2luKCcnKTsgLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBwX3NlbnQsIG1zZ19jdHhcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIGxldCByZXBseSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIHBfc2VudC5jYXRjaCBAIHJlamVjdFxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgcmVwbHkgPSBtc2dfY3R4LndpdGhSZWplY3RUaW1lb3V0KHJlcGx5KVxuXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiB0aGlzLmJ5X3Rva2VuLmRlbGV0ZSBAIHRva2VuXG4gICAgcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuICAgIHJldHVybiByZXBseVxuXG5FbmRwb2ludC5wcm90b3R5cGUuRVBUYXJnZXQgPSBFUFRhcmdldFxuIiwiaW1wb3J0IGVwX3Byb3RvIGZyb20gJy4vZXBfa2luZHMvaW5kZXguanN5J1xuaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBwbHVnaW5fbmFtZTogJ2VuZHBvaW50J1xuICBvbl9tc2coe21zZywgcmVwbHksIGluZm99KSA6OlxuICAgIGNvbnNvbGUud2FybiBAICdFTkRQT0lOVCBNU0c6JywgQHt9IG1zZywgcmVwbHksIGluZm9cbiAgb25fZXJyb3IoZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnJcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIGNvbnNvbGUuZXJyb3IgQCBgRU5EUE9JTlQgU0hVVERPV046ICR7ZXJyLm1lc3NhZ2V9YFxuXG4gIHN1YmNsYXNzKGNsYXNzZXMpIDo6XG4gICAgLy9jb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG4gIGpzb25fcGFjazogSlNPTi5zdHJpbmdpZnlcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBwbHVnaW5fbmFtZSwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICAgIGNyZWF0ZU1hcFxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgaWYgcGx1Z2luX29wdGlvbnMuZXBfa2luZHMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVbcGx1Z2luX25hbWVdID1cbiAgICAgIGJpbmRFbmRwb2ludEFwaSBAIHBhY2tldFBhcnNlclxuXG4gIGZ1bmN0aW9uIHBvc3QoaHViKSA6OlxuICAgIHJldHVybiBodWJbcGx1Z2luX25hbWVdID0gaHViW3BsdWdpbl9uYW1lXShodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3BhY2tcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4OiBNc2dDdHhfcGl9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6IHByb3RvY29sc1xuICAgICAgICBTaW5rOiBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBNc2dDdHg6IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgRW5kcG9pbnQ6IEVuZHBvaW50QmFzZS5zdWJjbGFzcyh7Y3JlYXRlTWFwfSlcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICBjb25zdCBjaGFubmVsID0gaHViLmNvbm5lY3Rfc2VsZigpXG4gICAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhfcGkuZm9ySHViKGh1YiwgY2hhbm5lbClcblxuICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mIEAgZW5kcG9pbnQsIGVwX3Byb3RvXG4gICAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBlbmRwb2ludCwgY3JlYXRlLCBNc2dDdHhcbiAgICAgIHJldHVybiBlbmRwb2ludFxuXG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBodWIucm91dGVyLnRhcmdldHNcbiAgICAgICAgZG8gdmFyIGlkX3RhcmdldCA9IHJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBpZFxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludCBAIGlkLCBtc2dfY3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQFxuICAgICAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIG9uX2luaXRcbiAgICAgICAgICAgICAgPyBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgICAgIDogb25faW5pdFxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICAvLyBBbGxvdyBmb3IgYm90aCBpbnRlcm5hbCBhbmQgZXh0ZXJuYWwgZXJyb3IgaGFuZGxpbmcgYnkgZm9ya2luZyByZWFkeS5jYXRjaFxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PiBoYW5kbGVycy5vbl9lcnJvciBAIGVyciwgQHt9IHpvbmU6J29uX3JlYWR5J1xuXG4gICAgICAgIDo6XG4gICAgICAgICAgY29uc3QgZXBfdGd0ID0gZXAuZXBfc2VsZigpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuIiwiaW1wb3J0IGVuZHBvaW50X3BsdWdpbiBmcm9tICcuL3BsdWdpbi5qc3knXG5cbmNvbnN0IGdldFJhbmRvbVZhbHVlcyA9ICd1bmRlZmluZWQnICE9PSB0eXBlb2Ygd2luZG93XG4gID8gd2luZG93LmNyeXB0by5nZXRSYW5kb21WYWx1ZXMgOiBudWxsXG5cbmVuZHBvaW50X2Jyb3dzZXIucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICBjb25zdCBhcnIgPSBuZXcgSW50MzJBcnJheSgxKVxuICBnZXRSYW5kb21WYWx1ZXMoYXJyKVxuICByZXR1cm4gYXJyWzBdXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGVuZHBvaW50X2Jyb3dzZXIocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIl0sIm5hbWVzIjpbImVwX3Byb3RvIiwiT2JqZWN0IiwiY3JlYXRlIiwiZ2V0UHJvdG90eXBlT2YiLCJhZGRfZXBfa2luZCIsImtpbmRzIiwiYXNzaWduIiwiYXBpIiwidGFyZ2V0IiwiY2xpZW50RW5kcG9pbnQiLCJlbmRwb2ludCIsImRvbmUiLCJhcmdzIiwibGVuZ3RoIiwibXNnX2N0eCIsIk1zZ0N0eCIsInRvIiwiZXBfY2xpZW50X2FwaSIsIm9uX3JlYWR5IiwiZXAiLCJodWIiLCJfcmVzb2x2ZSIsIm9uX2NsaWVudF9yZWFkeSIsInNodXRkb3duIiwiZXJyIiwiX3JlamVjdCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiYXBpX2VuZHBvaW50cyIsInBhcmFsbGVsIiwiaW5vcmRlciIsInJwYyIsImJpbmRfcnBjIiwib25fbXNnIiwibXNnIiwic2VuZGVyIiwiaW52b2tlIiwib3AiLCJhcGlfZm4iLCJrdyIsImN0eCIsImludm9rZV9nYXRlZCIsInBmeCIsIm9wX3ByZWZpeCIsImxvb2t1cF9vcCIsIm9wX2xvb2t1cCIsImZuIiwiYmluZCIsInJwY19hcGkiLCJ2YWx1ZSIsImVwX3NlbGYiLCJjYiIsInJlc29sdmVfb3AiLCJ1bmRlZmluZWQiLCJyZXMiLCJhbnN3ZXIiLCJnYXRlIiwidGhlbiIsIm5vb3AiLCJzZW5kIiwiZXJyX2Zyb20iLCJtZXNzYWdlIiwiY29kZSIsImVycm9yIiwicmVwbHlFeHBlY3RlZCIsIm9uX2luaXQiLCJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwicGFja2V0UGFyc2VyIiwiZnJhZ21lbnRfc2l6ZSIsImNvbmNhdEJ1ZmZlcnMiLCJwYWNrUGFja2V0T2JqIiwicGFja191dGY4IiwidW5wYWNrX3V0ZjgiLCJOdW1iZXIiLCJyYW5kb21faWQiLCJqc29uX3BhY2siLCJjcmVhdGVTdHJlYW0iLCJwYWNrZXRGcmFnbWVudHMiLCJjcmVhdGVNdWx0aXBhcnQiLCJzaW5rIiwicGFydHMiLCJmZWVkIiwiYm9keV9idWZmZXIiLCJpbmNsdWRlcyIsImRlbGV0ZVN0YXRlRm9yIiwicmVjdkRhdGEiLCJyc3RyZWFtIiwic3RhdGUiLCJmZWVkX2luaXQiLCJhc19jb250ZW50IiwiZmVlZF9pZ25vcmUiLCJqc29uX3VucGFjayIsImJvZHlfdXRmOCIsInJlY3ZTdHJlYW0iLCJyZWN2U3RyZWFtRGF0YSIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic3RyZWFtIiwiYmluZF9zdHJlYW0iLCJtb2RlIiwiY2hhbiIsIm1zZW5kIiwibXNlbmRfYnl0ZXMiLCJtc2VuZF9vYmplY3RzIiwibXNlbmRfaW1wbCIsIm9iamVjdCIsImJ5dGVzIiwid3JpdGUiLCJlbmQiLCJjaHVuayIsImNoZWNrX2ZucyIsImtleXMiLCJrZXkiLCJqc29uX3Byb3RvY29sIiwic2hhcmVkIiwiZGF0YWdyYW0iLCJkaXJlY3QiLCJyZWN2TXNnIiwic3RhdGVGb3IiLCJib2R5X2J1ZiIsInVucGFja0JvZHkiLCJiaW5hcnlfcHJvdG9jb2wiLCJhc0J1ZmZlciIsInBrdF9idWZmZXIiLCJjb250cm9sX3Byb3RvY29sIiwiaGlnaCIsInBpbmdfZnJhbWUiLCJwb25nX2ZyYW1lIiwicG9uZ190eXBlIiwicmVjdl9wb25nIiwicGluZ190eXBlIiwicmVjdl9waW5nIiwicGluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJ0czAiLCJEYXRlIiwicm91dGVyIiwiYm9keV9qc29uIiwicmVjdkN0cmwiLCJfc2VuZF9wb25nIiwicGt0X3BpbmciLCJyX2lkIiwidHMxIiwiZGlzcGF0Y2giLCJpbml0X3Byb3RvY29sIiwic2hhcmVkX3Byb3RvIiwianNvbiIsImpzb25fcHJvdG8iLCJiaW5hcnkiLCJiaW5hcnlfcHJvdG8iLCJjb250cm9sIiwiY29udHJvbF9wcm90byIsImNvZGVjcyIsImRlZmF1bHQiLCJTaW5rIiwiZm9yUHJvdG9jb2xzIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJleHRyYSIsImJpbmRTaW5rIiwiem9uZSIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsImdldCIsInNldCIsImRlbGV0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJlcF9lbmNvZGUiLCJhc19qc29uX3VucGFjayIsIm1zZ19jdHhfdG8iLCJ4Zm9ybUJ5S2V5IiwidiIsImZyb21fY3R4IiwiZXBfZGVjb2RlIiwianNvbl91bnBhY2tfeGZvcm0iLCJhc0VuZHBvaW50SWQiLCJlcF90Z3QiLCJmYXN0IiwiaW5pdCIsImZhc3RfanNvbiIsImRlZmluZVByb3BlcnRpZXMiLCJxdWVyeSIsInNpbXBsZSIsInIiLCJ0IiwidG9TdHJpbmciLCJzcGxpdCIsInBhcnNlSW50Iiwic3oiLCJwYXJzZSIsInJldml2ZXIiLCJyZWciLCJXZWFrTWFwIiwieGZuIiwidmZuIiwid2l0aENvZGVjcyIsImZvckh1YiIsImNoYW5uZWwiLCJzZW5kUmF3IiwiY2hhbl9zZW5kIiwiZnJlZXplIiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJfY29kZWMiLCJyZXBseSIsImZuT3JLZXkiLCJhc3NlcnRNb25pdG9yIiwicF9zZW50IiwiaW5pdFJlcGx5IiwidGd0Iiwic2VsZiIsImNsb25lIiwicmVwbHlfaWQiLCJ3aXRoIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwibW9uaXRvciIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwidGQiLCJ0aWQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwidW5yZWYiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImpzb25fc2VuZCIsInBfcmVwbHkiLCJ0aW1lb3V0IiwiUmVwbHlUaW1lb3V0Iiwic2V0VGltZW91dCIsIm1zX3RpbWVvdXQiLCJFbmRwb2ludCIsInN1YmNsYXNzIiwiZXh0ZW5zaW9ucyIsInRvSlNPTiIsIndpdGhFbmRwb2ludCIsIk1hcCIsImNyZWF0ZU1hcCIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIm5vdyIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJybXNnIiwiaXNfcmVwbHkiLCJhc19zZW5kZXIiLCJ3YXJuIiwiaW5pdFJlcGx5UHJvbWlzZSIsImNhdGNoIiwid2l0aFJlamVjdFRpbWVvdXQiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiY2xhc3NlcyIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsImVwX2tpbmRzIiwib3JkZXIiLCJwb3N0IiwiRmFicmljSHViX1BJIiwiYmFzZXMiLCJpc1BhY2tldFBhcnNlciIsInBsdWdpbl9uYW1lIiwiYmluZEVuZHBvaW50QXBpIiwicHJvdG9jb2xzIiwiTXNnQ3R4X3BpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiY29ubmVjdF9zZWxmIiwic2V0UHJvdG90eXBlT2YiLCJ0YXJnZXRzIiwiaGFzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJyZWdpc3RlciIsImdldFJhbmRvbVZhbHVlcyIsIndpbmRvdyIsImNyeXB0byIsImVuZHBvaW50X2Jyb3dzZXIiLCJhcnIiLCJJbnQzMkFycmF5IiwiZW5kcG9pbnRfcGx1Z2luIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBTyxNQUFNQSxhQUFXQyxPQUFPQyxNQUFQLENBQWdCRCxPQUFPRSxjQUFQLENBQXdCLFlBQVUsRUFBbEMsQ0FBaEIsQ0FBakI7QUFDUCxBQUFPLFNBQVNDLFdBQVQsQ0FBcUJDLEtBQXJCLEVBQTRCO1NBQzFCQyxNQUFQLENBQWdCTixVQUFoQixFQUEwQkssS0FBMUI7OztBQ0FGRCxZQUFjO2lCQUNHRyxHQUFmLEVBQW9CO1VBQ1pDLFNBQVNDLGVBQWVGLEdBQWYsQ0FBZjtTQUNLRyxRQUFMLENBQWdCRixNQUFoQjtXQUNPQSxPQUFPRyxJQUFkO0dBSlU7O1NBTUwsR0FBR0MsSUFBVixFQUFnQjtRQUNYLE1BQU1BLEtBQUtDLE1BQVgsSUFBcUIsZUFBZSxPQUFPRCxLQUFLLENBQUwsQ0FBOUMsRUFBd0Q7YUFDL0MsS0FBS0gsY0FBTCxDQUFzQkcsS0FBSyxDQUFMLENBQXRCLENBQVA7OztVQUVJRSxVQUFVLElBQUksS0FBS0MsTUFBVCxFQUFoQjtXQUNPLE1BQU1ILEtBQUtDLE1BQVgsR0FBb0JDLFFBQVFFLEVBQVIsQ0FBVyxHQUFHSixJQUFkLENBQXBCLEdBQTBDRSxPQUFqRDtHQVhVLEVBQWQ7O0FBY0EsTUFBTUcsZ0JBQWdCO1FBQ2RDLFFBQU4sQ0FBZUMsRUFBZixFQUFtQkMsR0FBbkIsRUFBd0I7U0FDakJDLFFBQUwsRUFBZ0IsTUFBTSxLQUFLQyxlQUFMLENBQXFCSCxFQUFyQixFQUF5QkMsR0FBekIsQ0FBdEI7VUFDTUQsR0FBR0ksUUFBSCxFQUFOO0dBSGtCO2dCQUlOSixFQUFkLEVBQWtCSyxHQUFsQixFQUF1QjtTQUNoQkMsT0FBTCxDQUFhRCxHQUFi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
