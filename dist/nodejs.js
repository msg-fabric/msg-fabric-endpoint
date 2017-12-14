'use strict';

var crypto = require('crypto');

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
  return crypto.randomBytes(4).readInt32LE();
}

function endpoint_nodejs(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id;
  }

  return endpoint_plugin(plugin_options);
}

module.exports = endpoint_nodejs;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzLmpzIiwic291cmNlcyI6WyIuLi9jb2RlL2VwX2tpbmRzL2V4dGVuc2lvbnMuanN5IiwiLi4vY29kZS9lcF9raW5kcy9jbGllbnQuanN5IiwiLi4vY29kZS9lcF9raW5kcy9hcGkuanN5IiwiLi4vY29kZS9lcF9raW5kcy9pbmRleC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2ZyYW1pbmcuanN5IiwiLi4vY29kZS9wcm90b2NvbC9zaGFyZWQuanN5IiwiLi4vY29kZS9wcm90b2NvbC9qc29uLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvYmluYXJ5LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvY29udHJvbC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2luZGV4LmpzeSIsIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL2VwX3RhcmdldC5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSIsIi4uL2NvZGUvaW5kZXgubm9kZWpzLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgZXBfcHJvdG8gPSBPYmplY3QuY3JlYXRlIEAgT2JqZWN0LmdldFByb3RvdHlwZU9mIEAgZnVuY3Rpb24oKXt9XG5leHBvcnQgZnVuY3Rpb24gYWRkX2VwX2tpbmQoa2luZHMpIDo6XG4gIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywga2luZHNcbmV4cG9ydCBkZWZhdWx0IGFkZF9lcF9raW5kXG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgY2xpZW50RW5kcG9pbnQoYXBpKSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KGFwaSlcbiAgICB0aGlzLmVuZHBvaW50IEAgdGFyZ2V0XG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cbiAgY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudEVuZHBvaW50IEAgYXJnc1swXVxuXG4gICAgY29uc3QgbXNnX2N0eCA9IG5ldyB0aGlzLk1zZ0N0eCgpXG4gICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoID8gbXNnX2N0eC50byguLi5hcmdzKSA6IG1zZ19jdHhcblxuXG5jb25zdCBlcF9jbGllbnRfYXBpID0gQHt9XG4gIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgdGhpcy5fcmVzb2x2ZSBAIGF3YWl0IHRoaXMub25fY2xpZW50X3JlYWR5KGVwLCBodWIpXG4gICAgYXdhaXQgZXAuc2h1dGRvd24oKVxuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgdGhpcy5fcmVqZWN0KGVycilcbiAgb25fc2h1dGRvd24oZXAsIGVycikgOjpcbiAgICBlcnIgPyB0aGlzLl9yZWplY3QoZXJyKSA6IHRoaXMuX3Jlc29sdmUoKVxuXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fY2xpZW50X3JlYWR5KSA6OlxuICBsZXQgdGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSBAIGVwX2NsaWVudF9hcGlcbiAgdGFyZ2V0Lm9uX2NsaWVudF9yZWFkeSA9IG9uX2NsaWVudF9yZWFkeVxuICB0YXJnZXQuZG9uZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICB0YXJnZXQuX3Jlc29sdmUgPSByZXNvbHZlXG4gICAgdGFyZ2V0Ll9yZWplY3QgPSByZWplY3RcbiAgcmV0dXJuIHRhcmdldFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGFwaShhcGkpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgYXBpX2VuZHBvaW50cy5wYXJhbGxlbChhcGkpXG4gIGFwaV9wYXJhbGxlbChhcGkpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgYXBpX2VuZHBvaW50cy5wYXJhbGxlbChhcGkpXG4gIGFwaV9pbm9yZGVyKGFwaSkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBhcGlfZW5kcG9pbnRzLmlub3JkZXIoYXBpKVxuXG5cbmV4cG9ydCBjb25zdCBhcGlfZW5kcG9pbnRzID0gQHt9XG4gIHBhcmFsbGVsKGFwaSkgOjpcbiAgICByZXR1cm4gZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfZW5kcG9pbnRzLmJpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuICBpbm9yZGVyKGFwaSkgOjpcbiAgICByZXR1cm4gZnVuY3Rpb24gKGVwLCBodWIpIDo6XG4gICAgICBjb25zdCBycGMgPSBhcGlfZW5kcG9pbnRzLmJpbmRfcnBjKGFwaSwgZXAsIGh1YilcbiAgICAgIHJldHVybiBAe30gcnBjLFxuICAgICAgICBhc3luYyBvbl9tc2coe21zZywgc2VuZGVyfSkgOjpcbiAgICAgICAgICBhd2FpdCBycGMuaW52b2tlX2dhdGVkIEAgc2VuZGVyLCBtc2cub3AsXG4gICAgICAgICAgICBhcGlfZm4gPT4gYXBpX2ZuKG1zZy5rdywgbXNnLmN0eClcblxuICBiaW5kX3JwYyhhcGksIGVwLCBodWIpIDo6XG4gICAgY29uc3QgcGZ4ID0gYXBpLm9wX3ByZWZpeCB8fCAncnBjXydcbiAgICBjb25zdCBsb29rdXBfb3AgPSBhcGkub3BfbG9va3VwXG4gICAgICA/IG9wID0+IGFwaS5vcF9sb29rdXAocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgICA6ICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcGlcbiAgICAgID8gb3AgPT4gYXBpKHBmeCArIG9wLCBlcCwgaHViKVxuICAgICAgOiBvcCA9PiA6OlxuICAgICAgICAgIGNvbnN0IGZuID0gYXBpW3BmeCArIG9wXVxuICAgICAgICAgIHJldHVybiBmbiA/IGZuLmJpbmQoYXBpKSA6IGZuXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHJwY19hcGksIEB7fVxuICAgICAgbG9va3VwX29wOiBAe30gdmFsdWU6IGxvb2t1cF9vcFxuICAgICAgZXJyX2Zyb206IEB7fSB2YWx1ZTogZXAuZXBfc2VsZigpXG5cblxuY29uc3QgcnBjX2FwaSA9IEA6XG4gIGFzeW5jIGludm9rZShzZW5kZXIsIG9wLCBjYikgOjpcbiAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLnJlc29sdmVfb3AgQCBzZW5kZXIsIG9wXG4gICAgaWYgdW5kZWZpbmVkID09PSBhcGlfZm4gOjogcmV0dXJuXG5cbiAgICBjb25zdCByZXMgPSB0aGlzLmFuc3dlciBAIHNlbmRlciwgYXBpX2ZuLCBjYlxuICAgIHJldHVybiBhd2FpdCByZXNcblxuICBhc3luYyBpbnZva2VfZ2F0ZWQoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZ2F0ZSlcbiAgICAgIC50aGVuIEAgKCkgPT4gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICB0aGlzLmdhdGUgPSByZXMudGhlbihub29wLCBub29wKVxuICAgIHJldHVybiBhd2FpdCByZXNcblxuICBhc3luYyByZXNvbHZlX29wKHNlbmRlciwgb3ApIDo6XG4gICAgaWYgJ3N0cmluZycgIT09IHR5cGVvZiBvcCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogJ0ludmFsaWQgb3BlcmF0aW9uJywgY29kZTogNDAwXG4gICAgICByZXR1cm5cblxuICAgIHRyeSA6OlxuICAgICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5sb29rdXBfb3Aob3ApXG4gICAgICBpZiAhIGFwaV9mbiA6OlxuICAgICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdVbmtub3duIG9wZXJhdGlvbicsIGNvZGU6IDQwNFxuICAgICAgcmV0dXJuIGFwaV9mblxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogYEludmFsaWQgb3BlcmF0aW9uOiAke2Vyci5tZXNzYWdlfWAsIGNvZGU6IDUwMFxuXG4gIGFzeW5jIGFuc3dlcihzZW5kZXIsIGFwaV9mbiwgY2IpIDo6XG4gICAgdHJ5IDo6XG4gICAgICB2YXIgYW5zd2VyID0gY2IgPyBhd2FpdCBjYihhcGlfZm4pIDogYXdhaXQgYXBpX2ZuKClcbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IGVycl9mcm9tOiB0aGlzLmVycl9mcm9tLCBlcnJvcjogZXJyXG4gICAgICByZXR1cm4gZmFsc2VcblxuICAgIGlmIHNlbmRlci5yZXBseUV4cGVjdGVkIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBhbnN3ZXJcbiAgICByZXR1cm4gdHJ1ZVxuXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG4iLCJpbXBvcnQge2FkZF9lcF9raW5kLCBlcF9wcm90b30gZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgc2VydmVyKG9uX2luaXQpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgb25faW5pdFxuXG5leHBvcnQgKiBmcm9tICcuL2NsaWVudC5qc3knXG5leHBvcnQgKiBmcm9tICcuL2FwaS5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGVwX3Byb3RvXG4iLCJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIG1zZW5kIEAgdHJ1ZSwgYm9keVxuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gJ3NpbmdsZSdcbiAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIHBhY2tfaGRyKG9iailcbiAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCBmcm9tX2lkOnJfaWR9ID0gcGt0X3BpbmcuaW5mb1xuICAgIGNvbnN0IG9iaiA9IEB7fSBtc2dpZFxuICAgICAgZnJvbV9pZDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICBpZF9yb3V0ZXI6IHJfaWQuaWRfcm91dGVyLCBpZF90YXJnZXQ6IHJfaWQuaWRfdGFyZ2V0XG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgICBvcDogJ3BvbmcnLCB0czAsIHRzMTogbmV3IERhdGUoKVxuXG4gICAgcG9uZ19mcmFtZS5wYWNrKHBvbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gcm91dGVyLmRpc3BhdGNoIEAgW3BrdF1cblxuICBmdW5jdGlvbiByZWN2X3BvbmcocGt0LCBzaW5rKSA6OlxuICAgIHBvbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5pbXBvcnQgc2hhcmVkX3Byb3RvIGZyb20gJy4vc2hhcmVkLmpzeSdcbmltcG9ydCBqc29uX3Byb3RvIGZyb20gJy4vanNvbi5qc3knXG5pbXBvcnQgYmluYXJ5X3Byb3RvIGZyb20gJy4vYmluYXJ5LmpzeSdcbmltcG9ydCBjb250cm9sX3Byb3RvIGZyb20gJy4vY29udHJvbC5qc3knXG5cbmV4cG9ydCAqIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGluaXRfcHJvdG9jb2wocGFja2V0UGFyc2VyLCBvcHRpb25zKSA6OlxuICBjb25zdCBzaGFyZWQgPSBzaGFyZWRfcHJvdG8gQCBwYWNrZXRQYXJzZXIsIG9wdGlvbnNcblxuICBjb25zdCBpbmJvdW5kID0gW11cbiAgY29uc3QganNvbiA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDAwIC8vIDB4MCog4oCUIEpTT04gYm9keVxuICAgIGpzb25fcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGJpbmFyeSA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDEwIC8vIDB4MSog4oCUIGJpbmFyeSBib2R5XG4gICAgYmluYXJ5X3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBjb250cm9sID0gY29udHJvbF9wcm90byBAIGluYm91bmQsXG4gICAgMHhmMCAvLyAweGYqIOKAlCBjb250cm9sXG4gICAgc2hhcmVkXG5cbiAgY29uc3QgY29kZWNzID0gQDoganNvbiwgYmluYXJ5LCBjb250cm9sLCBkZWZhdWx0OiBqc29uXG5cbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgcmV0dXJuIEA6IGluYm91bmQsIGNvZGVjcywgcmFuZG9tX2lkXG5cblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG5cbiAganNvbl91bnBhY2sob2JqKSA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgRW5kcG9pbnQgYmluZFNpbmsoKSByZXNwb25zaWJpbGl0eWBcblxuIiwiZXhwb3J0IGRlZmF1bHQgRVBUYXJnZXRcbmV4cG9ydCBjbGFzcyBFUFRhcmdldCA6OlxuICBjb25zdHJ1Y3RvcihpZCkgOjogdGhpcy5pZCA9IGlkXG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlkLmFzRW5kcG9pbnRJZCA6OlxuICAgICAgaWQgPSBpZC5hc0VuZHBvaW50SWQoKVxuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RfanNvblxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cblxuRVBUYXJnZXQuanNvbl91bnBhY2tfeGZvcm0gPSBqc29uX3VucGFja194Zm9ybVxuZXhwb3J0IGZ1bmN0aW9uIGpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpIDo6XG4gIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXIoKVxuXG4gIGZ1bmN0aW9uIHJldml2ZXIoKSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBzdGF0aWMgZm9ySHViKGh1YiwgY2hhbm5lbCkgOjpcbiAgICBjb25zdCB7c2VuZFJhd30gPSBjaGFubmVsXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuX3NlbmQgPSBhc3luYyBwa3QgPT4gOjpcbiAgICAgIGF3YWl0IHNlbmRSYXcocGt0KVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIHJldHVybiBNc2dDdHhcblxuXG4gIGNvbnN0cnVjdG9yKGlkKSA6OlxuICAgIGlmIG51bGwgIT0gaWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBpZFxuICAgICAgY29uc3QgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIHRoaXMuY3R4ID0gQHt9IGZyb21faWRcblxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG5cbiAgICBjb25zdCByZXMgPSBpbnZva2UgQCB0aGlzLmNoYW5fc2VuZCwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgdGd0ID0gZXBfZGVjb2RlKHRndCkgfHwgdGd0XG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgc2VuZF9qc29uIGFzIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBqc29uX3NlbmQgPSBtc2dDb2RlY3MuanNvbi5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3RfanNvbjogQHt9IGdldCgpIDo6IHJldHVybiBAOlxuICAgICAgICBzZW5kOiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncylcbiAgICAgICAgc2VuZFF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSlcbiAgICAgICAgcXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gICAgcmV0dXJuIHRoaXNcblxuXG4gIHdpdGhSZWplY3RUaW1lb3V0KHBfcmVwbHkpIDo6XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHBfcmVwbHkudGhlbiBAIHJlc29sdmUsIHJlamVjdFxuICAgICAgcF9yZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG5cbiAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcbiAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy5tc190aW1lb3V0KVxuICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG5cbiAgICAgIGZ1bmN0aW9uIGNsZWFyKCkgOjogY2xlYXJUaW1lb3V0IEAgdGlkXG5cblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIE1zZ0N0eC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXQsIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IHtFUFRhcmdldCwgZXBfZW5jb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5lcF9zZWxmKCkudG9KU09OKClcbiAgZXBfc2VsZigpIDo6IHJldHVybiBuZXcgdGhpcy5FUFRhcmdldCh0aGlzLmlkKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuXG4gIGNvbnN0cnVjdG9yKGlkLCBtc2dfY3R4KSA6OlxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBpZDogQHt9IHZhbHVlOiBpZFxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcykudG9cblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUm91dGVDYWNoZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcbiAgICAgIGpzb25fdW5wYWNrOiB0aGlzLkVQVGFyZ2V0LmFzX2pzb25fdW5wYWNrKHRoaXMudG8pXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgYXNfdGFyZ2V0KGlkKSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG9cbiAgYXNfc2VuZGVyKHtmcm9tX2lkOmlkLCBtc2dpZH0pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50bywgbXNnaWRcblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc19zZW5kZXIoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogdGhpcy5wYXJ0cy5qb2luKCcnKTsgLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBwX3NlbnQsIG1zZ19jdHhcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIGxldCByZXBseSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIHBfc2VudC5jYXRjaCBAIHJlamVjdFxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgcmVwbHkgPSBtc2dfY3R4LndpdGhSZWplY3RUaW1lb3V0KHJlcGx5KVxuXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiB0aGlzLmJ5X3Rva2VuLmRlbGV0ZSBAIHRva2VuXG4gICAgcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuICAgIHJldHVybiByZXBseVxuXG5FbmRwb2ludC5wcm90b3R5cGUuRVBUYXJnZXQgPSBFUFRhcmdldFxuIiwiaW1wb3J0IGVwX3Byb3RvIGZyb20gJy4vZXBfa2luZHMvaW5kZXguanN5J1xuaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBwbHVnaW5fbmFtZTogJ2VuZHBvaW50J1xuICBvbl9tc2coe21zZywgcmVwbHksIGluZm99KSA6OlxuICAgIGNvbnNvbGUud2FybiBAICdFTkRQT0lOVCBNU0c6JywgQHt9IG1zZywgcmVwbHksIGluZm9cbiAgb25fZXJyb3IoZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnJcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIGNvbnNvbGUuZXJyb3IgQCBgRU5EUE9JTlQgU0hVVERPV046ICR7ZXJyLm1lc3NhZ2V9YFxuXG4gIHN1YmNsYXNzKGNsYXNzZXMpIDo6XG4gICAgLy9jb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG4gIGpzb25fcGFjazogSlNPTi5zdHJpbmdpZnlcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBwbHVnaW5fbmFtZSwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICAgIGNyZWF0ZU1hcFxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgaWYgcGx1Z2luX29wdGlvbnMuZXBfa2luZHMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVbcGx1Z2luX25hbWVdID1cbiAgICAgIGJpbmRFbmRwb2ludEFwaSBAIHBhY2tldFBhcnNlclxuXG4gIGZ1bmN0aW9uIHBvc3QoaHViKSA6OlxuICAgIHJldHVybiBodWJbcGx1Z2luX25hbWVdID0gaHViW3BsdWdpbl9uYW1lXShodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3BhY2tcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4OiBNc2dDdHhfcGl9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6IHByb3RvY29sc1xuICAgICAgICBTaW5rOiBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBNc2dDdHg6IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgRW5kcG9pbnQ6IEVuZHBvaW50QmFzZS5zdWJjbGFzcyh7Y3JlYXRlTWFwfSlcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICBjb25zdCBjaGFubmVsID0gaHViLmNvbm5lY3Rfc2VsZigpXG4gICAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhfcGkuZm9ySHViKGh1YiwgY2hhbm5lbClcblxuICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mIEAgZW5kcG9pbnQsIGVwX3Byb3RvXG4gICAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBlbmRwb2ludCwgY3JlYXRlLCBNc2dDdHhcbiAgICAgIHJldHVybiBlbmRwb2ludFxuXG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBodWIucm91dGVyLnRhcmdldHNcbiAgICAgICAgZG8gdmFyIGlkX3RhcmdldCA9IHJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBpZFxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludCBAIGlkLCBtc2dfY3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQFxuICAgICAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIG9uX2luaXRcbiAgICAgICAgICAgICAgPyBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgICAgIDogb25faW5pdFxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICAvLyBBbGxvdyBmb3IgYm90aCBpbnRlcm5hbCBhbmQgZXh0ZXJuYWwgZXJyb3IgaGFuZGxpbmcgYnkgZm9ya2luZyByZWFkeS5jYXRjaFxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PiBoYW5kbGVycy5vbl9lcnJvciBAIGVyciwgQHt9IHpvbmU6J29uX3JlYWR5J1xuXG4gICAgICAgIDo6XG4gICAgICAgICAgY29uc3QgZXBfdGd0ID0gZXAuZXBfc2VsZigpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuIiwiaW1wb3J0IHtyYW5kb21CeXRlc30gZnJvbSAnY3J5cHRvJ1xuaW1wb3J0IGVuZHBvaW50X3BsdWdpbiBmcm9tICcuL3BsdWdpbi5qc3knXG5cbmVuZHBvaW50X25vZGVqcy5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIHJldHVybiByYW5kb21CeXRlcyg0KS5yZWFkSW50MzJMRSgpXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGVuZHBvaW50X25vZGVqcyhwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iXSwibmFtZXMiOlsiZXBfcHJvdG8iLCJPYmplY3QiLCJjcmVhdGUiLCJnZXRQcm90b3R5cGVPZiIsImFkZF9lcF9raW5kIiwia2luZHMiLCJhc3NpZ24iLCJhcGkiLCJ0YXJnZXQiLCJjbGllbnRFbmRwb2ludCIsImVuZHBvaW50IiwiZG9uZSIsImFyZ3MiLCJsZW5ndGgiLCJtc2dfY3R4IiwiTXNnQ3R4IiwidG8iLCJlcF9jbGllbnRfYXBpIiwib25fcmVhZHkiLCJlcCIsImh1YiIsIl9yZXNvbHZlIiwib25fY2xpZW50X3JlYWR5Iiwic2h1dGRvd24iLCJlcnIiLCJfcmVqZWN0IiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJhcGlfZW5kcG9pbnRzIiwicGFyYWxsZWwiLCJpbm9yZGVyIiwicnBjIiwiYmluZF9ycGMiLCJvbl9tc2ciLCJtc2ciLCJzZW5kZXIiLCJpbnZva2UiLCJvcCIsImFwaV9mbiIsImt3IiwiY3R4IiwiaW52b2tlX2dhdGVkIiwicGZ4Iiwib3BfcHJlZml4IiwibG9va3VwX29wIiwib3BfbG9va3VwIiwiZm4iLCJiaW5kIiwicnBjX2FwaSIsInZhbHVlIiwiZXBfc2VsZiIsImNiIiwicmVzb2x2ZV9vcCIsInVuZGVmaW5lZCIsInJlcyIsImFuc3dlciIsImdhdGUiLCJ0aGVuIiwibm9vcCIsInNlbmQiLCJlcnJfZnJvbSIsIm1lc3NhZ2UiLCJjb2RlIiwiZXJyb3IiLCJyZXBseUV4cGVjdGVkIiwib25faW5pdCIsImxpdHRsZV9lbmRpYW4iLCJjX3NpbmdsZSIsImNfZGF0YWdyYW0iLCJjX2RpcmVjdCIsImNfbXVsdGlwYXJ0IiwiY19zdHJlYW1pbmciLCJfZXJyX21zZ2lkX3JlcXVpcmVkIiwiX2Vycl90b2tlbl9yZXF1aXJlZCIsImZybV9yb3V0aW5nIiwic2l6ZSIsImJpdHMiLCJtYXNrIiwib2JqIiwiZnJvbV9pZCIsImR2Iiwib2Zmc2V0Iiwic2V0SW50MzIiLCJpZF9yb3V0ZXIiLCJpZF90YXJnZXQiLCJnZXRJbnQzMiIsImZybV9yZXNwb25zZSIsIm1zZ2lkIiwiRXJyb3IiLCJzZXRJbnQxNiIsInNlcV9hY2siLCJhY2tfZmxhZ3MiLCJ0b2tlbiIsImdldEludDE2IiwiZnJtX2RhdGFncmFtIiwidHJhbnNwb3J0IiwiZnJtX2RpcmVjdCIsImZybV9tdWx0aXBhcnQiLCJzZXFfcG9zIiwic2VxIiwic2VxX2ZsYWdzIiwiZnJtX3N0cmVhbWluZyIsImJpbmRfc2VxX25leHQiLCJzZXFfb2Zmc2V0Iiwic2VxX25leHQiLCJmbGFncyIsImZpbiIsIk5hTiIsImNvbXBvc2VGcmFtaW5ncyIsImZybV9mcm9tIiwiZnJtX3Jlc3AiLCJmcm1fdHJhbnNwb3J0cyIsImJ5Qml0cyIsInRfZnJvbSIsImZfdGVzdCIsInRfcmVzcCIsInQwIiwidDEiLCJ0MiIsInQzIiwibWFwIiwiZiIsInRlc3RCaXRzIiwiY2hvb3NlIiwibHN0IiwiVCIsImIiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwib25fZXJyb3IiLCJmZWVkX2JvZHkiLCJkYXRhIiwib25fZGF0YSIsIm9uX2VuZCIsImZlZWRfc2VxIiwibmV4dF9oZHIiLCJpIiwibGFzdElubmVyIiwiYnl0ZUxlbmd0aCIsImkwIiwiYm9keSIsImJpbmRUcmFuc3BvcnRJbXBscyIsImluYm91bmQiLCJoaWdoYml0cyIsInRyYW5zcG9ydHMiLCJvdXRib3VuZCIsImZyYW1pbmdzIiwiZnJhbWUiLCJpbXBsIiwidF9yZWN2IiwicGFja19oZHIiLCJyZWN2X21zZyIsImJpbmRUcmFuc3BvcnRzIiwicGFja0JvZHkiLCJzdHJlYW1pbmciLCJzdHJlYW0iLCJiaW5kX3N0cmVhbSIsIm1vZGUiLCJjaGFuIiwibXNlbmQiLCJtc2VuZF9ieXRlcyIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fc2h1dGRvd24iLCJhbGl2ZSIsInByb3RvY29sIiwiaXNBbGl2ZSIsImV4dHJhIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZ2V0Iiwic2V0IiwiZGVsZXRlIiwiRVBUYXJnZXQiLCJpZCIsImVwX2VuY29kZSIsImFzX2pzb25fdW5wYWNrIiwibXNnX2N0eF90byIsInhmb3JtQnlLZXkiLCJ2IiwiZnJvbV9jdHgiLCJlcF9kZWNvZGUiLCJqc29uX3VucGFja194Zm9ybSIsImFzRW5kcG9pbnRJZCIsImVwX3RndCIsImZhc3QiLCJpbml0IiwiZmFzdF9qc29uIiwiZGVmaW5lUHJvcGVydGllcyIsInF1ZXJ5Iiwic2ltcGxlIiwiciIsInQiLCJ0b1N0cmluZyIsInNwbGl0IiwicGFyc2VJbnQiLCJzeiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJ4Zm4iLCJ2Zm4iLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJmcmVlemUiLCJfaW52b2tlX2V4IiwiX21zZ0NvZGVjcyIsIl9jb2RlYyIsInJlcGx5IiwiZm5PcktleSIsImFzc2VydE1vbml0b3IiLCJwX3NlbnQiLCJpbml0UmVwbHkiLCJ0Z3QiLCJzZWxmIiwiY2xvbmUiLCJyZXBseV9pZCIsIndpdGgiLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJtb25pdG9yIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRpZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNvZGVjIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJ1bnJlZiIsImNsZWFyIiwiY2xlYXJJbnRlcnZhbCIsIm1zZ19jb2RlYyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwianNvbl9zZW5kIiwicF9yZXBseSIsInRpbWVvdXQiLCJSZXBseVRpbWVvdXQiLCJzZXRUaW1lb3V0IiwibXNfdGltZW91dCIsIkVuZHBvaW50Iiwic3ViY2xhc3MiLCJleHRlbnNpb25zIiwidG9KU09OIiwid2l0aEVuZHBvaW50IiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJpc19yZXBseSIsImFzX3NlbmRlciIsIndhcm4iLCJpbml0UmVwbHlQcm9taXNlIiwiY2F0Y2giLCJ3aXRoUmVqZWN0VGltZW91dCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJjbGFzc2VzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwiZXBfa2luZHMiLCJvcmRlciIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwicGx1Z2luX25hbWUiLCJiaW5kRW5kcG9pbnRBcGkiLCJwcm90b2NvbHMiLCJNc2dDdHhfcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJjb25uZWN0X3NlbGYiLCJzZXRQcm90b3R5cGVPZiIsInRhcmdldHMiLCJoYXMiLCJpZF9zZWxmIiwicmVhZHkiLCJfYWZ0ZXJfaW5pdCIsInJlZ2lzdGVyIiwiZW5kcG9pbnRfbm9kZWpzIiwicmFuZG9tQnl0ZXMi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
