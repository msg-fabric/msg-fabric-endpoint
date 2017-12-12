'use strict';

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
        return false; // change while awaiting above…
      }try {
        return await on_msg(msg, pkt);
      } catch (err) {
        try {
          var terminate = on_error(err, { msg, pkt, zone: 'dispatch' });
        } finally {
          if (false !== terminate) {
            shutdown(err, { msg, pkt });
            return false; // signal unregister to msg-fabric-core/router
          }
        }
      }
    };
  }stateFor(pkt, ifAbsent) {
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

  valueOf() {
    return this.id.id_target;
  }
  inspect() {
    return `«EPTarget ${ep_encode(this.id, true)}»`;
  }
  toJSON() {
    return ep_encode(this.id, false);
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
    if (null !== id) {
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

  valueOf() {
    return this.id.id_target;
  }
  inspect() {
    return `«Endpoint ${ep_encode(this.id, true)}»`;
  }
  toJSON() {
    return this.asTarget().toJSON();
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

  asTarget() {
    return new this.EPTarget(this.id);
  }
  asSender({ from_id, msgid }) {
    if (from_id) {
      return this.EPTarget.from_ctx(from_id, this.to, msgid);
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
    return { msg, info, sender: this.asSender(info) };
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

    const { Endpoint: Endpoint$$1, Sink: Sink$$1, MsgCtx: MsgCtx_pi } = plugin_options.subclass({
      protocols,
      Sink: Sink.forProtocols(protocols),
      MsgCtx: MsgCtx.forProtocols(protocols),
      Endpoint: Endpoint.subclass({ createMap }) });

    return function (hub) {
      const channel = hub.connect_self();
      const MsgCtx$$1 = MsgCtx_pi.forHub(hub, channel);
      return Object.assign(endpoint, { create, server: endpoint, client, clientEndpoint });

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

        const ready = Promise.resolve(on_init(ep, hub)).then(_after_init);

        // Allow for both internal and external error handling by forking ready.catch
        ready.catch(err => handlers.on_error(err, { zone: 'on_ready' }));

        {
          const ep_tgt = ep.asTarget();
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

      function clientEndpoint(on_ready) {
        return new Promise((resolve, reject) => endpoint(ep => ({
          async on_ready(ep, hub) {
            resolve((await on_ready(ep, hub)));
            ep.shutdown();
          },
          on_send_error(ep, err) {
            reject(err);
          },
          on_shutdown(ep, err) {
            err ? reject(err) : resolve();
          } })));
      }

      function client(...args) {
        if (1 === args.length && 'function' === typeof args[0]) {
          return clientEndpoint(args[0]);
        }

        const msg_ctx = new MsgCtx$$1(null);
        return 0 !== args.length ? msg_ctx.to(...args) : msg_ctx;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci5qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiLCIuLi9jb2RlL2luZGV4LmJyb3dzZXIuanN5Il0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IGxpdHRsZV9lbmRpYW4gPSB0cnVlXG5jb25zdCBjX3NpbmdsZSA9ICdzaW5nbGUnXG5jb25zdCBjX2RhdGFncmFtID0gJ2RhdGFncmFtJ1xuY29uc3QgY19kaXJlY3QgPSAnZGlyZWN0J1xuY29uc3QgY19tdWx0aXBhcnQgPSAnbXVsdGlwYXJ0J1xuY29uc3QgY19zdHJlYW1pbmcgPSAnc3RyZWFtaW5nJ1xuXG5jb25zdCBfZXJyX21zZ2lkX3JlcXVpcmVkID0gYFJlc3BvbnNlIHJlcWlyZXMgJ21zZ2lkJ2BcbmNvbnN0IF9lcnJfdG9rZW5fcmVxdWlyZWQgPSBgVHJhbnNwb3J0IHJlcWlyZXMgJ3Rva2VuJ2BcblxuXG5mdW5jdGlvbiBmcm1fcm91dGluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgxLCBtYXNrID0gMHgxXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmouZnJvbV9pZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkfSA9IG9ialxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgMHxmcm9tX2lkLmlkX3JvdXRlciwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MzIgQCA0K29mZnNldCwgMHxmcm9tX2lkLmlkX3RhcmdldCwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3QgZnJvbV9pZCA9IHVuZGVmaW5lZCA9PT0gb2JqLmZyb21faWRcbiAgICAgICAgPyBvYmouZnJvbV9pZCA9IHt9IDogb2JqLmZyb21faWRcbiAgICAgIGZyb21faWQuaWRfcm91dGVyID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgZnJvbV9pZC5pZF90YXJnZXQgPSBkdi5nZXRJbnQzMiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cbmZ1bmN0aW9uIGZybV9yZXNwb25zZSgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgyLCBtYXNrID0gMHgyXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmoubXNnaWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai5tc2dpZCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX21zZ2lkX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoubXNnaWQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcV9hY2ssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLmFja19mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRva2VuID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9hY2sgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouYWNrX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5cblxuZnVuY3Rpb24gZnJtX2RhdGFncmFtKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDAsIGJpdHMgPSAweDAsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGF0YWdyYW1cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kYXRhZ3JhbSA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RhdGFncmFtXG5cbmZ1bmN0aW9uIGZybV9kaXJlY3QoKSA6OlxuICBjb25zdCBzaXplID0gNCwgYml0cyA9IDB4NCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kaXJlY3RcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kaXJlY3QgPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kaXJlY3RcblxuZnVuY3Rpb24gZnJtX211bHRpcGFydCgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHg4LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX211bHRpcGFydFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX211bHRpcGFydCA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OiAvLyB1c2Ugc2VxX25leHRcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhblxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfbXVsdGlwYXJ0XG5cbmZ1bmN0aW9uIGZybV9zdHJlYW1pbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4YywgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19zdHJlYW1pbmdcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19zdHJlYW1pbmcgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjpcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhbiAvLyB1c2Ugc2VxX25leHRcbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX3N0cmVhbWluZ1xuXG5cbmZ1bmN0aW9uIGJpbmRfc2VxX25leHQob2Zmc2V0KSA6OlxuICBjb25zdCBzZXFfb2Zmc2V0ID0gdGhpcy5zZXFfcG9zICsgb2Zmc2V0XG4gIGxldCBzZXEgPSAxXG4gIHJldHVybiBmdW5jdGlvbiBzZXFfbmV4dCh7ZmxhZ3MsIGZpbn0sIGR2KSA6OlxuICAgIGlmICEgZmluIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIHNlcSsrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgIGVsc2UgOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgLXNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICAgIHNlcSA9IE5hTlxuXG5cblxuZXhwb3J0IGRlZmF1bHQgY29tcG9zZUZyYW1pbmdzKClcbmZ1bmN0aW9uIGNvbXBvc2VGcmFtaW5ncygpIDo6XG4gIGNvbnN0IGZybV9mcm9tID0gZnJtX3JvdXRpbmcoKSwgZnJtX3Jlc3AgPSBmcm1fcmVzcG9uc2UoKVxuICBjb25zdCBmcm1fdHJhbnNwb3J0cyA9IEBbXSBmcm1fZGF0YWdyYW0oKSwgZnJtX2RpcmVjdCgpLCBmcm1fbXVsdGlwYXJ0KCksIGZybV9zdHJlYW1pbmcoKVxuXG4gIGlmIDggIT09IGZybV9mcm9tLnNpemUgfHwgOCAhPT0gZnJtX3Jlc3Auc2l6ZSB8fCA0ICE9IGZybV90cmFuc3BvcnRzLmxlbmd0aCA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBGcmFtaW5nIFNpemUgY2hhbmdlYFxuXG4gIGNvbnN0IGJ5Qml0cyA9IFtdLCBtYXNrPTB4ZlxuXG4gIDo6XG4gICAgY29uc3QgdF9mcm9tID0gZnJtX2Zyb20uZl90ZXN0LCB0X3Jlc3AgPSBmcm1fcmVzcC5mX3Rlc3RcbiAgICBjb25zdCBbdDAsdDEsdDIsdDNdID0gZnJtX3RyYW5zcG9ydHMubWFwIEAgZj0+Zi5mX3Rlc3RcblxuICAgIGNvbnN0IHRlc3RCaXRzID0gYnlCaXRzLnRlc3RCaXRzID0gb2JqID0+XG4gICAgICAwIHwgdF9mcm9tKG9iaikgfCB0X3Jlc3Aob2JqKSB8IHQwKG9iaikgfCB0MShvYmopIHwgdDIob2JqKSB8IHQzKG9iailcblxuICAgIGJ5Qml0cy5jaG9vc2UgPSBmdW5jdGlvbiAob2JqLCBsc3QpIDo6XG4gICAgICBpZiBudWxsID09IGxzdCA6OiBsc3QgPSB0aGlzIHx8IGJ5Qml0c1xuICAgICAgcmV0dXJuIGxzdFt0ZXN0Qml0cyhvYmopXVxuXG5cbiAgZm9yIGNvbnN0IFQgb2YgZnJtX3RyYW5zcG9ydHMgOjpcbiAgICBjb25zdCB7Yml0czpiLCBzaXplLCB0cmFuc3BvcnR9ID0gVFxuXG4gICAgYnlCaXRzW2J8MF0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDAsIG1hc2ssIHNpemU6IHNpemUsIG9wOiAnJ1xuICAgIGJ5Qml0c1tifDFdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwxLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdmJ1xuICAgIGJ5Qml0c1tifDJdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwyLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdyJ1xuICAgIGJ5Qml0c1tifDNdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwzLCBtYXNrLCBzaXplOiAxNiArIHNpemUsIG9wOiAnZnInXG5cbiAgICBmb3IgY29uc3QgZm5fa2V5IG9mIFsnZl9wYWNrJywgJ2ZfdW5wYWNrJ10gOjpcbiAgICAgIGNvbnN0IGZuX3RyYW4gPSBUW2ZuX2tleV0sIGZuX2Zyb20gPSBmcm1fZnJvbVtmbl9rZXldLCBmbl9yZXNwID0gZnJtX3Jlc3BbZm5fa2V5XVxuXG4gICAgICBieUJpdHNbYnwwXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fdHJhbihvYmosIGR2LCAwKVxuICAgICAgYnlCaXRzW2J8MV1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDJdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9yZXNwKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwzXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fcmVzcChvYmosIGR2LCA4KTsgZm5fdHJhbihvYmosIGR2LCAxNilcblxuICBmb3IgY29uc3QgZnJtIG9mIGJ5Qml0cyA6OlxuICAgIGJpbmRBc3NlbWJsZWQgQCBmcm1cblxuICByZXR1cm4gYnlCaXRzXG5cblxuZnVuY3Rpb24gYmluZEFzc2VtYmxlZChmcm0pIDo6XG4gIGNvbnN0IHtULCBzaXplLCBmX3BhY2ssIGZfdW5wYWNrfSA9IGZybVxuICBpZiBULmJpbmRfc2VxX25leHQgOjpcbiAgICBmcm0uc2VxX25leHQgPSBULmJpbmRfc2VxX25leHQgQCBmcm0uc2l6ZSAtIFQuc2l6ZVxuXG4gIGRlbGV0ZSBmcm0uVFxuICBmcm0ucGFjayA9IHBhY2sgOyBmcm0udW5wYWNrID0gdW5wYWNrXG4gIGNvbnN0IHNlcV9uZXh0ID0gZnJtLnNlcV9uZXh0XG5cbiAgZnVuY3Rpb24gcGFjayhwa3RfdHlwZSwgcGt0X29iaikgOjpcbiAgICBpZiAhIEAgMCA8PSBwa3RfdHlwZSAmJiBwa3RfdHlwZSA8PSAyNTUgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGt0X3R5cGUgdG8gYmUgWzAuLjI1NV1gXG5cbiAgICBwa3Rfb2JqLnR5cGUgPSBwa3RfdHlwZVxuICAgIGlmIHNlcV9uZXh0ICYmIG51bGwgPT0gcGt0X29iai5zZXEgOjpcbiAgICAgIHBrdF9vYmouc2VxID0gdHJ1ZVxuXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgQXJyYXlCdWZmZXIoc2l6ZSlcbiAgICBmX3BhY2socGt0X29iaiwgZHYsIDApXG4gICAgcGt0X29iai5oZWFkZXIgPSBkdi5idWZmZXJcblxuICAgIGlmIHRydWUgPT09IHBrdF9vYmouc2VxIDo6XG4gICAgICBfYmluZF9pdGVyYWJsZSBAIHBrdF9vYmosIGR2LmJ1ZmZlci5zbGljZSgwLHNpemUpXG5cbiAgZnVuY3Rpb24gdW5wYWNrKHBrdCkgOjpcbiAgICBjb25zdCBidWYgPSBwa3QuaGVhZGVyX2J1ZmZlcigpXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgVWludDhBcnJheShidWYpLmJ1ZmZlclxuXG4gICAgY29uc3QgaW5mbyA9IHt9XG4gICAgZl91bnBhY2soaW5mbywgZHYsIDApXG4gICAgcmV0dXJuIHBrdC5pbmZvID0gaW5mb1xuXG4gIGZ1bmN0aW9uIF9iaW5kX2l0ZXJhYmxlKHBrdF9vYmosIGJ1Zl9jbG9uZSkgOjpcbiAgICBjb25zdCB7dHlwZX0gPSBwa3Rfb2JqXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0LCB0dGwsIHRva2VufSA9IHBrdF9vYmpcbiAgICBwa3Rfb2JqLm5leHQgPSBuZXh0XG5cbiAgICBmdW5jdGlvbiBuZXh0KG9wdGlvbnMpIDo6XG4gICAgICBpZiBudWxsID09IG9wdGlvbnMgOjogb3B0aW9ucyA9IHt9XG4gICAgICBjb25zdCBoZWFkZXIgPSBidWZfY2xvbmUuc2xpY2UoKVxuICAgICAgc2VxX25leHQgQCBvcHRpb25zLCBuZXcgRGF0YVZpZXcgQCBoZWFkZXJcbiAgICAgIHJldHVybiBAe30gZG9uZTogISEgb3B0aW9ucy5maW4sIHZhbHVlOiBAe30gLy8gcGt0X29ialxuICAgICAgICBpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHlwZSwgdHRsLCB0b2tlbiwgaGVhZGVyXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwYWNrZXRQYXJzZXIsIG9wdGlvbnMsIGZyYWdtZW50X3NpemUpIDo6XG4gIGNvbnN0IHtjb25jYXRCdWZmZXJzLCBwYWNrUGFja2V0T2JqLCBwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHBhY2tldFBhcnNlclxuICBmcmFnbWVudF9zaXplID0gTnVtYmVyKGZyYWdtZW50X3NpemUgfHwgODAwMClcbiAgaWYgMTAyNCA+IGZyYWdtZW50X3NpemUgfHwgNjUwMDAgPCBmcmFnbWVudF9zaXplIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgZnJhZ21lbnQgc2l6ZTogJHtmcmFnbWVudF9zaXplfWBcblxuICBjb25zdCB7cmFuZG9tX2lkLCBqc29uX3BhY2t9ID0gb3B0aW9uc1xuICByZXR1cm4gQDogcGFja2V0UGFyc2VyLCByYW5kb21faWQsIGpzb25fcGFja1xuICAgIGNyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBwYWNrZXRGcmFnbWVudHNcbiAgICBiaW5kVHJhbnNwb3J0c1xuXG5cbiAgZnVuY3Rpb24gY3JlYXRlTXVsdGlwYXJ0KHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IHBhcnRzID0gW10sIGZpbiA9IGZhbHNlXG4gICAgcmV0dXJuIEB7fSBmZWVkLCBpbmZvOiBwa3QuaW5mb1xuXG4gICAgZnVuY3Rpb24gZmVlZChwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPCAwIDo6IGZpbiA9IHRydWU7IHNlcSA9IC1zZXFcbiAgICAgIHBhcnRzW3NlcS0xXSA9IHBrdC5ib2R5X2J1ZmZlcigpXG5cbiAgICAgIGlmICEgZmluIDo6IHJldHVyblxuICAgICAgaWYgcGFydHMuaW5jbHVkZXMgQCB1bmRlZmluZWQgOjogcmV0dXJuXG5cbiAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG5cbiAgICAgIGNvbnN0IHJlcyA9IGNvbmNhdEJ1ZmZlcnMocGFydHMpXG4gICAgICBwYXJ0cyA9IG51bGxcbiAgICAgIHJldHVybiByZXNcblxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0ocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgbmV4dD0wLCBmaW4gPSBmYWxzZSwgcmVjdkRhdGEsIHJzdHJlYW1cbiAgICBjb25zdCBzdGF0ZSA9IEB7fSBmZWVkOiBmZWVkX2luaXQsIGluZm86IHBrdC5pbmZvXG4gICAgcmV0dXJuIHN0YXRlXG5cbiAgICBmdW5jdGlvbiBmZWVkX2luaXQocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG5cbiAgICAgIGNvbnN0IGluZm8gPSBwa3QuaW5mb1xuICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuICAgICAgcnN0cmVhbSA9IHNpbmsucmVjdlN0cmVhbShtc2csIGluZm8pXG4gICAgICBpZiBudWxsID09IHJzdHJlYW0gOjogcmV0dXJuXG4gICAgICBjaGVja19mbnMgQCByc3RyZWFtLCAnb25fZXJyb3InLCAnb25fZGF0YScsICdvbl9lbmQnIFxuICAgICAgcmVjdkRhdGEgPSBzaW5rLnJlY3ZTdHJlYW1EYXRhLmJpbmQoc2luaywgcnN0cmVhbSwgaW5mbylcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2JvZHlcbiAgICAgIGlmIHJzdHJlYW0ub25faW5pdCA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9pbml0KG1zZywgcGt0KVxuXG4gICAgZnVuY3Rpb24gZmVlZF9ib2R5KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHJlY3ZEYXRhKClcbiAgICAgIGxldCBkYXRhXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgICBkYXRhID0gYXNfY29udGVudChwa3QsIHNpbmspXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBpZiBmaW4gOjpcbiAgICAgICAgY29uc3QgcmVzID0gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2VuZCBAIHJlcywgcGt0XG4gICAgICBlbHNlIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcblxuICAgIGZ1bmN0aW9uIGZlZWRfaWdub3JlKHBrdCkgOjpcbiAgICAgIHRyeSA6OiBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcblxuICAgIGZ1bmN0aW9uIGZlZWRfc2VxKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA+PSAwIDo6XG4gICAgICAgIGlmIG5leHQrKyA9PT0gc2VxIDo6XG4gICAgICAgICAgcmV0dXJuIC8vIGluIG9yZGVyXG4gICAgICBlbHNlIDo6XG4gICAgICAgIGZpbiA9IHRydWVcbiAgICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcbiAgICAgICAgaWYgbmV4dCA9PT0gLXNlcSA6OlxuICAgICAgICAgIG5leHQgPSAnZG9uZSdcbiAgICAgICAgICByZXR1cm4gLy8gaW4tb3JkZXIsIGxhc3QgcGFja2V0XG5cbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuICAgICAgbmV4dCA9ICdpbnZhbGlkJ1xuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhY2tldCBvdXQgb2Ygc2VxdWVuY2VgXG5cbiAgZnVuY3Rpb24gKiBwYWNrZXRGcmFnbWVudHMoYnVmLCBuZXh0X2hkciwgZmluKSA6OlxuICAgIGlmIG51bGwgPT0gYnVmIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIHlpZWxkIG9ialxuICAgICAgcmV0dXJuXG5cbiAgICBsZXQgaSA9IDAsIGxhc3RJbm5lciA9IGJ1Zi5ieXRlTGVuZ3RoIC0gZnJhZ21lbnRfc2l6ZTtcbiAgICB3aGlsZSBpIDwgbGFzdElubmVyIDo6XG4gICAgICBjb25zdCBpMCA9IGlcbiAgICAgIGkgKz0gZnJhZ21lbnRfc2l6ZVxuXG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcigpXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpMCwgaSlcbiAgICAgIHlpZWxkIG9ialxuXG4gICAgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaSlcbiAgICAgIHlpZWxkIG9ialxuXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBbXVxuICAgIG91dGJvdW5kLmNob29zZSA9IGZyYW1pbmdzLmNob29zZVxuXG4gICAgZm9yIGNvbnN0IGZyYW1lIG9mIGZyYW1pbmdzIDo6XG4gICAgICBjb25zdCBpbXBsID0gZnJhbWUgPyB0cmFuc3BvcnRzW2ZyYW1lLnRyYW5zcG9ydF0gOiBudWxsXG4gICAgICBpZiAhIGltcGwgOjogY29udGludWVcblxuICAgICAgY29uc3Qge2JpdHMsIHBhY2ssIHVucGFja30gPSBmcmFtZVxuICAgICAgY29uc3QgcGt0X3R5cGUgPSBoaWdoYml0cyB8IGJpdHNcbiAgICAgIGNvbnN0IHt0X3JlY3Z9ID0gaW1wbFxuXG4gICAgICBmdW5jdGlvbiBwYWNrX2hkcihvYmopIDo6XG4gICAgICAgIHBhY2socGt0X3R5cGUsIG9iailcbiAgICAgICAgcmV0dXJuIG9ialxuXG4gICAgICBmdW5jdGlvbiByZWN2X21zZyhwa3QsIHNpbmspIDo6XG4gICAgICAgIHVucGFjayhwa3QpXG4gICAgICAgIHJldHVybiB0X3JlY3YocGt0LCBzaW5rKVxuXG4gICAgICBwYWNrX2hkci5wa3RfdHlwZSA9IHJlY3ZfbXNnLnBrdF90eXBlID0gcGt0X3R5cGVcbiAgICAgIG91dGJvdW5kW2JpdHNdID0gcGFja19oZHJcbiAgICAgIGluYm91bmRbcGt0X3R5cGVdID0gcmVjdl9tc2dcblxuICAgICAgaWYgJ3Byb2R1Y3Rpb24nICE9PSBwcm9jZXNzLmVudi5OT0RFX0VOViA6OlxuICAgICAgICBjb25zdCBvcCA9IHBhY2tfaGRyLm9wID0gcmVjdl9tc2cub3AgPSBmcmFtZS5vcFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCBwYWNrX2hkciwgJ25hbWUnLCBAe30gdmFsdWU6IGBwYWNrX2hkciDCqyR7b3B9wrtgXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHJlY3ZfbXNnLCAnbmFtZScsIEB7fSB2YWx1ZTogYHJlY3ZfbXNnIMKrJHtvcH3Cu2BcblxuICAgIHJldHVybiBvdXRib3VuZFxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3QgcGFja0JvZHkgPSB0cmFuc3BvcnRzLnBhY2tCb2R5XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpXG4gICAgcmV0dXJuIHRyYW5zcG9ydHMuc3RyZWFtaW5nXG4gICAgICA/IEB7fSBzZW5kLCBzdHJlYW06IGJpbmRfc3RyZWFtIEAgdHJhbnNwb3J0cy5zdHJlYW1pbmcubW9kZVxuICAgICAgOiBAe30gc2VuZFxuXG4gICAgZnVuY3Rpb24gc2VuZChjaGFuLCBvYmosIGJvZHkpIDo6XG4gICAgICBib2R5ID0gcGFja0JvZHkoYm9keSlcbiAgICAgIGlmIGZyYWdtZW50X3NpemUgPCBib2R5LmJ5dGVMZW5ndGggOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdtdWx0aXBhcnQnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfYnl0ZXMoY2hhbiwgb2JqKVxuICAgICAgICByZXR1cm4gbXNlbmQgQCB0cnVlLCBib2R5XG5cbiAgICAgIG9iai50cmFuc3BvcnQgPSAnc2luZ2xlJ1xuICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgcGFja19oZHIob2JqKVxuICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBsZXQgcmVzXG4gICAgICAgIGZvciBjb25zdCBvYmogb2YgcGFja2V0RnJhZ21lbnRzIEAgYm9keSwgbmV4dCwgZmluIDo6XG4gICAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICAgIHJlcyA9IGF3YWl0IGNoYW4gQCBwa3RcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiByZXNcblxuICAgIGZ1bmN0aW9uIG1zZW5kX29iamVjdHMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGNvbnN0IG9iaiA9IG5leHQoe2Zpbn0pXG4gICAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gYmluZF9zdHJlYW0obW9kZSkgOjpcbiAgICAgIGNvbnN0IG1zZW5kX2ltcGwgPSB7b2JqZWN0OiBtc2VuZF9vYmplY3RzLCBieXRlczogbXNlbmRfYnl0ZXN9W21vZGVdXG4gICAgICBpZiBtc2VuZF9pbXBsIDo6IHJldHVybiBzdHJlYW1cblxuICAgICAgZnVuY3Rpb24gc3RyZWFtKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ3N0cmVhbWluZydcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9pbXBsIEAgY2hhbiwgb2JqLCBqc29uX3BhY2sobXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSB3cml0ZS5iaW5kKHRydWUpXG4gICAgICAgIHJldHVybiB3cml0ZVxuXG4gICAgICAgIGZ1bmN0aW9uIHdyaXRlKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgdHJ1ZT09PXRoaXMsIHBhY2tCb2R5KGNodW5rKVxuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuXG5mdW5jdGlvbiBjaGVja19mbnMob2JqLCAuLi5rZXlzKSA6OlxuICBmb3IgY29uc3Qga2V5IG9mIGtleXMgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb2JqW2tleV0gOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgXCIke2tleX1cIiB0byBiZSBhIGZ1bmN0aW9uYFxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwganNvbl9wYWNrfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5XG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKSB8fCB1bmRlZmluZWRcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBib2R5X2J1ZiA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGJvZHlfYnVmIDo6XG4gICAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHVucGFja191dGY4KGJvZHlfYnVmKSB8fCB1bmRlZmluZWRcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ29iamVjdCdcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIHJldHVybiBzdGF0ZS5mZWVkKHBrdCwgdW5wYWNrQm9keSlcblxuICBmdW5jdGlvbiBwYWNrQm9keShib2R5KSA6OlxuICAgIHJldHVybiBwYWNrX3V0ZjggQCBqc29uX3BhY2soYm9keSlcblxuICBmdW5jdGlvbiB1bnBhY2tCb2R5KHBrdCwgc2luaykgOjpcbiAgICByZXR1cm4gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYmluYXJ5X3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIGNvbnN0IHthc0J1ZmZlcn0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keTogYXNCdWZmZXJcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBwa3QuYm9keV9idWZmZXIoKVxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnYnl0ZXMnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdCwgcGt0X2J1ZmZlcilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbmZ1bmN0aW9uIHBrdF9idWZmZXIocGt0KSA6OiByZXR1cm4gcGt0LmJvZHlfYnVmZmVyKClcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNvbnRyb2xfcHJvdG9jb2woaW5ib3VuZCwgaGlnaCwgc2hhcmVkKSA6OlxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja1BhY2tldE9ian0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgY29uc3QgcGluZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCB0b2tlbjogdHJ1ZSwgdHJhbnNwb3J0OiAnZGlyZWN0J1xuICBjb25zdCBwb25nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIG1zZ2lkOiB0cnVlLCB0cmFuc3BvcnQ6ICdkYXRhZ3JhbSdcblxuICBjb25zdCBwb25nX3R5cGUgPSBoaWdofDB4ZVxuICBpbmJvdW5kW3BvbmdfdHlwZV0gPSByZWN2X3BvbmdcbiAgY29uc3QgcGluZ190eXBlID0gaGlnaHwweGZcbiAgaW5ib3VuZFtoaWdofDB4Zl0gPSByZWN2X3BpbmdcblxuICByZXR1cm4gQHt9IHNlbmQ6cGluZywgcGluZ1xuXG4gIGZ1bmN0aW9uIHBpbmcoY2hhbiwgb2JqKSA6OlxuICAgIGlmICEgb2JqLnRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgIG9iai5ib2R5ID0gSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgIG9wOiAncGluZycsIHRzMDogbmV3IERhdGUoKVxuICAgIHBpbmdfZnJhbWUucGFjayhwaW5nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICBmdW5jdGlvbiByZWN2X3BpbmcocGt0LCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgcGluZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgX3NlbmRfcG9uZyBAIHBrdC5ib2R5LCBwa3QsIHJvdXRlclxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuICBmdW5jdGlvbiBfc2VuZF9wb25nKHt0czB9LCBwa3RfcGluZywgcm91dGVyKSA6OlxuICAgIGNvbnN0IHttc2dpZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qgb2JqID0gQHt9IG1zZ2lkXG4gICAgICBmcm9tX2lkOiBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIGlkX3JvdXRlcjogcl9pZC5pZF9yb3V0ZXIsIGlkX3RhcmdldDogcl9pZC5pZF90YXJnZXRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiBmYWxzZSAvLyBjaGFuZ2Ugd2hpbGUgYXdhaXRpbmcgYWJvdmXigKZcbiAgICAgIHRyeSA6OlxuICAgICAgICByZXR1cm4gYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlIC8vIHNpZ25hbCB1bnJlZ2lzdGVyIHRvIG1zZy1mYWJyaWMtY29yZS9yb3V0ZXJcblxuICBzdGF0ZUZvcihwa3QsIGlmQWJzZW50KSA6OlxuICAgIGNvbnN0IG1zZ2lkID0gcGt0LmluZm8ubXNnaWRcbiAgICBsZXQgZW50cnkgPSB0aGlzLmJ5X21zZ2lkLmdldChtc2dpZClcbiAgICBpZiB1bmRlZmluZWQgPT09IGVudHJ5IDo6XG4gICAgICBpZiAhIG1zZ2lkIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIG1zZ2lkOiAke21zZ2lkfWBcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZkFic2VudCA6OlxuICAgICAgICBlbnRyeSA9IGlmQWJzZW50KHBrdCwgdGhpcywgbXNnaWQpXG4gICAgICBlbHNlIGVudHJ5ID0gaWZBYnNlbnRcbiAgICAgIHRoaXMuYnlfbXNnaWQuc2V0IEAgbXNnaWQsIGVudHJ5XG4gICAgcmV0dXJuIGVudHJ5XG5cbiAgZGVsZXRlU3RhdGVGb3IobXNnaWQpIDo6XG4gICAgcmV0dXJuIHRoaXMuYnlfbXNnaWQuZGVsZXRlKG1zZ2lkKVxuXG4gIGpzb25fdW5wYWNrKG9iaikgOjogdGhyb3cgbmV3IEVycm9yIEAgYEVuZHBvaW50IGJpbmRTaW5rKCkgcmVzcG9uc2liaWxpdHlgXG5cbiIsImV4cG9ydCBkZWZhdWx0IEVQVGFyZ2V0XG5leHBvcnQgY2xhc3MgRVBUYXJnZXQgOjpcbiAgY29uc3RydWN0b3IoaWQpIDo6IHRoaXMuaWQgPSBpZFxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF90YXJnZXRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RfanNvblxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cblxuRVBUYXJnZXQuanNvbl91bnBhY2tfeGZvcm0gPSBqc29uX3VucGFja194Zm9ybVxuZXhwb3J0IGZ1bmN0aW9uIGpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpIDo6XG4gIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXIoKVxuXG4gIGZ1bmN0aW9uIHJldml2ZXIoKSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBzdGF0aWMgZm9ySHViKGh1YiwgY2hhbm5lbCkgOjpcbiAgICBjb25zdCB7c2VuZFJhd30gPSBjaGFubmVsXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuX3NlbmQgPSBhc3luYyBwa3QgPT4gOjpcbiAgICAgIGF3YWl0IHNlbmRSYXcocGt0KVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIHJldHVybiBNc2dDdHhcblxuXG4gIGNvbnN0cnVjdG9yKGlkKSA6OlxuICAgIGlmIG51bGwgIT09IGlkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gaWRcbiAgICAgIGNvbnN0IGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICB0aGlzLmN0eCA9IEB7fSBmcm9tX2lkXG5cblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlbilcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MpXG4gIHNlbmRRdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjLnN0cmVhbSwgYXJnc1xuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWNba2V5XSwgYXJnc1xuICBiaW5kSW52b2tlKGZuT3JLZXksIHRva2VuKSA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBmbk9yS2V5IDo6IGZuT3JLZXkgPSB0aGlzLl9jb2RlY1xuICAgIHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGZuT3JLZXksIGFyZ3MsIHRva2VuKVxuXG4gIF9pbnZva2VfZXgoaW52b2tlLCBhcmdzLCB0b2tlbikgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgaWYgbnVsbCA9PSB0b2tlbiA6OiB0b2tlbiA9IG9iai50b2tlblxuICAgIGVsc2Ugb2JqLnRva2VuID0gdG9rZW5cbiAgICBpZiB0cnVlID09PSB0b2tlbiA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuXG4gICAgY29uc3QgcmVzID0gaW52b2tlIEAgdGhpcy5jaGFuX3NlbmQsIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIHRndCA9IGVwX2RlY29kZSh0Z3QpIHx8IHRndFxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiAwID09PSBhcmdzLmxlbmd0aCA/IHNlbGYgOiBzZWxmLndpdGggQCAuLi5hcmdzXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgdHJ1ZSA9PT0gdGd0IHx8IGZhbHNlID09PSB0Z3QgOjpcbiAgICAgICAgY3R4LnRva2VuID0gdGd0XG4gICAgICBlbHNlIGlmIG51bGwgIT0gdGd0IDo6XG4gICAgICAgIGNvbnN0IHt0b2tlbiwgbXNnaWR9ID0gdGd0XG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG5cbiAgICAvLyBiaW5kIHNlbmRfanNvbiBhcyBmcmVxdWVudGx5IHVzZWQgZmFzdC1wYXRoXG4gICAgY29uc3QganNvbl9zZW5kID0gbXNnQ29kZWNzLmpzb24uc2VuZFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcy5wcm90b3R5cGUsIEA6XG4gICAgICBmYXN0X2pzb246IEB7fSBnZXQoKSA6OiByZXR1cm4gQDpcbiAgICAgICAgc2VuZDogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MpXG4gICAgICAgIHNlbmRRdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICAgIHJldHVybiB0aGlzXG5cblxuICB3aXRoUmVqZWN0VGltZW91dChwX3JlcGx5KSA6OlxuICAgIHJldHVybiBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBwX3JlcGx5LnRoZW4gQCByZXNvbHZlLCByZWplY3RcbiAgICAgIHBfcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4gcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG4gICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMubXNfdGltZW91dClcbiAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCBAIHRpZFxuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0LCBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCB7RVBUYXJnZXQsIGVwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3RhcmdldFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5hc1RhcmdldCgpLnRvSlNPTigpXG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgpIDo6XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGlkOiBAe30gdmFsdWU6IGlkXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKS50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSb3V0ZUNhY2hlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuICAgICAganNvbl91bnBhY2s6IHRoaXMuRVBUYXJnZXQuYXNfanNvbl91bnBhY2sodGhpcy50bylcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnIHx8IHttc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICBhc1RhcmdldCgpIDo6XG4gICAgcmV0dXJuIG5ldyB0aGlzLkVQVGFyZ2V0IEAgdGhpcy5pZFxuICBhc1NlbmRlcih7ZnJvbV9pZCwgbXNnaWR9KSA6OlxuICAgIGlmIGZyb21faWQgOjpcbiAgICAgIHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgZnJvbV9pZCwgdGhpcy50bywgbXNnaWRcblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc1NlbmRlcihpbmZvKVxuICByZWN2U3RyZWFtKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiB0aGlzLnBhcnRzLmpvaW4oJycpOyAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIHBfc2VudCwgbXNnX2N0eFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgbGV0IHJlcGx5ID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcF9zZW50LmNhdGNoIEAgcmVqZWN0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICByZXBseSA9IG1zZ19jdHgud2l0aFJlamVjdFRpbWVvdXQocmVwbHkpXG5cbiAgICBjb25zdCBjbGVhciA9ICgpID0+IHRoaXMuYnlfdG9rZW4uZGVsZXRlIEAgdG9rZW5cbiAgICByZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG4gICAgcmV0dXJuIHJlcGx5XG5cbkVuZHBvaW50LnByb3RvdHlwZS5FUFRhcmdldCA9IEVQVGFyZ2V0XG4iLCJpbXBvcnQgaW5pdF9wcm90b2NvbCBmcm9tICcuL3Byb3RvY29sL2luZGV4LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4LCBwcm90b2NvbHN9ID0gY2xhc3Nlc1xuICAgIHJldHVybiBjbGFzc2VzXG5cbiAganNvbl9wYWNrOiBKU09OLnN0cmluZ2lmeVxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHBsdWdpbl9uYW1lLCByYW5kb21faWQsIGpzb25fcGFja1xuICAgIG9uX21zZzogZGVmYXVsdF9vbl9tc2dcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gICAgY3JlYXRlTWFwXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZVtwbHVnaW5fbmFtZV0gPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1YltwbHVnaW5fbmFtZV0gPSBodWJbcGx1Z2luX25hbWVdKGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuXG4gICAgY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHg6IE1zZ0N0eF9waX0gPVxuICAgICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDpcbiAgICAgICAgcHJvdG9jb2xzLFxuICAgICAgICBTaW5rOiBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBNc2dDdHg6IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgRW5kcG9pbnQ6IEVuZHBvaW50QmFzZS5zdWJjbGFzcyh7Y3JlYXRlTWFwfSlcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICBjb25zdCBjaGFubmVsID0gaHViLmNvbm5lY3Rfc2VsZigpXG4gICAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhfcGkuZm9ySHViKGh1YiwgY2hhbm5lbClcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEA6IGNyZWF0ZSwgc2VydmVyOiBlbmRwb2ludCwgY2xpZW50LCBjbGllbnRFbmRwb2ludFxuXG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBodWIucm91dGVyLnRhcmdldHNcbiAgICAgICAgZG8gdmFyIGlkX3RhcmdldCA9IHJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBpZFxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludCBAIGlkLCBtc2dfY3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQCBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgLnRoZW4gQCBfYWZ0ZXJfaW5pdFxuXG4gICAgICAgIC8vIEFsbG93IGZvciBib3RoIGludGVybmFsIGFuZCBleHRlcm5hbCBlcnJvciBoYW5kbGluZyBieSBmb3JraW5nIHJlYWR5LmNhdGNoXG4gICAgICAgIHJlYWR5LmNhdGNoIEAgZXJyID0+IGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgOjpcbiAgICAgICAgICBjb25zdCBlcF90Z3QgPSBlcC5hc1RhcmdldCgpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuXG4gICAgICBmdW5jdGlvbiBjbGllbnRFbmRwb2ludChvbl9yZWFkeSkgOjpcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgICAgICBlbmRwb2ludCBAIGVwID0+IEA6XG4gICAgICAgICAgICBhc3luYyBvbl9yZWFkeShlcCwgaHViKSA6OlxuICAgICAgICAgICAgICByZXNvbHZlIEAgYXdhaXQgb25fcmVhZHkoZXAsIGh1YilcbiAgICAgICAgICAgICAgZXAuc2h1dGRvd24oKVxuICAgICAgICAgICAgb25fc2VuZF9lcnJvcihlcCwgZXJyKSA6OiByZWplY3QoZXJyKVxuICAgICAgICAgICAgb25fc2h1dGRvd24oZXAsIGVycikgOjogZXJyID8gcmVqZWN0KGVycikgOiByZXNvbHZlKClcblxuXG4gICAgICBmdW5jdGlvbiBjbGllbnQoLi4uYXJncykgOjpcbiAgICAgICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgICAgICByZXR1cm4gY2xpZW50RW5kcG9pbnQoYXJnc1swXSlcblxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIG51bGxcbiAgICAgICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoID8gbXNnX2N0eC50byguLi5hcmdzKSA6IG1zZ19jdHhcblxuIiwiaW1wb3J0IGVuZHBvaW50X3BsdWdpbiBmcm9tICcuL3BsdWdpbi5qc3knXG5cbmNvbnN0IGdldFJhbmRvbVZhbHVlcyA9ICd1bmRlZmluZWQnICE9PSB0eXBlb2Ygd2luZG93XG4gID8gd2luZG93LmNyeXB0by5nZXRSYW5kb21WYWx1ZXMgOiBudWxsXG5cbmVuZHBvaW50X2Jyb3dzZXIucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICBjb25zdCBhcnIgPSBuZXcgSW50MzJBcnJheSgxKVxuICBnZXRSYW5kb21WYWx1ZXMoYXJyKVxuICByZXR1cm4gYXJyWzBdXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGVuZHBvaW50X2Jyb3dzZXIocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIl0sIm5hbWVzIjpbImxpdHRsZV9lbmRpYW4iLCJjX3NpbmdsZSIsImNfZGF0YWdyYW0iLCJjX2RpcmVjdCIsImNfbXVsdGlwYXJ0IiwiY19zdHJlYW1pbmciLCJfZXJyX21zZ2lkX3JlcXVpcmVkIiwiX2Vycl90b2tlbl9yZXF1aXJlZCIsImZybV9yb3V0aW5nIiwic2l6ZSIsImJpdHMiLCJtYXNrIiwib2JqIiwiZnJvbV9pZCIsImR2Iiwib2Zmc2V0Iiwic2V0SW50MzIiLCJpZF9yb3V0ZXIiLCJpZF90YXJnZXQiLCJ1bmRlZmluZWQiLCJnZXRJbnQzMiIsImZybV9yZXNwb25zZSIsIm1zZ2lkIiwiRXJyb3IiLCJzZXRJbnQxNiIsInNlcV9hY2siLCJhY2tfZmxhZ3MiLCJ0b2tlbiIsImdldEludDE2IiwiZnJtX2RhdGFncmFtIiwidHJhbnNwb3J0IiwiZnJtX2RpcmVjdCIsImZybV9tdWx0aXBhcnQiLCJzZXFfcG9zIiwic2VxIiwic2VxX2ZsYWdzIiwiZnJtX3N0cmVhbWluZyIsImJpbmRfc2VxX25leHQiLCJzZXFfb2Zmc2V0Iiwic2VxX25leHQiLCJmbGFncyIsImZpbiIsIk5hTiIsImNvbXBvc2VGcmFtaW5ncyIsImZybV9mcm9tIiwiZnJtX3Jlc3AiLCJmcm1fdHJhbnNwb3J0cyIsImxlbmd0aCIsImJ5Qml0cyIsInRfZnJvbSIsImZfdGVzdCIsInRfcmVzcCIsInQwIiwidDEiLCJ0MiIsInQzIiwibWFwIiwiZiIsInRlc3RCaXRzIiwiY2hvb3NlIiwibHN0IiwiVCIsImIiLCJvcCIsImZuX2tleSIsImZuX3RyYW4iLCJmbl9mcm9tIiwiZm5fcmVzcCIsImZybSIsImJpbmRBc3NlbWJsZWQiLCJmX3BhY2siLCJmX3VucGFjayIsInBhY2siLCJ1bnBhY2siLCJwa3RfdHlwZSIsInBrdF9vYmoiLCJUeXBlRXJyb3IiLCJ0eXBlIiwiRGF0YVZpZXciLCJBcnJheUJ1ZmZlciIsImhlYWRlciIsImJ1ZmZlciIsInNsaWNlIiwicGt0IiwiYnVmIiwiaGVhZGVyX2J1ZmZlciIsIlVpbnQ4QXJyYXkiLCJpbmZvIiwiX2JpbmRfaXRlcmFibGUiLCJidWZfY2xvbmUiLCJ0dGwiLCJuZXh0Iiwib3B0aW9ucyIsImRvbmUiLCJ2YWx1ZSIsInBhY2tldFBhcnNlciIsImZyYWdtZW50X3NpemUiLCJjb25jYXRCdWZmZXJzIiwicGFja1BhY2tldE9iaiIsInBhY2tfdXRmOCIsInVucGFja191dGY4IiwiTnVtYmVyIiwicmFuZG9tX2lkIiwianNvbl9wYWNrIiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwiY3JlYXRlTXVsdGlwYXJ0Iiwic2luayIsInBhcnRzIiwiZmVlZCIsImJvZHlfYnVmZmVyIiwiaW5jbHVkZXMiLCJkZWxldGVTdGF0ZUZvciIsInJlcyIsInJlY3ZEYXRhIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0IiwiYXNfY29udGVudCIsImZlZWRfaWdub3JlIiwibXNnIiwianNvbl91bnBhY2siLCJib2R5X3V0ZjgiLCJyZWN2U3RyZWFtIiwicmVjdlN0cmVhbURhdGEiLCJiaW5kIiwiZXJyIiwib25fZXJyb3IiLCJmZWVkX2JvZHkiLCJvbl9pbml0IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic2VuZCIsInN0cmVhbSIsImJpbmRfc3RyZWFtIiwibW9kZSIsImNoYW4iLCJtc2VuZCIsIm1zZW5kX2J5dGVzIiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2ltcGwiLCJvYmplY3QiLCJieXRlcyIsIndyaXRlIiwiZW5kIiwiY2h1bmsiLCJjaGVja19mbnMiLCJrZXlzIiwia2V5IiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0IiwicmVjdk1zZyIsInN0YXRlRm9yIiwiYm9keV9idWYiLCJ1bnBhY2tCb2R5IiwiYmluYXJ5X3Byb3RvY29sIiwiYXNCdWZmZXIiLCJwa3RfYnVmZmVyIiwiY29udHJvbF9wcm90b2NvbCIsImhpZ2giLCJwaW5nX2ZyYW1lIiwicG9uZ19mcmFtZSIsInBvbmdfdHlwZSIsInJlY3ZfcG9uZyIsInBpbmdfdHlwZSIsInJlY3ZfcGluZyIsInBpbmciLCJKU09OIiwic3RyaW5naWZ5IiwidHMwIiwiRGF0ZSIsInJvdXRlciIsImJvZHlfanNvbiIsInJlY3ZDdHJsIiwiX3NlbmRfcG9uZyIsInBrdF9waW5nIiwicl9pZCIsInRzMSIsImRpc3BhdGNoIiwiaW5pdF9wcm90b2NvbCIsInNoYXJlZF9wcm90byIsImpzb24iLCJqc29uX3Byb3RvIiwiYmluYXJ5IiwiYmluYXJ5X3Byb3RvIiwiY29udHJvbCIsImNvbnRyb2xfcHJvdG8iLCJjb2RlY3MiLCJkZWZhdWx0IiwiU2luayIsImZvclByb3RvY29scyIsInByb3RvdHlwZSIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaHViIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImV4dHJhIiwiYXNzaWduIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZ2V0Iiwic2V0IiwiZGVsZXRlIiwiRVBUYXJnZXQiLCJpZCIsImVwX2VuY29kZSIsImFzX2pzb25fdW5wYWNrIiwibXNnX2N0eF90byIsInhmb3JtQnlLZXkiLCJPYmplY3QiLCJjcmVhdGUiLCJ2IiwiZnJvbV9jdHgiLCJlcF9kZWNvZGUiLCJqc29uX3VucGFja194Zm9ybSIsImVwX3RndCIsImZhc3QiLCJpbml0IiwiZmFzdF9qc29uIiwiZGVmaW5lUHJvcGVydGllcyIsInF1ZXJ5Iiwic2ltcGxlIiwiciIsInQiLCJ0b1N0cmluZyIsInNwbGl0IiwicGFyc2VJbnQiLCJzeiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJ4Zm4iLCJ2Zm4iLCJNc2dDdHgiLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJmcmVlemUiLCJjdHgiLCJfaW52b2tlX2V4IiwiX21zZ0NvZGVjcyIsImFyZ3MiLCJfY29kZWMiLCJyZXBseSIsImZuT3JLZXkiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwidGhlbiIsInBfc2VudCIsImluaXRSZXBseSIsInRvIiwidGd0Iiwic2VsZiIsImNsb25lIiwicmVwbHlfaWQiLCJ3aXRoIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwibW9uaXRvciIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJ0ZCIsInRpZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNvZGVjIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJ1bnJlZiIsImNsZWFyIiwiY2xlYXJJbnRlcnZhbCIsIm1zZ19jb2RlYyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwianNvbl9zZW5kIiwicF9yZXBseSIsInRpbWVvdXQiLCJSZXBseVRpbWVvdXQiLCJzZXRUaW1lb3V0IiwibXNfdGltZW91dCIsIkVuZHBvaW50Iiwic3ViY2xhc3MiLCJleHRlbnNpb25zIiwiYXNUYXJnZXQiLCJ0b0pTT04iLCJtc2dfY3R4Iiwid2l0aEVuZHBvaW50IiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJpc19yZXBseSIsInNlbmRlciIsImFzU2VuZGVyIiwid2FybiIsImluaXRSZXBseVByb21pc2UiLCJjYXRjaCIsIndpdGhSZWplY3RUaW1lb3V0IiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImVwIiwiZXJyb3IiLCJtZXNzYWdlIiwiY2xhc3NlcyIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsIm9yZGVyIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJwbHVnaW5fbmFtZSIsImJpbmRFbmRwb2ludEFwaSIsInByb3RvY29scyIsIk1zZ0N0eF9waSIsIlNpbmtCYXNlIiwiTXNnQ3R4QmFzZSIsIkVuZHBvaW50QmFzZSIsImNvbm5lY3Rfc2VsZiIsInNlcnZlciIsImNsaWVudCIsImNsaWVudEVuZHBvaW50IiwidGFyZ2V0cyIsImhhcyIsImlkX3NlbGYiLCJyZWFkeSIsIl9hZnRlcl9pbml0IiwidGFyZ2V0IiwicmVnaXN0ZXIiLCJvbl9yZWFkeSIsImdldFJhbmRvbVZhbHVlcyIsIndpbmRvdyIsImNyeXB0byIsImVuZHBvaW50X2Jyb3dzZXIiLCJhcnIiLCJJbnQzMkFycmF5IiwiZW5kcG9pbnRfcGx1Z2luIl0sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU1BLGdCQUFnQixJQUF0QjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxhQUFhLFVBQW5CO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCOztBQUVBLE1BQU1DLHNCQUF1QiwwQkFBN0I7QUFDQSxNQUFNQyxzQkFBdUIsMkJBQTdCOztBQUdBLFNBQVNDLFdBQVQsR0FBdUI7UUFDZkMsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ087UUFBQSxFQUNDRCxJQURELEVBQ09DLElBRFA7O1dBR0VDLEdBQVAsRUFBWTthQUFVLFFBQVFBLElBQUlDLE9BQVosR0FBc0JILElBQXRCLEdBQTZCLEtBQXBDO0tBSFY7O1dBS0VFLEdBQVAsRUFBWUUsRUFBWixFQUFnQkMsTUFBaEIsRUFBd0I7WUFDaEIsRUFBQ0YsT0FBRCxLQUFZRCxHQUFsQjtTQUNHSSxRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUks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
