'use strict';

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

module.exports = endpoint_browser;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci5qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9lcF9raW5kcy9leHRlbnNpb25zLmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvY2xpZW50LmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvYXBpLmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvaW5kZXguanN5IiwiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiLCIuLi9jb2RlL2luZGV4LmJyb3dzZXIuanN5Il0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjb25zdCBlcF9wcm90byA9IE9iamVjdC5jcmVhdGUgQCBPYmplY3QuZ2V0UHJvdG90eXBlT2YgQCBmdW5jdGlvbigpe31cbmV4cG9ydCBmdW5jdGlvbiBhZGRfZXBfa2luZChraW5kcykgOjpcbiAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBraW5kc1xuZXhwb3J0IGRlZmF1bHQgYWRkX2VwX2tpbmRcbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBjbGllbnRFbmRwb2ludChhcGkpIDo6XG4gICAgY29uc3QgdGFyZ2V0ID0gY2xpZW50RW5kcG9pbnQoYXBpKVxuICAgIHRoaXMuZW5kcG9pbnQgQCB0YXJnZXRcbiAgICByZXR1cm4gdGFyZ2V0LmRvbmVcblxuICBjbGllbnQoLi4uYXJncykgOjpcbiAgICBpZiAxID09PSBhcmdzLmxlbmd0aCAmJiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXJnc1swXSA6OlxuICAgICAgcmV0dXJuIHRoaXMuY2xpZW50RW5kcG9pbnQgQCBhcmdzWzBdXG5cbiAgICBjb25zdCBtc2dfY3R4ID0gbmV3IHRoaXMuTXNnQ3R4KClcbiAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGggPyBtc2dfY3R4LnRvKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG5cbmNvbnN0IGVwX2NsaWVudF9hcGkgPSBAe31cbiAgYXN5bmMgb25fcmVhZHkoZXAsIGh1YikgOjpcbiAgICB0aGlzLl9yZXNvbHZlIEAgYXdhaXQgdGhpcy5vbl9jbGllbnRfcmVhZHkoZXAsIGh1YilcbiAgICBhd2FpdCBlcC5zaHV0ZG93bigpXG4gIG9uX3NlbmRfZXJyb3IoZXAsIGVycikgOjpcbiAgICB0aGlzLl9yZWplY3QoZXJyKVxuICBvbl9zaHV0ZG93bihlcCwgZXJyKSA6OlxuICAgIGVyciA/IHRoaXMuX3JlamVjdChlcnIpIDogdGhpcy5fcmVzb2x2ZSgpXG5cbmV4cG9ydCBmdW5jdGlvbiBjbGllbnRFbmRwb2ludChvbl9jbGllbnRfcmVhZHkpIDo6XG4gIGxldCB0YXJnZXQgPSBPYmplY3QuY3JlYXRlIEAgZXBfY2xpZW50X2FwaVxuICB0YXJnZXQub25fY2xpZW50X3JlYWR5ID0gb25fY2xpZW50X3JlYWR5XG4gIHRhcmdldC5kb25lID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgIHRhcmdldC5fcmVzb2x2ZSA9IHJlc29sdmVcbiAgICB0YXJnZXQuX3JlamVjdCA9IHJlamVjdFxuICByZXR1cm4gdGFyZ2V0XG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgYXBpKGFwaSkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBhcGlfZW5kcG9pbnRzLnBhcmFsbGVsKGFwaSlcbiAgYXBpX3BhcmFsbGVsKGFwaSkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBhcGlfZW5kcG9pbnRzLnBhcmFsbGVsKGFwaSlcbiAgYXBpX2lub3JkZXIoYXBpKSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGFwaV9lbmRwb2ludHMuaW5vcmRlcihhcGkpXG5cblxuZXhwb3J0IGNvbnN0IGFwaV9lbmRwb2ludHMgPSBAe31cbiAgcGFyYWxsZWwoYXBpKSA6OlxuICAgIHJldHVybiBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9lbmRwb2ludHMuYmluZF9ycGMoYXBpLCBlcCwgaHViKVxuICAgICAgcmV0dXJuIEB7fSBycGMsXG4gICAgICAgIGFzeW5jIG9uX21zZyh7bXNnLCBzZW5kZXJ9KSA6OlxuICAgICAgICAgIGF3YWl0IHJwYy5pbnZva2UgQCBzZW5kZXIsIG1zZy5vcCxcbiAgICAgICAgICAgIGFwaV9mbiA9PiBhcGlfZm4obXNnLmt3LCBtc2cuY3R4KVxuXG4gIGlub3JkZXIoYXBpKSA6OlxuICAgIHJldHVybiBmdW5jdGlvbiAoZXAsIGh1YikgOjpcbiAgICAgIGNvbnN0IHJwYyA9IGFwaV9lbmRwb2ludHMuYmluZF9ycGMoYXBpLCBlcCwgaHViKVxuICAgICAgcmV0dXJuIEB7fSBycGMsXG4gICAgICAgIGFzeW5jIG9uX21zZyh7bXNnLCBzZW5kZXJ9KSA6OlxuICAgICAgICAgIGF3YWl0IHJwYy5pbnZva2VfZ2F0ZWQgQCBzZW5kZXIsIG1zZy5vcCxcbiAgICAgICAgICAgIGFwaV9mbiA9PiBhcGlfZm4obXNnLmt3LCBtc2cuY3R4KVxuXG4gIGJpbmRfcnBjKGFwaSwgZXAsIGh1YikgOjpcbiAgICBjb25zdCBwZnggPSBhcGkub3BfcHJlZml4IHx8ICdycGNfJ1xuICAgIGNvbnN0IGxvb2t1cF9vcCA9IGFwaS5vcF9sb29rdXBcbiAgICAgID8gb3AgPT4gYXBpLm9wX2xvb2t1cChwZnggKyBvcCwgZXAsIGh1YilcbiAgICAgIDogJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFwaVxuICAgICAgPyBvcCA9PiBhcGkocGZ4ICsgb3AsIGVwLCBodWIpXG4gICAgICA6IG9wID0+IDo6XG4gICAgICAgICAgY29uc3QgZm4gPSBhcGlbcGZ4ICsgb3BdXG4gICAgICAgICAgcmV0dXJuIGZuID8gZm4uYmluZChhcGkpIDogZm5cblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgcnBjX2FwaSwgQHt9XG4gICAgICBsb29rdXBfb3A6IEB7fSB2YWx1ZTogbG9va3VwX29wXG4gICAgICBlcnJfZnJvbTogQHt9IHZhbHVlOiBlcC5lcF9zZWxmKClcblxuXG5jb25zdCBycGNfYXBpID0gQDpcbiAgYXN5bmMgaW52b2tlKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgcmV0dXJuIGF3YWl0IHJlc1xuXG4gIGFzeW5jIGludm9rZV9nYXRlZChzZW5kZXIsIG9wLCBjYikgOjpcbiAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLnJlc29sdmVfb3AgQCBzZW5kZXIsIG9wXG4gICAgaWYgdW5kZWZpbmVkID09PSBhcGlfZm4gOjogcmV0dXJuXG5cbiAgICBjb25zdCByZXMgPSBQcm9taXNlLnJlc29sdmUodGhpcy5nYXRlKVxuICAgICAgLnRoZW4gQCAoKSA9PiB0aGlzLmFuc3dlciBAIHNlbmRlciwgYXBpX2ZuLCBjYlxuICAgIHRoaXMuZ2F0ZSA9IHJlcy50aGVuKG5vb3AsIG5vb3ApXG4gICAgcmV0dXJuIGF3YWl0IHJlc1xuXG4gIGFzeW5jIHJlc29sdmVfb3Aoc2VuZGVyLCBvcCkgOjpcbiAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIG9wIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnSW52YWxpZCBvcGVyYXRpb24nLCBjb2RlOiA0MDBcbiAgICAgIHJldHVyblxuXG4gICAgdHJ5IDo6XG4gICAgICBjb25zdCBhcGlfZm4gPSBhd2FpdCB0aGlzLmxvb2t1cF9vcChvcClcbiAgICAgIGlmICEgYXBpX2ZuIDo6XG4gICAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogJ1Vua25vd24gb3BlcmF0aW9uJywgY29kZTogNDA0XG4gICAgICByZXR1cm4gYXBpX2ZuXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IHRoaXMuZXJyX2Zyb21cbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiBgSW52YWxpZCBvcGVyYXRpb246ICR7ZXJyLm1lc3NhZ2V9YCwgY29kZTogNTAwXG5cbiAgYXN5bmMgYW5zd2VyKHNlbmRlciwgYXBpX2ZuLCBjYikgOjpcbiAgICB0cnkgOjpcbiAgICAgIHZhciBhbnN3ZXIgPSBjYiA/IGF3YWl0IGNiKGFwaV9mbikgOiBhd2FpdCBhcGlfZm4oKVxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogZXJyX2Zyb206IHRoaXMuZXJyX2Zyb20sIGVycm9yOiBlcnJcbiAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgaWYgc2VuZGVyLnJlcGx5RXhwZWN0ZWQgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IGFuc3dlclxuICAgIHJldHVybiB0cnVlXG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbiIsImltcG9ydCB7YWRkX2VwX2tpbmQsIGVwX3Byb3RvfSBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBzZXJ2ZXIob25faW5pdCkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBvbl9pbml0XG5cbmV4cG9ydCAqIGZyb20gJy4vY2xpZW50LmpzeSdcbmV4cG9ydCAqIGZyb20gJy4vYXBpLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZXBfcHJvdG9cbiIsImNvbnN0IGxpdHRsZV9lbmRpYW4gPSB0cnVlXG5jb25zdCBjX3NpbmdsZSA9ICdzaW5nbGUnXG5jb25zdCBjX2RhdGFncmFtID0gJ2RhdGFncmFtJ1xuY29uc3QgY19kaXJlY3QgPSAnZGlyZWN0J1xuY29uc3QgY19tdWx0aXBhcnQgPSAnbXVsdGlwYXJ0J1xuY29uc3QgY19zdHJlYW1pbmcgPSAnc3RyZWFtaW5nJ1xuXG5jb25zdCBfZXJyX21zZ2lkX3JlcXVpcmVkID0gYFJlc3BvbnNlIHJlcWlyZXMgJ21zZ2lkJ2BcbmNvbnN0IF9lcnJfdG9rZW5fcmVxdWlyZWQgPSBgVHJhbnNwb3J0IHJlcWlyZXMgJ3Rva2VuJ2BcblxuXG5mdW5jdGlvbiBmcm1fcm91dGluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgxLCBtYXNrID0gMHgxXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmouZnJvbV9pZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkfSA9IG9ialxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgMHxmcm9tX2lkLmlkX3JvdXRlciwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MzIgQCA0K29mZnNldCwgMHxmcm9tX2lkLmlkX3RhcmdldCwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3QgZnJvbV9pZCA9IHVuZGVmaW5lZCA9PT0gb2JqLmZyb21faWRcbiAgICAgICAgPyBvYmouZnJvbV9pZCA9IHt9IDogb2JqLmZyb21faWRcbiAgICAgIGZyb21faWQuaWRfcm91dGVyID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgZnJvbV9pZC5pZF90YXJnZXQgPSBkdi5nZXRJbnQzMiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cbmZ1bmN0aW9uIGZybV9yZXNwb25zZSgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgyLCBtYXNrID0gMHgyXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmoubXNnaWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai5tc2dpZCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX21zZ2lkX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoubXNnaWQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcV9hY2ssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLmFja19mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRva2VuID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9hY2sgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouYWNrX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5cblxuZnVuY3Rpb24gZnJtX2RhdGFncmFtKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDAsIGJpdHMgPSAweDAsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGF0YWdyYW1cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kYXRhZ3JhbSA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RhdGFncmFtXG5cbmZ1bmN0aW9uIGZybV9kaXJlY3QoKSA6OlxuICBjb25zdCBzaXplID0gNCwgYml0cyA9IDB4NCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kaXJlY3RcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kaXJlY3QgPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kaXJlY3RcblxuZnVuY3Rpb24gZnJtX211bHRpcGFydCgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHg4LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX211bHRpcGFydFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX211bHRpcGFydCA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OiAvLyB1c2Ugc2VxX25leHRcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhblxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfbXVsdGlwYXJ0XG5cbmZ1bmN0aW9uIGZybV9zdHJlYW1pbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4YywgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19zdHJlYW1pbmdcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19zdHJlYW1pbmcgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjpcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhbiAvLyB1c2Ugc2VxX25leHRcbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX3N0cmVhbWluZ1xuXG5cbmZ1bmN0aW9uIGJpbmRfc2VxX25leHQob2Zmc2V0KSA6OlxuICBjb25zdCBzZXFfb2Zmc2V0ID0gdGhpcy5zZXFfcG9zICsgb2Zmc2V0XG4gIGxldCBzZXEgPSAxXG4gIHJldHVybiBmdW5jdGlvbiBzZXFfbmV4dCh7ZmxhZ3MsIGZpbn0sIGR2KSA6OlxuICAgIGlmICEgZmluIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIHNlcSsrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgIGVsc2UgOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgLXNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICAgIHNlcSA9IE5hTlxuXG5cblxuZXhwb3J0IGRlZmF1bHQgY29tcG9zZUZyYW1pbmdzKClcbmZ1bmN0aW9uIGNvbXBvc2VGcmFtaW5ncygpIDo6XG4gIGNvbnN0IGZybV9mcm9tID0gZnJtX3JvdXRpbmcoKSwgZnJtX3Jlc3AgPSBmcm1fcmVzcG9uc2UoKVxuICBjb25zdCBmcm1fdHJhbnNwb3J0cyA9IEBbXSBmcm1fZGF0YWdyYW0oKSwgZnJtX2RpcmVjdCgpLCBmcm1fbXVsdGlwYXJ0KCksIGZybV9zdHJlYW1pbmcoKVxuXG4gIGlmIDggIT09IGZybV9mcm9tLnNpemUgfHwgOCAhPT0gZnJtX3Jlc3Auc2l6ZSB8fCA0ICE9IGZybV90cmFuc3BvcnRzLmxlbmd0aCA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBGcmFtaW5nIFNpemUgY2hhbmdlYFxuXG4gIGNvbnN0IGJ5Qml0cyA9IFtdLCBtYXNrPTB4ZlxuXG4gIDo6XG4gICAgY29uc3QgdF9mcm9tID0gZnJtX2Zyb20uZl90ZXN0LCB0X3Jlc3AgPSBmcm1fcmVzcC5mX3Rlc3RcbiAgICBjb25zdCBbdDAsdDEsdDIsdDNdID0gZnJtX3RyYW5zcG9ydHMubWFwIEAgZj0+Zi5mX3Rlc3RcblxuICAgIGNvbnN0IHRlc3RCaXRzID0gYnlCaXRzLnRlc3RCaXRzID0gb2JqID0+XG4gICAgICAwIHwgdF9mcm9tKG9iaikgfCB0X3Jlc3Aob2JqKSB8IHQwKG9iaikgfCB0MShvYmopIHwgdDIob2JqKSB8IHQzKG9iailcblxuICAgIGJ5Qml0cy5jaG9vc2UgPSBmdW5jdGlvbiAob2JqLCBsc3QpIDo6XG4gICAgICBpZiBudWxsID09IGxzdCA6OiBsc3QgPSB0aGlzIHx8IGJ5Qml0c1xuICAgICAgcmV0dXJuIGxzdFt0ZXN0Qml0cyhvYmopXVxuXG5cbiAgZm9yIGNvbnN0IFQgb2YgZnJtX3RyYW5zcG9ydHMgOjpcbiAgICBjb25zdCB7Yml0czpiLCBzaXplLCB0cmFuc3BvcnR9ID0gVFxuXG4gICAgYnlCaXRzW2J8MF0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDAsIG1hc2ssIHNpemU6IHNpemUsIG9wOiAnJ1xuICAgIGJ5Qml0c1tifDFdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwxLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdmJ1xuICAgIGJ5Qml0c1tifDJdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwyLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdyJ1xuICAgIGJ5Qml0c1tifDNdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwzLCBtYXNrLCBzaXplOiAxNiArIHNpemUsIG9wOiAnZnInXG5cbiAgICBmb3IgY29uc3QgZm5fa2V5IG9mIFsnZl9wYWNrJywgJ2ZfdW5wYWNrJ10gOjpcbiAgICAgIGNvbnN0IGZuX3RyYW4gPSBUW2ZuX2tleV0sIGZuX2Zyb20gPSBmcm1fZnJvbVtmbl9rZXldLCBmbl9yZXNwID0gZnJtX3Jlc3BbZm5fa2V5XVxuXG4gICAgICBieUJpdHNbYnwwXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fdHJhbihvYmosIGR2LCAwKVxuICAgICAgYnlCaXRzW2J8MV1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDJdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9yZXNwKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwzXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fcmVzcChvYmosIGR2LCA4KTsgZm5fdHJhbihvYmosIGR2LCAxNilcblxuICBmb3IgY29uc3QgZnJtIG9mIGJ5Qml0cyA6OlxuICAgIGJpbmRBc3NlbWJsZWQgQCBmcm1cblxuICByZXR1cm4gYnlCaXRzXG5cblxuZnVuY3Rpb24gYmluZEFzc2VtYmxlZChmcm0pIDo6XG4gIGNvbnN0IHtULCBzaXplLCBmX3BhY2ssIGZfdW5wYWNrfSA9IGZybVxuICBpZiBULmJpbmRfc2VxX25leHQgOjpcbiAgICBmcm0uc2VxX25leHQgPSBULmJpbmRfc2VxX25leHQgQCBmcm0uc2l6ZSAtIFQuc2l6ZVxuXG4gIGRlbGV0ZSBmcm0uVFxuICBmcm0ucGFjayA9IHBhY2sgOyBmcm0udW5wYWNrID0gdW5wYWNrXG4gIGNvbnN0IHNlcV9uZXh0ID0gZnJtLnNlcV9uZXh0XG5cbiAgZnVuY3Rpb24gcGFjayhwa3RfdHlwZSwgcGt0X29iaikgOjpcbiAgICBpZiAhIEAgMCA8PSBwa3RfdHlwZSAmJiBwa3RfdHlwZSA8PSAyNTUgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGt0X3R5cGUgdG8gYmUgWzAuLjI1NV1gXG5cbiAgICBwa3Rfb2JqLnR5cGUgPSBwa3RfdHlwZVxuICAgIGlmIHNlcV9uZXh0ICYmIG51bGwgPT0gcGt0X29iai5zZXEgOjpcbiAgICAgIHBrdF9vYmouc2VxID0gdHJ1ZVxuXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgQXJyYXlCdWZmZXIoc2l6ZSlcbiAgICBmX3BhY2socGt0X29iaiwgZHYsIDApXG4gICAgcGt0X29iai5oZWFkZXIgPSBkdi5idWZmZXJcblxuICAgIGlmIHRydWUgPT09IHBrdF9vYmouc2VxIDo6XG4gICAgICBfYmluZF9pdGVyYWJsZSBAIHBrdF9vYmosIGR2LmJ1ZmZlci5zbGljZSgwLHNpemUpXG5cbiAgZnVuY3Rpb24gdW5wYWNrKHBrdCkgOjpcbiAgICBjb25zdCBidWYgPSBwa3QuaGVhZGVyX2J1ZmZlcigpXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgVWludDhBcnJheShidWYpLmJ1ZmZlclxuXG4gICAgY29uc3QgaW5mbyA9IHt9XG4gICAgZl91bnBhY2soaW5mbywgZHYsIDApXG4gICAgcmV0dXJuIHBrdC5pbmZvID0gaW5mb1xuXG4gIGZ1bmN0aW9uIF9iaW5kX2l0ZXJhYmxlKHBrdF9vYmosIGJ1Zl9jbG9uZSkgOjpcbiAgICBjb25zdCB7dHlwZX0gPSBwa3Rfb2JqXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0LCB0dGwsIHRva2VufSA9IHBrdF9vYmpcbiAgICBwa3Rfb2JqLm5leHQgPSBuZXh0XG5cbiAgICBmdW5jdGlvbiBuZXh0KG9wdGlvbnMpIDo6XG4gICAgICBpZiBudWxsID09IG9wdGlvbnMgOjogb3B0aW9ucyA9IHt9XG4gICAgICBjb25zdCBoZWFkZXIgPSBidWZfY2xvbmUuc2xpY2UoKVxuICAgICAgc2VxX25leHQgQCBvcHRpb25zLCBuZXcgRGF0YVZpZXcgQCBoZWFkZXJcbiAgICAgIHJldHVybiBAe30gZG9uZTogISEgb3B0aW9ucy5maW4sIHZhbHVlOiBAe30gLy8gcGt0X29ialxuICAgICAgICBpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHlwZSwgdHRsLCB0b2tlbiwgaGVhZGVyXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwYWNrZXRQYXJzZXIsIG9wdGlvbnMsIGZyYWdtZW50X3NpemUpIDo6XG4gIGNvbnN0IHtjb25jYXRCdWZmZXJzLCBwYWNrUGFja2V0T2JqLCBwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHBhY2tldFBhcnNlclxuICBmcmFnbWVudF9zaXplID0gTnVtYmVyKGZyYWdtZW50X3NpemUgfHwgODAwMClcbiAgaWYgMTAyNCA+IGZyYWdtZW50X3NpemUgfHwgNjUwMDAgPCBmcmFnbWVudF9zaXplIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgZnJhZ21lbnQgc2l6ZTogJHtmcmFnbWVudF9zaXplfWBcblxuICBjb25zdCB7cmFuZG9tX2lkLCBqc29uX3BhY2t9ID0gb3B0aW9uc1xuICByZXR1cm4gQDogcGFja2V0UGFyc2VyLCByYW5kb21faWQsIGpzb25fcGFja1xuICAgIGNyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBwYWNrZXRGcmFnbWVudHNcbiAgICBiaW5kVHJhbnNwb3J0c1xuXG5cbiAgZnVuY3Rpb24gY3JlYXRlTXVsdGlwYXJ0KHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IHBhcnRzID0gW10sIGZpbiA9IGZhbHNlXG4gICAgcmV0dXJuIEB7fSBmZWVkLCBpbmZvOiBwa3QuaW5mb1xuXG4gICAgZnVuY3Rpb24gZmVlZChwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPCAwIDo6IGZpbiA9IHRydWU7IHNlcSA9IC1zZXFcbiAgICAgIHBhcnRzW3NlcS0xXSA9IHBrdC5ib2R5X2J1ZmZlcigpXG5cbiAgICAgIGlmICEgZmluIDo6IHJldHVyblxuICAgICAgaWYgcGFydHMuaW5jbHVkZXMgQCB1bmRlZmluZWQgOjogcmV0dXJuXG5cbiAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG5cbiAgICAgIGNvbnN0IHJlcyA9IGNvbmNhdEJ1ZmZlcnMocGFydHMpXG4gICAgICBwYXJ0cyA9IG51bGxcbiAgICAgIHJldHVybiByZXNcblxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0ocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgbmV4dD0wLCBmaW4gPSBmYWxzZSwgcmVjdkRhdGEsIHJzdHJlYW1cbiAgICBjb25zdCBzdGF0ZSA9IEB7fSBmZWVkOiBmZWVkX2luaXQsIGluZm86IHBrdC5pbmZvXG4gICAgcmV0dXJuIHN0YXRlXG5cbiAgICBmdW5jdGlvbiBmZWVkX2luaXQocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG5cbiAgICAgIGNvbnN0IGluZm8gPSBwa3QuaW5mb1xuICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuICAgICAgcnN0cmVhbSA9IHNpbmsucmVjdlN0cmVhbShtc2csIGluZm8pXG4gICAgICBpZiBudWxsID09IHJzdHJlYW0gOjogcmV0dXJuXG4gICAgICBjaGVja19mbnMgQCByc3RyZWFtLCAnb25fZXJyb3InLCAnb25fZGF0YScsICdvbl9lbmQnIFxuICAgICAgcmVjdkRhdGEgPSBzaW5rLnJlY3ZTdHJlYW1EYXRhLmJpbmQoc2luaywgcnN0cmVhbSwgaW5mbylcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2JvZHlcbiAgICAgIGlmIHJzdHJlYW0ub25faW5pdCA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9pbml0KG1zZywgcGt0KVxuXG4gICAgZnVuY3Rpb24gZmVlZF9ib2R5KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHJlY3ZEYXRhKClcbiAgICAgIGxldCBkYXRhXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgICBkYXRhID0gYXNfY29udGVudChwa3QsIHNpbmspXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBpZiBmaW4gOjpcbiAgICAgICAgY29uc3QgcmVzID0gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2VuZCBAIHJlcywgcGt0XG4gICAgICBlbHNlIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcblxuICAgIGZ1bmN0aW9uIGZlZWRfaWdub3JlKHBrdCkgOjpcbiAgICAgIHRyeSA6OiBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcblxuICAgIGZ1bmN0aW9uIGZlZWRfc2VxKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA+PSAwIDo6XG4gICAgICAgIGlmIG5leHQrKyA9PT0gc2VxIDo6XG4gICAgICAgICAgcmV0dXJuIC8vIGluIG9yZGVyXG4gICAgICBlbHNlIDo6XG4gICAgICAgIGZpbiA9IHRydWVcbiAgICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcbiAgICAgICAgaWYgbmV4dCA9PT0gLXNlcSA6OlxuICAgICAgICAgIG5leHQgPSAnZG9uZSdcbiAgICAgICAgICByZXR1cm4gLy8gaW4tb3JkZXIsIGxhc3QgcGFja2V0XG5cbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuICAgICAgbmV4dCA9ICdpbnZhbGlkJ1xuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhY2tldCBvdXQgb2Ygc2VxdWVuY2VgXG5cbiAgZnVuY3Rpb24gKiBwYWNrZXRGcmFnbWVudHMoYnVmLCBuZXh0X2hkciwgZmluKSA6OlxuICAgIGlmIG51bGwgPT0gYnVmIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIHlpZWxkIG9ialxuICAgICAgcmV0dXJuXG5cbiAgICBsZXQgaSA9IDAsIGxhc3RJbm5lciA9IGJ1Zi5ieXRlTGVuZ3RoIC0gZnJhZ21lbnRfc2l6ZTtcbiAgICB3aGlsZSBpIDwgbGFzdElubmVyIDo6XG4gICAgICBjb25zdCBpMCA9IGlcbiAgICAgIGkgKz0gZnJhZ21lbnRfc2l6ZVxuXG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcigpXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpMCwgaSlcbiAgICAgIHlpZWxkIG9ialxuXG4gICAgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaSlcbiAgICAgIHlpZWxkIG9ialxuXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBbXVxuICAgIG91dGJvdW5kLmNob29zZSA9IGZyYW1pbmdzLmNob29zZVxuXG4gICAgZm9yIGNvbnN0IGZyYW1lIG9mIGZyYW1pbmdzIDo6XG4gICAgICBjb25zdCBpbXBsID0gZnJhbWUgPyB0cmFuc3BvcnRzW2ZyYW1lLnRyYW5zcG9ydF0gOiBudWxsXG4gICAgICBpZiAhIGltcGwgOjogY29udGludWVcblxuICAgICAgY29uc3Qge2JpdHMsIHBhY2ssIHVucGFja30gPSBmcmFtZVxuICAgICAgY29uc3QgcGt0X3R5cGUgPSBoaWdoYml0cyB8IGJpdHNcbiAgICAgIGNvbnN0IHt0X3JlY3Z9ID0gaW1wbFxuXG4gICAgICBmdW5jdGlvbiBwYWNrX2hkcihvYmopIDo6XG4gICAgICAgIHBhY2socGt0X3R5cGUsIG9iailcbiAgICAgICAgcmV0dXJuIG9ialxuXG4gICAgICBmdW5jdGlvbiByZWN2X21zZyhwa3QsIHNpbmspIDo6XG4gICAgICAgIHVucGFjayhwa3QpXG4gICAgICAgIHJldHVybiB0X3JlY3YocGt0LCBzaW5rKVxuXG4gICAgICBwYWNrX2hkci5wa3RfdHlwZSA9IHJlY3ZfbXNnLnBrdF90eXBlID0gcGt0X3R5cGVcbiAgICAgIG91dGJvdW5kW2JpdHNdID0gcGFja19oZHJcbiAgICAgIGluYm91bmRbcGt0X3R5cGVdID0gcmVjdl9tc2dcblxuICAgICAgaWYgJ3Byb2R1Y3Rpb24nICE9PSBwcm9jZXNzLmVudi5OT0RFX0VOViA6OlxuICAgICAgICBjb25zdCBvcCA9IHBhY2tfaGRyLm9wID0gcmVjdl9tc2cub3AgPSBmcmFtZS5vcFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCBwYWNrX2hkciwgJ25hbWUnLCBAe30gdmFsdWU6IGBwYWNrX2hkciDCqyR7b3B9wrtgXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHJlY3ZfbXNnLCAnbmFtZScsIEB7fSB2YWx1ZTogYHJlY3ZfbXNnIMKrJHtvcH3Cu2BcblxuICAgIHJldHVybiBvdXRib3VuZFxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3QgcGFja0JvZHkgPSB0cmFuc3BvcnRzLnBhY2tCb2R5XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpXG4gICAgcmV0dXJuIHRyYW5zcG9ydHMuc3RyZWFtaW5nXG4gICAgICA/IEB7fSBzZW5kLCBzdHJlYW06IGJpbmRfc3RyZWFtIEAgdHJhbnNwb3J0cy5zdHJlYW1pbmcubW9kZVxuICAgICAgOiBAe30gc2VuZFxuXG4gICAgZnVuY3Rpb24gc2VuZChjaGFuLCBvYmosIGJvZHkpIDo6XG4gICAgICBib2R5ID0gcGFja0JvZHkoYm9keSlcbiAgICAgIGlmIGZyYWdtZW50X3NpemUgPCBib2R5LmJ5dGVMZW5ndGggOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdtdWx0aXBhcnQnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfYnl0ZXMoY2hhbiwgb2JqKVxuICAgICAgICByZXR1cm4gbXNlbmQgQCB0cnVlLCBib2R5XG5cbiAgICAgIG9iai50cmFuc3BvcnQgPSAnc2luZ2xlJ1xuICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgcGFja19oZHIob2JqKVxuICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBsZXQgcmVzXG4gICAgICAgIGZvciBjb25zdCBvYmogb2YgcGFja2V0RnJhZ21lbnRzIEAgYm9keSwgbmV4dCwgZmluIDo6XG4gICAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICAgIHJlcyA9IGF3YWl0IGNoYW4gQCBwa3RcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiByZXNcblxuICAgIGZ1bmN0aW9uIG1zZW5kX29iamVjdHMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGNvbnN0IG9iaiA9IG5leHQoe2Zpbn0pXG4gICAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gYmluZF9zdHJlYW0obW9kZSkgOjpcbiAgICAgIGNvbnN0IG1zZW5kX2ltcGwgPSB7b2JqZWN0OiBtc2VuZF9vYmplY3RzLCBieXRlczogbXNlbmRfYnl0ZXN9W21vZGVdXG4gICAgICBpZiBtc2VuZF9pbXBsIDo6IHJldHVybiBzdHJlYW1cblxuICAgICAgZnVuY3Rpb24gc3RyZWFtKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ3N0cmVhbWluZydcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9pbXBsIEAgY2hhbiwgb2JqLCBqc29uX3BhY2sobXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSB3cml0ZS5iaW5kKHRydWUpXG4gICAgICAgIHJldHVybiB3cml0ZVxuXG4gICAgICAgIGZ1bmN0aW9uIHdyaXRlKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgdHJ1ZT09PXRoaXMsIHBhY2tCb2R5KGNodW5rKVxuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuXG5mdW5jdGlvbiBjaGVja19mbnMob2JqLCAuLi5rZXlzKSA6OlxuICBmb3IgY29uc3Qga2V5IG9mIGtleXMgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb2JqW2tleV0gOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgXCIke2tleX1cIiB0byBiZSBhIGZ1bmN0aW9uYFxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwganNvbl9wYWNrfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5XG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKSB8fCB1bmRlZmluZWRcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBib2R5X2J1ZiA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGJvZHlfYnVmIDo6XG4gICAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHVucGFja191dGY4KGJvZHlfYnVmKSB8fCB1bmRlZmluZWRcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ29iamVjdCdcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIHJldHVybiBzdGF0ZS5mZWVkKHBrdCwgdW5wYWNrQm9keSlcblxuICBmdW5jdGlvbiBwYWNrQm9keShib2R5KSA6OlxuICAgIHJldHVybiBwYWNrX3V0ZjggQCBqc29uX3BhY2soYm9keSlcblxuICBmdW5jdGlvbiB1bnBhY2tCb2R5KHBrdCwgc2luaykgOjpcbiAgICByZXR1cm4gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYmluYXJ5X3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIGNvbnN0IHthc0J1ZmZlcn0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keTogYXNCdWZmZXJcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBwa3QuYm9keV9idWZmZXIoKVxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnYnl0ZXMnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdCwgcGt0X2J1ZmZlcilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbmZ1bmN0aW9uIHBrdF9idWZmZXIocGt0KSA6OiByZXR1cm4gcGt0LmJvZHlfYnVmZmVyKClcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNvbnRyb2xfcHJvdG9jb2woaW5ib3VuZCwgaGlnaCwgc2hhcmVkKSA6OlxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja1BhY2tldE9ian0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgY29uc3QgcGluZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCB0b2tlbjogdHJ1ZSwgdHJhbnNwb3J0OiAnZGlyZWN0J1xuICBjb25zdCBwb25nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIG1zZ2lkOiB0cnVlLCB0cmFuc3BvcnQ6ICdkYXRhZ3JhbSdcblxuICBjb25zdCBwb25nX3R5cGUgPSBoaWdofDB4ZVxuICBpbmJvdW5kW3BvbmdfdHlwZV0gPSByZWN2X3BvbmdcbiAgY29uc3QgcGluZ190eXBlID0gaGlnaHwweGZcbiAgaW5ib3VuZFtoaWdofDB4Zl0gPSByZWN2X3BpbmdcblxuICByZXR1cm4gQHt9IHNlbmQ6cGluZywgcGluZ1xuXG4gIGZ1bmN0aW9uIHBpbmcoY2hhbiwgb2JqKSA6OlxuICAgIGlmICEgb2JqLnRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgIG9iai5ib2R5ID0gSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgIG9wOiAncGluZycsIHRzMDogbmV3IERhdGUoKVxuICAgIHBpbmdfZnJhbWUucGFjayhwaW5nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICBmdW5jdGlvbiByZWN2X3BpbmcocGt0LCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgcGluZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgX3NlbmRfcG9uZyBAIHBrdC5ib2R5LCBwa3QsIHJvdXRlclxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuICBmdW5jdGlvbiBfc2VuZF9wb25nKHt0czB9LCBwa3RfcGluZywgcm91dGVyKSA6OlxuICAgIGNvbnN0IHttc2dpZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qgb2JqID0gQHt9IG1zZ2lkXG4gICAgICBmcm9tX2lkOiBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIGlkX3JvdXRlcjogcl9pZC5pZF9yb3V0ZXIsIGlkX3RhcmdldDogcl9pZC5pZF90YXJnZXRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgc3RhdGVGb3IocGt0LCBpZkFic2VudCkgOjpcbiAgICBjb25zdCBtc2dpZCA9IHBrdC5pbmZvLm1zZ2lkXG4gICAgbGV0IGVudHJ5ID0gdGhpcy5ieV9tc2dpZC5nZXQobXNnaWQpXG4gICAgaWYgdW5kZWZpbmVkID09PSBlbnRyeSA6OlxuICAgICAgaWYgISBtc2dpZCA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBtc2dpZDogJHttc2dpZH1gXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWZBYnNlbnQgOjpcbiAgICAgICAgZW50cnkgPSBpZkFic2VudChwa3QsIHRoaXMsIG1zZ2lkKVxuICAgICAgZWxzZSBlbnRyeSA9IGlmQWJzZW50XG4gICAgICB0aGlzLmJ5X21zZ2lkLnNldCBAIG1zZ2lkLCBlbnRyeVxuICAgIHJldHVybiBlbnRyeVxuXG4gIGRlbGV0ZVN0YXRlRm9yKG1zZ2lkKSA6OlxuICAgIHJldHVybiB0aGlzLmJ5X21zZ2lkLmRlbGV0ZShtc2dpZClcblxuICBqc29uX3VucGFjayhvYmopIDo6IHRocm93IG5ldyBFcnJvciBAIGBFbmRwb2ludCBiaW5kU2luaygpIHJlc3BvbnNpYmlsaXR5YFxuXG4iLCJleHBvcnQgZGVmYXVsdCBFUFRhcmdldFxuZXhwb3J0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIGNvbnN0cnVjdG9yKGlkKSA6OiB0aGlzLmlkID0gaWRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VQVGFyZ2V0ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gZXBfZW5jb2RlKHRoaXMuaWQsIGZhbHNlKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuICBpc0VQVGFyZ2V0KCkgOjogcmV0dXJuIHRydWVcblxuICBnZXQgaWRfcm91dGVyKCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfcm91dGVyXG4gIGdldCBpZF90YXJnZXQoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF90YXJnZXRcblxuICBzdGF0aWMgYXNfanNvbl91bnBhY2sobXNnX2N0eF90bywgeGZvcm1CeUtleSkgOjpcbiAgICB4Zm9ybUJ5S2V5ID0gT2JqZWN0LmNyZWF0ZSh4Zm9ybUJ5S2V5IHx8IG51bGwpXG4gICAgeGZvcm1CeUtleVt0b2tlbl0gPSB2ID0+IHRoaXMuZnJvbV9jdHggQCBlcF9kZWNvZGUodiksIG1zZ19jdHhfdG9cbiAgICByZXR1cm4gdGhpcy5qc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBmcm9tX2N0eChpZCwgbXNnX2N0eF90bywgbXNnaWQpIDo6XG4gICAgaWYgISBpZCA6OiByZXR1cm5cbiAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWQuYXNFbmRwb2ludElkIDo6XG4gICAgICBpZCA9IGlkLmFzRW5kcG9pbnRJZCgpXG5cbiAgICBjb25zdCBlcF90Z3QgPSBuZXcgdGhpcyhpZClcbiAgICBsZXQgZmFzdCwgaW5pdCA9ICgpID0+IGZhc3QgPSBtc2dfY3R4X3RvKGVwX3RndCwge21zZ2lkfSkuZmFzdF9qc29uXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgIHNlbmQ6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5zZW5kXG4gICAgICBxdWVyeTogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnF1ZXJ5XG4gICAgICByZXBseUV4cGVjdGVkOiBAe30gdmFsdWU6ICEhIG1zZ2lkXG5cblxuY29uc3QgdG9rZW4gPSAnXFx1MDNFMCcgLy8gJ8+gJ1xuRVBUYXJnZXQudG9rZW4gPSB0b2tlblxuXG5FUFRhcmdldC5lcF9lbmNvZGUgPSBlcF9lbmNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9lbmNvZGUoaWQsIHNpbXBsZSkgOjpcbiAgbGV0IHtpZF9yb3V0ZXI6ciwgaWRfdGFyZ2V0OnR9ID0gaWRcbiAgciA9IChyPj4+MCkudG9TdHJpbmcoMzYpXG4gIHQgPSAodD4+PjApLnRvU3RyaW5nKDM2KVxuICBpZiBzaW1wbGUgOjpcbiAgICByZXR1cm4gYCR7dG9rZW59ICR7cn1+JHt0fWBcblxuICBjb25zdCByZXMgPSBAe30gW3Rva2VuXTogYCR7cn1+JHt0fWBcbiAgT2JqZWN0LmFzc2lnbiBAIHJlcywgaWRcbiAgZGVsZXRlIHJlcy5pZF9yb3V0ZXI7IGRlbGV0ZSByZXMuaWRfdGFyZ2V0XG4gIHJldHVybiByZXNcblxuXG5FUFRhcmdldC5lcF9kZWNvZGUgPSBlcF9kZWNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9kZWNvZGUodikgOjpcbiAgY29uc3QgaWQgPSAnc3RyaW5nJyA9PT0gdHlwZW9mIHZcbiAgICA/IHYuc3BsaXQodG9rZW4pWzFdXG4gICAgOiB2W3Rva2VuXVxuICBpZiAhIGlkIDo6IHJldHVyblxuXG4gIGxldCBbcix0XSA9IGlkLnNwbGl0KCd+JylcbiAgaWYgdW5kZWZpbmVkID09PSB0IDo6IHJldHVyblxuICByID0gMCB8IHBhcnNlSW50KHIsIDM2KVxuICB0ID0gMCB8IHBhcnNlSW50KHQsIDM2KVxuXG4gIHJldHVybiBAe30gaWRfcm91dGVyOiByLCBpZF90YXJnZXQ6IHRcblxuXG5FUFRhcmdldC5qc29uX3VucGFja194Zm9ybSA9IGpzb25fdW5wYWNrX3hmb3JtXG5leHBvcnQgZnVuY3Rpb24ganNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSkgOjpcbiAgcmV0dXJuIHN6ID0+IEpTT04ucGFyc2UgQCBzeiwgcmV2aXZlcigpXG5cbiAgZnVuY3Rpb24gcmV2aXZlcigpIDo6XG4gICAgY29uc3QgcmVnID0gbmV3IFdlYWtNYXAoKVxuICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlKSA6OlxuICAgICAgY29uc3QgeGZuID0geGZvcm1CeUtleVtrZXldXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHhmbiA6OlxuICAgICAgICByZWcuc2V0KHRoaXMsIHhmbilcbiAgICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICAgIGlmICdvYmplY3QnID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgY29uc3QgdmZuID0gcmVnLmdldCh2YWx1ZSlcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB2Zm4gOjpcbiAgICAgICAgICByZXR1cm4gdmZuIEAgdmFsdWVcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4iLCJpbXBvcnQge2VwX2RlY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIHN0YXRpYyBmb3JIdWIoaHViLCBjaGFubmVsKSA6OlxuICAgIGNvbnN0IHtzZW5kUmF3fSA9IGNoYW5uZWxcblxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLmNoYW5fc2VuZCA9IGFzeW5jIHBrdCA9PiA6OlxuICAgICAgYXdhaXQgc2VuZFJhdyhwa3QpXG4gICAgICByZXR1cm4gdHJ1ZVxuXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG5cbiAgY29uc3RydWN0b3IoaWQpIDo6XG4gICAgaWYgbnVsbCAhPSBpZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGlkXG4gICAgICBjb25zdCBmcm9tX2lkID0gT2JqZWN0LmZyZWV6ZSBAOiBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgdGhpcy5jdHggPSBAe30gZnJvbV9pZFxuXG5cbiAgd2l0aEVuZHBvaW50KGVuZHBvaW50KSA6OlxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgZW5kcG9pbnQ6IEB7fSB2YWx1ZTogZW5kcG9pbnRcblxuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9tc2dDb2RlY3MuY29udHJvbC5waW5nLCBbXSwgdG9rZW4pXG4gIHNlbmQoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzKVxuICBzZW5kUXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKVxuICBxdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgc3RyZWFtKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zdHJlYW0sIGFyZ3NcbiAgaW52b2tlKGtleSwgLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjW2tleV0sIGFyZ3NcbiAgYmluZEludm9rZShmbk9yS2V5LCB0b2tlbikgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgZm5PcktleSA6OiBmbk9yS2V5ID0gdGhpcy5fY29kZWNcbiAgICByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChmbk9yS2V5LCBhcmdzLCB0b2tlbilcblxuICBfaW52b2tlX2V4KGludm9rZSwgYXJncywgdG9rZW4pIDo6XG4gICAgY29uc3Qgb2JqID0gT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eFxuICAgIGlmIG51bGwgPT0gdG9rZW4gOjogdG9rZW4gPSBvYmoudG9rZW5cbiAgICBlbHNlIG9iai50b2tlbiA9IHRva2VuXG4gICAgaWYgdHJ1ZSA9PT0gdG9rZW4gOjpcbiAgICAgIHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuXG4gICAgdGhpcy5hc3NlcnRNb25pdG9yKClcblxuICAgIGNvbnN0IHJlcyA9IGludm9rZSBAIHRoaXMuY2hhbl9zZW5kLCBvYmosIC4uLmFyZ3NcbiAgICBpZiAhIHRva2VuIHx8ICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXMudGhlbiA6OiByZXR1cm4gcmVzXG5cbiAgICBsZXQgcF9zZW50ICA9IHJlcy50aGVuKClcbiAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIHRoaXMpXG4gICAgcF9zZW50ID0gcF9zZW50LnRoZW4gQCAoKSA9PiBAOiByZXBseVxuICAgIHBfc2VudC5yZXBseSA9IHJlcGx5XG4gICAgcmV0dXJuIHBfc2VudFxuXG4gIGdldCB0bygpIDo6IHJldHVybiAodGd0LCAuLi5hcmdzKSA9PiA6OlxuICAgIGlmIG51bGwgPT0gdGd0IDo6IHRocm93IG5ldyBFcnJvciBAIGBOdWxsIHRhcmdldCBlbmRwb2ludGBcblxuICAgIGNvbnN0IHNlbGYgPSB0aGlzLmNsb25lKClcblxuICAgIGNvbnN0IGN0eCA9IHNlbGYuY3R4XG4gICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgIGN0eC5pZF90YXJnZXQgPSB0Z3RcbiAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICBlbHNlIDo6XG4gICAgICB0Z3QgPSBlcF9kZWNvZGUodGd0KSB8fCB0Z3RcbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IGlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IHJlcGx5X2lkLmlkX3JvdXRlclxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gMCA9PT0gYXJncy5sZW5ndGggPyBzZWxmIDogc2VsZi53aXRoIEAgLi4uYXJnc1xuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmIHRydWUgPT09IHRndCB8fCBmYWxzZSA9PT0gdGd0IDo6XG4gICAgICAgIGN0eC50b2tlbiA9IHRndFxuICAgICAgZWxzZSBpZiBudWxsICE9IHRndCA6OlxuICAgICAgICBjb25zdCB7dG9rZW4sIG1zZ2lkfSA9IHRndFxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBzZW5kX2pzb24gYXMgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IGpzb25fc2VuZCA9IG1zZ0NvZGVjcy5qc29uLnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgZmFzdF9qc29uOiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzKVxuICAgICAgICBzZW5kUXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKVxuICAgICAgICBxdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgICByZXR1cm4gdGhpc1xuXG5cbiAgd2l0aFJlamVjdFRpbWVvdXQocF9yZXBseSkgOjpcbiAgICByZXR1cm4gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgcF9yZXBseS50aGVuIEAgcmVzb2x2ZSwgcmVqZWN0XG4gICAgICBwX3JlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcblxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLm1zX3RpbWVvdXQpXG4gICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcblxuICAgICAgZnVuY3Rpb24gY2xlYXIoKSA6OiBjbGVhclRpbWVvdXQgQCB0aWRcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dCwgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQge0VQVGFyZ2V0LCBlcF9lbmNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIHN1YmNsYXNzKGV4dGVuc2lvbnMpIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgZXh0ZW5zaW9uc1xuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVwX3NlbGYoKS50b0pTT04oKVxuICBlcF9zZWxmKCkgOjogcmV0dXJuIG5ldyB0aGlzLkVQVGFyZ2V0KHRoaXMuaWQpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgpIDo6XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGlkOiBAe30gdmFsdWU6IGlkXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKS50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSb3V0ZUNhY2hlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuICAgICAganNvbl91bnBhY2s6IHRoaXMuRVBUYXJnZXQuYXNfanNvbl91bnBhY2sodGhpcy50bylcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnIHx8IHttc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICBhc190YXJnZXQoaWQpIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50b1xuICBhc19zZW5kZXIoe2Zyb21faWQ6aWQsIG1zZ2lkfSkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvLCBtc2dpZFxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgcmVjdk1zZyhtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mbywgc2VuZGVyOiB0aGlzLmFzX3NlbmRlcihpbmZvKVxuICByZWN2U3RyZWFtKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiB0aGlzLnBhcnRzLmpvaW4oJycpOyAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIHBfc2VudCwgbXNnX2N0eFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgbGV0IHJlcGx5ID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcF9zZW50LmNhdGNoIEAgcmVqZWN0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICByZXBseSA9IG1zZ19jdHgud2l0aFJlamVjdFRpbWVvdXQocmVwbHkpXG5cbiAgICBjb25zdCBjbGVhciA9ICgpID0+IHRoaXMuYnlfdG9rZW4uZGVsZXRlIEAgdG9rZW5cbiAgICByZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG4gICAgcmV0dXJuIHJlcGx5XG5cbkVuZHBvaW50LnByb3RvdHlwZS5FUFRhcmdldCA9IEVQVGFyZ2V0XG4iLCJpbXBvcnQgZXBfcHJvdG8gZnJvbSAnLi9lcF9raW5kcy9pbmRleC5qc3knXG5pbXBvcnQgaW5pdF9wcm90b2NvbCBmcm9tICcuL3Byb3RvY29sL2luZGV4LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4LCBwcm90b2NvbHN9ID0gY2xhc3Nlc1xuICAgIHJldHVybiBjbGFzc2VzXG5cbiAganNvbl9wYWNrOiBKU09OLnN0cmluZ2lmeVxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHBsdWdpbl9uYW1lLCByYW5kb21faWQsIGpzb25fcGFja1xuICAgIG9uX21zZzogZGVmYXVsdF9vbl9tc2dcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gICAgY3JlYXRlTWFwXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICBpZiBwbHVnaW5fb3B0aW9ucy5lcF9raW5kcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywgcGx1Z2luX29wdGlvbnMuZXBfa2luZHNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZVtwbHVnaW5fbmFtZV0gPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1YltwbHVnaW5fbmFtZV0gPSBodWJbcGx1Z2luX25hbWVdKGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuXG4gICAgY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHg6IE1zZ0N0eF9waX0gPVxuICAgICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDogcHJvdG9jb2xzXG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBodWIuY29ubmVjdF9zZWxmKClcbiAgICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eF9waS5mb3JIdWIoaHViLCBjaGFubmVsKVxuXG4gICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YgQCBlbmRwb2ludCwgZXBfcHJvdG9cbiAgICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGVuZHBvaW50LCBjcmVhdGUsIE1zZ0N0eFxuICAgICAgcmV0dXJuIGVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcmFuZG9tX2lkKClcbiAgICAgICAgd2hpbGUgdGFyZ2V0cy5oYXMgQCBpZF90YXJnZXRcbiAgICAgICAgcmV0dXJuIGNyZWF0ZSBAIGlkX3RhcmdldCwgb25faW5pdFxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGUoaWRfdGFyZ2V0LCBvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBoYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbClcbiAgICAgICAgY29uc3QgaWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIGlkXG4gICAgICAgIGNvbnN0IGVwID0gbmV3IEVuZHBvaW50IEAgaWQsIG1zZ19jdHhcblxuICAgICAgICBjb25zdCByZWFkeSA9IFByb21pc2VcbiAgICAgICAgICAucmVzb2x2ZSBAXG4gICAgICAgICAgICAnZnVuY3Rpb24nID09PSB0eXBlb2Ygb25faW5pdFxuICAgICAgICAgICAgICA/IG9uX2luaXQoZXAsIGh1YilcbiAgICAgICAgICAgICAgOiBvbl9pbml0XG4gICAgICAgICAgLnRoZW4gQCBfYWZ0ZXJfaW5pdFxuXG4gICAgICAgIC8vIEFsbG93IGZvciBib3RoIGludGVybmFsIGFuZCBleHRlcm5hbCBlcnJvciBoYW5kbGluZyBieSBmb3JraW5nIHJlYWR5LmNhdGNoXG4gICAgICAgIHJlYWR5LmNhdGNoIEAgZXJyID0+IGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgOjpcbiAgICAgICAgICBjb25zdCBlcF90Z3QgPSBlcC5lcF9zZWxmKClcbiAgICAgICAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgICAgICAgcmVhZHk6IEB7fSB2YWx1ZTogcmVhZHkudGhlbiBAICgpID0+IGVwX3RndFxuXG5cbiAgICAgICAgZnVuY3Rpb24gX2FmdGVyX2luaXQodGFyZ2V0KSA6OlxuICAgICAgICAgIGlmIG51bGwgPT0gdGFyZ2V0IDo6XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIGVuZHBvaW50IGluaXQgdG8gcmV0dXJuIGEgY2xvc3VyZSBvciBpbnRlcmZhY2VgXG5cbiAgICAgICAgICBoYW5kbGVycy5vbl9tc2cgPSAodGFyZ2V0Lm9uX21zZyB8fCAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRhcmdldCA/IHRhcmdldCA6IGRlZmF1bHRfb25fbXNnKSkuYmluZCh0YXJnZXQpXG4gICAgICAgICAgaGFuZGxlcnMub25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0LCBlcClcbiAgICAgICAgICBoYW5kbGVycy5vbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQsIGVwKVxuXG4gICAgICAgICAgbmV3IFNpbmsoKS5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnNcblxuICAgICAgICAgIHJldHVybiB0YXJnZXQub25fcmVhZHkgPyB0YXJnZXQub25fcmVhZHkoZXAsIGh1YikgOiB0YXJnZXRcblxuXG4iLCJpbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuY29uc3QgZ2V0UmFuZG9tVmFsdWVzID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiB3aW5kb3dcbiAgPyB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA6IG51bGxcblxuZW5kcG9pbnRfYnJvd3Nlci5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIGNvbnN0IGFyciA9IG5ldyBJbnQzMkFycmF5KDEpXG4gIGdldFJhbmRvbVZhbHVlcyhhcnIpXG4gIHJldHVybiBhcnJbMF1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfYnJvd3NlcihwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iXSwibmFtZXMiOlsiZXBfcHJvdG8iLCJPYmplY3QiLCJjcmVhdGUiLCJnZXRQcm90b3R5cGVPZiIsImFkZF9lcF9raW5kIiwia2luZHMiLCJhc3NpZ24iLCJhcGkiLCJ0YXJnZXQiLCJjbGllbnRFbmRwb2ludCIsImVuZHBvaW50IiwiZG9uZSIsImFyZ3MiLCJsZW5ndGgiLCJtc2dfY3R4IiwiTXNnQ3R4IiwidG8iLCJlcF9jbGllbnRfYXBpIiwib25fcmVhZHkiLCJlcCIsImh1YiIsIl9yZXNvbHZlIiwib25fY2xpZW50X3JlYWR5Iiwic2h1dGRvd24iLCJlcnIiLCJfcmVqZWN0IiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJhcGlfZW5kcG9pbnRzIiwicGFyYWxsZWwiLCJpbm9yZGVyIiwicnBjIiwiYmluZF9ycGMiLCJvbl9tc2ciLCJtc2ciLCJzZW5kZXIiLCJpbnZva2UiLCJvcCIsImFwaV9mbiIsImt3IiwiY3R4IiwiaW52b2tlX2dhdGVkIiwicGZ4Iiwib3BfcHJlZml4IiwibG9va3VwX29wIiwib3BfbG9va3VwIiwiZm4iLCJiaW5kIiwicnBjX2FwaSIsInZhbHVlIiwiZXBfc2VsZiIsImNiIiwicmVzb2x2ZV9vcCIsInVuZGVmaW5lZCIsInJlcyIsImFuc3dlciIsImdhdGUiLCJ0aGVuIiwibm9vcCIsInNlbmQiLCJlcnJfZnJvbSIsIm1lc3NhZ2UiLCJjb2RlIiwiZXJyb3IiLCJyZXBseUV4cGVjdGVkIiwib25faW5pdCIsImxpdHRsZV9lbmRpYW4iLCJjX3NpbmdsZSIsImNfZGF0YWdyYW0iLCJjX2RpcmVjdCIsImNfbXVsdGlwYXJ0IiwiY19zdHJlYW1pbmciLCJfZXJyX21zZ2lkX3JlcXVpcmVkIiwiX2Vycl90b2tlbl9yZXF1aXJlZCIsImZybV9yb3V0aW5nIiwic2l6ZSIsImJpdHMiLCJtYXNrIiwib2JqIiwiZnJvbV9pZCIsImR2Iiwib2Zmc2V0Iiwic2V0SW50MzIiLCJpZF9yb3V0ZXIiLCJpZF90YXJnZXQiLCJnZXRJbnQzMiIsImZybV9yZXNwb25zZSIsIm1zZ2lkIiwiRXJyb3IiLCJzZXRJbnQxNiIsInNlcV9hY2siLCJhY2tfZmxhZ3MiLCJ0b2tlbiIsImdldEludDE2IiwiZnJtX2RhdGFncmFtIiwidHJhbnNwb3J0IiwiZnJtX2RpcmVjdCIsImZybV9tdWx0aXBhcnQiLCJzZXFfcG9zIiwic2VxIiwic2VxX2ZsYWdzIiwiZnJtX3N0cmVhbWluZyIsImJpbmRfc2VxX25leHQiLCJzZXFfb2Zmc2V0Iiwic2VxX25leHQiLCJmbGFncyIsImZpbiIsIk5hTiIsImNvbXBvc2VGcmFtaW5ncyIsImZybV9mcm9tIiwiZnJtX3Jlc3AiLCJmcm1fdHJhbnNwb3J0cyIsImJ5Qml0cyIsInRfZnJvbSIsImZfdGVzdCIsInRfcmVzcCIsInQwIiwidDEiLCJ0MiIsInQzIiwibWFwIiwiZiIsInRlc3RCaXRzIiwiY2hvb3NlIiwibHN0IiwiVCIsImIiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwib25fZXJyb3IiLCJmZWVkX2JvZHkiLCJkYXRhIiwib25fZGF0YSIsIm9uX2VuZCIsImZlZWRfc2VxIiwibmV4dF9oZHIiLCJpIiwibGFzdElubmVyIiwiYnl0ZUxlbmd0aCIsImkwIiwiYm9keSIsImJpbmRUcmFuc3BvcnRJbXBscyIsImluYm91bmQiLCJoaWdoYml0cyIsInRyYW5zcG9ydHMiLCJvdXRib3VuZCIsImZyYW1pbmdzIiwiZnJhbWUiLCJpbXBsIiwidF9yZWN2IiwicGFja19oZHIiLCJyZWN2X21zZyIsImJpbmRUcmFuc3BvcnRzIiwicGFja0JvZHkiLCJzdHJlYW1pbmciLCJzdHJlYW0iLCJiaW5kX3N0cmVhbSIsIm1vZGUiLCJjaGFuIiwibXNlbmQiLCJtc2VuZF9ieXRlcyIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fc2h1dGRvd24iLCJhbGl2ZSIsInByb3RvY29sIiwiaXNBbGl2ZSIsImV4dHJhIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZ2V0Iiwic2V0IiwiZGVsZXRlIiwiRVBUYXJnZXQiLCJpZCIsImVwX2VuY29kZSIsImFzX2pzb25fdW5wYWNrIiwibXNnX2N0eF90byIsInhmb3JtQnlLZXkiLCJ2IiwiZnJvbV9jdHgiLCJlcF9kZWNvZGUiLCJqc29uX3VucGFja194Zm9ybSIsImFzRW5kcG9pbnRJZCIsImVwX3RndCIsImZhc3QiLCJpbml0IiwiZmFzdF9qc29uIiwiZGVmaW5lUHJvcGVydGllcyIsInF1ZXJ5Iiwic2ltcGxlIiwiciIsInQiLCJ0b1N0cmluZyIsInNwbGl0IiwicGFyc2VJbnQiLCJzeiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJ4Zm4iLCJ2Zm4iLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJmcmVlemUiLCJfaW52b2tlX2V4IiwiX21zZ0NvZGVjcyIsIl9jb2RlYyIsInJlcGx5IiwiZm5PcktleSIsImFzc2VydE1vbml0b3IiLCJwX3NlbnQiLCJpbml0UmVwbHkiLCJ0Z3QiLCJzZWxmIiwiY2xvbmUiLCJyZXBseV9pZCIsIndpdGgiLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJtb25pdG9yIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRpZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNvZGVjIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJ1bnJlZiIsImNsZWFyIiwiY2xlYXJJbnRlcnZhbCIsIm1zZ19jb2RlYyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwianNvbl9zZW5kIiwicF9yZXBseSIsInRpbWVvdXQiLCJSZXBseVRpbWVvdXQiLCJzZXRUaW1lb3V0IiwibXNfdGltZW91dCIsIkVuZHBvaW50Iiwic3ViY2xhc3MiLCJleHRlbnNpb25zIiwidG9KU09OIiwid2l0aEVuZHBvaW50IiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJpc19yZXBseSIsImFzX3NlbmRlciIsIndhcm4iLCJpbml0UmVwbHlQcm9taXNlIiwiY2F0Y2giLCJ3aXRoUmVqZWN0VGltZW91dCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJjbGFzc2VzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwiZXBfa2luZHMiLCJvcmRlciIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwicGx1Z2luX25hbWUiLCJiaW5kRW5kcG9pbnRBcGkiLCJwcm90b2NvbHMiLCJNc2dDdHhfcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJjb25uZWN0X3NlbGYiLCJzZXRQcm90b3R5cGVPZiIsInRhcmdldHMiLCJoYXMiLCJpZF9zZWxmIiwicmVhZHkiLCJfYWZ0ZXJfaW5pdCIsInJlZ2lzdGVyIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiLCJlbmRwb2ludF9wbHVnaW4iXSwibWFwcGluZ3MiOiI7O0FBQU8sTUFBTUEsYUFBV0MsT0FBT0MsTUFBUCxDQUFnQkQsT0FBT0UsY0FBUCxDQUF3QixZQUFVLEVBQWxDLENBQWhCLENBQWpCO0FBQ1AsQUFBTyxTQUFTQyxXQUFULENBQXFCQyxLQUFyQixFQUE0QjtTQUMxQkMsTUFBUCxDQUFnQk4sVUFBaEIsRUFBMEJLLEtBQTFCOzs7QUNBRkQsWUFBYztpQkFDR0csR0FBZixFQUFvQjtVQUNaQyxTQUFTQyxlQUFlRixHQUFmLENBQWY7U0FDS0csUUFBTCxDQUFnQkYsTUFBaEI7V0FDT0EsT0FBT0csSUFBZDtHQUpVOztTQU1MLEdBQUdDLElBQVYsRUFBZ0I7UUFDWCxNQUFNQSxLQUFLQyxNQUFYLElBQXFCLGVBQWUsT0FBT0QsS0FBSyxDQUFMLENBQTlDLEVBQXdEO2FBQy9DLEtBQUtILGNBQUwsQ0FBc0JHLEtBQUssQ0FBTCxDQUF0QixDQUFQOzs7VUFFSUUsVUFBVSxJQUFJLEtBQUtDLE1BQVQsRUFBaEI7V0FDTyxNQUFNSCxLQUFLQyxNQUFYLEdBQW9CQyxRQUFRRSxFQUFSLENBQVcsR0FBR0osSUFBZCxDQUFwQixHQUEwQ0UsT0FBakQ7R0FYVSxFQUFkOztBQWNBLE1BQU1HLGdCQUFnQjtRQUNkQyxRQUFOLENBQWVDLEVBQWYsRUFBbUJDLEdBQW5CLEVBQXdCO1NBQ2pCQyxRQUFMLEVBQWdCLE1BQU0sS0FBS0MsZUFBTCxDQUFxQkgsRUFBckIsRUFBeUJDLEdBQXpCLENBQXRCO1VBQ01ELEdBQUdJLFFBQUgsRUFBTjtHQUhrQjtnQkFJTkosRUFBZCxFQUFrQkssR0FBbEIsRUFBdUI7U0FDaEJDLE9BQUwsQ0FBYUQsR0FBYjtHQUxrQjtjQU1STCxFQUFaLEVBQWdCSyxHQUFoQixFQUFxQjtVQUNiLEtBQUtDLE9BQUwsQ0FBYUQsR0FBYixDQUFOLEdBQTBCLEtBQUtILFFBQUwsRUFBMUI7R0FQa0IsRUFBdEI7O0FBU0EsQUFBTyxTQUFTWixjQUFULENBQXdCYSxlQUF4QixFQUF5QztNQUMxQ2QsU0FBU1AsT0FBT0MsTUFBUCxDQUFnQmUsYUFBaEIsQ0FBYjtTQUNPSyxlQUFQLEdBQXlCQSxlQUF6QjtTQUNPWCxJQUFQLEdBQWMsSUFBSWUsT0FBSixDQUFjLENBQUNDLE9BQUQsRUFBVUMsTUFBVixLQUFxQjtXQUN4Q1AsUUFBUCxHQUFrQk0sT0FBbEI7V0FDT0YsT0FBUCxHQUFpQkcsTUFBakI7R0FGWSxDQUFkO1NBR09wQixNQUFQOzs7QUM3QkZKLFlBQWM7TUFDUkcsR0FBSixFQUFTO1dBQVUsS0FBS0csUUFBTCxDQUFnQm1CLGNBQWNDLFFBQWQsQ0FBdUJ2QixHQUF2QixDQUFoQixDQUFQO0dBREE7ZUFFQ0EsR0FBYixFQUFrQjtXQUFVLEtBQUtHLFFBQUwsQ0FBZ0JtQixjQUFjQyxRQUFkLENBQXVCdkIsR0FBdkIsQ0FBaEIsQ0FBUDtHQUZUO2NBR0FBLEdBQVosRUFBaUI7V0FBVSxLQUFLRyxRQUFMLENBQWdCbUIsY0FBY0UsT0FBZCxDQUFzQnhCLEdBQXRCLENBQWhCLENBQVA7R0FIUixFQUFkOztBQU1BLEFBQU8sTUFBTXNCLGdCQUFnQjtXQUNsQnRCLEdBQVQsRUFBYztXQUNMLFVBQVVZLEVBQVYsRUFBY0MsR0FBZCxFQUFtQjtZQUNsQlksTUFBTUgsY0FBY0ksUUFBZCxDQUF1QjFCLEdBQXZCLEVBQTRCWSxFQUE1QixFQUFnQ0MsR0FBaEMsQ0FBWjthQUNPLEVBQUlZLEdBQUo7Y0FDQ0UsTUFBTixDQUFhLEVBQUNDLEdBQUQsRUFBTUMsTUFBTixFQUFiLEVBQTRCO2dCQUNwQkosSUFBSUssTUFBSixDQUFhRCxNQUFiLEVBQXFCRCxJQUFJRyxFQUF6QixFQUNKQyxVQUFVQSxPQUFPSixJQUFJSyxFQUFYLEVBQWVMLElBQUlNLEdBQW5CLENBRE4sQ0FBTjtTQUZHLEVBQVA7S0FGRjtHQUZ5Qjs7VUFTbkJsQyxHQUFSLEVBQWE7V0FDSixVQUFVWSxFQUFWLEVBQWNDLEdBQWQsRUFBbUI7WUFDbEJZLE1BQU1ILGNBQWNJLFFBQWQsQ0FBdUIxQixHQUF2QixFQUE0QlksRUFBNUIsRUFBZ0NDLEdBQWhDLENBQVo7YUFDTyxFQUFJWSxHQUFKO2NBQ0NFLE1BQU4sQ0FBYSxFQUFDQyxHQUFELEVBQU1DLE1BQU4sRUFBYixFQUE0QjtnQkFDcEJKLElBQUlVLFlBQUosQ0FBbUJOLE1BQW5CLEVBQTJCRCxJQUFJRyxFQUEvQixFQUNKQyxVQUFVQSxPQUFPSixJQUFJSyxFQUFYLEVBQWVMLElBQUlNLEdBQW5CLENBRE4sQ0FBTjtTQUZHLEVBQVA7S0FGRjtHQVZ5Qjs7V0FpQmxCbEMsR0FBVCxFQUFjWSxFQUFkLEVBQWtCQyxHQUFsQixFQUF1QjtVQUNmdUIsTUFBTXBDLElBQUlxQyxTQUFKLElBQWlCLE1BQTdCO1VBQ01DLFlBQVl0QyxJQUFJdUMsU0FBSixHQUNkUixNQUFNL0IsSUFBSXVDLFNBQUosQ0FBY0gsTUFBTUwsRUFBcEIsRUFBd0JuQixFQUF4QixFQUE0QkMsR0FBNUIsQ0FEUSxHQUVkLGVBQWUsT0FBT2IsR0FBdEIsR0FDQStCLE1BQU0vQixJQUFJb0MsTUFBTUwsRUFBVixFQUFjbkIsRUFBZCxFQUFrQkMsR0FBbEIsQ0FETixHQUVBa0IsTUFBTTtZQUNFUyxLQUFLeEMsSUFBSW9DLE1BQU1MLEVBQVYsQ0FBWDthQUNPUyxLQUFLQSxHQUFHQyxJQUFILENBQVF6QyxHQUFSLENBQUwsR0FBb0J3QyxFQUEzQjtLQU5OOztXQVFPOUMsT0FBT0MsTUFBUCxDQUFnQitDLE9BQWhCLEVBQXlCO2lCQUNuQixFQUFJQyxPQUFPTCxTQUFYLEVBRG1CO2dCQUVwQixFQUFJSyxPQUFPL0IsR0FBR2dDLE9BQUgsRUFBWCxFQUZvQixFQUF6QixDQUFQO0dBM0J5QixFQUF0Qjs7QUFnQ1AsTUFBTUYsVUFBWTtRQUNWWixNQUFOLENBQWFELE1BQWIsRUFBcUJFLEVBQXJCLEVBQXlCYyxFQUF6QixFQUE2QjtVQUNyQmIsU0FBUyxNQUFNLEtBQUtjLFVBQUwsQ0FBa0JqQixNQUFsQixFQUEwQkUsRUFBMUIsQ0FBckI7UUFDR2dCLGNBQWNmLE1BQWpCLEVBQTBCOzs7O1VBRXBCZ0IsTUFBTSxLQUFLQyxNQUFMLENBQWNwQixNQUFkLEVBQXNCRyxNQUF0QixFQUE4QmEsRUFBOUIsQ0FBWjtXQUNPLE1BQU1HLEdBQWI7R0FOYzs7UUFRVmIsWUFBTixDQUFtQk4sTUFBbkIsRUFBMkJFLEVBQTNCLEVBQStCYyxFQUEvQixFQUFtQztVQUMzQmIsU0FBUyxNQUFNLEtBQUtjLFVBQUwsQ0FBa0JqQixNQUFsQixFQUEwQkUsRUFBMUIsQ0FBckI7UUFDR2dCLGNBQWNmLE1BQWpCLEVBQTBCOzs7O1VBRXBCZ0IsTUFBTTdCLFFBQVFDLE9BQVIsQ0FBZ0IsS0FBSzhCLElBQXJCLEVBQ1RDLElBRFMsQ0FDRixNQUFNLEtBQUtGLE1BQUwsQ0FBY3BCLE1BQWQsRUFBc0JHLE1BQXRCLEVBQThCYSxFQUE5QixDQURKLENBQVo7U0FFS0ssSUFBTCxHQUFZRixJQUFJRyxJQUFKLENBQVNDLElBQVQsRUFBZUEsSUFBZixDQUFaO1dBQ08sTUFBTUosR0FBYjtHQWZjOztRQWlCVkYsVUFBTixDQUFpQmpCLE1BQWpCLEVBQXlCRSxFQUF6QixFQUE2QjtRQUN4QixhQUFhLE9BQU9BLEVBQXZCLEVBQTRCO1lBQ3BCRixPQUFPd0IsSUFBUCxDQUFjLEVBQUN0QixFQUFELEVBQUt1QixVQUFVLEtBQUtBLFFBQXBCO2VBQ1gsRUFBSUMsU0FBUyxtQkFBYixFQUFrQ0MsTUFBTSxHQUF4QyxFQURXLEVBQWQsQ0FBTjs7OztRQUlFO1lBQ0l4QixTQUFTLE1BQU0sS0FBS00sU0FBTCxDQUFlUCxFQUFmLENBQXJCO1VBQ0csQ0FBRUMsTUFBTCxFQUFjO2NBQ05ILE9BQU93QixJQUFQLENBQWMsRUFBQ3RCLEVBQUQsRUFBS3VCLFVBQVUsS0FBS0EsUUFBcEI7aUJBQ1gsRUFBSUMsU0FBUyxtQkFBYixFQUFrQ0MsTUFBTSxHQUF4QyxFQURXLEVBQWQsQ0FBTjs7YUFFS3hCLE1BQVA7S0FMRixDQU1BLE9BQU1mLEdBQU4sRUFBWTtZQUNKWSxPQUFPd0IsSUFBUCxDQUFjLEVBQUN0QixFQUFELEVBQUt1QixVQUFVLEtBQUtBLFFBQXBCO2VBQ1gsRUFBSUMsU0FBVSxzQkFBcUJ0QyxJQUFJc0MsT0FBUSxFQUEvQyxFQUFrREMsTUFBTSxHQUF4RCxFQURXLEVBQWQsQ0FBTjs7R0E5Qlk7O1FBaUNWUCxNQUFOLENBQWFwQixNQUFiLEVBQXFCRyxNQUFyQixFQUE2QmEsRUFBN0IsRUFBaUM7UUFDM0I7VUFDRUksU0FBU0osS0FBSyxNQUFNQSxHQUFHYixNQUFILENBQVgsR0FBd0IsTUFBTUEsUUFBM0M7S0FERixDQUVBLE9BQU1mLEdBQU4sRUFBWTtZQUNKWSxPQUFPd0IsSUFBUCxDQUFjLEVBQUNDLFVBQVUsS0FBS0EsUUFBaEIsRUFBMEJHLE9BQU94QyxHQUFqQyxFQUFkLENBQU47YUFDTyxLQUFQOzs7UUFFQ1ksT0FBTzZCLGFBQVYsRUFBMEI7WUFDbEI3QixPQUFPd0IsSUFBUCxDQUFjLEVBQUNKLE1BQUQsRUFBZCxDQUFOOztXQUNLLElBQVA7R0ExQ2MsRUFBbEI7O0FBNkNBLFNBQVNHLElBQVQsR0FBZ0I7O0FDbkZoQnZELFlBQWM7U0FDTDhELE9BQVAsRUFBZ0I7V0FBVSxLQUFLeEQsUUFBTCxDQUFnQndELE9BQWhCLENBQVA7R0FEUCxFQUFkOztBQ0ZBLE1BQU1DLGdCQUFnQixJQUF0QjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxhQUFhLFVBQW5CO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCOztBQUVBLE1BQU1DLHNCQUF1QiwwQkFBN0I7QUFDQSxNQUFNQyxzQkFBdUIsMkJBQTdCOztBQUdBLFNBQVNDLFdBQVQsR0FBdUI7UUFDZkMsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ087UUFBQSxFQUNDRCxJQURELEVBQ09DLElBRFA7O1dBR0VDLEdBQVAsRUFBWTthQUFVLFFBQVFBLElBQUlDLE9BQVosR0FBc0JILElBQXRCLEdBQTZCLEtBQXBDO0tBSFY7O1dBS0VFLEdBQVAsRUFBWUUsRUFBWixFQUFnQkMsTUFBaEIsRUFBd0I7WUFDaEIsRUFBQ0YsT0FBRCxLQUFZRCxHQUFsQjtTQUNHSSxRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUksU0FBbEMsRUFBNkNqQixhQUE3QztTQUNHZ0IsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCLElBQUVGLFFBQVFLLFNBQWxDLEVBQTZDbEIsYUFBN0M7S0FSRzs7YUFVSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtZQUNsQkYsVUFBVTFCLGNBQWN5QixJQUFJQyxPQUFsQixHQUNaRCxJQUFJQyxPQUFKLEdBQWMsRUFERixHQUNPRCxJQUFJQyxPQUQzQjtjQUVRSSxTQUFSLEdBQW9CSCxHQUFHSyxRQUFILENBQWMsSUFBRUosTUFBaEIsRUFBd0JmLGFBQXhCLENBQXBCO2NBQ1FrQixTQUFSLEdBQW9CSixHQUFHSyxRQUFILENBQWMsSUFBRUosTUFBaEIsRUFBd0JmLGFBQXhCLENBQXBCO0tBZEcsRUFBUDs7O0FBZ0JGLFNBQVNvQixZQUFULEdBQXdCO1FBQ2hCWCxPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTztRQUFBLEVBQ0NELElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVUsUUFBUUEsSUFBSVMsS0FBWixHQUFvQlgsSUFBcEIsR0FBMkIsS0FBbEM7S0FIVjs7V0FLRUUsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtVQUNuQixDQUFFSCxJQUFJUyxLQUFULEVBQWlCO2NBQU8sSUFBSUMsS0FBSixDQUFZaEIsbUJBQVosQ0FBTjs7U0FDZlUsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJUyxLQUE1QixFQUFtQ3JCLGFBQW5DO1NBQ0d1QixRQUFILENBQWMsSUFBRVIsTUFBaEIsRUFBd0IsSUFBRUgsSUFBSVksT0FBOUIsRUFBdUN4QixhQUF2QztTQUNHdUIsUUFBSCxDQUFjLElBQUVSLE1BQWhCLEVBQXdCLElBQUVILElBQUlhLFNBQTlCLEVBQXlDekIsYUFBekM7S0FURzs7YUFXSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtVQUNwQlcsS0FBSixHQUFZWixHQUFHSyxRQUFILENBQWMsSUFBRUosTUFBaEIsRUFBd0JmLGFBQXhCLENBQVo7VUFDSXdCLE9BQUosR0FBY1YsR0FBR2EsUUFBSCxDQUFjLElBQUVaLE1BQWhCLEVBQXdCZixhQUF4QixDQUFkO1VBQ0l5QixTQUFKLEdBQWdCWCxHQUFHYSxRQUFILENBQWMsSUFBRVosTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO0tBZEcsRUFBUDs7O0FBa0JGLFNBQVM0QixZQUFULEdBQXdCO1FBQ2hCbkIsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSWtCLFdBQVczQixVQUFmO1FBQUEsRUFDQ1EsSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7VUFDUFYsZUFBZVUsSUFBSWlCLFNBQXRCLEVBQWtDO2VBQVFuQixJQUFQOztVQUNoQ0UsSUFBSWlCLFNBQUosSUFBaUI1QixhQUFhVyxJQUFJaUIsU0FBckMsRUFBaUQ7ZUFBUSxLQUFQOzthQUMzQyxDQUFFakIsSUFBSWMsS0FBTixHQUFjaEIsSUFBZCxHQUFxQixLQUE1QjtLQU5HOztXQVFFRSxHQUFQLEVBQVlFLEVBQVosRUFBZ0JDLE1BQWhCLEVBQXdCLEVBUm5COzthQVVJSCxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBCO1VBQ3BCYyxTQUFKLEdBQWdCM0IsVUFBaEI7S0FYRyxFQUFQOzs7QUFhRixTQUFTNEIsVUFBVCxHQUFzQjtRQUNkckIsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSWtCLFdBQVcxQixRQUFmO1FBQUEsRUFDQ08sSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7VUFDUFQsYUFBYVMsSUFBSWlCLFNBQXBCLEVBQWdDO2VBQVFuQixJQUFQOztVQUM5QkUsSUFBSWlCLFNBQUosSUFBaUI1QixhQUFhVyxJQUFJaUIsU0FBckMsRUFBaUQ7ZUFBUSxLQUFQOzthQUMzQyxDQUFDLENBQUVqQixJQUFJYyxLQUFQLEdBQWVoQixJQUFmLEdBQXNCLEtBQTdCO0tBTkc7O1dBUUVFLEdBQVAsRUFBWUUsRUFBWixFQUFnQkMsTUFBaEIsRUFBd0I7VUFDbkIsQ0FBRUgsSUFBSWMsS0FBVCxFQUFpQjtjQUFPLElBQUlKLEtBQUosQ0FBWWYsbUJBQVosQ0FBTjs7U0FDZlMsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJYyxLQUE1QixFQUFtQzFCLGFBQW5DO0tBVkc7O2FBWUlZLEdBQVQsRUFBY0UsRUFBZCxFQUFrQkMsTUFBbEIsRUFBMEI7VUFDcEJNLEtBQUosR0FBWVAsR0FBR0ssUUFBSCxDQUFjLElBQUVKLE1BQWhCLEVBQXdCZixhQUF4QixDQUFaO1VBQ0k2QixTQUFKLEdBQWdCMUIsUUFBaEI7S0FkRyxFQUFQOzs7QUFnQkYsU0FBUzRCLGFBQVQsR0FBeUI7UUFDakJ0QixPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTyxFQUFJa0IsV0FBV3pCLFdBQWY7UUFBQSxFQUNDTSxJQURELEVBQ09DLElBRFA7O1dBR0VDLEdBQVAsRUFBWTthQUFVUixnQkFBZ0JRLElBQUlpQixTQUFwQixHQUFnQ25CLElBQWhDLEdBQXVDLEtBQTlDO0tBSFY7O2lCQUFBLEVBS1VzQixTQUFTLENBTG5CO1dBTUVwQixHQUFQLEVBQVlFLEVBQVosRUFBZ0JDLE1BQWhCLEVBQXdCO1VBQ25CLENBQUVILElBQUljLEtBQVQsRUFBaUI7Y0FBTyxJQUFJSixLQUFKLENBQVlmLG1CQUFaLENBQU47O1NBQ2ZTLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QkgsSUFBSWMsS0FBNUIsRUFBbUMxQixhQUFuQztVQUNHLFFBQVFZLElBQUlxQixHQUFmLEVBQXFCOztXQUNoQlYsUUFBSCxDQUFjLElBQUVSLE1BQWhCLEVBQXdCLENBQXhCLEVBQTJCZixhQUEzQjtPQURGLE1BRUtjLEdBQUdTLFFBQUgsQ0FBYyxJQUFFUixNQUFoQixFQUF3QixJQUFFSCxJQUFJcUIsR0FBOUIsRUFBbUNqQyxhQUFuQztTQUNGdUIsUUFBSCxDQUFjLElBQUVSLE1BQWhCLEVBQXdCLElBQUVILElBQUlzQixTQUE5QixFQUF5Q2xDLGFBQXpDO0tBWkc7O2FBY0lZLEdBQVQsRUFBY0UsRUFBZCxFQUFrQkMsTUFBbEIsRUFBMEI7VUFDcEJNLEtBQUosR0FBZ0JQLEdBQUdLLFFBQUgsQ0FBYyxJQUFFSixNQUFoQixFQUF3QmYsYUFBeEIsQ0FBaEI7VUFDSWlDLEdBQUosR0FBZ0JuQixHQUFHYSxRQUFILENBQWMsSUFBRVosTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO1VBQ0lrQyxTQUFKLEdBQWdCcEIsR0FBR2EsUUFBSCxDQUFjLElBQUVaLE1BQWhCLEVBQXdCZixhQUF4QixDQUFoQjtVQUNJNkIsU0FBSixHQUFnQnpCLFdBQWhCO0tBbEJHLEVBQVA7OztBQW9CRixTQUFTK0IsYUFBVCxHQUF5QjtRQUNqQjFCLE9BQU8sQ0FBYjtRQUFnQkMsT0FBTyxHQUF2QjtRQUE0QkMsT0FBTyxHQUFuQztTQUNPLEVBQUlrQixXQUFXeEIsV0FBZjtRQUFBLEVBQ0NLLElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVVQLGdCQUFnQk8sSUFBSWlCLFNBQXBCLEdBQWdDbkIsSUFBaEMsR0FBdUMsS0FBOUM7S0FIVjs7aUJBQUEsRUFLVXNCLFNBQVMsQ0FMbkI7V0FNRXBCLEdBQVAsRUFBWUUsRUFBWixFQUFnQkMsTUFBaEIsRUFBd0I7VUFDbkIsQ0FBRUgsSUFBSWMsS0FBVCxFQUFpQjtjQUFPLElBQUlKLEtBQUosQ0FBWWYsbUJBQVosQ0FBTjs7U0FDZlMsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJYyxLQUE1QixFQUFtQzFCLGFBQW5DO1VBQ0csUUFBUVksSUFBSXFCLEdBQWYsRUFBcUI7V0FDaEJWLFFBQUgsQ0FBYyxJQUFFUixNQUFoQixFQUF3QixDQUF4QixFQUEyQmYsYUFBM0I7O09BREYsTUFFS2MsR0FBR1MsUUFBSCxDQUFjLElBQUVSLE1BQWhCLEVBQXdCLElBQUVILElBQUlxQixHQUE5QixFQUFtQ2pDLGFBQW5DO1NBQ0Z1QixRQUFILENBQWMsSUFBRVIsTUFBaEIsRUFBd0IsSUFBRUgsSUFBSXNCLFNBQTlCLEVBQXlDbEMsYUFBekM7S0FaRzs7YUFjSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtVQUNwQk0sS0FBSixHQUFnQlAsR0FBR0ssUUFBSCxDQUFjLElBQUVKLE1BQWhCLEVBQXdCZixhQUF4QixDQUFoQjtVQUNJaUMsR0FBSixHQUFnQm5CLEdBQUdhLFFBQUgsQ0FBYyxJQUFFWixNQUFoQixFQUF3QmYsYUFBeEIsQ0FBaEI7VUFDSWtDLFNBQUosR0FBZ0JwQixHQUFHYSxRQUFILENBQWMsSUFBRVosTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO1VBQ0k2QixTQUFKLEdBQWdCeEIsV0FBaEI7S0FsQkcsRUFBUDs7O0FBcUJGLFNBQVMrQixhQUFULENBQXVCckIsTUFBdkIsRUFBK0I7UUFDdkJzQixhQUFhLEtBQUtMLE9BQUwsR0FBZWpCLE1BQWxDO01BQ0lrQixNQUFNLENBQVY7U0FDTyxTQUFTSyxRQUFULENBQWtCLEVBQUNDLEtBQUQsRUFBUUMsR0FBUixFQUFsQixFQUFnQzFCLEVBQWhDLEVBQW9DO1FBQ3RDLENBQUUwQixHQUFMLEVBQVc7U0FDTmpCLFFBQUgsQ0FBY2MsVUFBZCxFQUEwQkosS0FBMUIsRUFBaUNqQyxhQUFqQztTQUNHdUIsUUFBSCxDQUFjLElBQUVjLFVBQWhCLEVBQTRCLElBQUVFLEtBQTlCLEVBQXFDdkMsYUFBckM7S0FGRixNQUdLO1NBQ0F1QixRQUFILENBQWNjLFVBQWQsRUFBMEIsQ0FBQ0osR0FBM0IsRUFBZ0NqQyxhQUFoQztTQUNHdUIsUUFBSCxDQUFjLElBQUVjLFVBQWhCLEVBQTRCLElBQUVFLEtBQTlCLEVBQXFDdkMsYUFBckM7WUFDTXlDLEdBQU47O0dBUEo7OztBQVdGLGVBQWVDLGlCQUFmO0FBQ0EsU0FBU0EsZUFBVCxHQUEyQjtRQUNuQkMsV0FBV25DLGFBQWpCO1FBQWdDb0MsV0FBV3hCLGNBQTNDO1FBQ015QixpQkFBaUIsQ0FBSWpCLGNBQUosRUFBb0JFLFlBQXBCLEVBQWtDQyxlQUFsQyxFQUFtREksZUFBbkQsQ0FBdkI7O01BRUcsTUFBTVEsU0FBU2xDLElBQWYsSUFBdUIsTUFBTW1DLFNBQVNuQyxJQUF0QyxJQUE4QyxLQUFLb0MsZUFBZW5HLE1BQXJFLEVBQThFO1VBQ3RFLElBQUk0RSxLQUFKLENBQWEscUJBQWIsQ0FBTjs7O1FBRUl3QixTQUFTLEVBQWY7UUFBbUJuQyxPQUFLLEdBQXhCOzs7VUFHUW9DLFNBQVNKLFNBQVNLLE1BQXhCO1VBQWdDQyxTQUFTTCxTQUFTSSxNQUFsRDtVQUNNLENBQUNFLEVBQUQsRUFBSUMsRUFBSixFQUFPQyxFQUFQLEVBQVVDLEVBQVYsSUFBZ0JSLGVBQWVTLEdBQWYsQ0FBcUJDLEtBQUdBLEVBQUVQLE1BQTFCLENBQXRCOztVQUVNUSxXQUFXVixPQUFPVSxRQUFQLEdBQWtCNUMsT0FDakMsSUFBSW1DLE9BQU9uQyxHQUFQLENBQUosR0FBa0JxQyxPQUFPckMsR0FBUCxDQUFsQixHQUFnQ3NDLEdBQUd0QyxHQUFILENBQWhDLEdBQTBDdUMsR0FBR3ZDLEdBQUgsQ0FBMUMsR0FBb0R3QyxHQUFHeEMsR0FBSCxDQUFwRCxHQUE4RHlDLEdBQUd6QyxHQUFILENBRGhFOztXQUdPNkMsTUFBUCxHQUFnQixVQUFVN0MsR0FBVixFQUFlOEMsR0FBZixFQUFvQjtVQUMvQixRQUFRQSxHQUFYLEVBQWlCO2NBQU8sUUFBUVosTUFBZDs7YUFDWFksSUFBSUYsU0FBUzVDLEdBQVQsQ0FBSixDQUFQO0tBRkY7OztPQUtFLE1BQU0rQyxDQUFWLElBQWVkLGNBQWYsRUFBZ0M7VUFDeEIsRUFBQ25DLE1BQUtrRCxDQUFOLEVBQVNuRCxJQUFULEVBQWVvQixTQUFmLEtBQTRCOEIsQ0FBbEM7O1dBRU9DLElBQUUsQ0FBVCxJQUFjLEVBQUlELENBQUosRUFBTzlCLFNBQVAsRUFBa0JuQixNQUFNa0QsSUFBRSxDQUExQixFQUE2QmpELElBQTdCLEVBQW1DRixNQUFNQSxJQUF6QyxFQUErQ3RDLElBQUksRUFBbkQsRUFBZDtXQUNPeUYsSUFBRSxDQUFULElBQWMsRUFBSUQsQ0FBSixFQUFPOUIsU0FBUCxFQUFrQm5CLE1BQU1rRCxJQUFFLENBQTFCLEVBQTZCakQsSUFBN0IsRUFBbUNGLE1BQU0sSUFBSUEsSUFBN0MsRUFBbUR0QyxJQUFJLEdBQXZELEVBQWQ7V0FDT3lGLElBQUUsQ0FBVCxJQUFjLEVBQUlELENBQUosRUFBTzlCLFNBQVAsRUFBa0JuQixNQUFNa0QsSUFBRSxDQUExQixFQUE2QmpELElBQTdCLEVBQW1DRixNQUFNLElBQUlBLElBQTdDLEVBQW1EdEMsSUFBSSxHQUF2RCxFQUFkO1dBQ095RixJQUFFLENBQVQsSUFBYyxFQUFJRCxDQUFKLEVBQU85QixTQUFQLEVBQWtCbkIsTUFBTWtELElBQUUsQ0FBMUIsRUFBNkJqRCxJQUE3QixFQUFtQ0YsTUFBTSxLQUFLQSxJQUE5QyxFQUFvRHRDLElBQUksSUFBeEQsRUFBZDs7U0FFSSxNQUFNMEYsTUFBVixJQUFvQixDQUFDLFFBQUQsRUFBVyxVQUFYLENBQXBCLEVBQTZDO1lBQ3JDQyxVQUFVSCxFQUFFRSxNQUFGLENBQWhCO1lBQTJCRSxVQUFVcEIsU0FBU2tCLE1BQVQsQ0FBckM7WUFBdURHLFVBQVVwQixTQUFTaUIsTUFBVCxDQUFqRTs7YUFFT0QsSUFBRSxDQUFULEVBQVlDLE1BQVosSUFBc0IsVUFBU2pELEdBQVQsRUFBY0UsRUFBZCxFQUFrQjtnQkFBV0YsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCO09BQTNDO2FBQ084QyxJQUFFLENBQVQsRUFBWUMsTUFBWixJQUFzQixVQUFTakQsR0FBVCxFQUFjRSxFQUFkLEVBQWtCO2dCQUFXRixHQUFSLEVBQWFFLEVBQWIsRUFBaUIsQ0FBakIsRUFBcUJnRCxRQUFRbEQsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCO09BQWhFO2FBQ084QyxJQUFFLENBQVQsRUFBWUMsTUFBWixJQUFzQixVQUFTakQsR0FBVCxFQUFjRSxFQUFkLEVBQWtCO2dCQUFXRixHQUFSLEVBQWFFLEVBQWIsRUFBaUIsQ0FBakIsRUFBcUJnRCxRQUFRbEQsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCO09BQWhFO2FBQ084QyxJQUFFLENBQVQsRUFBWUMsTUFBWixJQUFzQixVQUFTakQsR0FBVCxFQUFjRSxFQUFkLEVBQWtCO2dCQUFXRixHQUFSLEVBQWFFLEVBQWIsRUFBaUIsQ0FBakIsRUFBcUJrRCxRQUFRcEQsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCLEVBQXFCZ0QsUUFBUWxELEdBQVIsRUFBYUUsRUFBYixFQUFpQixFQUFqQjtPQUFyRjs7OztPQUVBLE1BQU1tRCxHQUFWLElBQWlCbkIsTUFBakIsRUFBMEI7a0JBQ1JtQixHQUFoQjs7O1NBRUtuQixNQUFQOzs7QUFHRixTQUFTb0IsYUFBVCxDQUF1QkQsR0FBdkIsRUFBNEI7UUFDcEIsRUFBQ04sQ0FBRCxFQUFJbEQsSUFBSixFQUFVMEQsTUFBVixFQUFrQkMsUUFBbEIsS0FBOEJILEdBQXBDO01BQ0dOLEVBQUV2QixhQUFMLEVBQXFCO1FBQ2ZFLFFBQUosR0FBZXFCLEVBQUV2QixhQUFGLENBQWtCNkIsSUFBSXhELElBQUosR0FBV2tELEVBQUVsRCxJQUEvQixDQUFmOzs7U0FFS3dELElBQUlOLENBQVg7TUFDSVUsSUFBSixHQUFXQSxJQUFYLENBQWtCSixJQUFJSyxNQUFKLEdBQWFBLE1BQWI7UUFDWmhDLFdBQVcyQixJQUFJM0IsUUFBckI7O1dBRVMrQixJQUFULENBQWNFLFFBQWQsRUFBd0JDLE9BQXhCLEVBQWlDO1FBQzVCLEVBQUksS0FBS0QsUUFBTCxJQUFpQkEsWUFBWSxHQUFqQyxDQUFILEVBQTBDO1lBQ2xDLElBQUlFLFNBQUosQ0FBaUIsa0NBQWpCLENBQU47OztZQUVNQyxJQUFSLEdBQWVILFFBQWY7UUFDR2pDLFlBQVksUUFBUWtDLFFBQVF2QyxHQUEvQixFQUFxQztjQUMzQkEsR0FBUixHQUFjLElBQWQ7OztVQUVJbkIsS0FBSyxJQUFJNkQsUUFBSixDQUFlLElBQUlDLFdBQUosQ0FBZ0JuRSxJQUFoQixDQUFmLENBQVg7V0FDTytELE9BQVAsRUFBZ0IxRCxFQUFoQixFQUFvQixDQUFwQjtZQUNRK0QsTUFBUixHQUFpQi9ELEdBQUdnRSxNQUFwQjs7UUFFRyxTQUFTTixRQUFRdkMsR0FBcEIsRUFBMEI7cUJBQ1B1QyxPQUFqQixFQUEwQjFELEdBQUdnRSxNQUFILENBQVVDLEtBQVYsQ0FBZ0IsQ0FBaEIsRUFBa0J0RSxJQUFsQixDQUExQjs7OztXQUVLNkQsTUFBVCxDQUFnQlUsR0FBaEIsRUFBcUI7VUFDYkMsTUFBTUQsSUFBSUUsYUFBSixFQUFaO1VBQ01wRSxLQUFLLElBQUk2RCxRQUFKLENBQWUsSUFBSVEsVUFBSixDQUFlRixHQUFmLEVBQW9CSCxNQUFuQyxDQUFYOztVQUVNTSxPQUFPLEVBQWI7YUFDU0EsSUFBVCxFQUFldEUsRUFBZixFQUFtQixDQUFuQjtXQUNPa0UsSUFBSUksSUFBSixHQUFXQSxJQUFsQjs7O1dBRU9DLGNBQVQsQ0FBd0JiLE9BQXhCLEVBQWlDYyxTQUFqQyxFQUE0QztVQUNwQyxFQUFDWixJQUFELEtBQVNGLE9BQWY7VUFDTSxFQUFDdkQsU0FBRCxFQUFZQyxTQUFaLEVBQXVCcUUsR0FBdkIsRUFBNEI3RCxLQUE1QixLQUFxQzhDLE9BQTNDO1lBQ1FnQixJQUFSLEdBQWVBLElBQWY7O2FBRVNBLElBQVQsQ0FBY0MsT0FBZCxFQUF1QjtVQUNsQixRQUFRQSxPQUFYLEVBQXFCO2tCQUFXLEVBQVY7O1lBQ2hCWixTQUFTUyxVQUFVUCxLQUFWLEVBQWY7ZUFDV1UsT0FBWCxFQUFvQixJQUFJZCxRQUFKLENBQWVFLE1BQWYsQ0FBcEI7YUFDTyxFQUFJckksTUFBTSxDQUFDLENBQUVpSixRQUFRakQsR0FBckIsRUFBMEJ6RCxPQUFPO1NBQWpDLEVBQ0xrQyxTQURLLEVBQ01DLFNBRE4sRUFDaUJ3RCxJQURqQixFQUN1QmEsR0FEdkIsRUFDNEI3RCxLQUQ1QixFQUNtQ21ELE1BRG5DLEVBQVA7Ozs7O0FDaE9OLG1CQUFlLFVBQVNhLFlBQVQsRUFBdUJELE9BQXZCLEVBQWdDRSxhQUFoQyxFQUErQztRQUN0RCxFQUFDQyxhQUFELEVBQWdCQyxhQUFoQixFQUErQkMsU0FBL0IsRUFBMENDLFdBQTFDLEtBQXlETCxZQUEvRDtrQkFDZ0JNLE9BQU9MLGlCQUFpQixJQUF4QixDQUFoQjtNQUNHLE9BQU9BLGFBQVAsSUFBd0IsUUFBUUEsYUFBbkMsRUFBbUQ7VUFDM0MsSUFBSXJFLEtBQUosQ0FBYSwwQkFBeUJxRSxhQUFjLEVBQXBELENBQU47OztRQUVJLEVBQUNNLFNBQUQsRUFBWUMsU0FBWixLQUF5QlQsT0FBL0I7U0FDUyxFQUFDQyxZQUFELEVBQWVPLFNBQWYsRUFBMEJDLFNBQTFCO21CQUFBLEVBQ1VDLFlBRFYsRUFDd0JDLGVBRHhCO2tCQUFBLEVBQVQ7O1dBS1NDLGVBQVQsQ0FBeUJyQixHQUF6QixFQUE4QnNCLElBQTlCLEVBQW9DakYsS0FBcEMsRUFBMkM7UUFDckNrRixRQUFRLEVBQVo7UUFBZ0IvRCxNQUFNLEtBQXRCO1dBQ08sRUFBSWdFLElBQUosRUFBVXBCLE1BQU1KLElBQUlJLElBQXBCLEVBQVA7O2FBRVNvQixJQUFULENBQWN4QixHQUFkLEVBQW1CO1VBQ2IvQyxNQUFNK0MsSUFBSUksSUFBSixDQUFTbkQsR0FBbkI7VUFDR0EsTUFBTSxDQUFULEVBQWE7Y0FBTyxJQUFOLENBQVlBLE1BQU0sQ0FBQ0EsR0FBUDs7WUFDcEJBLE1BQUksQ0FBVixJQUFlK0MsSUFBSXlCLFdBQUosRUFBZjs7VUFFRyxDQUFFakUsR0FBTCxFQUFXOzs7VUFDUitELE1BQU1HLFFBQU4sQ0FBaUJ2SCxTQUFqQixDQUFILEVBQWdDOzs7O1dBRTNCd0gsY0FBTCxDQUFvQnRGLEtBQXBCOztZQUVNakMsTUFBTXdHLGNBQWNXLEtBQWQsQ0FBWjtjQUNRLElBQVI7YUFDT25ILEdBQVA7Ozs7V0FFSytHLFlBQVQsQ0FBc0JuQixHQUF0QixFQUEyQnNCLElBQTNCLEVBQWlDakYsS0FBakMsRUFBd0M7UUFDbENtRSxPQUFLLENBQVQ7UUFBWWhELE1BQU0sS0FBbEI7UUFBeUJvRSxRQUF6QjtRQUFtQ0MsT0FBbkM7VUFDTUMsUUFBUSxFQUFJTixNQUFNTyxTQUFWLEVBQXFCM0IsTUFBTUosSUFBSUksSUFBL0IsRUFBZDtXQUNPMEIsS0FBUDs7YUFFU0MsU0FBVCxDQUFtQi9CLEdBQW5CLEVBQXdCZ0MsVUFBeEIsRUFBb0M7WUFDNUJSLElBQU4sR0FBYVMsV0FBYjs7WUFFTTdCLE9BQU9KLElBQUlJLElBQWpCO1lBQ01wSCxNQUFNc0ksS0FBS1ksV0FBTCxDQUFtQmxDLElBQUltQyxTQUFKLEVBQW5CLENBQVo7Z0JBQ1ViLEtBQUtjLFVBQUwsQ0FBZ0JwSixHQUFoQixFQUFxQm9ILElBQXJCLENBQVY7VUFDRyxRQUFReUIsT0FBWCxFQUFxQjs7O2dCQUNUQSxPQUFaLEVBQXFCLFVBQXJCLEVBQWlDLFNBQWpDLEVBQTRDLFFBQTVDO2lCQUNXUCxLQUFLZSxjQUFMLENBQW9CeEksSUFBcEIsQ0FBeUJ5SCxJQUF6QixFQUErQk8sT0FBL0IsRUFBd0N6QixJQUF4QyxDQUFYOztVQUVJO2lCQUNPSixHQUFUO09BREYsQ0FFQSxPQUFNM0gsR0FBTixFQUFZO2VBQ0h3SixRQUFRUyxRQUFSLENBQW1CakssR0FBbkIsRUFBd0IySCxHQUF4QixDQUFQOzs7WUFFSXdCLElBQU4sR0FBYWUsU0FBYjtVQUNHVixRQUFROUcsT0FBWCxFQUFxQjtlQUNaOEcsUUFBUTlHLE9BQVIsQ0FBZ0IvQixHQUFoQixFQUFxQmdILEdBQXJCLENBQVA7Ozs7YUFFS3VDLFNBQVQsQ0FBbUJ2QyxHQUFuQixFQUF3QmdDLFVBQXhCLEVBQW9DOztVQUU5QlEsSUFBSjtVQUNJO2lCQUNPeEMsR0FBVDtlQUNPZ0MsV0FBV2hDLEdBQVgsRUFBZ0JzQixJQUFoQixDQUFQO09BRkYsQ0FHQSxPQUFNakosR0FBTixFQUFZO2VBQ0h3SixRQUFRUyxRQUFSLENBQW1CakssR0FBbkIsRUFBd0IySCxHQUF4QixDQUFQOzs7VUFFQ3hDLEdBQUgsRUFBUztjQUNEcEQsTUFBTXlILFFBQVFZLE9BQVIsQ0FBa0JELElBQWxCLEVBQXdCeEMsR0FBeEIsQ0FBWjtlQUNPNkIsUUFBUWEsTUFBUixDQUFpQnRJLEdBQWpCLEVBQXNCNEYsR0FBdEIsQ0FBUDtPQUZGLE1BR0s7ZUFDSTZCLFFBQVFZLE9BQVIsQ0FBa0JELElBQWxCLEVBQXdCeEMsR0FBeEIsQ0FBUDs7OzthQUVLaUMsV0FBVCxDQUFxQmpDLEdBQXJCLEVBQTBCO1VBQ3BCO2lCQUFZQSxHQUFUO09BQVAsQ0FDQSxPQUFNM0gsR0FBTixFQUFZOzs7YUFFTHNLLFFBQVQsQ0FBa0IzQyxHQUFsQixFQUF1QjtVQUNqQi9DLE1BQU0rQyxJQUFJSSxJQUFKLENBQVNuRCxHQUFuQjtVQUNHQSxPQUFPLENBQVYsRUFBYztZQUNUdUQsV0FBV3ZELEdBQWQsRUFBb0I7aUJBQUE7O09BRHRCLE1BR0s7Z0JBQ0csSUFBTjtlQUNLMEUsY0FBTCxDQUFvQnRGLEtBQXBCO2NBQ0dtRSxTQUFTLENBQUN2RCxHQUFiLEVBQW1CO21CQUNWLE1BQVA7bUJBRGlCOztTQUlyQjZFLE1BQU1OLElBQU4sR0FBYVMsV0FBYjthQUNPLFNBQVA7WUFDTSxJQUFJM0YsS0FBSixDQUFhLHdCQUFiLENBQU47Ozs7WUFFTzhFLGVBQVgsQ0FBMkJuQixHQUEzQixFQUFnQzJDLFFBQWhDLEVBQTBDcEYsR0FBMUMsRUFBK0M7UUFDMUMsUUFBUXlDLEdBQVgsRUFBaUI7WUFDVHJFLE1BQU1nSCxTQUFTLEVBQUNwRixHQUFELEVBQVQsQ0FBWjtZQUNNNUIsR0FBTjs7OztRQUdFaUgsSUFBSSxDQUFSO1FBQVdDLFlBQVk3QyxJQUFJOEMsVUFBSixHQUFpQnBDLGFBQXhDO1dBQ01rQyxJQUFJQyxTQUFWLEVBQXNCO1lBQ2RFLEtBQUtILENBQVg7V0FDS2xDLGFBQUw7O1lBRU0vRSxNQUFNZ0gsVUFBWjtVQUNJSyxJQUFKLEdBQVdoRCxJQUFJRixLQUFKLENBQVVpRCxFQUFWLEVBQWNILENBQWQsQ0FBWDtZQUNNakgsR0FBTjs7OztZQUdNQSxNQUFNZ0gsU0FBUyxFQUFDcEYsR0FBRCxFQUFULENBQVo7VUFDSXlGLElBQUosR0FBV2hELElBQUlGLEtBQUosQ0FBVThDLENBQVYsQ0FBWDtZQUNNakgsR0FBTjs7OztXQUlLc0gsa0JBQVQsQ0FBNEJDLE9BQTVCLEVBQXFDQyxRQUFyQyxFQUErQ0MsVUFBL0MsRUFBMkQ7VUFDbkRDLFdBQVcsRUFBakI7YUFDUzdFLE1BQVQsR0FBa0I4RSxTQUFTOUUsTUFBM0I7O1NBRUksTUFBTStFLEtBQVYsSUFBbUJELFFBQW5CLEVBQThCO1lBQ3RCRSxPQUFPRCxRQUFRSCxXQUFXRyxNQUFNM0csU0FBakIsQ0FBUixHQUFzQyxJQUFuRDtVQUNHLENBQUU0RyxJQUFMLEVBQVk7Ozs7WUFFTixFQUFDL0gsSUFBRCxFQUFPMkQsSUFBUCxFQUFhQyxNQUFiLEtBQXVCa0UsS0FBN0I7WUFDTWpFLFdBQVc2RCxXQUFXMUgsSUFBNUI7WUFDTSxFQUFDZ0ksTUFBRCxLQUFXRCxJQUFqQjs7ZUFFU0UsUUFBVCxDQUFrQi9ILEdBQWxCLEVBQXVCO2FBQ2hCMkQsUUFBTCxFQUFlM0QsR0FBZjtlQUNPQSxHQUFQOzs7ZUFFT2dJLFFBQVQsQ0FBa0I1RCxHQUFsQixFQUF1QnNCLElBQXZCLEVBQTZCO2VBQ3BCdEIsR0FBUDtlQUNPMEQsT0FBTzFELEdBQVAsRUFBWXNCLElBQVosQ0FBUDs7O2VBRU8vQixRQUFULEdBQW9CcUUsU0FBU3JFLFFBQVQsR0FBb0JBLFFBQXhDO2VBQ1M3RCxJQUFULElBQWlCaUksUUFBakI7Y0FDUXBFLFFBQVIsSUFBb0JxRSxRQUFwQjs7Ozs7V0FPS04sUUFBUDs7O1dBR09PLGNBQVQsQ0FBd0JWLE9BQXhCLEVBQWlDQyxRQUFqQyxFQUEyQ0MsVUFBM0MsRUFBdUQ7VUFDL0NTLFdBQVdULFdBQVdTLFFBQTVCO1VBQ01SLFdBQVdKLG1CQUFtQkMsT0FBbkIsRUFBNEJDLFFBQTVCLEVBQXNDQyxVQUF0QyxDQUFqQjtXQUNPQSxXQUFXVSxTQUFYLEdBQ0gsRUFBSXRKLElBQUosRUFBVXVKLFFBQVFDLFlBQWNaLFdBQVdVLFNBQVgsQ0FBcUJHLElBQW5DLENBQWxCLEVBREcsR0FFSCxFQUFJekosSUFBSixFQUZKOzthQUlTQSxJQUFULENBQWMwSixJQUFkLEVBQW9CdkksR0FBcEIsRUFBeUJxSCxJQUF6QixFQUErQjthQUN0QmEsU0FBU2IsSUFBVCxDQUFQO1VBQ0d0QyxnQkFBZ0JzQyxLQUFLRixVQUF4QixFQUFxQztZQUNoQyxDQUFFbkgsSUFBSWMsS0FBVCxFQUFpQjtjQUFLQSxLQUFKLEdBQVl1RSxXQUFaOztZQUNkcEUsU0FBSixHQUFnQixXQUFoQjtjQUNNdUgsUUFBUUMsWUFBWUYsSUFBWixFQUFrQnZJLEdBQWxCLENBQWQ7ZUFDT3dJLE1BQVEsSUFBUixFQUFjbkIsSUFBZCxDQUFQOzs7VUFFRXBHLFNBQUosR0FBZ0IsUUFBaEI7VUFDSW9HLElBQUosR0FBV0EsSUFBWDtZQUNNVSxXQUFXTCxTQUFTN0UsTUFBVCxDQUFnQjdDLEdBQWhCLENBQWpCO1lBQ01vRSxNQUFNYSxjQUFnQjhDLFNBQVMvSCxHQUFULENBQWhCLENBQVo7YUFDT3VJLEtBQU9uRSxHQUFQLENBQVA7OzthQUVPcUUsV0FBVCxDQUFxQkYsSUFBckIsRUFBMkJ2SSxHQUEzQixFQUFnQzVDLEdBQWhDLEVBQXFDO1lBQzdCMkssV0FBV0wsU0FBUzdFLE1BQVQsQ0FBZ0I3QyxHQUFoQixDQUFqQjtVQUNJLEVBQUM0RSxJQUFELEtBQVNtRCxTQUFTL0gsR0FBVCxDQUFiO1VBQ0csU0FBUzVDLEdBQVosRUFBa0I7WUFDWmlLLElBQUosR0FBV2pLLEdBQVg7Y0FDTWdILE1BQU1hLGNBQWdCakYsR0FBaEIsQ0FBWjthQUNPb0UsR0FBUDs7O2FBRUssZ0JBQWdCeEMsR0FBaEIsRUFBcUJ5RixJQUFyQixFQUEyQjtZQUM3QixTQUFTekMsSUFBWixFQUFtQjtnQkFDWCxJQUFJbEUsS0FBSixDQUFZLGlCQUFaLENBQU47O1lBQ0VsQyxHQUFKO2FBQ0ksTUFBTXdCLEdBQVYsSUFBaUJ3RixnQkFBa0I2QixJQUFsQixFQUF3QnpDLElBQXhCLEVBQThCaEQsR0FBOUIsQ0FBakIsRUFBcUQ7Z0JBQzdDd0MsTUFBTWEsY0FBZ0JqRixHQUFoQixDQUFaO2dCQUNNLE1BQU11SSxLQUFPbkUsR0FBUCxDQUFaOztZQUNDeEMsR0FBSCxFQUFTO2lCQUFRLElBQVA7O2VBQ0hwRCxHQUFQO09BUkY7OzthQVVPa0ssYUFBVCxDQUF1QkgsSUFBdkIsRUFBNkJ2SSxHQUE3QixFQUFrQzVDLEdBQWxDLEVBQXVDO1lBQy9CMkssV0FBV0wsU0FBUzdFLE1BQVQsQ0FBZ0I3QyxHQUFoQixDQUFqQjtVQUNJLEVBQUM0RSxJQUFELEtBQVNtRCxTQUFTL0gsR0FBVCxDQUFiO1VBQ0csU0FBUzVDLEdBQVosRUFBa0I7WUFDWmlLLElBQUosR0FBV2pLLEdBQVg7Y0FDTWdILE1BQU1hLGNBQWdCakYsR0FBaEIsQ0FBWjthQUNPb0UsR0FBUDs7O2FBRUssVUFBVXhDLEdBQVYsRUFBZXlGLElBQWYsRUFBcUI7WUFDdkIsU0FBU3pDLElBQVosRUFBbUI7Z0JBQ1gsSUFBSWxFLEtBQUosQ0FBWSxpQkFBWixDQUFOOztjQUNJVixNQUFNNEUsS0FBSyxFQUFDaEQsR0FBRCxFQUFMLENBQVo7WUFDSXlGLElBQUosR0FBV0EsSUFBWDtjQUNNakQsTUFBTWEsY0FBZ0JqRixHQUFoQixDQUFaO1lBQ0c0QixHQUFILEVBQVM7aUJBQVEsSUFBUDs7ZUFDSDJHLEtBQU9uRSxHQUFQLENBQVA7T0FQRjs7O2FBU09pRSxXQUFULENBQXFCQyxJQUFyQixFQUEyQjtZQUNuQkssYUFBYSxFQUFDQyxRQUFRRixhQUFULEVBQXdCRyxPQUFPSixXQUEvQixHQUE0Q0gsSUFBNUMsQ0FBbkI7VUFDR0ssVUFBSCxFQUFnQjtlQUFRUCxNQUFQOzs7ZUFFUkEsTUFBVCxDQUFnQkcsSUFBaEIsRUFBc0J2SSxHQUF0QixFQUEyQjVDLEdBQTNCLEVBQWdDO1lBQzNCLENBQUU0QyxJQUFJYyxLQUFULEVBQWlCO2NBQUtBLEtBQUosR0FBWXVFLFdBQVo7O1lBQ2RwRSxTQUFKLEdBQWdCLFdBQWhCO2NBQ011SCxRQUFRRyxXQUFhSixJQUFiLEVBQW1CdkksR0FBbkIsRUFBd0JzRixVQUFVbEksR0FBVixDQUF4QixDQUFkO2NBQ00wTCxLQUFOLEdBQWNBLEtBQWQsQ0FBcUJBLE1BQU1DLEdBQU4sR0FBWUQsTUFBTTdLLElBQU4sQ0FBVyxJQUFYLENBQVo7ZUFDZDZLLEtBQVA7O2lCQUVTQSxLQUFULENBQWVFLEtBQWYsRUFBc0I7aUJBQ2JBLFNBQVMsSUFBVCxHQUNIUixNQUFRLFNBQU8sSUFBZixFQUFxQk4sU0FBU2MsS0FBVCxDQUFyQixDQURHLEdBRUhSLE1BQVEsSUFBUixDQUZKOzs7Ozs7O0FBS1YsU0FBU1MsU0FBVCxDQUFtQmpKLEdBQW5CLEVBQXdCLEdBQUdrSixJQUEzQixFQUFpQztPQUMzQixNQUFNQyxHQUFWLElBQWlCRCxJQUFqQixFQUF3QjtRQUNuQixlQUFlLE9BQU9sSixJQUFJbUosR0FBSixDQUF6QixFQUFvQztZQUM1QixJQUFJdEYsU0FBSixDQUFpQixhQUFZc0YsR0FBSSxvQkFBakMsQ0FBTjs7Ozs7QUM3TlMsU0FBU0MsYUFBVCxDQUF1QkMsTUFBdkIsRUFBK0I7UUFDdEMsRUFBQzVELGVBQUQsRUFBa0JGLFlBQWxCLEVBQWdDRCxTQUFoQyxLQUE2QytELE1BQW5EO1FBQ00sRUFBQ25FLFNBQUQsRUFBWUMsV0FBWixLQUEyQmtFLE9BQU92RSxZQUF4Qzs7U0FFTztZQUFBOztRQUdEd0UsUUFBSixHQUFlO2FBQVUsS0FBS0MsTUFBWjtLQUhiO1lBSUc7YUFDQ25GLEdBQVAsRUFBWXNCLElBQVosRUFBa0I7Y0FDVnRJLE1BQU1zSSxLQUFLWSxXQUFMLENBQW1CbEMsSUFBSW1DLFNBQUosTUFBbUJoSSxTQUF0QyxDQUFaO2VBQ09tSCxLQUFLOEQsT0FBTCxDQUFlcE0sR0FBZixFQUFvQmdILElBQUlJLElBQXhCLENBQVA7T0FISSxFQUpIOztlQVNNO2FBQ0ZKLEdBQVAsRUFBWXNCLElBQVosRUFBa0I7Y0FDVlEsUUFBUVIsS0FBSytELFFBQUwsQ0FBZ0JyRixHQUFoQixFQUFxQnFCLGVBQXJCLENBQWQ7Y0FDTWlFLFdBQVd4RCxNQUFNTixJQUFOLENBQVd4QixHQUFYLENBQWpCO1lBQ0c3RixjQUFjbUwsUUFBakIsRUFBNEI7Z0JBQ3BCdE0sTUFBTXNJLEtBQUtZLFdBQUwsQ0FBbUJuQixZQUFZdUUsUUFBWixLQUF5Qm5MLFNBQTVDLENBQVo7aUJBQ09tSCxLQUFLOEQsT0FBTCxDQUFlcE0sR0FBZixFQUFvQjhJLE1BQU0xQixJQUExQixDQUFQOztPQU5LLEVBVE47O2VBaUJNO1lBQ0gsUUFERzthQUVGSixHQUFQLEVBQVlzQixJQUFaLEVBQWtCO2NBQ1ZRLFFBQVFSLEtBQUsrRCxRQUFMLENBQWdCckYsR0FBaEIsRUFBcUJtQixZQUFyQixDQUFkO2VBQ09XLE1BQU1OLElBQU4sQ0FBV3hCLEdBQVgsRUFBZ0J1RixVQUFoQixDQUFQO09BSk8sRUFqQk4sRUFBUDs7V0F1QlN6QixRQUFULENBQWtCYixJQUFsQixFQUF3QjtXQUNmbkMsVUFBWUksVUFBVStCLElBQVYsQ0FBWixDQUFQOzs7V0FFT3NDLFVBQVQsQ0FBb0J2RixHQUFwQixFQUF5QnNCLElBQXpCLEVBQStCO1dBQ3RCQSxLQUFLWSxXQUFMLENBQW1CbEMsSUFBSW1DLFNBQUosRUFBbkIsQ0FBUDs7OztBQy9CVyxTQUFTcUQsZUFBVCxDQUF5QlAsTUFBekIsRUFBaUM7UUFDeEMsRUFBQzVELGVBQUQsRUFBa0JGLFlBQWxCLEtBQWtDOEQsTUFBeEM7UUFDTSxFQUFDbkUsU0FBRCxFQUFZQyxXQUFaLEtBQTJCa0UsT0FBT3ZFLFlBQXhDO1FBQ00sRUFBQytFLFFBQUQsS0FBYVIsT0FBT3ZFLFlBQTFCO1NBQ087Y0FDSytFLFFBREw7O1FBR0RQLFFBQUosR0FBZTthQUFVLEtBQUtDLE1BQVo7S0FIYjtZQUlHO2FBQ0NuRixHQUFQLEVBQVlzQixJQUFaLEVBQWtCO2NBQ1Z0SSxNQUFNZ0gsSUFBSXlCLFdBQUosRUFBWjtlQUNPSCxLQUFLOEQsT0FBTCxDQUFlcE0sR0FBZixFQUFvQmdILElBQUlJLElBQXhCLENBQVA7T0FISSxFQUpIOztlQVNNO2FBQ0ZKLEdBQVAsRUFBWXNCLElBQVosRUFBa0I7Y0FDVlEsUUFBUVIsS0FBSytELFFBQUwsQ0FBZ0JyRixHQUFoQixFQUFxQnFCLGVBQXJCLENBQWQ7Y0FDTXJJLE1BQU04SSxNQUFNTixJQUFOLENBQVd4QixHQUFYLENBQVo7WUFDRzdGLGNBQWNuQixHQUFqQixFQUF1QjtpQkFDZHNJLEtBQUs4RCxPQUFMLENBQWVwTSxHQUFmLEVBQW9COEksTUFBTTFCLElBQTFCLENBQVA7O09BTEssRUFUTjs7ZUFnQk07WUFDSCxPQURHO2FBRUZKLEdBQVAsRUFBWXNCLElBQVosRUFBa0I7Y0FDVlEsUUFBUVIsS0FBSytELFFBQUwsQ0FBZ0JyRixHQUFoQixFQUFxQm1CLFlBQXJCLENBQWQ7Y0FDTW5JLE1BQU04SSxNQUFNTixJQUFOLENBQVd4QixHQUFYLEVBQWdCMEYsVUFBaEIsQ0FBWjtZQUNHdkwsY0FBY25CLEdBQWpCLEVBQXVCO2lCQUNkc0ksS0FBSzhELE9BQUwsQ0FBZXBNLEdBQWYsRUFBb0I4SSxNQUFNMUIsSUFBMUIsQ0FBUDs7T0FOSyxFQWhCTixFQUFQOzs7QUF3QkYsU0FBU3NGLFVBQVQsQ0FBb0IxRixHQUFwQixFQUF5QjtTQUFVQSxJQUFJeUIsV0FBSixFQUFQOzs7QUMxQmIsU0FBU2tFLGdCQUFULENBQTBCeEMsT0FBMUIsRUFBbUN5QyxJQUFuQyxFQUF5Q1gsTUFBekMsRUFBaUQ7UUFDeEQsRUFBQ2hFLFNBQUQsS0FBY2dFLE1BQXBCO1FBQ00sRUFBQ3BFLGFBQUQsS0FBa0JvRSxPQUFPdkUsWUFBL0I7O1FBRU1tRixhQUFhdEMsU0FBUzlFLE1BQVQsQ0FBa0IsRUFBQzVDLFNBQVMsSUFBVixFQUFnQmEsT0FBTyxJQUF2QixFQUE2QkcsV0FBVyxRQUF4QyxFQUFsQixDQUFuQjtRQUNNaUosYUFBYXZDLFNBQVM5RSxNQUFULENBQWtCLEVBQUM1QyxTQUFTLElBQVYsRUFBZ0JRLE9BQU8sSUFBdkIsRUFBNkJRLFdBQVcsVUFBeEMsRUFBbEIsQ0FBbkI7O1FBRU1rSixZQUFZSCxPQUFLLEdBQXZCO1VBQ1FHLFNBQVIsSUFBcUJDLFNBQXJCO1FBQ01DLFlBQVlMLE9BQUssR0FBdkI7VUFDUUEsT0FBSyxHQUFiLElBQW9CTSxTQUFwQjs7U0FFTyxFQUFJekwsTUFBSzBMLElBQVQsRUFBZUEsSUFBZixFQUFQOztXQUVTQSxJQUFULENBQWNoQyxJQUFkLEVBQW9CdkksR0FBcEIsRUFBeUI7UUFDcEIsQ0FBRUEsSUFBSWMsS0FBVCxFQUFpQjtVQUNYQSxLQUFKLEdBQVl1RSxXQUFaOztRQUNFZ0MsSUFBSixHQUFXbUQsS0FBS0MsU0FBTCxDQUFpQjtVQUN0QixNQURzQixFQUNkQyxLQUFLLElBQUlDLElBQUosRUFEUyxFQUFqQixDQUFYO2VBRVdsSCxJQUFYLENBQWdCNEcsU0FBaEIsRUFBMkJySyxHQUEzQjtVQUNNb0UsTUFBTWEsY0FBZ0JqRixHQUFoQixDQUFaO1dBQ091SSxLQUFPbkUsR0FBUCxDQUFQOzs7V0FFT2tHLFNBQVQsQ0FBbUJsRyxHQUFuQixFQUF3QnNCLElBQXhCLEVBQThCa0YsTUFBOUIsRUFBc0M7ZUFDekJsSCxNQUFYLENBQWtCVSxHQUFsQjtRQUNJaUQsSUFBSixHQUFXakQsSUFBSXlHLFNBQUosRUFBWDtlQUNhekcsSUFBSWlELElBQWpCLEVBQXVCakQsR0FBdkIsRUFBNEJ3RyxNQUE1QjtXQUNPbEYsS0FBS29GLFFBQUwsQ0FBYzFHLElBQUlpRCxJQUFsQixFQUF3QmpELElBQUlJLElBQTVCLENBQVA7OztXQUVPdUcsVUFBVCxDQUFvQixFQUFDTCxHQUFELEVBQXBCLEVBQTJCTSxRQUEzQixFQUFxQ0osTUFBckMsRUFBNkM7VUFDckMsRUFBQ25LLEtBQUQsRUFBUUgsU0FBUixFQUFtQkQsU0FBbkIsRUFBOEJKLFNBQVFnTCxJQUF0QyxLQUE4Q0QsU0FBU3hHLElBQTdEO1VBQ014RSxNQUFNLEVBQUlTLEtBQUo7ZUFDRCxFQUFJSCxTQUFKLEVBQWVELFNBQWYsRUFEQztpQkFFQzRLLEtBQUs1SyxTQUZOLEVBRWlCQyxXQUFXMkssS0FBSzNLLFNBRmpDO1lBR0prSyxLQUFLQyxTQUFMLENBQWlCO1lBQ2pCLE1BRGlCLEVBQ1RDLEdBRFMsRUFDSlEsS0FBSyxJQUFJUCxJQUFKLEVBREQsRUFBakIsQ0FISSxFQUFaOztlQU1XbEgsSUFBWCxDQUFnQjBHLFNBQWhCLEVBQTJCbkssR0FBM0I7VUFDTW9FLE1BQU1hLGNBQWdCakYsR0FBaEIsQ0FBWjtXQUNPNEssT0FBT08sUUFBUCxDQUFrQixDQUFDL0csR0FBRCxDQUFsQixDQUFQOzs7V0FFT2dHLFNBQVQsQ0FBbUJoRyxHQUFuQixFQUF3QnNCLElBQXhCLEVBQThCO2VBQ2pCaEMsTUFBWCxDQUFrQlUsR0FBbEI7UUFDSWlELElBQUosR0FBV2pELElBQUl5RyxTQUFKLEVBQVg7V0FDT25GLEtBQUtvRixRQUFMLENBQWMxRyxJQUFJaUQsSUFBbEIsRUFBd0JqRCxJQUFJSSxJQUE1QixDQUFQOzs7O0FDdENXLFNBQVM0RyxhQUFULENBQXVCdEcsWUFBdkIsRUFBcUNELE9BQXJDLEVBQThDO1FBQ3JEd0UsU0FBU2dDLGFBQWV2RyxZQUFmLEVBQTZCRCxPQUE3QixDQUFmOztRQUVNMEMsVUFBVSxFQUFoQjtRQUNNK0QsT0FBT2pDLE9BQU9wQixjQUFQLENBQXdCVixPQUF4QixFQUNYLElBRFc7SUFFWGdFLGNBQVdsQyxNQUFYLENBRlcsQ0FBYjs7UUFJTW1DLFNBQVNuQyxPQUFPcEIsY0FBUCxDQUF3QlYsT0FBeEIsRUFDYixJQURhO0lBRWJrRSxnQkFBYXBDLE1BQWIsQ0FGYSxDQUFmOztRQUlNcUMsVUFBVUMsaUJBQWdCcEUsT0FBaEIsRUFDZCxJQURjO0lBRWQ4QixNQUZjLENBQWhCOztRQUlNdUMsU0FBVyxFQUFDTixJQUFELEVBQU9FLE1BQVAsRUFBZUUsT0FBZixFQUF3QkcsU0FBU1AsSUFBakMsRUFBakI7O1FBRU0sRUFBQ2pHLFNBQUQsS0FBY2dFLE1BQXBCO1NBQ1MsRUFBQzlCLE9BQUQsRUFBVXFFLE1BQVYsRUFBa0J2RyxTQUFsQixFQUFUOzs7QUMzQmEsTUFBTXlHLElBQU4sQ0FBVztTQUNqQkMsWUFBUCxDQUFvQixFQUFDeEUsT0FBRCxFQUFwQixFQUErQjtVQUN2QnVFLElBQU4sU0FBbUIsSUFBbkIsQ0FBd0I7U0FDbkJFLFNBQUwsQ0FBZUMsU0FBZixHQUEyQjFFLE9BQTNCO1dBQ091RSxJQUFQOzs7V0FFT25RLFFBQVQsRUFBbUJVLEdBQW5CLEVBQXdCaUUsU0FBeEIsRUFBbUM0TCxRQUFuQyxFQUE2QztVQUNyQ0MsYUFBYSxNQUFNOVAsSUFBSXVPLE1BQUosQ0FBV3dCLGdCQUFYLENBQTRCOUwsU0FBNUIsQ0FBekI7O1FBRUlzSyxNQUFKLENBQVd5QixjQUFYLENBQTRCL0wsU0FBNUIsRUFDRSxLQUFLZ00sYUFBTCxDQUFxQjNRLFFBQXJCLEVBQStCd1EsVUFBL0IsRUFBMkNELFFBQTNDLENBREY7V0FFTyxJQUFQOzs7Z0JBRVl2USxRQUFkLEVBQXdCd1EsVUFBeEIsRUFBb0MsRUFBQ2hQLE1BQUQsRUFBU3VKLFFBQVQsRUFBbUI2RixXQUFuQixFQUFwQyxFQUFxRTtRQUMvREMsUUFBUSxJQUFaO1VBQ01DLFdBQVcsS0FBS1IsU0FBdEI7VUFDTVMsVUFBVSxNQUFNRixLQUF0QjtVQUNNaFEsV0FBVyxDQUFDQyxHQUFELEVBQU1rUSxLQUFOLEtBQWdCO1VBQzVCSCxLQUFILEVBQVc7cUJBQ0tMLGFBQWFLLFFBQVEsS0FBckI7b0JBQ0YvUCxHQUFaLEVBQWlCa1EsS0FBakI7O0tBSEo7O1dBS09wUixNQUFQLENBQWdCLElBQWhCLEVBQXNCSSxTQUFTaVIsUUFBVCxDQUFrQixJQUFsQixDQUF0QixFQUErQyxFQUFJRixPQUFKLEVBQWFsUSxRQUFiLEVBQS9DO1dBQ09qQixNQUFQLENBQWdCSSxRQUFoQixFQUEwQixFQUFJK1EsT0FBSixFQUFhbFEsUUFBYixFQUExQjs7V0FFTyxPQUFPNEgsR0FBUCxFQUFZd0csTUFBWixLQUF1QjtVQUN6QixVQUFRNEIsS0FBUixJQUFpQixRQUFNcEksR0FBMUIsRUFBZ0M7ZUFBUW9JLEtBQVA7OztZQUUzQnhFLFdBQVd5RSxTQUFTckksSUFBSU4sSUFBYixDQUFqQjtVQUNHdkYsY0FBY3lKLFFBQWpCLEVBQTRCO2VBQ25CLEtBQUt0QixTQUFXLEtBQVgsRUFBa0IsRUFBSXRDLEdBQUosRUFBU3lJLE1BQU0sVUFBZixFQUFsQixDQUFaOzs7VUFFRTtZQUNFelAsTUFBTSxNQUFNNEssU0FBVzVELEdBQVgsRUFBZ0IsSUFBaEIsRUFBc0J3RyxNQUF0QixDQUFoQjtZQUNHLENBQUV4TixHQUFMLEVBQVc7aUJBQVFBLEdBQVA7O09BRmQsQ0FHQSxPQUFNWCxHQUFOLEVBQVk7ZUFDSCxLQUFLaUssU0FBV2pLLEdBQVgsRUFBZ0IsRUFBSTJILEdBQUosRUFBU3lJLE1BQU0sVUFBZixFQUFoQixDQUFaOzs7VUFFQyxVQUFVTCxLQUFiLEVBQXFCO2VBQ1o1QixPQUFPdUIsVUFBZDs7O1VBRUU7Y0FDSWhQLE9BQVNDLEdBQVQsRUFBY2dILEdBQWQsQ0FBTjtPQURGLENBRUEsT0FBTTNILEdBQU4sRUFBWTtZQUNOO2NBQ0VxUSxZQUFZcEcsU0FBV2pLLEdBQVgsRUFBZ0IsRUFBSVcsR0FBSixFQUFTZ0gsR0FBVCxFQUFjeUksTUFBTSxVQUFwQixFQUFoQixDQUFoQjtTQURGLFNBRVE7Y0FDSCxVQUFVQyxTQUFiLEVBQXlCO3FCQUNkclEsR0FBVCxFQUFjLEVBQUNXLEdBQUQsRUFBTWdILEdBQU4sRUFBZDttQkFDT3dHLE9BQU91QixVQUFkOzs7O0tBeEJSOzs7V0EwQk8vSCxHQUFULEVBQWMySSxRQUFkLEVBQXdCO1VBQ2hCdE0sUUFBUTJELElBQUlJLElBQUosQ0FBUy9ELEtBQXZCO1FBQ0l1TSxRQUFRLEtBQUtDLFFBQUwsQ0FBY0MsR0FBZCxDQUFrQnpNLEtBQWxCLENBQVo7UUFDR2xDLGNBQWN5TyxLQUFqQixFQUF5QjtVQUNwQixDQUFFdk0sS0FBTCxFQUFhO2NBQ0wsSUFBSUMsS0FBSixDQUFhLGtCQUFpQkQsS0FBTSxFQUFwQyxDQUFOOztVQUNDLGVBQWUsT0FBT3NNLFFBQXpCLEVBQW9DO2dCQUMxQkEsU0FBUzNJLEdBQVQsRUFBYyxJQUFkLEVBQW9CM0QsS0FBcEIsQ0FBUjtPQURGLE1BRUt1TSxRQUFRRCxRQUFSO1dBQ0FFLFFBQUwsQ0FBY0UsR0FBZCxDQUFvQjFNLEtBQXBCLEVBQTJCdU0sS0FBM0I7O1dBQ0tBLEtBQVA7OztpQkFFYXZNLEtBQWYsRUFBc0I7V0FDYixLQUFLd00sUUFBTCxDQUFjRyxNQUFkLENBQXFCM00sS0FBckIsQ0FBUDs7O2NBRVVULEdBQVosRUFBaUI7VUFBUyxJQUFJVSxLQUFKLENBQWEsb0NBQWIsQ0FBTjs7OztBQ2pFZixNQUFNMk0sVUFBTixDQUFlO2NBQ1JDLEVBQVosRUFBZ0I7U0FBUUEsRUFBTCxHQUFVQSxFQUFWOzs7WUFFVDtXQUFXLGFBQVlDLFVBQVUsS0FBS0QsRUFBZixFQUFtQixJQUFuQixDQUF5QixHQUE3Qzs7V0FDSjtXQUFVQyxVQUFVLEtBQUtELEVBQWYsRUFBbUIsS0FBbkIsQ0FBUDs7aUJBQ0c7V0FBVSxLQUFLQSxFQUFaOztlQUNMO1dBQVUsSUFBUDs7O01BRVpqTixTQUFKLEdBQWdCO1dBQVUsS0FBS2lOLEVBQUwsQ0FBUWpOLFNBQWY7O01BQ2ZDLFNBQUosR0FBZ0I7V0FBVSxLQUFLZ04sRUFBTCxDQUFRaE4sU0FBZjs7O1NBRVprTixjQUFQLENBQXNCQyxVQUF0QixFQUFrQ0MsVUFBbEMsRUFBOEM7aUJBQy9CeFMsT0FBT0MsTUFBUCxDQUFjdVMsY0FBYyxJQUE1QixDQUFiO2VBQ1c1TSxLQUFYLElBQW9CNk0sS0FBSyxLQUFLQyxRQUFMLENBQWdCQyxVQUFVRixDQUFWLENBQWhCLEVBQThCRixVQUE5QixDQUF6QjtXQUNPLEtBQUtLLGlCQUFMLENBQXVCSixVQUF2QixDQUFQOzs7U0FFS0UsUUFBUCxDQUFnQk4sRUFBaEIsRUFBb0JHLFVBQXBCLEVBQWdDaE4sS0FBaEMsRUFBdUM7UUFDbEMsQ0FBRTZNLEVBQUwsRUFBVTs7O1FBQ1AsZUFBZSxPQUFPQSxHQUFHUyxZQUE1QixFQUEyQztXQUNwQ1QsR0FBR1MsWUFBSCxFQUFMOzs7VUFFSUMsU0FBUyxJQUFJLElBQUosQ0FBU1YsRUFBVCxDQUFmO1FBQ0lXLElBQUo7UUFBVUMsT0FBTyxNQUFNRCxPQUFPUixXQUFXTyxNQUFYLEVBQW1CLEVBQUN2TixLQUFELEVBQW5CLEVBQTRCME4sU0FBMUQ7V0FDT2pULE9BQU9rVCxnQkFBUCxDQUEwQkosTUFBMUIsRUFBa0M7WUFDakMsRUFBSWQsTUFBTTtpQkFBVSxDQUFDZSxRQUFRQyxNQUFULEVBQWlCclAsSUFBeEI7U0FBYixFQURpQzthQUVoQyxFQUFJcU8sTUFBTTtpQkFBVSxDQUFDZSxRQUFRQyxNQUFULEVBQWlCRyxLQUF4QjtTQUFiLEVBRmdDO3FCQUd4QixFQUFJbFEsT0FBTyxDQUFDLENBQUVzQyxLQUFkLEVBSHdCLEVBQWxDLENBQVA7Ozs7QUFNSixNQUFNSyxRQUFRLFFBQWQ7QUFDQXVNLFdBQVN2TSxLQUFULEdBQWlCQSxLQUFqQjs7QUFFQXVNLFdBQVNFLFNBQVQsR0FBcUJBLFNBQXJCO0FBQ0EsQUFBTyxTQUFTQSxTQUFULENBQW1CRCxFQUFuQixFQUF1QmdCLE1BQXZCLEVBQStCO01BQ2hDLEVBQUNqTyxXQUFVa08sQ0FBWCxFQUFjak8sV0FBVWtPLENBQXhCLEtBQTZCbEIsRUFBakM7TUFDSSxDQUFDaUIsTUFBSSxDQUFMLEVBQVFFLFFBQVIsQ0FBaUIsRUFBakIsQ0FBSjtNQUNJLENBQUNELE1BQUksQ0FBTCxFQUFRQyxRQUFSLENBQWlCLEVBQWpCLENBQUo7TUFDR0gsTUFBSCxFQUFZO1dBQ0YsR0FBRXhOLEtBQU0sSUFBR3lOLENBQUUsSUFBR0MsQ0FBRSxFQUExQjs7O1FBRUloUSxNQUFNLEVBQUksQ0FBQ3NDLEtBQUQsR0FBVSxHQUFFeU4sQ0FBRSxJQUFHQyxDQUFFLEVBQXZCLEVBQVo7U0FDT2pULE1BQVAsQ0FBZ0JpRCxHQUFoQixFQUFxQjhPLEVBQXJCO1NBQ085TyxJQUFJNkIsU0FBWCxDQUFzQixPQUFPN0IsSUFBSThCLFNBQVg7U0FDZjlCLEdBQVA7OztBQUdGNk8sV0FBU1EsU0FBVCxHQUFxQkEsU0FBckI7QUFDQSxBQUFPLFNBQVNBLFNBQVQsQ0FBbUJGLENBQW5CLEVBQXNCO1FBQ3JCTCxLQUFLLGFBQWEsT0FBT0ssQ0FBcEIsR0FDUEEsRUFBRWUsS0FBRixDQUFRNU4sS0FBUixFQUFlLENBQWYsQ0FETyxHQUVQNk0sRUFBRTdNLEtBQUYsQ0FGSjtNQUdHLENBQUV3TSxFQUFMLEVBQVU7Ozs7TUFFTixDQUFDaUIsQ0FBRCxFQUFHQyxDQUFILElBQVFsQixHQUFHb0IsS0FBSCxDQUFTLEdBQVQsQ0FBWjtNQUNHblEsY0FBY2lRLENBQWpCLEVBQXFCOzs7TUFDakIsSUFBSUcsU0FBU0osQ0FBVCxFQUFZLEVBQVosQ0FBUjtNQUNJLElBQUlJLFNBQVNILENBQVQsRUFBWSxFQUFaLENBQVI7O1NBRU8sRUFBSW5PLFdBQVdrTyxDQUFmLEVBQWtCak8sV0FBV2tPLENBQTdCLEVBQVA7OztBQUdGbkIsV0FBU1MsaUJBQVQsR0FBNkJBLGlCQUE3QjtBQUNBLEFBQU8sU0FBU0EsaUJBQVQsQ0FBMkJKLFVBQTNCLEVBQXVDO1NBQ3JDa0IsTUFBTXBFLEtBQUtxRSxLQUFMLENBQWFELEVBQWIsRUFBaUJFLFNBQWpCLENBQWI7O1dBRVNBLE9BQVQsR0FBbUI7VUFDWEMsTUFBTSxJQUFJQyxPQUFKLEVBQVo7V0FDTyxVQUFTN0YsR0FBVCxFQUFjaEwsS0FBZCxFQUFxQjtZQUNwQjhRLE1BQU12QixXQUFXdkUsR0FBWCxDQUFaO1VBQ0c1SyxjQUFjMFEsR0FBakIsRUFBdUI7WUFDakI5QixHQUFKLENBQVEsSUFBUixFQUFjOEIsR0FBZDtlQUNPOVEsS0FBUDs7O1VBRUMsYUFBYSxPQUFPQSxLQUF2QixFQUErQjtjQUN2QitRLE1BQU1ILElBQUk3QixHQUFKLENBQVEvTyxLQUFSLENBQVo7WUFDR0ksY0FBYzJRLEdBQWpCLEVBQXVCO2lCQUNkQSxJQUFNL1EsS0FBTixDQUFQOzs7YUFDR0EsS0FBUDtLQVZGOzs7O0FDbEVXLE1BQU1uQyxNQUFOLENBQWE7U0FDbkIrUCxZQUFQLENBQW9CLEVBQUMxRyxTQUFELEVBQVl1RyxNQUFaLEVBQXBCLEVBQXlDO1VBQ2pDNVAsTUFBTixTQUFxQixJQUFyQixDQUEwQjtXQUNuQmdRLFNBQVAsQ0FBaUIzRyxTQUFqQixHQUE2QkEsU0FBN0I7V0FDTzhKLFVBQVAsQ0FBb0J2RCxNQUFwQjtXQUNPNVAsTUFBUDs7O1NBRUtvVCxNQUFQLENBQWMvUyxHQUFkLEVBQW1CZ1QsT0FBbkIsRUFBNEI7VUFDcEIsRUFBQ0MsT0FBRCxLQUFZRCxPQUFsQjs7VUFFTXJULE1BQU4sU0FBcUIsSUFBckIsQ0FBMEI7V0FDbkJnUSxTQUFQLENBQWlCdUQsU0FBakIsR0FBNkIsTUFBTW5MLEdBQU4sSUFBYTtZQUNsQ2tMLFFBQVFsTCxHQUFSLENBQU47YUFDTyxJQUFQO0tBRkY7O1dBSU9wSSxNQUFQOzs7Y0FHVXNSLEVBQVosRUFBZ0I7UUFDWCxRQUFRQSxFQUFYLEVBQWdCO1lBQ1IsRUFBQ2hOLFNBQUQsRUFBWUQsU0FBWixLQUF5QmlOLEVBQS9CO1lBQ01yTixVQUFVL0UsT0FBT3NVLE1BQVAsQ0FBZ0IsRUFBQ2xQLFNBQUQsRUFBWUQsU0FBWixFQUFoQixDQUFoQjtXQUNLM0MsR0FBTCxHQUFXLEVBQUl1QyxPQUFKLEVBQVg7Ozs7ZUFHU3RFLFFBQWIsRUFBdUI7V0FDZFQsT0FBT2tULGdCQUFQLENBQTBCLElBQTFCLEVBQWdDO2dCQUMzQixFQUFJalEsT0FBT3hDLFFBQVgsRUFEMkIsRUFBaEMsQ0FBUDs7O09BSUdtRixRQUFNLElBQVgsRUFBaUI7V0FBVSxLQUFLMk8sVUFBTCxDQUFnQixLQUFLQyxVQUFMLENBQWdCaEUsT0FBaEIsQ0FBd0JuQixJQUF4QyxFQUE4QyxFQUE5QyxFQUFrRHpKLEtBQWxELENBQVA7O09BQ2YsR0FBR2pGLElBQVIsRUFBYztXQUFVLEtBQUs0VCxVQUFMLENBQWdCLEtBQUtFLE1BQUwsQ0FBWTlRLElBQTVCLEVBQWtDaEQsSUFBbEMsQ0FBUDs7WUFDUCxHQUFHQSxJQUFiLEVBQW1CO1dBQVUsS0FBSzRULFVBQUwsQ0FBZ0IsS0FBS0UsTUFBTCxDQUFZOVEsSUFBNUIsRUFBa0NoRCxJQUFsQyxFQUF3QyxJQUF4QyxDQUFQOztRQUNoQixHQUFHQSxJQUFULEVBQWU7V0FBVSxLQUFLNFQsVUFBTCxDQUFnQixLQUFLRSxNQUFMLENBQVk5USxJQUE1QixFQUFrQ2hELElBQWxDLEVBQXdDLElBQXhDLEVBQThDK1QsS0FBckQ7OztTQUVYLEdBQUcvVCxJQUFWLEVBQWdCO1dBQVUsS0FBSzRULFVBQUwsQ0FBa0IsS0FBS0UsTUFBTCxDQUFZdkgsTUFBOUIsRUFBc0N2TSxJQUF0QyxDQUFQOztTQUNac04sR0FBUCxFQUFZLEdBQUd0TixJQUFmLEVBQXFCO1dBQVUsS0FBSzRULFVBQUwsQ0FBa0IsS0FBS0UsTUFBTCxDQUFZeEcsR0FBWixDQUFsQixFQUFvQ3ROLElBQXBDLENBQVA7O2FBQ2JnVSxPQUFYLEVBQW9CL08sS0FBcEIsRUFBMkI7UUFDdEIsZUFBZSxPQUFPK08sT0FBekIsRUFBbUM7Z0JBQVcsS0FBS0YsTUFBZjs7V0FDN0IsQ0FBQyxHQUFHOVQsSUFBSixLQUFhLEtBQUs0VCxVQUFMLENBQWdCSSxPQUFoQixFQUF5QmhVLElBQXpCLEVBQStCaUYsS0FBL0IsQ0FBcEI7OzthQUVTeEQsTUFBWCxFQUFtQnpCLElBQW5CLEVBQXlCaUYsS0FBekIsRUFBZ0M7VUFDeEJkLE1BQU05RSxPQUFPSyxNQUFQLENBQWdCLEVBQWhCLEVBQW9CLEtBQUttQyxHQUF6QixDQUFaO1FBQ0csUUFBUW9ELEtBQVgsRUFBbUI7Y0FBU2QsSUFBSWMsS0FBWjtLQUFwQixNQUNLZCxJQUFJYyxLQUFKLEdBQVlBLEtBQVo7UUFDRixTQUFTQSxLQUFaLEVBQW9CO2NBQ1ZkLElBQUljLEtBQUosR0FBWSxLQUFLdUUsU0FBTCxFQUFwQjs7O1NBRUd5SyxhQUFMOztVQUVNdFIsTUFBTWxCLE9BQVMsS0FBS2lTLFNBQWQsRUFBeUJ2UCxHQUF6QixFQUE4QixHQUFHbkUsSUFBakMsQ0FBWjtRQUNHLENBQUVpRixLQUFGLElBQVcsZUFBZSxPQUFPdEMsSUFBSUcsSUFBeEMsRUFBK0M7YUFBUUgsR0FBUDs7O1FBRTVDdVIsU0FBVXZSLElBQUlHLElBQUosRUFBZDtVQUNNaVIsUUFBUSxLQUFLalUsUUFBTCxDQUFjcVUsU0FBZCxDQUF3QmxQLEtBQXhCLEVBQStCaVAsTUFBL0IsRUFBdUMsSUFBdkMsQ0FBZDthQUNTQSxPQUFPcFIsSUFBUCxDQUFjLE9BQVEsRUFBQ2lSLEtBQUQsRUFBUixDQUFkLENBQVQ7V0FDT0EsS0FBUCxHQUFlQSxLQUFmO1dBQ09HLE1BQVA7OztNQUVFOVQsRUFBSixHQUFTO1dBQVUsQ0FBQ2dVLEdBQUQsRUFBTSxHQUFHcFUsSUFBVCxLQUFrQjtVQUNoQyxRQUFRb1UsR0FBWCxFQUFpQjtjQUFPLElBQUl2UCxLQUFKLENBQWEsc0JBQWIsQ0FBTjs7O1lBRVp3UCxPQUFPLEtBQUtDLEtBQUwsRUFBYjs7WUFFTXpTLE1BQU13UyxLQUFLeFMsR0FBakI7VUFDRyxhQUFhLE9BQU91UyxHQUF2QixFQUE2QjtZQUN2QjNQLFNBQUosR0FBZ0IyUCxHQUFoQjtZQUNJNVAsU0FBSixHQUFnQjNDLElBQUl1QyxPQUFKLENBQVlJLFNBQTVCO09BRkYsTUFHSztjQUNHd04sVUFBVW9DLEdBQVYsS0FBa0JBLEdBQXhCO2NBQ00sRUFBQ2hRLFNBQVNtUSxRQUFWLEVBQW9COVAsU0FBcEIsRUFBK0JELFNBQS9CLEVBQTBDUyxLQUExQyxFQUFpREwsS0FBakQsS0FBMER3UCxHQUFoRTs7WUFFRzFSLGNBQWMrQixTQUFqQixFQUE2QjtjQUN2QkEsU0FBSixHQUFnQkEsU0FBaEI7Y0FDSUQsU0FBSixHQUFnQkEsU0FBaEI7U0FGRixNQUdLLElBQUc5QixjQUFjNlIsUUFBZCxJQUEwQixDQUFFMVMsSUFBSTRDLFNBQW5DLEVBQStDO2NBQzlDQSxTQUFKLEdBQWdCOFAsU0FBUzlQLFNBQXpCO2NBQ0lELFNBQUosR0FBZ0IrUCxTQUFTL1AsU0FBekI7OztZQUVDOUIsY0FBY3VDLEtBQWpCLEVBQXlCO2NBQUtBLEtBQUosR0FBWUEsS0FBWjs7WUFDdkJ2QyxjQUFja0MsS0FBakIsRUFBeUI7Y0FBS0EsS0FBSixHQUFZQSxLQUFaOzs7O2FBRXJCLE1BQU01RSxLQUFLQyxNQUFYLEdBQW9Cb1UsSUFBcEIsR0FBMkJBLEtBQUtHLElBQUwsQ0FBWSxHQUFHeFUsSUFBZixDQUFsQztLQXZCVTs7O09BeUJQLEdBQUdBLElBQVIsRUFBYztVQUNONkIsTUFBTSxLQUFLQSxHQUFqQjtTQUNJLElBQUl1UyxHQUFSLElBQWVwVSxJQUFmLEVBQXNCO1VBQ2pCLFNBQVNvVSxHQUFULElBQWdCLFVBQVVBLEdBQTdCLEVBQW1DO1lBQzdCblAsS0FBSixHQUFZbVAsR0FBWjtPQURGLE1BRUssSUFBRyxRQUFRQSxHQUFYLEVBQWlCO2NBQ2QsRUFBQ25QLEtBQUQsRUFBUUwsS0FBUixLQUFpQndQLEdBQXZCO1lBQ0cxUixjQUFjdUMsS0FBakIsRUFBeUI7Y0FBS0EsS0FBSixHQUFZQSxLQUFaOztZQUN2QnZDLGNBQWNrQyxLQUFqQixFQUF5QjtjQUFLQSxLQUFKLEdBQVlBLEtBQVo7Ozs7V0FDdkIsSUFBUDs7O2NBRVU7V0FDSCxLQUFLMFAsS0FBTCxDQUFhLEVBQUNyUCxPQUFPLElBQVIsRUFBYixDQUFQOzs7UUFFSSxHQUFHakYsSUFBVCxFQUFlO1dBQ05YLE9BQU9DLE1BQVAsQ0FBZ0IsSUFBaEIsRUFBc0I7V0FDcEIsRUFBQ2dELE9BQU9qRCxPQUFPSyxNQUFQLENBQWdCLEVBQWhCLEVBQW9CLEtBQUttQyxHQUF6QixFQUE4QixHQUFHN0IsSUFBakMsQ0FBUixFQURvQixFQUF0QixDQUFQOzs7a0JBSWM7UUFDWCxDQUFFLEtBQUt5VSxZQUFMLEVBQUwsRUFBMkI7WUFDbkIsSUFBSTVQLEtBQUosQ0FBYSx3QkFBYixDQUFOOzs7aUJBQ1c7V0FBVSxJQUFQOztVQUNWbUUsVUFBUSxFQUFoQixFQUFvQjtRQUNmLFNBQVNBLE9BQVQsSUFBb0IsVUFBVUEsT0FBakMsRUFBMkM7Z0JBQy9CLEVBQUkwTCxRQUFRMUwsT0FBWixFQUFWOzs7VUFFSTJMLFVBQVUsS0FBSzdVLFFBQUwsQ0FBYzhVLFdBQWQsQ0FBMEIsS0FBSy9TLEdBQUwsQ0FBUzRDLFNBQW5DLENBQWhCOztVQUVNb1EsY0FBYzdMLFFBQVE2TCxXQUFSLElBQXVCLElBQTNDO1FBQ0lDLFlBQVk5TCxRQUFROEwsU0FBeEI7UUFDRyxTQUFTQSxTQUFaLEVBQXdCO2tCQUNWRCxjQUFZLENBQXhCOzs7UUFFRUosWUFBSjtVQUNNTSxVQUFVLElBQUlqVSxPQUFKLENBQWMsQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO1lBQzNDakIsT0FBT2lKLFFBQVFoSSxNQUFSLEdBQWlCQSxNQUFqQixHQUEwQkQsT0FBdkM7V0FDSzBULFlBQUwsR0FBb0JBLGVBQWUsTUFDakNJLGNBQWNGLFFBQVFLLEVBQVIsRUFBZCxHQUNJLElBREosSUFDWWpWLEtBQUs0VSxPQUFMLEdBQWUsS0FEM0IsQ0FERjtLQUZjLENBQWhCOztRQU1JTSxHQUFKO1VBQ01DLGNBQWNKLGFBQWFELGNBQVksQ0FBN0M7UUFDRzdMLFFBQVEwTCxNQUFSLElBQWtCSSxTQUFyQixFQUFpQztZQUN6QkssT0FBTyxLQUFLQyxLQUFMLENBQVcsU0FBWCxDQUFiO1lBQ01DLFlBQVksTUFBTTtZQUNuQkgsY0FBY1AsUUFBUUssRUFBUixFQUFqQixFQUFnQztlQUN6QnZULE1BQUwsQ0FBWSxNQUFaOztPQUZKO1lBR002VCxZQUFjRCxTQUFkLEVBQXlCSCxXQUF6QixDQUFOO0tBTEYsTUFNSztZQUNHSSxZQUFjYixZQUFkLEVBQTRCUyxXQUE1QixDQUFOOztRQUNDRCxJQUFJTSxLQUFQLEVBQWU7VUFBS0EsS0FBSjs7VUFDVkMsUUFBUSxNQUFNQyxjQUFjUixHQUFkLENBQXBCOztZQUVRblMsSUFBUixDQUFhMFMsS0FBYixFQUFvQkEsS0FBcEI7V0FDT1QsT0FBUDs7O1FBR0lXLFNBQU4sRUFBaUIsR0FBRzFWLElBQXBCLEVBQTBCO1FBQ3JCLGFBQWEsT0FBTzBWLFNBQXZCLEVBQW1DO2tCQUNyQixLQUFLN0IsVUFBTCxDQUFnQjZCLFNBQWhCLENBQVo7OztRQUVDLGVBQWUsT0FBT0EsVUFBVTFTLElBQW5DLEVBQTBDO1lBQ2xDLElBQUlnRixTQUFKLENBQWlCLGdDQUFqQixDQUFOOzs7V0FFSzNJLE9BQU9DLE1BQVAsQ0FBZ0IsSUFBaEIsRUFBd0I7Y0FDbkIsRUFBQ2dELE9BQU9vVCxTQUFSLEVBRG1CO1dBRXRCLEVBQUNwVCxPQUFPakQsT0FBT0ssTUFBUCxDQUFnQixFQUFoQixFQUFvQixLQUFLbUMsR0FBekIsRUFBOEIsR0FBRzdCLElBQWpDLENBQVIsRUFGc0IsRUFBeEIsQ0FBUDs7O1NBSUtzVCxVQUFQLENBQWtCcUMsU0FBbEIsRUFBNkI7U0FDdkIsTUFBTSxDQUFDQyxJQUFELEVBQU9GLFNBQVAsQ0FBVixJQUErQnJXLE9BQU93VyxPQUFQLENBQWlCRixTQUFqQixDQUEvQixFQUE0RDtXQUNyRHhGLFNBQUwsQ0FBZXlGLElBQWYsSUFBdUIsWUFBVztlQUN6QixLQUFLUixLQUFMLENBQWFNLFNBQWIsQ0FBUDtPQURGOztTQUVHdkYsU0FBTCxDQUFlMEQsVUFBZixHQUE0QjhCLFNBQTVCO1NBQ0t4RixTQUFMLENBQWUyRCxNQUFmLEdBQXdCNkIsVUFBVTNGLE9BQWxDOzs7VUFHTThGLFlBQVlILFVBQVVsRyxJQUFWLENBQWV6TSxJQUFqQztXQUNPdVAsZ0JBQVAsQ0FBMEIsS0FBS3BDLFNBQS9CLEVBQTRDO2lCQUMvQixFQUFJa0IsTUFBTTtpQkFBWTtrQkFDekIsQ0FBQyxHQUFHclIsSUFBSixLQUFhLEtBQUs0VCxVQUFMLENBQWdCa0MsU0FBaEIsRUFBMkI5VixJQUEzQixDQURZO3VCQUVwQixDQUFDLEdBQUdBLElBQUosS0FBYSxLQUFLNFQsVUFBTCxDQUFnQmtDLFNBQWhCLEVBQTJCOVYsSUFBM0IsRUFBaUMsSUFBakMsQ0FGTzttQkFHeEIsQ0FBQyxHQUFHQSxJQUFKLEtBQWEsS0FBSzRULFVBQUwsQ0FBZ0JrQyxTQUFoQixFQUEyQjlWLElBQTNCLEVBQWlDLElBQWpDLEVBQXVDK1QsS0FINUIsRUFBVDtTQUFiLEVBRCtCLEVBQTVDOztXQU1PLElBQVA7OztvQkFHZ0JnQyxPQUFsQixFQUEyQjtXQUNsQixJQUFJalYsT0FBSixDQUFjLENBQUNDLE9BQUQsRUFBVUMsTUFBVixLQUFxQjtjQUNoQzhCLElBQVIsQ0FBZS9CLE9BQWYsRUFBd0JDLE1BQXhCO2NBQ1E4QixJQUFSLENBQWUwUyxLQUFmLEVBQXNCQSxLQUF0Qjs7WUFFTVEsVUFBVSxNQUFNaFYsT0FBUyxJQUFJLEtBQUtpVixZQUFULEVBQVQsQ0FBdEI7WUFDTWhCLE1BQU1pQixXQUFXRixPQUFYLEVBQW9CLEtBQUtHLFVBQXpCLENBQVo7VUFDR2xCLElBQUlNLEtBQVAsRUFBZTtZQUFLQSxLQUFKOzs7ZUFFUEMsS0FBVCxHQUFpQjtxQkFBa0JQLEdBQWY7O0tBUmYsQ0FBUDs7OztBQVdKLE1BQU1nQixZQUFOLFNBQTJCcFIsS0FBM0IsQ0FBaUM7O0FBRWpDeEYsT0FBT0ssTUFBUCxDQUFnQlMsT0FBT2dRLFNBQXZCLEVBQWtDO2NBQUEsRUFDbEJnRyxZQUFZLElBRE0sRUFBbEM7O0FDekxlLE1BQU1DLFFBQU4sQ0FBZTtTQUNyQkMsUUFBUCxDQUFnQkMsVUFBaEIsRUFBNEI7VUFDcEJGLFFBQU4sU0FBdUIsSUFBdkIsQ0FBNEI7V0FDckIxVyxNQUFQLENBQWdCMFcsU0FBU2pHLFNBQXpCLEVBQW9DbUcsVUFBcEM7V0FDT0YsUUFBUDs7O1lBRVE7V0FBVyxhQUFZMUUsVUFBVSxLQUFLRCxFQUFmLEVBQW1CLElBQW5CLENBQXlCLEdBQTdDOztXQUNKO1dBQVUsS0FBS2xQLE9BQUwsR0FBZWdVLE1BQWYsRUFBUDs7WUFDRjtXQUFVLElBQUksS0FBSy9FLFFBQVQsQ0FBa0IsS0FBS0MsRUFBdkIsQ0FBUDs7aUJBQ0U7V0FBVSxLQUFLQSxFQUFaOzs7Y0FFTkEsRUFBWixFQUFnQnZSLE9BQWhCLEVBQXlCO1dBQ2hCcVMsZ0JBQVAsQ0FBMEIsSUFBMUIsRUFBZ0M7VUFDMUIsRUFBSWpRLE9BQU9tUCxFQUFYLEVBRDBCO1VBRTFCLEVBQUluUCxPQUFPcEMsUUFBUXNXLFlBQVIsQ0FBcUIsSUFBckIsRUFBMkJwVyxFQUF0QyxFQUYwQixFQUFoQzs7O2NBSVU7V0FBVSxJQUFJcVcsR0FBSixFQUFQOzttQkFDRTtXQUFVLEtBQUtDLFNBQUwsRUFBUDs7bUJBQ0g7V0FBVSxLQUFLQSxTQUFMLEVBQVA7O3FCQUNEO1dBQVUsS0FBS0EsU0FBTCxFQUFQOzt3QkFDQTtXQUFVLEtBQUtBLFNBQUwsRUFBUDs7O1dBRWhCN00sSUFBVCxFQUFlO1VBQ1A4TSxXQUFXLEtBQUtDLGNBQUwsRUFBakI7VUFDTUMsYUFBYSxLQUFLQyxnQkFBTCxFQUFuQjtXQUNPdkUsZ0JBQVAsQ0FBMEIsSUFBMUIsRUFBa0M7Z0JBQ3RCLEVBQUlqUSxPQUFPcVUsUUFBWCxFQURzQjtrQkFFcEIsRUFBSXJVLE9BQU91VSxVQUFYLEVBRm9CLEVBQWxDOztVQUlNRSxVQUFVLENBQUMzUyxPQUFELEVBQVUyUyxPQUFWLEtBQXNCO1lBQzlCQyxLQUFLbEksS0FBS21JLEdBQUwsRUFBWDtVQUNHN1MsT0FBSCxFQUFhO2NBQ0x1TyxJQUFJa0UsV0FBV3hGLEdBQVgsQ0FBZWpOLFFBQVFLLFNBQXZCLENBQVY7WUFDRy9CLGNBQWNpUSxDQUFqQixFQUFxQjtZQUNqQnFFLEVBQUYsR0FBT3JFLEVBQUcsTUFBS29FLE9BQVEsRUFBaEIsSUFBcUJDLEVBQTVCOzs7V0FDQ0UsV0FBTCxDQUFpQjlTLE9BQWpCLEVBQTBCMlMsT0FBMUIsRUFBbUNDLEVBQW5DO0tBTkY7O1dBUU87Z0JBQ0ssS0FBS0csY0FBTCxFQURMO21CQUVRLEtBQUszRixRQUFMLENBQWNHLGNBQWQsQ0FBNkIsS0FBS3ZSLEVBQWxDLENBRlI7O2dCQUlLLENBQUNtQixHQUFELEVBQU1vSCxJQUFOLEtBQWU7Z0JBQ2ZBLEtBQUt2RSxPQUFiLEVBQXNCLE1BQXRCO2NBQ00yUCxRQUFRNEMsU0FBU3RGLEdBQVQsQ0FBYTFJLEtBQUsxRCxLQUFsQixDQUFkO2NBQ01tUyxPQUFPLEtBQUtuSSxRQUFMLENBQWMxTixHQUFkLEVBQW1Cb0gsSUFBbkIsRUFBeUJvTCxLQUF6QixDQUFiOztZQUVHclIsY0FBY3FSLEtBQWpCLEVBQXlCO2tCQUNmaFQsT0FBUixDQUFnQnFXLFFBQVEsRUFBQzdWLEdBQUQsRUFBTW9ILElBQU4sRUFBeEIsRUFBcUM3RixJQUFyQyxDQUEwQ2lSLEtBQTFDO1NBREYsTUFFSyxPQUFPcUQsSUFBUDtPQVhGOztlQWFJLENBQUM3VixHQUFELEVBQU1vSCxJQUFOLEtBQWU7Z0JBQ2RBLEtBQUt2RSxPQUFiLEVBQXNCLEtBQXRCO2NBQ00yUCxRQUFRNEMsU0FBU3RGLEdBQVQsQ0FBYTFJLEtBQUsxRCxLQUFsQixDQUFkO2NBQ01tUyxPQUFPLEtBQUt6SixPQUFMLENBQWFwTSxHQUFiLEVBQWtCb0gsSUFBbEIsRUFBd0JvTCxLQUF4QixDQUFiOztZQUVHclIsY0FBY3FSLEtBQWpCLEVBQXlCO2tCQUNmaFQsT0FBUixDQUFnQnFXLElBQWhCLEVBQXNCdFUsSUFBdEIsQ0FBMkJpUixLQUEzQjtTQURGLE1BRUssT0FBT3FELElBQVA7T0FwQkY7O3NCQXNCVyxDQUFDaE4sT0FBRCxFQUFVekIsSUFBVixLQUFtQjtnQkFDekJBLEtBQUt2RSxPQUFiLEVBQXNCLFFBQXRCO09BdkJHO2tCQXdCTyxDQUFDN0MsR0FBRCxFQUFNb0gsSUFBTixLQUFlO2dCQUNqQkEsS0FBS3ZFLE9BQWIsRUFBc0IsUUFBdEI7Y0FDTTJQLFFBQVE0QyxTQUFTdEYsR0FBVCxDQUFhMUksS0FBSzFELEtBQWxCLENBQWQ7Y0FDTW1GLFVBQVUsS0FBS08sVUFBTCxDQUFnQnBKLEdBQWhCLEVBQXFCb0gsSUFBckIsRUFBMkJvTCxLQUEzQixDQUFoQjs7WUFFR3JSLGNBQWNxUixLQUFqQixFQUF5QjtrQkFDZmhULE9BQVIsQ0FBZ0JxSixPQUFoQixFQUF5QnRILElBQXpCLENBQThCaVIsS0FBOUI7O2VBQ0szSixPQUFQO09BL0JHLEVBQVA7OztZQWlDUXFILEVBQVYsRUFBYztRQUNUQSxFQUFILEVBQVE7YUFBUSxLQUFLRCxRQUFMLENBQWNPLFFBQWQsQ0FBeUJOLEVBQXpCLEVBQTZCLEtBQUtyUixFQUFsQyxDQUFQOzs7WUFDRCxFQUFDZ0UsU0FBUXFOLEVBQVQsRUFBYTdNLEtBQWIsRUFBVixFQUErQjtRQUMxQjZNLEVBQUgsRUFBUTthQUFRLEtBQUtELFFBQUwsQ0FBY08sUUFBZCxDQUF5Qk4sRUFBekIsRUFBNkIsS0FBS3JSLEVBQWxDLEVBQXNDd0UsS0FBdEMsQ0FBUDs7OztjQUVDUixPQUFaLEVBQXFCMlMsT0FBckIsRUFBOEJDLEVBQTlCLEVBQWtDO1dBQ3pCelYsR0FBVCxFQUFjb0gsSUFBZCxFQUFvQjBPLFFBQXBCLEVBQThCO1FBQ3pCQSxRQUFILEVBQWM7YUFBUTlWLEdBQVA7OztVQUNUQSxHQUFSLEVBQWFvSCxJQUFiLEVBQW1CME8sUUFBbkIsRUFBNkI7UUFDeEJBLFFBQUgsRUFBYzthQUFROVYsR0FBUDs7V0FDUixFQUFJQSxHQUFKLEVBQVNvSCxJQUFULEVBQWVuSCxRQUFRLEtBQUs4VixTQUFMLENBQWUzTyxJQUFmLENBQXZCLEVBQVA7O2FBQ1NwSCxHQUFYLEVBQWdCb0gsSUFBaEIsRUFBc0IwTyxRQUF0QixFQUFnQztZQUN0QkUsSUFBUixDQUFnQix5QkFBd0I1TyxJQUFLLEVBQTdDO1dBQ08sSUFBUDs7Ozs7OztHQVFGd0wsVUFBVWxQLEtBQVYsRUFBaUJpUCxNQUFqQixFQUF5QmhVLE9BQXpCLEVBQWtDO1dBQ3pCLEtBQUtzWCxnQkFBTCxDQUF3QnZTLEtBQXhCLEVBQStCaVAsTUFBL0IsRUFBdUNoVSxPQUF2QyxDQUFQOzs7Y0FFVXVFLFNBQVosRUFBdUI7VUFDZjZJLE1BQU03SSxVQUFVQSxTQUFWLElBQXVCQSxTQUFuQztRQUNJa1EsVUFBVSxLQUFLa0MsVUFBTCxDQUFnQnhGLEdBQWhCLENBQXNCL0QsR0FBdEIsQ0FBZDtRQUNHNUssY0FBY2lTLE9BQWpCLEVBQTJCO2dCQUNmLEVBQUlsUSxTQUFKLEVBQWV1UyxJQUFJbEksS0FBS21JLEdBQUwsRUFBbkI7YUFDSDtpQkFBVW5JLEtBQUttSSxHQUFMLEtBQWEsS0FBS0QsRUFBekI7U0FEQSxFQUFWO1dBRUtILFVBQUwsQ0FBZ0J2RixHQUFoQixDQUFzQmhFLEdBQXRCLEVBQTJCcUgsT0FBM0I7O1dBQ0tBLE9BQVA7OzttQkFFZTFQLEtBQWpCLEVBQXdCaVAsTUFBeEIsRUFBZ0NoVSxPQUFoQyxFQUF5QztRQUNuQzZULFFBQVEsSUFBSWpULE9BQUosQ0FBYyxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7V0FDeEMyVixRQUFMLENBQWNyRixHQUFkLENBQW9Cck0sS0FBcEIsRUFBMkJsRSxPQUEzQjthQUNPMFcsS0FBUCxDQUFlelcsTUFBZjtLQUZVLENBQVo7O1FBSUdkLE9BQUgsRUFBYTtjQUNIQSxRQUFRd1gsaUJBQVIsQ0FBMEIzRCxLQUExQixDQUFSOzs7VUFFSXlCLFFBQVEsTUFBTSxLQUFLbUIsUUFBTCxDQUFjcEYsTUFBZCxDQUF1QnRNLEtBQXZCLENBQXBCO1VBQ01uQyxJQUFOLENBQWEwUyxLQUFiLEVBQW9CQSxLQUFwQjtXQUNPekIsS0FBUDs7OztBQUVKcUMsU0FBU2pHLFNBQVQsQ0FBbUJxQixRQUFuQixHQUE4QkEsVUFBOUI7O0FDL0dBLE1BQU1tRyx5QkFBMkI7ZUFDbEIsVUFEa0I7U0FFeEIsRUFBQ3BXLEdBQUQsRUFBTXdTLEtBQU4sRUFBYXBMLElBQWIsRUFBUCxFQUEyQjtZQUNqQjRPLElBQVIsQ0FBZSxlQUFmLEVBQWdDLEVBQUloVyxHQUFKLEVBQVN3UyxLQUFULEVBQWdCcEwsSUFBaEIsRUFBaEM7R0FINkI7V0FJdEJwSSxFQUFULEVBQWFLLEdBQWIsRUFBa0JrUSxLQUFsQixFQUF5QjtZQUNmMU4sS0FBUixDQUFnQixpQkFBaEIsRUFBbUN4QyxHQUFuQzs7O0dBTDZCLEVBUS9COFAsWUFBWW5RLEVBQVosRUFBZ0JLLEdBQWhCLEVBQXFCa1EsS0FBckIsRUFBNEI7O1lBRWxCMU4sS0FBUixDQUFpQixzQkFBcUJ4QyxJQUFJc0MsT0FBUSxFQUFsRDtHQVY2Qjs7V0FZdEIwVSxPQUFULEVBQWtCOztXQUVUQSxPQUFQO0dBZDZCOzthQWdCcEJqSixLQUFLQyxTQWhCZTtjQWlCbkI7V0FBVSxJQUFJNkgsR0FBSixFQUFQLENBQUg7R0FqQm1CLEVBQWpDLENBb0JBLHNCQUFlLFVBQVNvQixjQUFULEVBQXlCO21CQUNyQnhZLE9BQU9LLE1BQVAsQ0FBZ0IsRUFBaEIsRUFBb0JpWSxzQkFBcEIsRUFBNENFLGNBQTVDLENBQWpCO1FBQ007ZUFBQSxFQUNTck8sU0FEVCxFQUNvQkMsU0FEcEI7WUFFSXFPLGNBRko7Y0FHTUMsZ0JBSE47aUJBSVNDLG1CQUpUO2FBQUEsS0FNSkgsY0FORjs7TUFRR0EsZUFBZUksUUFBbEIsRUFBNkI7V0FDcEJ2WSxNQUFQLENBQWdCTixVQUFoQixFQUEwQnlZLGVBQWVJLFFBQXpDOzs7U0FFTyxFQUFDQyxPQUFPLENBQVIsRUFBVzdCLFFBQVgsRUFBcUI4QixJQUFyQixFQUFUOztXQUVTOUIsUUFBVCxDQUFrQitCLFlBQWxCLEVBQWdDQyxLQUFoQyxFQUF1QztVQUMvQixFQUFDcFAsWUFBRCxLQUFpQm1QLGFBQWFqSSxTQUFwQztRQUNHLFFBQU1sSCxZQUFOLElBQXNCLENBQUVBLGFBQWFxUCxjQUFiLEVBQTNCLEVBQTJEO1lBQ25ELElBQUl0USxTQUFKLENBQWlCLGlDQUFqQixDQUFOOzs7aUJBRVdtSSxTQUFiLENBQXVCb0ksV0FBdkIsSUFDRUMsZ0JBQWtCdlAsWUFBbEIsQ0FERjs7O1dBR09rUCxJQUFULENBQWMzWCxHQUFkLEVBQW1CO1dBQ1ZBLElBQUkrWCxXQUFKLElBQW1CL1gsSUFBSStYLFdBQUosRUFBaUIvWCxHQUFqQixDQUExQjs7O1dBRU9nWSxlQUFULENBQXlCdlAsWUFBekIsRUFBdUM7VUFDL0J3UCxZQUFZbEosY0FBZ0J0RyxZQUFoQixFQUE4QixFQUFJTyxTQUFKLEVBQWVDLFNBQWYsRUFBOUIsQ0FBbEI7O1VBRU0sWUFBQzJNLFdBQUQsUUFBV25HLE9BQVgsRUFBaUI5UCxRQUFRdVksU0FBekIsS0FDSmIsZUFBZXhCLFFBQWYsQ0FBMEIsRUFBQ29DLFNBQUQ7WUFDbEJFLEtBQVN6SSxZQUFULENBQXNCdUksU0FBdEIsQ0FEa0I7Y0FFaEJHLE9BQVcxSSxZQUFYLENBQXdCdUksU0FBeEIsQ0FGZ0I7Z0JBR2RJLFNBQWF4QyxRQUFiLENBQXNCLEVBQUNLLFNBQUQsRUFBdEIsQ0FIYyxFQUExQixDQURGOztXQU1PLFVBQVNsVyxHQUFULEVBQWM7WUFDYmdULFVBQVVoVCxJQUFJc1ksWUFBSixFQUFoQjtZQUNNM1ksWUFBU3VZLFVBQVVuRixNQUFWLENBQWlCL1MsR0FBakIsRUFBc0JnVCxPQUF0QixDQUFmOzthQUVPdUYsY0FBUCxDQUF3QmpaLFFBQXhCLEVBQWtDVixVQUFsQzthQUNPTSxNQUFQLENBQWdCSSxRQUFoQixFQUEwQixFQUFJQSxRQUFKLEVBQWNSLE1BQWQsVUFBc0JhLFNBQXRCLEVBQTFCO2FBQ09MLFFBQVA7O2VBR1NBLFFBQVQsQ0FBa0J3RCxPQUFsQixFQUEyQjtjQUNuQjBWLFVBQVV4WSxJQUFJdU8sTUFBSixDQUFXaUssT0FBM0I7V0FDRyxJQUFJdlUsWUFBWStFLFdBQWhCLENBQUgsUUFDTXdQLFFBQVFDLEdBQVIsQ0FBY3hVLFNBQWQsQ0FETjtlQUVPbkYsT0FBU21GLFNBQVQsRUFBb0JuQixPQUFwQixDQUFQOzs7ZUFFT2hFLE1BQVQsQ0FBZ0JtRixTQUFoQixFQUEyQm5CLE9BQTNCLEVBQW9DO2NBQzVCK00sV0FBV2hSLE9BQU9DLE1BQVAsQ0FBYyxJQUFkLENBQWpCO2NBQ01tUyxLQUFLLEVBQUloTixTQUFKLEVBQWVELFdBQVdoRSxJQUFJdU8sTUFBSixDQUFXbUssT0FBckMsRUFBWDtjQUNNaFosVUFBVSxJQUFJQyxTQUFKLENBQWFzUixFQUFiLENBQWhCO2NBQ01sUixLQUFLLElBQUk2VixXQUFKLENBQWUzRSxFQUFmLEVBQW1CdlIsT0FBbkIsQ0FBWDs7Y0FFTWlaLFFBQVFyWSxRQUNYQyxPQURXLENBRVYsZUFBZSxPQUFPdUMsT0FBdEIsR0FDSUEsUUFBUS9DLEVBQVIsRUFBWUMsR0FBWixDQURKLEdBRUk4QyxPQUpNLEVBS1hSLElBTFcsQ0FLSnNXLFdBTEksQ0FBZDs7O2NBUU0zQixLQUFOLENBQWM3VyxPQUFPeVAsU0FBU3hGLFFBQVQsQ0FBb0JqSyxHQUFwQixFQUF5QixFQUFJb1EsTUFBSyxVQUFULEVBQXpCLENBQXJCOzs7Z0JBR1FtQixTQUFTNVIsR0FBR2dDLE9BQUgsRUFBZjtpQkFDT2xELE9BQU9rVCxnQkFBUCxDQUEwQkosTUFBMUIsRUFBa0M7bUJBQ2hDLEVBQUk3UCxPQUFPNlcsTUFBTXJXLElBQU4sQ0FBYSxNQUFNcVAsTUFBbkIsQ0FBWCxFQURnQyxFQUFsQyxDQUFQOzs7aUJBSU9pSCxXQUFULENBQXFCeFosTUFBckIsRUFBNkI7Y0FDeEIsUUFBUUEsTUFBWCxFQUFvQjtrQkFDWixJQUFJb0ksU0FBSixDQUFpQix5REFBakIsQ0FBTjs7O21CQUVPMUcsTUFBVCxHQUFrQixDQUFDMUIsT0FBTzBCLE1BQVAsS0FBa0IsZUFBZSxPQUFPMUIsTUFBdEIsR0FBK0JBLE1BQS9CLEdBQXdDa1ksY0FBMUQsQ0FBRCxFQUE0RTFWLElBQTVFLENBQWlGeEMsTUFBakYsQ0FBbEI7bUJBQ1NpTCxRQUFULEdBQW9CLENBQUNqTCxPQUFPaUwsUUFBUCxJQUFtQmtOLGdCQUFwQixFQUFzQzNWLElBQXRDLENBQTJDeEMsTUFBM0MsRUFBbURXLEVBQW5ELENBQXBCO21CQUNTbVEsV0FBVCxHQUF1QixDQUFDOVEsT0FBTzhRLFdBQVAsSUFBc0JzSCxtQkFBdkIsRUFBNEM1VixJQUE1QyxDQUFpRHhDLE1BQWpELEVBQXlEVyxFQUF6RCxDQUF2Qjs7Y0FFSTBQLE9BQUosR0FBV29KLFFBQVgsQ0FBc0I5WSxFQUF0QixFQUEwQkMsR0FBMUIsRUFBK0JpRSxTQUEvQixFQUEwQzRMLFFBQTFDOztpQkFFT3pRLE9BQU9VLFFBQVAsR0FBa0JWLE9BQU9VLFFBQVAsQ0FBZ0JDLEVBQWhCLEVBQW9CQyxHQUFwQixDQUFsQixHQUE2Q1osTUFBcEQ7OztLQS9DTjs7OztBQzNESixNQUFNMFosa0JBQWtCLGdCQUFnQixPQUFPQyxNQUF2QixHQUNwQkEsT0FBT0MsTUFBUCxDQUFjRixlQURNLEdBQ1ksSUFEcEM7O0FBR0FHLGlCQUFpQmpRLFNBQWpCLEdBQTZCQSxTQUE3QjtBQUNBLFNBQVNBLFNBQVQsR0FBcUI7UUFDYmtRLE1BQU0sSUFBSUMsVUFBSixDQUFlLENBQWYsQ0FBWjtrQkFDZ0JELEdBQWhCO1NBQ09BLElBQUksQ0FBSixDQUFQOzs7QUFFRixBQUFlLFNBQVNELGdCQUFULENBQTBCNUIsaUJBQWUsRUFBekMsRUFBNkM7TUFDdkQsUUFBUUEsZUFBZXJPLFNBQTFCLEVBQXNDO21CQUNyQkEsU0FBZixHQUEyQkEsU0FBM0I7OztTQUVLb1EsZ0JBQWdCL0IsY0FBaEIsQ0FBUDs7Ozs7In0=
