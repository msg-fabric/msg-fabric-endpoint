import { randomBytes } from 'crypto';

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

      if ('production' !== process.env.NODE_ENV) {
        const op = pack_hdr.op = recv_msg.op = frame.op;
        Object.defineProperty(pack_hdr, 'name', { value: `pack_hdr «${op}»` });
        Object.defineProperty(recv_msg, 'name', { value: `recv_msg «${op}»` });
      }
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
        return { sent: msend(true, body) };
      }

      obj.transport = 'single';
      obj.body = body;
      const pack_hdr = outbound.choose(obj);
      const pkt = packPacketObj(pack_hdr(obj));
      return { sent: chan(pkt) };
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
    _send_pong(pkt.body, pkt, sink, router);
    return sink.recvCtrl(pkt.body, pkt.info);
  }

  function _send_pong({ ts0 }, pkt_ping, sink, router) {
    const { msgid, from_id: r_id } = pkt_ping.info;
    const { id_router, id_target } = r_id;
    const obj = { id_router, id_target,
      from_id: sink.from_id, msgid,
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

  constructor(json_unpack) {
    this.json_unpack = json_unpack;
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
}

class Endpoint {
  static forProtocols({}) {
    class Endpoint extends this {}
    return Endpoint;
  }

  valueOf() {
    return this.from_id;
  }
  inspect() {
    return `«Endpoint ${this.from_id.id_target}»`;
  }

  constructor(msg_ctx) {
    msg_ctx = msg_ctx.withEndpoint(this);
    Object.defineProperties(this, {
      from_id: { value: msg_ctx.from_id, enumerable: true },
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
      from_id: this.from_id,
      by_msgid: this.createStateMap(),

      recvCtrl: (msg, info) => {
        traffic(info.from_id, 'ctrl');
        const rmsg = this.recvCtrl(msg, info);

        const reply = by_token.get(info.token);
        if (undefined !== reply) {
          Promise.resolve({ rmsg, msg, info }).then(reply);
        } else return rmsg;
      },

      recvMsg: (msg, info) => {
        traffic(info.from_id, 'msg');
        const rmsg = this.recvMsg(msg, info);

        const reply = by_token.get(info.token);
        if (undefined !== reply) {
          Promise.resolve(rmsg).then(reply);
        } else return rmsg;
      },

      recvStreamData: (rstream, info) => {
        traffic(info.from_id, 'stream');
      },
      recvStream: (msg, info) => {
        traffic(info.from_id, 'stream');
        const rstream = this.recvStream(msg, info);

        const reply = by_token.get(info.token);
        if (undefined !== reply) {
          Promise.resolve(rstream).then(reply);
        }
        return rstream;
      } };
  }

  recvTraffic(from_id, traffic, ts) {}
  recvCtrl(msg, info) {}
  recvMsg(msg, info) {
    return { msg, info };
  }
  recvStream(msg, info) {
    console.warn(`Unhandle recv stream: ${info}`);
    return null;
    /* return @{} msg, info
         on_init(msg, pkt) :: return this
         on_data(data, pkt) :: this.parts.push @ data
         on_end(result, pkt) :: return this.parts.join('')
         on_error(err, pkt) :: console.log @ err
    */
  }initReply(token, msg_ctx, kind) {
    return this.initReplyPromise(token, msg_ctx.ms_timeout);
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

  initReplyPromise(token, ms_timeout) {
    const ans = new Promise((resolve, reject) => {
      this.by_token.set(token, resolve);
      if (ms_timeout) {
        const tid = setTimeout(timeout, ms_timeout);
        if (tid.unref) {
          tid.unref();
        }
        function timeout() {
          reject(new this.ReplyTimeout());
        }
      }
    });

    return sent => {
      ans.sent = sent;
      return ans;
    };
  }
}

class ReplyTimeout extends Error {}

Object.assign(Endpoint.prototype, {
  ReplyTimeout });

class MsgCtx {
  static forProtocols({ random_id, codecs }) {
    class MsgCtx extends this {}
    MsgCtx.prototype.random_id = random_id;
    MsgCtx.withCodecs(codecs);
    return MsgCtx;
  }

  constructor(from_id, resolveRoute) {
    if (null !== from_id) {
      const { id_target, id_router } = from_id;
      from_id = Object.freeze({ id_target, id_router });
    }

    const ctx = { from_id };
    Object.defineProperties(this, {
      _root_: { value: this },
      from_id: { value: from_id },
      ctx: { value: ctx },
      resolveRoute: { value: resolveRoute } });
  }

  withEndpoint(endpoint) {
    return Object.defineProperties(this, {
      endpoint: { value: endpoint } });
  }

  static from(id_target, hub) {
    const from_id = null === id_target ? null : { id_target, id_router: hub.router.id_self };
    return new this(from_id, hub.bindRouteDispatch());
  }

  get to() {
    return (...args) => this.clone().with(...args);
  }

  ping(token = true) {
    return this.codec('control', { token }).invoke('ping');
  }
  send(...args) {
    return this.invoke('send', ...args);
  }
  stream(...args) {
    return this.invoke('stream', ...args);
  }

  invoke(key, ...args) {
    const obj = Object.assign({}, this.ctx);
    this.assertMonitor();
    const chan = this.resolveRoute(obj.id_router);
    if (true !== obj.token) {
      return this._codec[key](chan, obj, ...args);
    } else {
      const token = obj.token = this.random_id();
      const reply = this.endpoint.initReply(token, this, key);
      return reply(this._codec[key](chan, obj, ...args));
    }
  }

  with(...args) {
    const ctx = this.ctx;
    for (let tgt of args) {
      if ('number' === typeof tgt) {
        ctx.id_target = tgt;
        ctx.id_router = ctx.from_id.id_router;
        continue;
      }

      const { from_id: reply_id, id_target, id_router, token, msgid } = tgt;

      if (undefined !== id_target) {
        if (undefined === id_router) {
          if (!ctx.id_router) {
            // implicitly on the same router
            ctx.id_router = ctx.from_id.id_router;
          }
        } else ctx.id_router = id_router;
        ctx.id_target = id_target;
      } else if (undefined !== id_router) {
        throw new Error(`Passing 'id_router' requires 'id_target'`);
      } else if (undefined !== reply_id && !ctx.id_target) {
        ctx.id_router = reply_id.id_router;
        ctx.id_target = reply_id.id_target;
      }

      if (undefined !== token) {
        ctx.token = token;
      }
      if (undefined !== msgid) {
        ctx.msgid = msgid;
      }
    }

    return this;
  }

  withReply() {
    return this.clone({ token: true });
  }

  reset(...args) {
    return Object.create(this._root_, {
      ctx: { value: Object.assign({}, this.ctx, ...args) } });
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
    return this;
  }
}

Object.assign(MsgCtx.prototype, {
  ms_timeout: 5000 });

const default_plugin_options = {
  on_error(err, { msg, pkt }) {
    console.error('ENDPOINT ERROR:', err, { msg, pkt });
    // return false to prevent auto-shutdown
  }, on_shutdown(err, { msg, pkt }) {
    console.error('ENDPOINT SHUTDOWN:' + err);
  },

  subclass({ Sink: Sink$$1, Endpoint: Endpoint$$1, MsgCtx: MsgCtx$$1, protocols }) {},

  msg_unpack(ep) {
    return JSON.parse;
  },
  msg_pack() {
    return JSON.stringify;
  } };

var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    random_id, msg_unpack, msg_pack,
    on_error: default_on_error,
    on_shutdown: default_on_shutdown } = plugin_options;

  return { order: 1, subclass, post };

  function subclass(FabricHub_PI, bases) {
    const { packetParser } = FabricHub_PI.prototype;
    if (null == packetParser || !packetParser.isPacketParser()) {
      throw new TypeError(`Invalid packetParser for plugin`);
    }

    FabricHub_PI.prototype.endpoint = bindEndpointApi(packetParser);
  }

  function post(hub) {
    return hub.endpoint = hub.endpoint(hub);
  }

  function bindEndpointApi(packetParser) {
    const protocols = init_protocol(packetParser, { random_id, json_pack: msg_pack() });
    const Sink$$1 = Sink.forProtocols(protocols);
    const MsgCtx$$1 = MsgCtx.forProtocols(protocols);
    const Endpoint$$1 = Endpoint.forProtocols(protocols);

    plugin_options.subclass({
      Sink: Sink$$1, Endpoint: Endpoint$$1, MsgCtx: MsgCtx$$1, protocols });

    return function (hub) {
      return Object.assign(endpoint, { create, server: endpoint, client });

      function client(...args) {
        const msg_ctx = MsgCtx$$1.from(null, hub);
        return 0 !== args.length ? msg_ctx.with(...args) : msg_ctx;
      }

      function endpoint(on_init) {
        return create(random_id(), on_init);
      }

      function create(id_target, on_init) {
        const msg_ctx = MsgCtx$$1.from(id_target, hub);
        const ep = new Endpoint$$1(msg_ctx);

        const target = on_init(ep, hub);
        const on_msg = (target.on_msg || target).bind(target);
        const on_error = (target.on_error || default_on_error).bind(target);
        const on_shutdown = (target.on_shutdown || default_on_shutdown).bind(target);

        const sink = new Sink$$1(ep.json_unpack || msg_unpack(ep));
        sink.register(ep, hub, id_target, { on_msg, on_error, on_shutdown });

        let ready = Promise.resolve(target);
        if (target.on_ready) {
          ready = ready.then(target => target.on_ready());
        }

        const res = Object.create(endpoint_target_api, {
          id_router: { enumerable: true, value: hub.router.id_self },
          id_target: { enumerable: true, value: id_target },
          ready: { value: ready.then(() => res) } });
        return res;
      }
    };
  }
};

const endpoint_target_api = {
  valueOf() {
    return 0 | this.id_target;
  },
  inspect() {
    return `«Endpoint Target ${this.id_target}»`;
  } };

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

const getRandomValues = 'undefined' !== typeof window ? window.crypto.getRandomValues : null;

endpoint_browser.random_id = random_id$1;
function random_id$1() {
  const arr = new Int32Array(1);
  getRandomValues(arr);
  return arr[0];
}

function endpoint_browser(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id$1;
  }

  return endpoint_plugin(plugin_options);
}

export { endpoint_nodejs, endpoint_browser, endpoint_plugin as endpoint };
export default endpoint_plugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL3Byb3RvY29sL2ZyYW1pbmcuanN5IiwiLi4vY29kZS9wcm90b2NvbC9zaGFyZWQuanN5IiwiLi4vY29kZS9wcm90b2NvbC9qc29uLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvYmluYXJ5LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvY29udHJvbC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2luZGV4LmpzeSIsIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvbXNnY3R4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSIsIi4uL2NvZGUvaW5kZXgubm9kZWpzLmpzeSIsIi4uL2NvZGUvaW5kZXguYnJvd3Nlci5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgbGl0dGxlX2VuZGlhbiA9IHRydWVcbmNvbnN0IGNfc2luZ2xlID0gJ3NpbmdsZSdcbmNvbnN0IGNfZGF0YWdyYW0gPSAnZGF0YWdyYW0nXG5jb25zdCBjX2RpcmVjdCA9ICdkaXJlY3QnXG5jb25zdCBjX211bHRpcGFydCA9ICdtdWx0aXBhcnQnXG5jb25zdCBjX3N0cmVhbWluZyA9ICdzdHJlYW1pbmcnXG5cbmNvbnN0IF9lcnJfbXNnaWRfcmVxdWlyZWQgPSBgUmVzcG9uc2UgcmVxaXJlcyAnbXNnaWQnYFxuY29uc3QgX2Vycl90b2tlbl9yZXF1aXJlZCA9IGBUcmFuc3BvcnQgcmVxaXJlcyAndG9rZW4nYFxuXG5cbmZ1bmN0aW9uIGZybV9yb3V0aW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDEsIG1hc2sgPSAweDFcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5mcm9tX2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3Qge2Zyb21faWR9ID0gb2JqXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCAwfGZyb21faWQuaWRfcm91dGVyLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQzMiBAIDQrb2Zmc2V0LCAwfGZyb21faWQuaWRfdGFyZ2V0LCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCBmcm9tX2lkID0gdW5kZWZpbmVkID09PSBvYmouZnJvbV9pZFxuICAgICAgICA/IG9iai5mcm9tX2lkID0ge30gOiBvYmouZnJvbV9pZFxuICAgICAgZnJvbV9pZC5pZF9yb3V0ZXIgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBmcm9tX2lkLmlkX3RhcmdldCA9IGR2LmdldEludDMyIEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuZnVuY3Rpb24gZnJtX3Jlc3BvbnNlKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDIsIG1hc2sgPSAweDJcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5tc2dpZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLm1zZ2lkIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfbXNnaWRfcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai5tc2dpZCwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxX2FjaywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouYWNrX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudG9rZW4gPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2FjayA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5hY2tfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cblxuXG5mdW5jdGlvbiBmcm1fZGF0YWdyYW0oKSA6OlxuICBjb25zdCBzaXplID0gMCwgYml0cyA9IDB4MCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kYXRhZ3JhbVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RhdGFncmFtID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGF0YWdyYW1cblxuZnVuY3Rpb24gZnJtX2RpcmVjdCgpIDo6XG4gIGNvbnN0IHNpemUgPSA0LCBiaXRzID0gMHg0LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RpcmVjdFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RpcmVjdCA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RpcmVjdFxuXG5mdW5jdGlvbiBmcm1fbXVsdGlwYXJ0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDgsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfbXVsdGlwYXJ0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfbXVsdGlwYXJ0ID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6IC8vIHVzZSBzZXFfbmV4dFxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuXG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19tdWx0aXBhcnRcblxuZnVuY3Rpb24gZnJtX3N0cmVhbWluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHhjLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX3N0cmVhbWluZ1xuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX3N0cmVhbWluZyA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OlxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuIC8vIHVzZSBzZXFfbmV4dFxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfc3RyZWFtaW5nXG5cblxuZnVuY3Rpb24gYmluZF9zZXFfbmV4dChvZmZzZXQpIDo6XG4gIGNvbnN0IHNlcV9vZmZzZXQgPSB0aGlzLnNlcV9wb3MgKyBvZmZzZXRcbiAgbGV0IHNlcSA9IDFcbiAgcmV0dXJuIGZ1bmN0aW9uIHNlcV9uZXh0KHtmbGFncywgZmlufSwgZHYpIDo6XG4gICAgaWYgISBmaW4gOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgc2VxKyssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgZWxzZSA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCAtc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgICAgc2VxID0gTmFOXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlRnJhbWluZ3MoKVxuZnVuY3Rpb24gY29tcG9zZUZyYW1pbmdzKCkgOjpcbiAgY29uc3QgZnJtX2Zyb20gPSBmcm1fcm91dGluZygpLCBmcm1fcmVzcCA9IGZybV9yZXNwb25zZSgpXG4gIGNvbnN0IGZybV90cmFuc3BvcnRzID0gQFtdIGZybV9kYXRhZ3JhbSgpLCBmcm1fZGlyZWN0KCksIGZybV9tdWx0aXBhcnQoKSwgZnJtX3N0cmVhbWluZygpXG5cbiAgaWYgOCAhPT0gZnJtX2Zyb20uc2l6ZSB8fCA4ICE9PSBmcm1fcmVzcC5zaXplIHx8IDQgIT0gZnJtX3RyYW5zcG9ydHMubGVuZ3RoIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEZyYW1pbmcgU2l6ZSBjaGFuZ2VgXG5cbiAgY29uc3QgYnlCaXRzID0gW10sIG1hc2s9MHhmXG5cbiAgOjpcbiAgICBjb25zdCB0X2Zyb20gPSBmcm1fZnJvbS5mX3Rlc3QsIHRfcmVzcCA9IGZybV9yZXNwLmZfdGVzdFxuICAgIGNvbnN0IFt0MCx0MSx0Mix0M10gPSBmcm1fdHJhbnNwb3J0cy5tYXAgQCBmPT5mLmZfdGVzdFxuXG4gICAgY29uc3QgdGVzdEJpdHMgPSBieUJpdHMudGVzdEJpdHMgPSBvYmogPT5cbiAgICAgIDAgfCB0X2Zyb20ob2JqKSB8IHRfcmVzcChvYmopIHwgdDAob2JqKSB8IHQxKG9iaikgfCB0MihvYmopIHwgdDMob2JqKVxuXG4gICAgYnlCaXRzLmNob29zZSA9IGZ1bmN0aW9uIChvYmosIGxzdCkgOjpcbiAgICAgIGlmIG51bGwgPT0gbHN0IDo6IGxzdCA9IHRoaXMgfHwgYnlCaXRzXG4gICAgICByZXR1cm4gbHN0W3Rlc3RCaXRzKG9iaildXG5cblxuICBmb3IgY29uc3QgVCBvZiBmcm1fdHJhbnNwb3J0cyA6OlxuICAgIGNvbnN0IHtiaXRzOmIsIHNpemUsIHRyYW5zcG9ydH0gPSBUXG5cbiAgICBieUJpdHNbYnwwXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MCwgbWFzaywgc2l6ZTogc2l6ZSwgb3A6ICcnXG4gICAgYnlCaXRzW2J8MV0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDEsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ2YnXG4gICAgYnlCaXRzW2J8Ml0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDIsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ3InXG4gICAgYnlCaXRzW2J8M10gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDMsIG1hc2ssIHNpemU6IDE2ICsgc2l6ZSwgb3A6ICdmcidcblxuICAgIGZvciBjb25zdCBmbl9rZXkgb2YgWydmX3BhY2snLCAnZl91bnBhY2snXSA6OlxuICAgICAgY29uc3QgZm5fdHJhbiA9IFRbZm5fa2V5XSwgZm5fZnJvbSA9IGZybV9mcm9tW2ZuX2tleV0sIGZuX3Jlc3AgPSBmcm1fcmVzcFtmbl9rZXldXG5cbiAgICAgIGJ5Qml0c1tifDBdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl90cmFuKG9iaiwgZHYsIDApXG4gICAgICBieUJpdHNbYnwxXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8Ml1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3Jlc3Aob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDNdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl9yZXNwKG9iaiwgZHYsIDgpOyBmbl90cmFuKG9iaiwgZHYsIDE2KVxuXG4gIGZvciBjb25zdCBmcm0gb2YgYnlCaXRzIDo6XG4gICAgYmluZEFzc2VtYmxlZCBAIGZybVxuXG4gIHJldHVybiBieUJpdHNcblxuXG5mdW5jdGlvbiBiaW5kQXNzZW1ibGVkKGZybSkgOjpcbiAgY29uc3Qge1QsIHNpemUsIGZfcGFjaywgZl91bnBhY2t9ID0gZnJtXG4gIGlmIFQuYmluZF9zZXFfbmV4dCA6OlxuICAgIGZybS5zZXFfbmV4dCA9IFQuYmluZF9zZXFfbmV4dCBAIGZybS5zaXplIC0gVC5zaXplXG5cbiAgZGVsZXRlIGZybS5UXG4gIGZybS5wYWNrID0gcGFjayA7IGZybS51bnBhY2sgPSB1bnBhY2tcbiAgY29uc3Qgc2VxX25leHQgPSBmcm0uc2VxX25leHRcblxuICBmdW5jdGlvbiBwYWNrKHBrdF90eXBlLCBwa3Rfb2JqKSA6OlxuICAgIGlmICEgQCAwIDw9IHBrdF90eXBlICYmIHBrdF90eXBlIDw9IDI1NSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwa3RfdHlwZSB0byBiZSBbMC4uMjU1XWBcblxuICAgIHBrdF9vYmoudHlwZSA9IHBrdF90eXBlXG4gICAgaWYgc2VxX25leHQgJiYgbnVsbCA9PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgcGt0X29iai5zZXEgPSB0cnVlXG5cbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBBcnJheUJ1ZmZlcihzaXplKVxuICAgIGZfcGFjayhwa3Rfb2JqLCBkdiwgMClcbiAgICBwa3Rfb2JqLmhlYWRlciA9IGR2LmJ1ZmZlclxuXG4gICAgaWYgdHJ1ZSA9PT0gcGt0X29iai5zZXEgOjpcbiAgICAgIF9iaW5kX2l0ZXJhYmxlIEAgcGt0X29iaiwgZHYuYnVmZmVyLnNsaWNlKDAsc2l6ZSlcblxuICBmdW5jdGlvbiB1bnBhY2socGt0KSA6OlxuICAgIGNvbnN0IGJ1ZiA9IHBrdC5oZWFkZXJfYnVmZmVyKClcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBVaW50OEFycmF5KGJ1ZikuYnVmZmVyXG5cbiAgICBjb25zdCBpbmZvID0ge31cbiAgICBmX3VucGFjayhpbmZvLCBkdiwgMClcbiAgICByZXR1cm4gcGt0LmluZm8gPSBpbmZvXG5cbiAgZnVuY3Rpb24gX2JpbmRfaXRlcmFibGUocGt0X29iaiwgYnVmX2Nsb25lKSA6OlxuICAgIGNvbnN0IHt0eXBlfSA9IHBrdF9vYmpcbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXQsIHR0bCwgdG9rZW59ID0gcGt0X29ialxuICAgIHBrdF9vYmoubmV4dCA9IG5leHRcblxuICAgIGZ1bmN0aW9uIG5leHQob3B0aW9ucykgOjpcbiAgICAgIGlmIG51bGwgPT0gb3B0aW9ucyA6OiBvcHRpb25zID0ge31cbiAgICAgIGNvbnN0IGhlYWRlciA9IGJ1Zl9jbG9uZS5zbGljZSgpXG4gICAgICBzZXFfbmV4dCBAIG9wdGlvbnMsIG5ldyBEYXRhVmlldyBAIGhlYWRlclxuICAgICAgcmV0dXJuIEB7fSBkb25lOiAhISBvcHRpb25zLmZpbiwgdmFsdWU6IEB7fSAvLyBwa3Rfb2JqXG4gICAgICAgIGlkX3JvdXRlciwgaWRfdGFyZ2V0LCB0eXBlLCB0dGwsIHRva2VuLCBoZWFkZXJcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBhY2tldFBhcnNlciwgb3B0aW9ucywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIGNvbnN0IHtyYW5kb21faWQsIGpzb25fcGFja30gPSBvcHRpb25zXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgY3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIHBhY2tldEZyYWdtZW50c1xuICAgIGJpbmRUcmFuc3BvcnRzXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgcGFydHMgPSBbXSwgZmluID0gZmFsc2VcbiAgICByZXR1cm4gQHt9IGZlZWQsIGluZm86IHBrdC5pbmZvXG5cbiAgICBmdW5jdGlvbiBmZWVkKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgcGFydHNbc2VxLTFdID0gcGt0LmJvZHlfYnVmZmVyKClcblxuICAgICAgaWYgISBmaW4gOjogcmV0dXJuXG4gICAgICBpZiBwYXJ0cy5pbmNsdWRlcyBAIHVuZGVmaW5lZCA6OiByZXR1cm5cblxuICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcblxuICAgICAgY29uc3QgcmVzID0gY29uY2F0QnVmZmVycyhwYXJ0cylcbiAgICAgIHBhcnRzID0gbnVsbFxuICAgICAgcmV0dXJuIHJlc1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbShwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByZWN2RGF0YSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgaW5mbyA9IHBrdC5pbmZvXG4gICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgaW5mbylcbiAgICAgIGlmIG51bGwgPT0gcnN0cmVhbSA6OiByZXR1cm5cbiAgICAgIGNoZWNrX2ZucyBAIHJzdHJlYW0sICdvbl9lcnJvcicsICdvbl9kYXRhJywgJ29uX2VuZCcgXG4gICAgICByZWN2RGF0YSA9IHNpbmsucmVjdlN0cmVhbURhdGEuYmluZChzaW5rLCByc3RyZWFtLCBpbmZvKVxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfYm9keVxuICAgICAgaWYgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG5cbiAgICBmdW5jdGlvbiBmZWVkX2JvZHkocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgcmVjdkRhdGEoKVxuICAgICAgbGV0IGRhdGFcbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICAgIGRhdGEgPSBhc19jb250ZW50KHBrdCwgc2luaylcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIGlmIGZpbiA6OlxuICAgICAgICBjb25zdCByZXMgPSByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZW5kIEAgcmVzLCBwa3RcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pZ25vcmUocGt0KSA6OlxuICAgICAgdHJ5IDo6IGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuXG4gICAgZnVuY3Rpb24gZmVlZF9zZXEocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxID49IDAgOjpcbiAgICAgICAgaWYgbmV4dCsrID09PSBzZXEgOjpcbiAgICAgICAgICByZXR1cm4gLy8gaW4gb3JkZXJcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgZmluID0gdHJ1ZVxuICAgICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuICAgICAgICBpZiBuZXh0ID09PSAtc2VxIDo6XG4gICAgICAgICAgbmV4dCA9ICdkb25lJ1xuICAgICAgICAgIHJldHVybiAvLyBpbi1vcmRlciwgbGFzdCBwYWNrZXRcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG4gICAgICBuZXh0ID0gJ2ludmFsaWQnXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFja2V0IG91dCBvZiBzZXF1ZW5jZWBcblxuICBmdW5jdGlvbiAqIHBhY2tldEZyYWdtZW50cyhidWYsIG5leHRfaGRyLCBmaW4pIDo6XG4gICAgaWYgbnVsbCA9PSBidWYgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgeWllbGQgb2JqXG4gICAgICByZXR1cm5cblxuICAgIGxldCBpID0gMCwgbGFzdElubmVyID0gYnVmLmJ5dGVMZW5ndGggLSBmcmFnbWVudF9zaXplO1xuICAgIHdoaWxlIGkgPCBsYXN0SW5uZXIgOjpcbiAgICAgIGNvbnN0IGkwID0gaVxuICAgICAgaSArPSBmcmFnbWVudF9zaXplXG5cbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKClcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkwLCBpKVxuICAgICAgeWllbGQgb2JqXG5cbiAgICA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpKVxuICAgICAgeWllbGQgb2JqXG5cblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBvdXRib3VuZCA9IFtdXG4gICAgb3V0Ym91bmQuY2hvb3NlID0gZnJhbWluZ3MuY2hvb3NlXG5cbiAgICBmb3IgY29uc3QgZnJhbWUgb2YgZnJhbWluZ3MgOjpcbiAgICAgIGNvbnN0IGltcGwgPSBmcmFtZSA/IHRyYW5zcG9ydHNbZnJhbWUudHJhbnNwb3J0XSA6IG51bGxcbiAgICAgIGlmICEgaW1wbCA6OiBjb250aW51ZVxuXG4gICAgICBjb25zdCB7Yml0cywgcGFjaywgdW5wYWNrfSA9IGZyYW1lXG4gICAgICBjb25zdCBwa3RfdHlwZSA9IGhpZ2hiaXRzIHwgYml0c1xuICAgICAgY29uc3Qge3RfcmVjdn0gPSBpbXBsXG5cbiAgICAgIGZ1bmN0aW9uIHBhY2tfaGRyKG9iaikgOjpcbiAgICAgICAgcGFjayhwa3RfdHlwZSwgb2JqKVxuICAgICAgICByZXR1cm4gb2JqXG5cbiAgICAgIGZ1bmN0aW9uIHJlY3ZfbXNnKHBrdCwgc2luaykgOjpcbiAgICAgICAgdW5wYWNrKHBrdClcbiAgICAgICAgcmV0dXJuIHRfcmVjdihwa3QsIHNpbmspXG5cbiAgICAgIHBhY2tfaGRyLnBrdF90eXBlID0gcmVjdl9tc2cucGt0X3R5cGUgPSBwa3RfdHlwZVxuICAgICAgb3V0Ym91bmRbYml0c10gPSBwYWNrX2hkclxuICAgICAgaW5ib3VuZFtwa3RfdHlwZV0gPSByZWN2X21zZ1xuXG4gICAgICBpZiAncHJvZHVjdGlvbicgIT09IHByb2Nlc3MuZW52Lk5PREVfRU5WIDo6XG4gICAgICAgIGNvbnN0IG9wID0gcGFja19oZHIub3AgPSByZWN2X21zZy5vcCA9IGZyYW1lLm9wXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHBhY2tfaGRyLCAnbmFtZScsIEB7fSB2YWx1ZTogYHBhY2tfaGRyIMKrJHtvcH3Cu2BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcmVjdl9tc2csICduYW1lJywgQHt9IHZhbHVlOiBgcmVjdl9tc2cgwqske29wfcK7YFxuXG4gICAgcmV0dXJuIG91dGJvdW5kXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0cyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBwYWNrQm9keSA9IHRyYW5zcG9ydHMucGFja0JvZHlcbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICByZXR1cm4gdHJhbnNwb3J0cy5zdHJlYW1pbmdcbiAgICAgID8gQHt9IHNlbmQsIHN0cmVhbTogYmluZF9zdHJlYW0gQCB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICA6IEB7fSBzZW5kXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ211bHRpcGFydCdcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcyhjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBAe30gc2VudDogbXNlbmQgQCB0cnVlLCBib2R5XG5cbiAgICAgIG9iai50cmFuc3BvcnQgPSAnc2luZ2xlJ1xuICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgcGFja19oZHIob2JqKVxuICAgICAgcmV0dXJuIEB7fSBzZW50OiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCBzaW5rLCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHNpbmssIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0fSA9IHJfaWRcbiAgICBjb25zdCBvYmogPSBAe30gaWRfcm91dGVyLCBpZF90YXJnZXRcbiAgICAgIGZyb21faWQ6IHNpbmsuZnJvbV9pZCwgbXNnaWRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgY29uc3RydWN0b3IoanNvbl91bnBhY2spIDo6XG4gICAgdGhpcy5qc29uX3VucGFjayA9IGpzb25fdW5wYWNrXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiBmYWxzZSAvLyBjaGFuZ2Ugd2hpbGUgYXdhaXRpbmcgYWJvdmXigKZcbiAgICAgIHRyeSA6OlxuICAgICAgICByZXR1cm4gYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlIC8vIHNpZ25hbCB1bnJlZ2lzdGVyIHRvIG1zZy1mYWJyaWMtY29yZS9yb3V0ZXJcblxuICBzdGF0ZUZvcihwa3QsIGlmQWJzZW50KSA6OlxuICAgIGNvbnN0IG1zZ2lkID0gcGt0LmluZm8ubXNnaWRcbiAgICBsZXQgZW50cnkgPSB0aGlzLmJ5X21zZ2lkLmdldChtc2dpZClcbiAgICBpZiB1bmRlZmluZWQgPT09IGVudHJ5IDo6XG4gICAgICBpZiAhIG1zZ2lkIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIG1zZ2lkOiAke21zZ2lkfWBcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZkFic2VudCA6OlxuICAgICAgICBlbnRyeSA9IGlmQWJzZW50KHBrdCwgdGhpcywgbXNnaWQpXG4gICAgICBlbHNlIGVudHJ5ID0gaWZBYnNlbnRcbiAgICAgIHRoaXMuYnlfbXNnaWQuc2V0IEAgbXNnaWQsIGVudHJ5XG4gICAgcmV0dXJuIGVudHJ5XG5cbiAgZGVsZXRlU3RhdGVGb3IobXNnaWQpIDo6XG4gICAgcmV0dXJuIHRoaXMuYnlfbXNnaWQuZGVsZXRlKG1zZ2lkKVxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7fSkgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIHRoaXMuZnJvbV9pZFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7dGhpcy5mcm9tX2lkLmlkX3RhcmdldH3Cu2BcblxuICBjb25zdHJ1Y3Rvcihtc2dfY3R4KSA6OlxuICAgIG1zZ19jdHggPSBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGZyb21faWQ6IEB7fSB2YWx1ZTogbXNnX2N0eC5mcm9tX2lkLCBlbnVtZXJhYmxlOiB0cnVlXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGZyb21faWQ6IHRoaXMuZnJvbV9pZFxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUoe3Jtc2csIG1zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvKSA6OlxuICByZWN2TXNnKG1zZywgaW5mbykgOjpcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mb1xuICByZWN2U3RyZWFtKG1zZywgaW5mbykgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHJldHVybiB0aGlzLnBhcnRzLmpvaW4oJycpXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgbXNnX2N0eCwga2luZCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIG1zZ19jdHgubXNfdGltZW91dFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBtc190aW1lb3V0KSA6OlxuICAgIGNvbnN0IGFucyA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIGlmIG1zX3RpbWVvdXQgOjpcbiAgICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCBtc190aW1lb3V0KVxuICAgICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICAgICAgZnVuY3Rpb24gdGltZW91dCgpIDo6IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuXG4gICAgcmV0dXJuIHNlbnQgPT4gOjpcbiAgICAgIGFucy5zZW50ID0gc2VudFxuICAgICAgcmV0dXJuIGFuc1xuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0XG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIGNvbnN0cnVjdG9yKGZyb21faWQsIHJlc29sdmVSb3V0ZSkgOjpcbiAgICBpZiBudWxsICE9PSBmcm9tX2lkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZnJvbV9pZFxuICAgICAgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcblxuICAgIGNvbnN0IGN0eCA9IHtmcm9tX2lkfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9yb290XzogQDogdmFsdWU6IHRoaXNcbiAgICAgIGZyb21faWQ6IEA6IHZhbHVlOiBmcm9tX2lkXG4gICAgICBjdHg6IEA6IHZhbHVlOiBjdHhcbiAgICAgIHJlc29sdmVSb3V0ZTogQDogdmFsdWU6IHJlc29sdmVSb3V0ZVxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cbiAgc3RhdGljIGZyb20oaWRfdGFyZ2V0LCBodWIpIDo6XG4gICAgY29uc3QgZnJvbV9pZCA9IG51bGwgPT09IGlkX3RhcmdldCA/IG51bGxcbiAgICAgIDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICByZXR1cm4gbmV3IHRoaXMgQCBmcm9tX2lkLCBodWIuYmluZFJvdXRlRGlzcGF0Y2goKVxuXG4gIGdldCB0bygpIDo6IHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5jbG9uZSgpLndpdGggQCAuLi5hcmdzXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5jb2RlYygnY29udHJvbCcsIHt0b2tlbn0pLmludm9rZSBAICdwaW5nJ1xuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLmludm9rZSBAICdzZW5kJywgLi4uYXJnc1xuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuaW52b2tlIEAgJ3N0cmVhbScsIC4uLmFyZ3NcblxuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZShvYmouaWRfcm91dGVyKVxuICAgIGlmIHRydWUgIT09IG9iai50b2tlbiA6OlxuICAgICAgcmV0dXJuIHRoaXMuX2NvZGVjW2tleV0gQCBjaGFuLCBvYmosIC4uLmFyZ3NcblxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuICAgICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgdGhpcywga2V5KVxuICAgICAgcmV0dXJuIHJlcGx5IEAgdGhpcy5fY29kZWNba2V5XSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgICBpZiAhIGN0eC5pZF9yb3V0ZXIgOjpcbiAgICAgICAgICAgIC8vIGltcGxpY2l0bHkgb24gdGhlIHNhbWUgcm91dGVyXG4gICAgICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGVsc2UgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gaWRfcm91dGVyIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYXNzaW5nICdpZF9yb3V0ZXInIHJlcXVpcmVzICdpZF90YXJnZXQnYFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgcmVzZXQoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMuX3Jvb3RfLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcbiAgICByZXR1cm4gdGhpc1xuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBvbl9lcnJvcihlcnIsIHttc2csIHBrdH0pIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnIsIEB7fSBtc2csIHBrdFxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgU0hVVERPV046JyArIGVyclxuXG4gIHN1YmNsYXNzKHtTaW5rLCBFbmRwb2ludCwgTXNnQ3R4LCBwcm90b2NvbHN9KSA6OlxuXG4gIG1zZ191bnBhY2soZXApIDo6IHJldHVybiBKU09OLnBhcnNlXG4gIG1zZ19wYWNrKCkgOjogcmV0dXJuIEpTT04uc3RyaW5naWZ5XG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICByYW5kb21faWQsIG1zZ191bnBhY2ssIG1zZ19wYWNrXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGUuZW5kcG9pbnQgPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1Yi5lbmRwb2ludCA9IGh1Yi5lbmRwb2ludChodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3BhY2s6IG1zZ19wYWNrKClcbiAgICBjb25zdCBTaW5rID0gU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgY29uc3QgRW5kcG9pbnQgPSBFbmRwb2ludEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcblxuICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICBTaW5rLCBFbmRwb2ludCwgTXNnQ3R4LCBwcm90b2NvbHNcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGUsIHNlcnZlcjogZW5kcG9pbnQsIGNsaWVudFxuXG4gICAgICBmdW5jdGlvbiBjbGllbnQoLi4uYXJncykgOjpcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgbnVsbCwgaHViXG4gICAgICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aFxuICAgICAgICAgID8gbXNnX2N0eC53aXRoKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgcmFuZG9tX2lkKCksIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgaWRfdGFyZ2V0LCBodWJcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eClcblxuICAgICAgICBjb25zdCB0YXJnZXQgPSBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgIGNvbnN0IG9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8IHRhcmdldCkuYmluZCh0YXJnZXQpXG4gICAgICAgIGNvbnN0IG9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldClcbiAgICAgICAgY29uc3Qgb25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0KVxuXG4gICAgICAgIGNvbnN0IHNpbmsgPSBuZXcgU2luayBAIGVwLmpzb25fdW5wYWNrIHx8IG1zZ191bnBhY2soZXApXG4gICAgICAgIHNpbmsucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsXG4gICAgICAgICAgQHt9IG9uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3duXG5cbiAgICAgICAgbGV0IHJlYWR5ID0gUHJvbWlzZS5yZXNvbHZlKHRhcmdldClcbiAgICAgICAgaWYgdGFyZ2V0Lm9uX3JlYWR5IDo6XG4gICAgICAgICAgcmVhZHkgPSByZWFkeS50aGVuIEAgdGFyZ2V0ID0+IHRhcmdldC5vbl9yZWFkeSgpXG5cbiAgICAgICAgY29uc3QgcmVzID0gT2JqZWN0LmNyZWF0ZSBAIGVuZHBvaW50X3RhcmdldF9hcGksIEA6XG4gICAgICAgICAgaWRfcm91dGVyOiBAe30gZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICAgIGlkX3RhcmdldDogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZF90YXJnZXRcbiAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gcmVzXG4gICAgICAgIHJldHVybiByZXNcblxuY29uc3QgZW5kcG9pbnRfdGFyZ2V0X2FwaSA9IEA6XG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gMCB8IHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgVGFyZ2V0ICR7dGhpcy5pZF90YXJnZXR9wrtgXG5cbiIsImltcG9ydCB7cmFuZG9tQnl0ZXN9IGZyb20gJ2NyeXB0bydcbmltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5lbmRwb2ludF9ub2RlanMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICByZXR1cm4gcmFuZG9tQnl0ZXMoNCkucmVhZEludDMyTEUoKVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9ub2RlanMocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIiwiaW1wb3J0IGVuZHBvaW50X3BsdWdpbiBmcm9tICcuL3BsdWdpbi5qc3knXG5cbmNvbnN0IGdldFJhbmRvbVZhbHVlcyA9ICd1bmRlZmluZWQnICE9PSB0eXBlb2Ygd2luZG93XG4gID8gd2luZG93LmNyeXB0by5nZXRSYW5kb21WYWx1ZXMgOiBudWxsXG5cbmVuZHBvaW50X2Jyb3dzZXIucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICBjb25zdCBhcnIgPSBuZXcgSW50MzJBcnJheSgxKVxuICBnZXRSYW5kb21WYWx1ZXMoYXJyKVxuICByZXR1cm4gYXJyWzBdXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGVuZHBvaW50X2Jyb3dzZXIocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIl0sIm5hbWVzIjpbImxpdHRsZV9lbmRpYW4iLCJjX3NpbmdsZSIsImNfZGF0YWdyYW0iLCJjX2RpcmVjdCIsImNfbXVsdGlwYXJ0IiwiY19zdHJlYW1pbmciLCJfZXJyX21zZ2lkX3JlcXVpcmVkIiwiX2Vycl90b2tlbl9yZXF1aXJlZCIsImZybV9yb3V0aW5nIiwic2l6ZSIsImJpdHMiLCJtYXNrIiwib2JqIiwiZnJvbV9pZCIsImR2Iiwib2Zmc2V0Iiwic2V0SW50MzIiLCJpZF9yb3V0ZXIiLCJpZF90YXJnZXQiLCJ1bmRlZmluZWQiLCJnZXRJbnQzMiIsImZybV9yZXNwb25zZSIsIm1zZ2lkIiwiRXJyb3IiLCJzZXRJbnQxNiIsInNlcV9hY2siLCJhY2tfZmxhZ3MiLCJ0b2tlbiIsImdldEludDE2IiwiZnJtX2RhdGFncmFtIiwidHJhbnNwb3J0IiwiZnJtX2RpcmVjdCIsImZybV9tdWx0aXBhcnQiLCJzZXFfcG9zIiwic2VxIiwic2VxX2ZsYWdzIiwiZnJtX3N0cmVhbWluZyIsImJpbmRfc2VxX25leHQiLCJzZXFfb2Zmc2V0Iiwic2VxX25leHQiLCJmbGFncyIsImZpbiIsIk5hTiIsImNvbXBvc2VGcmFtaW5ncyIsImZybV9mcm9tIiwiZnJtX3Jlc3AiLCJmcm1fdHJhbnNwb3J0cyIsImxlbmd0aCIsImJ5Qml0cyIsInRfZnJvbSIsImZfdGVzdCIsInRfcmVzcCIsInQwIiwidDEiLCJ0MiIsInQzIiwibWFwIiwiZiIsInRlc3RCaXRzIiwiY2hvb3NlIiwibHN0IiwiVCIsImIiLCJvcCIsImZuX2tleSIsImZuX3RyYW4iLCJmbl9mcm9tIiwiZm5fcmVzcCIsImZybSIsImJpbmRBc3NlbWJsZWQiLCJmX3BhY2siLCJmX3VucGFjayIsInBhY2siLCJ1bnBhY2siLCJwa3RfdHlwZSIsInBrdF9vYmoiLCJUeXBlRXJyb3IiLCJ0eXBlIiwiRGF0YVZpZXciLCJBcnJheUJ1ZmZlciIsImhlYWRlciIsImJ1ZmZlciIsInNsaWNlIiwicGt0IiwiYnVmIiwiaGVhZGVyX2J1ZmZlciIsIlVpbnQ4QXJyYXkiLCJpbmZvIiwiX2JpbmRfaXRlcmFibGUiLCJidWZfY2xvbmUiLCJ0dGwiLCJuZXh0Iiwib3B0aW9ucyIsImRvbmUiLCJ2YWx1ZSIsInBhY2tldFBhcnNlciIsImZyYWdtZW50X3NpemUiLCJjb25jYXRCdWZmZXJzIiwicGFja1BhY2tldE9iaiIsInBhY2tfdXRmOCIsInVucGFja191dGY4IiwiTnVtYmVyIiwicmFuZG9tX2lkIiwianNvbl9wYWNrIiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwiY3JlYXRlTXVsdGlwYXJ0Iiwic2luayIsInBhcnRzIiwiZmVlZCIsImJvZHlfYnVmZmVyIiwiaW5jbHVkZXMiLCJkZWxldGVTdGF0ZUZvciIsInJlcyIsInJlY3ZEYXRhIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0IiwiYXNfY29udGVudCIsImZlZWRfaWdub3JlIiwibXNnIiwianNvbl91bnBhY2siLCJib2R5X3V0ZjgiLCJyZWN2U3RyZWFtIiwicmVjdlN0cmVhbURhdGEiLCJiaW5kIiwiZXJyIiwib25fZXJyb3IiLCJmZWVkX2JvZHkiLCJvbl9pbml0IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJwcm9jZXNzIiwiZW52IiwiTk9ERV9FTlYiLCJkZWZpbmVQcm9wZXJ0eSIsImJpbmRUcmFuc3BvcnRzIiwicGFja0JvZHkiLCJzdHJlYW1pbmciLCJzZW5kIiwic3RyZWFtIiwiYmluZF9zdHJlYW0iLCJtb2RlIiwiY2hhbiIsIm1zZW5kIiwibXNlbmRfYnl0ZXMiLCJzZW50IiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2ltcGwiLCJvYmplY3QiLCJieXRlcyIsIndyaXRlIiwiZW5kIiwiY2h1bmsiLCJjaGVja19mbnMiLCJrZXlzIiwia2V5IiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0IiwicmVjdk1zZyIsInN0YXRlRm9yIiwiYm9keV9idWYiLCJ1bnBhY2tCb2R5IiwiYmluYXJ5X3Byb3RvY29sIiwiYXNCdWZmZXIiLCJwa3RfYnVmZmVyIiwiY29udHJvbF9wcm90b2NvbCIsImhpZ2giLCJwaW5nX2ZyYW1lIiwicG9uZ19mcmFtZSIsInBvbmdfdHlwZSIsInJlY3ZfcG9uZyIsInBpbmdfdHlwZSIsInJlY3ZfcGluZyIsInBpbmciLCJKU09OIiwic3RyaW5naWZ5IiwidHMwIiwiRGF0ZSIsInJvdXRlciIsImJvZHlfanNvbiIsInJlY3ZDdHJsIiwiX3NlbmRfcG9uZyIsInBrdF9waW5nIiwicl9pZCIsInRzMSIsImRpc3BhdGNoIiwiaW5pdF9wcm90b2NvbCIsInNoYXJlZF9wcm90byIsImpzb24iLCJqc29uX3Byb3RvIiwiYmluYXJ5IiwiYmluYXJ5X3Byb3RvIiwiY29udHJvbCIsImNvbnRyb2xfcHJvdG8iLCJjb2RlY3MiLCJkZWZhdWx0IiwiU2luayIsImZvclByb3RvY29scyIsInByb3RvdHlwZSIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaHViIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImV4dHJhIiwiYXNzaWduIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZ2V0Iiwic2V0IiwiZGVsZXRlIiwiRW5kcG9pbnQiLCJtc2dfY3R4Iiwid2l0aEVuZHBvaW50IiwiZGVmaW5lUHJvcGVydGllcyIsImVudW1lcmFibGUiLCJ0byIsIk1hcCIsImNyZWF0ZU1hcCIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIm5vdyIsInQiLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwicm1zZyIsInJlcGx5IiwicmVzb2x2ZSIsInRoZW4iLCJ3YXJuIiwiaW5pdFJlcGx5Iiwia2luZCIsImluaXRSZXBseVByb21pc2UiLCJtc190aW1lb3V0IiwibW9uaXRvciIsImFucyIsIlByb21pc2UiLCJyZWplY3QiLCJ0aWQiLCJzZXRUaW1lb3V0IiwidGltZW91dCIsInVucmVmIiwiUmVwbHlUaW1lb3V0IiwiT2JqZWN0IiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsInJlc29sdmVSb3V0ZSIsImZyZWV6ZSIsImN0eCIsImZyb20iLCJpZF9zZWxmIiwiYmluZFJvdXRlRGlzcGF0Y2giLCJhcmdzIiwiY2xvbmUiLCJ3aXRoIiwiY29kZWMiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwiX2NvZGVjIiwidGd0IiwicmVwbHlfaWQiLCJjcmVhdGUiLCJfcm9vdF8iLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJfbXNnQ29kZWNzIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiZXJyb3IiLCJwcm90b2NvbHMiLCJlcCIsInBhcnNlIiwicGx1Z2luX29wdGlvbnMiLCJtc2dfdW5wYWNrIiwibXNnX3BhY2siLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsIm9yZGVyIiwic3ViY2xhc3MiLCJwb3N0IiwiRmFicmljSHViX1BJIiwiYmFzZXMiLCJpc1BhY2tldFBhcnNlciIsImJpbmRFbmRwb2ludEFwaSIsIlNpbmtCYXNlIiwiTXNnQ3R4QmFzZSIsIkVuZHBvaW50QmFzZSIsInNlcnZlciIsImNsaWVudCIsInRhcmdldCIsInJlZ2lzdGVyIiwicmVhZHkiLCJvbl9yZWFkeSIsImVuZHBvaW50X3RhcmdldF9hcGkiLCJlbmRwb2ludF9ub2RlanMiLCJyYW5kb21CeXRlcyIsInJlYWRJbnQzMkxFIiwiZW5kcG9pbnRfcGx1Z2luIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGFBQWEsVUFBbkI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7O0FBRUEsTUFBTUMsc0JBQXVCLDBCQUE3QjtBQUNBLE1BQU1DLHNCQUF1QiwyQkFBN0I7O0FBR0EsU0FBU0MsV0FBVCxHQUF1QjtRQUNmQyxPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTztRQUFBLEVBQ0NELElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVUsUUFBUUEsSUFBSUMsT0FBWixHQUFzQkgsSUFBdEIsR0FBNkIsS0FBcEM7S0FIVjs7V0FLRUUsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtZQUNoQixFQUFDRixPQUFELEtBQVlELEdBQWxCO1NBQ0dJLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QixJQUFFRixRQUFRSSxTQUFsQyxFQUE2Q2pCLGFBQTdDO1NBQ0dnQixRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUssU0FBbEMsRUFBNkNsQixhQUE3QztLQVJHOzthQVVJWSxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBCO1lBQ2xCRixVQUFVTSxjQUFjUCxJQUFJQyxPQUFsQixHQUNaRCxJQUFJQyxPQUFKLEdBQWMsRUFERixHQUNPRCxJQUFJQyxPQUQzQjtjQUVRSSxTQUFSLEdBQW9CSCxHQUFHTSxRQUFILENBQWMsSUFBRUwsTUFBaEIsRUFBd0JmLGFBQXhCLENBQXBCO2NBQ1FrQixTQUFSLEdBQW9CSixHQUFHTSxRQUFILENBQWMsSUFBRUwsTUFBaEIsRUFBd0JmLGFBQXhCLENBQXBCO0tBZEcsRUFBUDs7O0FBZ0JGLFNBQVNxQixZQUFULEdBQXdCO1FBQ2hCWixPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTztRQUFBLEVBQ0NELElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVUsUUFBUUEsSUFBSVUsS0FBWixHQUFvQlosSUFBcEIsR0FBMkIsS0FBbEM7S0FIVjs7V0FLRUUsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtVQUNuQixDQUFFSCxJQUFJVSxLQUFULEVBQWlCO2NBQU8sSUFBSUMsS0FBSixDQUFZakIsbUJBQVosQ0FBTjs7U0FDZlUsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJVSxLQUE1QixFQUFtQ3RCLGFBQW5DO1NBQ0d3QixRQUFILENBQWMsSUFBRVQsTUFBaEIsRUFBd0IsSUFBRUgsSUFBSWEsT0FBOUIsRUFBdUN6QixhQUF2QztTQUNHd0IsUUFBSCxDQUFjLElBQUVULE1BQWhCLEVBQXdCLElBQUVILElBQUljLFNBQTlCLEVBQXlDMUIsYUFBekM7S0FURzs7YUFXSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtVQUNwQlksS0FBSixHQUFZYixHQUFHTSxRQUFILENBQWMsSUFBRUwsTUFBaEIsRUFBd0JmLGFBQXhCLENBQVo7VUFDSXlCLE9BQUosR0FBY1gsR0FBR2MsUUFBSCxDQUFjLElBQUViLE1BQWhCLEVBQXdCZixhQUF4QixDQUFkO1VBQ0kwQixTQUFKLEdBQWdCWixHQUFHYyxRQUFILENBQWMsSUFBRWIsTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO0tBZEcsRUFBUDs7O0FBa0JGLFNBQVM2QixZQUFULEdBQXdCO1FBQ2hCcEIsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSW1CLFdBQVc1QixVQUFmO1FBQUEsRUFDQ1EsSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7VUFDUFYsZUFBZVUsSUFBSWtCLFNBQXRCLEVBQWtDO2VBQVFwQixJQUFQOztVQUNoQ0UsSUFBSWtCLFNBQUosSUFBaUI3QixhQUFhVyxJQUFJa0IsU0FBckMsRUFBaUQ7ZUFBUSxLQUFQOzthQUMzQyxDQUFFbEIsSUFBSWUsS0FBTixHQUFjakIsSUFBZCxHQUFxQixLQUE1QjtLQU5HOztXQVFFRSxHQUFQLEVBQVlFLEVBQVosRUFBZ0JDLE1BQWhCLEVBQXdCLEVBUm5COzthQVVJSCxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBCO1VBQ3BCZSxTQUFKLEdBQWdCNUIsVUFBaEI7S0FYRyxFQUFQOzs7QUFhRixTQUFTNkIsVUFBVCxHQUFzQjtRQUNkdEIsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSW1CLFdBQVczQixRQUFmO1FBQUEsRUFDQ08sSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7VUFDUFQsYUFBYVMsSUFBSWtCLFNBQXBCLEVBQWdDO2VBQVFwQixJQUFQOztVQUM5QkUsSUFBSWtCLFNBQUosSUFBaUI3QixhQUFhVyxJQUFJa0IsU0FBckMsRUFBaUQ7ZUFBUSxLQUFQOzthQUMzQyxDQUFDLENBQUVsQixJQUFJZSxLQUFQLEdBQWVqQixJQUFmLEdBQXNCLEtBQTdCO0tBTkc7O1dBUUVFLEdBQVAsRUFBWUUsRUFBWixFQUFnQkMsTUFBaEIsRUFBd0I7VUFDbkIsQ0FBRUgsSUFBSWUsS0FBVCxFQUFpQjtjQUFPLElBQUlKLEtBQUosQ0FBWWhCLG1CQUFaLENBQU47O1NBQ2ZTLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QkgsSUFBSWUsS0FBNUIsRUFBbUMzQixhQUFuQztLQVZHOzthQVlJWSxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBCO1VBQ3BCTyxLQUFKLEdBQVlSLEdBQUdNLFFBQUgsQ0FBYyxJQUFFTCxNQUFoQixFQUF3QmYsYUFBeEIsQ0FBWjtVQUNJOEIsU0FBSixHQUFnQjNCLFFBQWhCO0tBZEcsRUFBUDs7O0FBZ0JGLFNBQVM2QixhQUFULEdBQXlCO1FBQ2pCdkIsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSW1CLFdBQVcxQixXQUFmO1FBQUEsRUFDQ00sSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7YUFBVVIsZ0JBQWdCUSxJQUFJa0IsU0FBcEIsR0FBZ0NwQixJQUFoQyxHQUF1QyxLQUE5QztLQUhWOztpQkFBQSxFQUtVdUIsU0FBUyxDQUxuQjtXQU1FckIsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtVQUNuQixDQUFFSCxJQUFJZSxLQUFULEVBQWlCO2NBQU8sSUFBSUosS0FBSixDQUFZaEIsbUJBQVosQ0FBTjs7U0FDZlMsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJZSxLQUE1QixFQUFtQzNCLGFBQW5DO1VBQ0csUUFBUVksSUFBSXNCLEdBQWYsRUFBcUI7O1dBQ2hCVixRQUFILENBQWMsSUFBRVQsTUFBaEIsRUFBd0IsQ0FBeEIsRUFBMkJmLGFBQTNCO09BREYsTUFFS2MsR0FBR1UsUUFBSCxDQUFjLElBQUVULE1BQWhCLEVBQXdCLElBQUVILElBQUlzQixHQUE5QixFQUFtQ2xDLGFBQW5DO1NBQ0Z3QixRQUFILENBQWMsSUFBRVQsTUFBaEIsRUFBd0IsSUFBRUgsSUFBSXVCLFNBQTlCLEVBQXlDbkMsYUFBekM7S0FaRzs7YUFjSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtVQUNwQk8sS0FBSixHQUFnQlIsR0FBR00sUUFBSCxDQUFjLElBQUVMLE1BQWhCLEVBQXdCZixhQUF4QixDQUFoQjtVQUNJa0MsR0FBSixHQUFnQnBCLEdBQUdjLFFBQUgsQ0FBYyxJQUFFYixNQUFoQixFQUF3QmYsYUFBeEIsQ0FBaEI7VUFDSW1DLFNBQUosR0FBZ0JyQixHQUFHYyxRQUFILENBQWMsSUFBRWIsTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO1VBQ0k4QixTQUFKLEdBQWdCMUIsV0FBaEI7S0FsQkcsRUFBUDs7O0FBb0JGLFNBQVNnQyxhQUFULEdBQXlCO1FBQ2pCM0IsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSW1CLFdBQVd6QixXQUFmO1FBQUEsRUFDQ0ssSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7YUFBVVAsZ0JBQWdCTyxJQUFJa0IsU0FBcEIsR0FBZ0NwQixJQUFoQyxHQUF1QyxLQUE5QztLQUhWOztpQkFBQSxFQUtVdUIsU0FBUyxDQUxuQjtXQU1FckIsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtVQUNuQixDQUFFSCxJQUFJZSxLQUFULEVBQWlCO2NBQU8sSUFBSUosS0FBSixDQUFZaEIsbUJBQVosQ0FBTjs7U0FDZlMsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJZSxLQUE1QixFQUFtQzNCLGFBQW5DO1VBQ0csUUFBUVksSUFBSXNCLEdBQWYsRUFBcUI7V0FDaEJWLFFBQUgsQ0FBYyxJQUFFVCxNQUFoQixFQUF3QixDQUF4QixFQUEyQmYsYUFBM0I7O09BREYsTUFFS2MsR0FBR1UsUUFBSCxDQUFjLElBQUVULE1BQWhCLEVBQXdCLElBQUVILElBQUlzQixHQUE5QixFQUFtQ2xDLGFBQW5DO1NBQ0Z3QixRQUFILENBQWMsSUFBRVQsTUFBaEIsRUFBd0IsSUFBRUgsSUFBSXVCLFNBQTlCLEVBQXlDbkMsYUFBekM7S0FaRzs7YUFjSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtVQUNwQk8sS0FBSixHQUFnQlIsR0FBR00sUUFBSCxDQUFjLElBQUVMLE1BQWhCLEVBQXdCZixhQUF4QixDQUFoQjtVQUNJa0MsR0FBSixHQUFnQnBCLEdBQUdjLFFBQUgsQ0FBYyxJQUFFYixNQUFoQixFQUF3QmYsYUFBeEIsQ0FBaEI7VUFDSW1DLFNBQUosR0FBZ0JyQixHQUFHYyxRQUFILENBQWMsSUFBRWIsTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO1VBQ0k4QixTQUFKLEdBQWdCekIsV0FBaEI7S0FsQkcsRUFBUDs7O0FBcUJGLFNBQVNnQyxhQUFULENBQXVCdEIsTUFBdkIsRUFBK0I7UUFDdkJ1QixhQUFhLEtBQUtMLE9BQUwsR0FBZWxCLE1BQWxDO01BQ0ltQixNQUFNLENBQVY7U0FDTyxTQUFTSyxRQUFULENBQWtCLEVBQUNDLEtBQUQsRUFBUUMsR0FBUixFQUFsQixFQUFnQzNCLEVBQWhDLEVBQW9DO1FBQ3RDLENBQUUyQixHQUFMLEVBQVc7U0FDTmpCLFFBQUgsQ0FBY2MsVUFBZCxFQUEwQkosS0FBMUIsRUFBaUNsQyxhQUFqQztTQUNHd0IsUUFBSCxDQUFjLElBQUVjLFVBQWhCLEVBQTRCLElBQUVFLEtBQTlCLEVBQXFDeEMsYUFBckM7S0FGRixNQUdLO1NBQ0F3QixRQUFILENBQWNjLFVBQWQsRUFBMEIsQ0FBQ0osR0FBM0IsRUFBZ0NsQyxhQUFoQztTQUNHd0IsUUFBSCxDQUFjLElBQUVjLFVBQWhCLEVBQTRCLElBQUVFLEtBQTlCLEVBQXFDeEMsYUFBckM7WUFDTTBDLEdBQU47O0dBUEo7OztBQVdGLGVBQWVDLGlCQUFmO0FBQ0EsU0FBU0EsZUFBVCxHQUEyQjtRQUNuQkMsV0FBV3BDLGFBQWpCO1FBQWdDcUMsV0FBV3hCLGNBQTNDO1FBQ015QixpQkFBaUIsQ0FBSWpCLGNBQUosRUFBb0JFLFlBQXBCLEVBQWtDQyxlQUFsQyxFQUFtREksZUFBbkQsQ0FBdkI7O01BRUcsTUFBTVEsU0FBU25DLElBQWYsSUFBdUIsTUFBTW9DLFNBQVNwQyxJQUF0QyxJQUE4QyxLQUFLcUMsZUFBZUMsTUFBckUsRUFBOEU7VUFDdEUsSUFBSXhCLEtBQUosQ0FBYSxxQkFBYixDQUFOOzs7UUFFSXlCLFNBQVMsRUFBZjtRQUFtQnJDLE9BQUssR0FBeEI7OztVQUdRc0MsU0FBU0wsU0FBU00sTUFBeEI7VUFBZ0NDLFNBQVNOLFNBQVNLLE1BQWxEO1VBQ00sQ0FBQ0UsRUFBRCxFQUFJQyxFQUFKLEVBQU9DLEVBQVAsRUFBVUMsRUFBVixJQUFnQlQsZUFBZVUsR0FBZixDQUFxQkMsS0FBR0EsRUFBRVAsTUFBMUIsQ0FBdEI7O1VBRU1RLFdBQVdWLE9BQU9VLFFBQVAsR0FBa0I5QyxPQUNqQyxJQUFJcUMsT0FBT3JDLEdBQVAsQ0FBSixHQUFrQnVDLE9BQU92QyxHQUFQLENBQWxCLEdBQWdDd0MsR0FBR3hDLEdBQUgsQ0FBaEMsR0FBMEN5QyxHQUFHekMsR0FBSCxDQUExQyxHQUFvRDBDLEdBQUcxQyxHQUFILENBQXBELEdBQThEMkMsR0FBRzNDLEdBQUgsQ0FEaEU7O1dBR08rQyxNQUFQLEdBQWdCLFVBQVUvQyxHQUFWLEVBQWVnRCxHQUFmLEVBQW9CO1VBQy9CLFFBQVFBLEdBQVgsRUFBaUI7Y0FBTyxRQUFRWixNQUFkOzthQUNYWSxJQUFJRixTQUFTOUMsR0FBVCxDQUFKLENBQVA7S0FGRjs7O09BS0UsTUFBTWlELENBQVYsSUFBZWYsY0FBZixFQUFnQztVQUN4QixFQUFDcEMsTUFBS29ELENBQU4sRUFBU3JELElBQVQsRUFBZXFCLFNBQWYsS0FBNEIrQixDQUFsQzs7V0FFT0MsSUFBRSxDQUFULElBQWMsRUFBSUQsQ0FBSixFQUFPL0IsU0FBUCxFQUFrQnBCLE1BQU1vRCxJQUFFLENBQTFCLEVBQTZCbkQsSUFBN0IsRUFBbUNGLE1BQU1BLElBQXpDLEVBQStDc0QsSUFBSSxFQUFuRCxFQUFkO1dBQ09ELElBQUUsQ0FBVCxJQUFjLEVBQUlELENBQUosRUFBTy9CLFNBQVAsRUFBa0JwQixNQUFNb0QsSUFBRSxDQUExQixFQUE2Qm5ELElBQTdCLEVBQW1DRixNQUFNLElBQUlBLElBQTdDLEVBQW1Ec0QsSUFBSSxHQUF2RCxFQUFkO1dBQ09ELElBQUUsQ0FBVCxJQUFjLEVBQUlELENBQUosRUFBTy9CLFNBQVAsRUFBa0JwQixNQUFNb0QsSUFBRSxDQUExQixFQUE2Qm5ELElBQTdCLEVBQW1DRixNQUFNLElBQUlBLElBQTdDLEVBQW1Ec0QsSUFBSSxHQUF2RCxFQUFkO1dBQ09ELElBQUUsQ0FBVCxJQUFjLEVBQUlELENBQUosRUFBTy9CLFNBQVAsRUFBa0JwQixNQUFNb0QsSUFBRSxDQUExQixFQUE2Qm5ELElBQTdCLEVBQW1DRixNQUFNLEtBQUtBLElBQTlDLEVBQW9Ec0QsSUFBSSxJQUF4RCxFQUFkOztTQUVJLE1BQU1DLE1BQVYsSUFBb0IsQ0FBQyxRQUFELEVBQVcsVUFBWCxDQUFwQixFQUE2QztZQUNyQ0MsVUFBVUosRUFBRUcsTUFBRixDQUFoQjtZQUEyQkUsVUFBVXRCLFNBQVNvQixNQUFULENBQXJDO1lBQXVERyxVQUFVdEIsU0FBU21CLE1BQVQsQ0FBakU7O2FBRU9GLElBQUUsQ0FBVCxFQUFZRSxNQUFaLElBQXNCLFVBQVNwRCxHQUFULEVBQWNFLEVBQWQsRUFBa0I7Z0JBQVdGLEdBQVIsRUFBYUUsRUFBYixFQUFpQixDQUFqQjtPQUEzQzthQUNPZ0QsSUFBRSxDQUFULEVBQVlFLE1BQVosSUFBc0IsVUFBU3BELEdBQVQsRUFBY0UsRUFBZCxFQUFrQjtnQkFBV0YsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCLEVBQXFCbUQsUUFBUXJELEdBQVIsRUFBYUUsRUFBYixFQUFpQixDQUFqQjtPQUFoRTthQUNPZ0QsSUFBRSxDQUFULEVBQVlFLE1BQVosSUFBc0IsVUFBU3BELEdBQVQsRUFBY0UsRUFBZCxFQUFrQjtnQkFBV0YsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCLEVBQXFCbUQsUUFBUXJELEdBQVIsRUFBYUUsRUFBYixFQUFpQixDQUFqQjtPQUFoRTthQUNPZ0QsSUFBRSxDQUFULEVBQVlFLE1BQVosSUFBc0IsVUFBU3BELEdBQVQsRUFBY0UsRUFBZCxFQUFrQjtnQkFBV0YsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCLEVBQXFCcUQsUUFBUXZELEdBQVIsRUFBYUUsRUFBYixFQUFpQixDQUFqQixFQUFxQm1ELFFBQVFyRCxHQUFSLEVBQWFFLEVBQWIsRUFBaUIsRUFBakI7T0FBckY7Ozs7T0FFQSxNQUFNc0QsR0FBVixJQUFpQnBCLE1BQWpCLEVBQTBCO2tCQUNSb0IsR0FBaEI7OztTQUVLcEIsTUFBUDs7O0FBR0YsU0FBU3FCLGFBQVQsQ0FBdUJELEdBQXZCLEVBQTRCO1FBQ3BCLEVBQUNQLENBQUQsRUFBSXBELElBQUosRUFBVTZELE1BQVYsRUFBa0JDLFFBQWxCLEtBQThCSCxHQUFwQztNQUNHUCxFQUFFeEIsYUFBTCxFQUFxQjtRQUNmRSxRQUFKLEdBQWVzQixFQUFFeEIsYUFBRixDQUFrQitCLElBQUkzRCxJQUFKLEdBQVdvRCxFQUFFcEQsSUFBL0IsQ0FBZjs7O1NBRUsyRCxJQUFJUCxDQUFYO01BQ0lXLElBQUosR0FBV0EsSUFBWCxDQUFrQkosSUFBSUssTUFBSixHQUFhQSxNQUFiO1FBQ1psQyxXQUFXNkIsSUFBSTdCLFFBQXJCOztXQUVTaUMsSUFBVCxDQUFjRSxRQUFkLEVBQXdCQyxPQUF4QixFQUFpQztRQUM1QixFQUFJLEtBQUtELFFBQUwsSUFBaUJBLFlBQVksR0FBakMsQ0FBSCxFQUEwQztZQUNsQyxJQUFJRSxTQUFKLENBQWlCLGtDQUFqQixDQUFOOzs7WUFFTUMsSUFBUixHQUFlSCxRQUFmO1FBQ0duQyxZQUFZLFFBQVFvQyxRQUFRekMsR0FBL0IsRUFBcUM7Y0FDM0JBLEdBQVIsR0FBYyxJQUFkOzs7VUFFSXBCLEtBQUssSUFBSWdFLFFBQUosQ0FBZSxJQUFJQyxXQUFKLENBQWdCdEUsSUFBaEIsQ0FBZixDQUFYO1dBQ09rRSxPQUFQLEVBQWdCN0QsRUFBaEIsRUFBb0IsQ0FBcEI7WUFDUWtFLE1BQVIsR0FBaUJsRSxHQUFHbUUsTUFBcEI7O1FBRUcsU0FBU04sUUFBUXpDLEdBQXBCLEVBQTBCO3FCQUNQeUMsT0FBakIsRUFBMEI3RCxHQUFHbUUsTUFBSCxDQUFVQyxLQUFWLENBQWdCLENBQWhCLEVBQWtCekUsSUFBbEIsQ0FBMUI7Ozs7V0FFS2dFLE1BQVQsQ0FBZ0JVLEdBQWhCLEVBQXFCO1VBQ2JDLE1BQU1ELElBQUlFLGFBQUosRUFBWjtVQUNNdkUsS0FBSyxJQUFJZ0UsUUFBSixDQUFlLElBQUlRLFVBQUosQ0FBZUYsR0FBZixFQUFvQkgsTUFBbkMsQ0FBWDs7VUFFTU0sT0FBTyxFQUFiO2FBQ1NBLElBQVQsRUFBZXpFLEVBQWYsRUFBbUIsQ0FBbkI7V0FDT3FFLElBQUlJLElBQUosR0FBV0EsSUFBbEI7OztXQUVPQyxjQUFULENBQXdCYixPQUF4QixFQUFpQ2MsU0FBakMsRUFBNEM7VUFDcEMsRUFBQ1osSUFBRCxLQUFTRixPQUFmO1VBQ00sRUFBQzFELFNBQUQsRUFBWUMsU0FBWixFQUF1QndFLEdBQXZCLEVBQTRCL0QsS0FBNUIsS0FBcUNnRCxPQUEzQztZQUNRZ0IsSUFBUixHQUFlQSxJQUFmOzthQUVTQSxJQUFULENBQWNDLE9BQWQsRUFBdUI7VUFDbEIsUUFBUUEsT0FBWCxFQUFxQjtrQkFBVyxFQUFWOztZQUNoQlosU0FBU1MsVUFBVVAsS0FBVixFQUFmO2VBQ1dVLE9BQVgsRUFBb0IsSUFBSWQsUUFBSixDQUFlRSxNQUFmLENBQXBCO2FBQ08sRUFBSWEsTUFBTSxDQUFDLENBQUVELFFBQVFuRCxHQUFyQixFQUEwQnFELE9BQU87U0FBakMsRUFDTDdFLFNBREssRUFDTUMsU0FETixFQUNpQjJELElBRGpCLEVBQ3VCYSxHQUR2QixFQUM0Qi9ELEtBRDVCLEVBQ21DcUQsTUFEbkMsRUFBUDs7Ozs7QUNoT04sbUJBQWUsVUFBU2UsWUFBVCxFQUF1QkgsT0FBdkIsRUFBZ0NJLGFBQWhDLEVBQStDO1FBQ3RELEVBQUNDLGFBQUQsRUFBZ0JDLGFBQWhCLEVBQStCQyxTQUEvQixFQUEwQ0MsV0FBMUMsS0FBeURMLFlBQS9EO2tCQUNnQk0sT0FBT0wsaUJBQWlCLElBQXhCLENBQWhCO01BQ0csT0FBT0EsYUFBUCxJQUF3QixRQUFRQSxhQUFuQyxFQUFtRDtVQUMzQyxJQUFJekUsS0FBSixDQUFhLDBCQUF5QnlFLGFBQWMsRUFBcEQsQ0FBTjs7O1FBRUksRUFBQ00sU0FBRCxFQUFZQyxTQUFaLEtBQXlCWCxPQUEvQjtTQUNTLEVBQUNHLFlBQUQsRUFBZU8sU0FBZixFQUEwQkMsU0FBMUI7bUJBQUEsRUFDVUMsWUFEVixFQUN3QkMsZUFEeEI7a0JBQUEsRUFBVDs7V0FLU0MsZUFBVCxDQUF5QnZCLEdBQXpCLEVBQThCd0IsSUFBOUIsRUFBb0NyRixLQUFwQyxFQUEyQztRQUNyQ3NGLFFBQVEsRUFBWjtRQUFnQm5FLE1BQU0sS0FBdEI7V0FDTyxFQUFJb0UsSUFBSixFQUFVdEIsTUFBTUosSUFBSUksSUFBcEIsRUFBUDs7YUFFU3NCLElBQVQsQ0FBYzFCLEdBQWQsRUFBbUI7VUFDYmpELE1BQU1pRCxJQUFJSSxJQUFKLENBQVNyRCxHQUFuQjtVQUNHQSxNQUFNLENBQVQsRUFBYTtjQUFPLElBQU4sQ0FBWUEsTUFBTSxDQUFDQSxHQUFQOztZQUNwQkEsTUFBSSxDQUFWLElBQWVpRCxJQUFJMkIsV0FBSixFQUFmOztVQUVHLENBQUVyRSxHQUFMLEVBQVc7OztVQUNSbUUsTUFBTUcsUUFBTixDQUFpQjVGLFNBQWpCLENBQUgsRUFBZ0M7Ozs7V0FFM0I2RixjQUFMLENBQW9CMUYsS0FBcEI7O1lBRU0yRixNQUFNaEIsY0FBY1csS0FBZCxDQUFaO2NBQ1EsSUFBUjthQUNPSyxHQUFQOzs7O1dBRUtULFlBQVQsQ0FBc0JyQixHQUF0QixFQUEyQndCLElBQTNCLEVBQWlDckYsS0FBakMsRUFBd0M7UUFDbENxRSxPQUFLLENBQVQ7UUFBWWxELE1BQU0sS0FBbEI7UUFBeUJ5RSxRQUF6QjtRQUFtQ0MsT0FBbkM7VUFDTUMsUUFBUSxFQUFJUCxNQUFNUSxTQUFWLEVBQXFCOUIsTUFBTUosSUFBSUksSUFBL0IsRUFBZDtXQUNPNkIsS0FBUDs7YUFFU0MsU0FBVCxDQUFtQmxDLEdBQW5CLEVBQXdCbUMsVUFBeEIsRUFBb0M7WUFDNUJULElBQU4sR0FBYVUsV0FBYjs7WUFFTWhDLE9BQU9KLElBQUlJLElBQWpCO1lBQ01pQyxNQUFNYixLQUFLYyxXQUFMLENBQW1CdEMsSUFBSXVDLFNBQUosRUFBbkIsQ0FBWjtnQkFDVWYsS0FBS2dCLFVBQUwsQ0FBZ0JILEdBQWhCLEVBQXFCakMsSUFBckIsQ0FBVjtVQUNHLFFBQVE0QixPQUFYLEVBQXFCOzs7Z0JBQ1RBLE9BQVosRUFBcUIsVUFBckIsRUFBaUMsU0FBakMsRUFBNEMsUUFBNUM7aUJBQ1dSLEtBQUtpQixjQUFMLENBQW9CQyxJQUFwQixDQUF5QmxCLElBQXpCLEVBQStCUSxPQUEvQixFQUF3QzVCLElBQXhDLENBQVg7O1VBRUk7aUJBQ09KLEdBQVQ7T0FERixDQUVBLE9BQU0yQyxHQUFOLEVBQVk7ZUFDSFgsUUFBUVksUUFBUixDQUFtQkQsR0FBbkIsRUFBd0IzQyxHQUF4QixDQUFQOzs7WUFFSTBCLElBQU4sR0FBYW1CLFNBQWI7VUFDR2IsUUFBUWMsT0FBWCxFQUFxQjtlQUNaZCxRQUFRYyxPQUFSLENBQWdCVCxHQUFoQixFQUFxQnJDLEdBQXJCLENBQVA7Ozs7YUFFSzZDLFNBQVQsQ0FBbUI3QyxHQUFuQixFQUF3Qm1DLFVBQXhCLEVBQW9DOztVQUU5QlksSUFBSjtVQUNJO2lCQUNPL0MsR0FBVDtlQUNPbUMsV0FBV25DLEdBQVgsRUFBZ0J3QixJQUFoQixDQUFQO09BRkYsQ0FHQSxPQUFNbUIsR0FBTixFQUFZO2VBQ0hYLFFBQVFZLFFBQVIsQ0FBbUJELEdBQW5CLEVBQXdCM0MsR0FBeEIsQ0FBUDs7O1VBRUMxQyxHQUFILEVBQVM7Y0FDRHdFLE1BQU1FLFFBQVFnQixPQUFSLENBQWtCRCxJQUFsQixFQUF3Qi9DLEdBQXhCLENBQVo7ZUFDT2dDLFFBQVFpQixNQUFSLENBQWlCbkIsR0FBakIsRUFBc0I5QixHQUF0QixDQUFQO09BRkYsTUFHSztlQUNJZ0MsUUFBUWdCLE9BQVIsQ0FBa0JELElBQWxCLEVBQXdCL0MsR0FBeEIsQ0FBUDs7OzthQUVLb0MsV0FBVCxDQUFxQnBDLEdBQXJCLEVBQTBCO1VBQ3BCO2lCQUFZQSxHQUFUO09BQVAsQ0FDQSxPQUFNMkMsR0FBTixFQUFZOzs7YUFFTE8sUUFBVCxDQUFrQmxELEdBQWxCLEVBQXVCO1VBQ2pCakQsTUFBTWlELElBQUlJLElBQUosQ0FBU3JELEdBQW5CO1VBQ0dBLE9BQU8sQ0FBVixFQUFjO1lBQ1R5RCxXQUFXekQsR0FBZCxFQUFvQjtpQkFBQTs7T0FEdEIsTUFHSztnQkFDRyxJQUFOO2VBQ0s4RSxjQUFMLENBQW9CMUYsS0FBcEI7Y0FDR3FFLFNBQVMsQ0FBQ3pELEdBQWIsRUFBbUI7bUJBQ1YsTUFBUDttQkFEaUI7O1NBSXJCa0YsTUFBTVAsSUFBTixHQUFhVSxXQUFiO2FBQ08sU0FBUDtZQUNNLElBQUloRyxLQUFKLENBQWEsd0JBQWIsQ0FBTjs7OztZQUVPa0YsZUFBWCxDQUEyQnJCLEdBQTNCLEVBQWdDa0QsUUFBaEMsRUFBMEM3RixHQUExQyxFQUErQztRQUMxQyxRQUFRMkMsR0FBWCxFQUFpQjtZQUNUeEUsTUFBTTBILFNBQVMsRUFBQzdGLEdBQUQsRUFBVCxDQUFaO1lBQ003QixHQUFOOzs7O1FBR0UySCxJQUFJLENBQVI7UUFBV0MsWUFBWXBELElBQUlxRCxVQUFKLEdBQWlCekMsYUFBeEM7V0FDTXVDLElBQUlDLFNBQVYsRUFBc0I7WUFDZEUsS0FBS0gsQ0FBWDtXQUNLdkMsYUFBTDs7WUFFTXBGLE1BQU0wSCxVQUFaO1VBQ0lLLElBQUosR0FBV3ZELElBQUlGLEtBQUosQ0FBVXdELEVBQVYsRUFBY0gsQ0FBZCxDQUFYO1lBQ00zSCxHQUFOOzs7O1lBR01BLE1BQU0wSCxTQUFTLEVBQUM3RixHQUFELEVBQVQsQ0FBWjtVQUNJa0csSUFBSixHQUFXdkQsSUFBSUYsS0FBSixDQUFVcUQsQ0FBVixDQUFYO1lBQ00zSCxHQUFOOzs7O1dBSUtnSSxrQkFBVCxDQUE0QkMsT0FBNUIsRUFBcUNDLFFBQXJDLEVBQStDQyxVQUEvQyxFQUEyRDtVQUNuREMsV0FBVyxFQUFqQjthQUNTckYsTUFBVCxHQUFrQnNGLFNBQVN0RixNQUEzQjs7U0FFSSxNQUFNdUYsS0FBVixJQUFtQkQsUUFBbkIsRUFBOEI7WUFDdEJFLE9BQU9ELFFBQVFILFdBQVdHLE1BQU1wSCxTQUFqQixDQUFSLEdBQXNDLElBQW5EO1VBQ0csQ0FBRXFILElBQUwsRUFBWTs7OztZQUVOLEVBQUN6SSxJQUFELEVBQU84RCxJQUFQLEVBQWFDLE1BQWIsS0FBdUJ5RSxLQUE3QjtZQUNNeEUsV0FBV29FLFdBQVdwSSxJQUE1QjtZQUNNLEVBQUMwSSxNQUFELEtBQVdELElBQWpCOztlQUVTRSxRQUFULENBQWtCekksR0FBbEIsRUFBdUI7YUFDaEI4RCxRQUFMLEVBQWU5RCxHQUFmO2VBQ09BLEdBQVA7OztlQUVPMEksUUFBVCxDQUFrQm5FLEdBQWxCLEVBQXVCd0IsSUFBdkIsRUFBNkI7ZUFDcEJ4QixHQUFQO2VBQ09pRSxPQUFPakUsR0FBUCxFQUFZd0IsSUFBWixDQUFQOzs7ZUFFT2pDLFFBQVQsR0FBb0I0RSxTQUFTNUUsUUFBVCxHQUFvQkEsUUFBeEM7ZUFDU2hFLElBQVQsSUFBaUIySSxRQUFqQjtjQUNRM0UsUUFBUixJQUFvQjRFLFFBQXBCOztVQUVHLGlCQUFpQkMsUUFBUUMsR0FBUixDQUFZQyxRQUFoQyxFQUEyQztjQUNuQzFGLEtBQUtzRixTQUFTdEYsRUFBVCxHQUFjdUYsU0FBU3ZGLEVBQVQsR0FBY21GLE1BQU1uRixFQUE3QztlQUNPMkYsY0FBUCxDQUF3QkwsUUFBeEIsRUFBa0MsTUFBbEMsRUFBMEMsRUFBSXZELE9BQVEsYUFBWS9CLEVBQUcsR0FBM0IsRUFBMUM7ZUFDTzJGLGNBQVAsQ0FBd0JKLFFBQXhCLEVBQWtDLE1BQWxDLEVBQTBDLEVBQUl4RCxPQUFRLGFBQVkvQixFQUFHLEdBQTNCLEVBQTFDOzs7O1dBRUdpRixRQUFQOzs7V0FHT1csY0FBVCxDQUF3QmQsT0FBeEIsRUFBaUNDLFFBQWpDLEVBQTJDQyxVQUEzQyxFQUF1RDtVQUMvQ2EsV0FBV2IsV0FBV2EsUUFBNUI7VUFDTVosV0FBV0osbUJBQW1CQyxPQUFuQixFQUE0QkMsUUFBNUIsRUFBc0NDLFVBQXRDLENBQWpCO1dBQ09BLFdBQVdjLFNBQVgsR0FDSCxFQUFJQyxJQUFKLEVBQVVDLFFBQVFDLFlBQWNqQixXQUFXYyxTQUFYLENBQXFCSSxJQUFuQyxDQUFsQixFQURHLEdBRUgsRUFBSUgsSUFBSixFQUZKOzthQUlTQSxJQUFULENBQWNJLElBQWQsRUFBb0J0SixHQUFwQixFQUF5QitILElBQXpCLEVBQStCO2FBQ3RCaUIsU0FBU2pCLElBQVQsQ0FBUDtVQUNHM0MsZ0JBQWdCMkMsS0FBS0YsVUFBeEIsRUFBcUM7WUFDaEMsQ0FBRTdILElBQUllLEtBQVQsRUFBaUI7Y0FBS0EsS0FBSixHQUFZMkUsV0FBWjs7WUFDZHhFLFNBQUosR0FBZ0IsV0FBaEI7Y0FDTXFJLFFBQVFDLFlBQVlGLElBQVosRUFBa0J0SixHQUFsQixDQUFkO2VBQ08sRUFBSXlKLE1BQU1GLE1BQVEsSUFBUixFQUFjeEIsSUFBZCxDQUFWLEVBQVA7OztVQUVFN0csU0FBSixHQUFnQixRQUFoQjtVQUNJNkcsSUFBSixHQUFXQSxJQUFYO1lBQ01VLFdBQVdMLFNBQVNyRixNQUFULENBQWdCL0MsR0FBaEIsQ0FBakI7WUFDTXVFLE1BQU1lLGNBQWdCbUQsU0FBU3pJLEdBQVQsQ0FBaEIsQ0FBWjthQUNPLEVBQUl5SixNQUFNSCxLQUFPL0UsR0FBUCxDQUFWLEVBQVA7OzthQUVPaUYsV0FBVCxDQUFxQkYsSUFBckIsRUFBMkJ0SixHQUEzQixFQUFnQzRHLEdBQWhDLEVBQXFDO1lBQzdCNkIsV0FBV0wsU0FBU3JGLE1BQVQsQ0FBZ0IvQyxHQUFoQixDQUFqQjtVQUNJLEVBQUMrRSxJQUFELEtBQVMwRCxTQUFTekksR0FBVCxDQUFiO1VBQ0csU0FBUzRHLEdBQVosRUFBa0I7WUFDWm1CLElBQUosR0FBV25CLEdBQVg7Y0FDTXJDLE1BQU1lLGNBQWdCdEYsR0FBaEIsQ0FBWjthQUNPdUUsR0FBUDs7O2FBRUssZ0JBQWdCMUMsR0FBaEIsRUFBcUJrRyxJQUFyQixFQUEyQjtZQUM3QixTQUFTaEQsSUFBWixFQUFtQjtnQkFDWCxJQUFJcEUsS0FBSixDQUFZLGlCQUFaLENBQU47O1lBQ0UwRixHQUFKO2FBQ0ksTUFBTXJHLEdBQVYsSUFBaUI2RixnQkFBa0JrQyxJQUFsQixFQUF3QmhELElBQXhCLEVBQThCbEQsR0FBOUIsQ0FBakIsRUFBcUQ7Z0JBQzdDMEMsTUFBTWUsY0FBZ0J0RixHQUFoQixDQUFaO2dCQUNNLE1BQU1zSixLQUFPL0UsR0FBUCxDQUFaOztZQUNDMUMsR0FBSCxFQUFTO2lCQUFRLElBQVA7O2VBQ0h3RSxHQUFQO09BUkY7OzthQVVPcUQsYUFBVCxDQUF1QkosSUFBdkIsRUFBNkJ0SixHQUE3QixFQUFrQzRHLEdBQWxDLEVBQXVDO1lBQy9CNkIsV0FBV0wsU0FBU3JGLE1BQVQsQ0FBZ0IvQyxHQUFoQixDQUFqQjtVQUNJLEVBQUMrRSxJQUFELEtBQVMwRCxTQUFTekksR0FBVCxDQUFiO1VBQ0csU0FBUzRHLEdBQVosRUFBa0I7WUFDWm1CLElBQUosR0FBV25CLEdBQVg7Y0FDTXJDLE1BQU1lLGNBQWdCdEYsR0FBaEIsQ0FBWjthQUNPdUUsR0FBUDs7O2FBRUssVUFBVTFDLEdBQVYsRUFBZWtHLElBQWYsRUFBcUI7WUFDdkIsU0FBU2hELElBQVosRUFBbUI7Z0JBQ1gsSUFBSXBFLEtBQUosQ0FBWSxpQkFBWixDQUFOOztjQUNJWCxNQUFNK0UsS0FBSyxFQUFDbEQsR0FBRCxFQUFMLENBQVo7WUFDSWtHLElBQUosR0FBV0EsSUFBWDtjQUNNeEQsTUFBTWUsY0FBZ0J0RixHQUFoQixDQUFaO1lBQ0c2QixHQUFILEVBQVM7aUJBQVEsSUFBUDs7ZUFDSHlILEtBQU8vRSxHQUFQLENBQVA7T0FQRjs7O2FBU082RSxXQUFULENBQXFCQyxJQUFyQixFQUEyQjtZQUNuQk0sYUFBYSxFQUFDQyxRQUFRRixhQUFULEVBQXdCRyxPQUFPTCxXQUEvQixHQUE0Q0gsSUFBNUMsQ0FBbkI7VUFDR00sVUFBSCxFQUFnQjtlQUFRUixNQUFQOzs7ZUFFUkEsTUFBVCxDQUFnQkcsSUFBaEIsRUFBc0J0SixHQUF0QixFQUEyQjRHLEdBQTNCLEVBQWdDO1lBQzNCLENBQUU1RyxJQUFJZSxLQUFULEVBQWlCO2NBQUtBLEtBQUosR0FBWTJFLFdBQVo7O1lBQ2R4RSxTQUFKLEdBQWdCLFdBQWhCO2NBQ01xSSxRQUFRSSxXQUFhTCxJQUFiLEVBQW1CdEosR0FBbkIsRUFBd0IyRixVQUFVaUIsR0FBVixDQUF4QixDQUFkO2NBQ01rRCxLQUFOLEdBQWNBLEtBQWQsQ0FBcUJBLE1BQU1DLEdBQU4sR0FBWUQsTUFBTTdDLElBQU4sQ0FBVyxJQUFYLENBQVo7ZUFDZDZDLEtBQVA7O2lCQUVTQSxLQUFULENBQWVFLEtBQWYsRUFBc0I7aUJBQ2JBLFNBQVMsSUFBVCxHQUNIVCxNQUFRLFNBQU8sSUFBZixFQUFxQlAsU0FBU2dCLEtBQVQsQ0FBckIsQ0FERyxHQUVIVCxNQUFRLElBQVIsQ0FGSjs7Ozs7OztBQUtWLFNBQVNVLFNBQVQsQ0FBbUJqSyxHQUFuQixFQUF3QixHQUFHa0ssSUFBM0IsRUFBaUM7T0FDM0IsTUFBTUMsR0FBVixJQUFpQkQsSUFBakIsRUFBd0I7UUFDbkIsZUFBZSxPQUFPbEssSUFBSW1LLEdBQUosQ0FBekIsRUFBb0M7WUFDNUIsSUFBSW5HLFNBQUosQ0FBaUIsYUFBWW1HLEdBQUksb0JBQWpDLENBQU47Ozs7O0FDN05TLFNBQVNDLGFBQVQsQ0FBdUJDLE1BQXZCLEVBQStCO1FBQ3RDLEVBQUN2RSxlQUFELEVBQWtCRixZQUFsQixFQUFnQ0QsU0FBaEMsS0FBNkMwRSxNQUFuRDtRQUNNLEVBQUM5RSxTQUFELEVBQVlDLFdBQVosS0FBMkI2RSxPQUFPbEYsWUFBeEM7O1NBRU87WUFBQTs7UUFHRG1GLFFBQUosR0FBZTthQUFVLEtBQUtDLE1BQVo7S0FIYjtZQUlHO2FBQ0NoRyxHQUFQLEVBQVl3QixJQUFaLEVBQWtCO2NBQ1ZhLE1BQU1iLEtBQUtjLFdBQUwsQ0FBbUJ0QyxJQUFJdUMsU0FBSixNQUFtQnZHLFNBQXRDLENBQVo7ZUFDT3dGLEtBQUt5RSxPQUFMLENBQWU1RCxHQUFmLEVBQW9CckMsSUFBSUksSUFBeEIsQ0FBUDtPQUhJLEVBSkg7O2VBU007YUFDRkosR0FBUCxFQUFZd0IsSUFBWixFQUFrQjtjQUNWUyxRQUFRVCxLQUFLMEUsUUFBTCxDQUFnQmxHLEdBQWhCLEVBQXFCdUIsZUFBckIsQ0FBZDtjQUNNNEUsV0FBV2xFLE1BQU1QLElBQU4sQ0FBVzFCLEdBQVgsQ0FBakI7WUFDR2hFLGNBQWNtSyxRQUFqQixFQUE0QjtnQkFDcEI5RCxNQUFNYixLQUFLYyxXQUFMLENBQW1CckIsWUFBWWtGLFFBQVosS0FBeUJuSyxTQUE1QyxDQUFaO2lCQUNPd0YsS0FBS3lFLE9BQUwsQ0FBZTVELEdBQWYsRUFBb0JKLE1BQU03QixJQUExQixDQUFQOztPQU5LLEVBVE47O2VBaUJNO1lBQ0gsUUFERzthQUVGSixHQUFQLEVBQVl3QixJQUFaLEVBQWtCO2NBQ1ZTLFFBQVFULEtBQUswRSxRQUFMLENBQWdCbEcsR0FBaEIsRUFBcUJxQixZQUFyQixDQUFkO2VBQ09ZLE1BQU1QLElBQU4sQ0FBVzFCLEdBQVgsRUFBZ0JvRyxVQUFoQixDQUFQO09BSk8sRUFqQk4sRUFBUDs7V0F1QlMzQixRQUFULENBQWtCakIsSUFBbEIsRUFBd0I7V0FDZnhDLFVBQVlJLFVBQVVvQyxJQUFWLENBQVosQ0FBUDs7O1dBRU80QyxVQUFULENBQW9CcEcsR0FBcEIsRUFBeUJ3QixJQUF6QixFQUErQjtXQUN0QkEsS0FBS2MsV0FBTCxDQUFtQnRDLElBQUl1QyxTQUFKLEVBQW5CLENBQVA7Ozs7QUMvQlcsU0FBUzhELGVBQVQsQ0FBeUJQLE1BQXpCLEVBQWlDO1FBQ3hDLEVBQUN2RSxlQUFELEVBQWtCRixZQUFsQixLQUFrQ3lFLE1BQXhDO1FBRU0sRUFBQ1EsUUFBRCxLQUFhUixPQUFPbEYsWUFBMUI7U0FDTztjQUNLMEYsUUFETDs7UUFHRFAsUUFBSixHQUFlO2FBQVUsS0FBS0MsTUFBWjtLQUhiO1lBSUc7YUFDQ2hHLEdBQVAsRUFBWXdCLElBQVosRUFBa0I7Y0FDVmEsTUFBTXJDLElBQUkyQixXQUFKLEVBQVo7ZUFDT0gsS0FBS3lFLE9BQUwsQ0FBZTVELEdBQWYsRUFBb0JyQyxJQUFJSSxJQUF4QixDQUFQO09BSEksRUFKSDs7ZUFTTTthQUNGSixHQUFQLEVBQVl3QixJQUFaLEVBQWtCO2NBQ1ZTLFFBQVFULEtBQUswRSxRQUFMLENBQWdCbEcsR0FBaEIsRUFBcUJ1QixlQUFyQixDQUFkO2NBQ01jLE1BQU1KLE1BQU1QLElBQU4sQ0FBVzFCLEdBQVgsQ0FBWjtZQUNHaEUsY0FBY3FHLEdBQWpCLEVBQXVCO2lCQUNkYixLQUFLeUUsT0FBTCxDQUFlNUQsR0FBZixFQUFvQkosTUFBTTdCLElBQTFCLENBQVA7O09BTEssRUFUTjs7ZUFnQk07WUFDSCxPQURHO2FBRUZKLEdBQVAsRUFBWXdCLElBQVosRUFBa0I7Y0FDVlMsUUFBUVQsS0FBSzBFLFFBQUwsQ0FBZ0JsRyxHQUFoQixFQUFxQnFCLFlBQXJCLENBQWQ7Y0FDTWdCLE1BQU1KLE1BQU1QLElBQU4sQ0FBVzFCLEdBQVgsRUFBZ0J1RyxVQUFoQixDQUFaO1lBQ0d2SyxjQUFjcUcsR0FBakIsRUFBdUI7aUJBQ2RiLEtBQUt5RSxPQUFMLENBQWU1RCxHQUFmLEVBQW9CSixNQUFNN0IsSUFBMUIsQ0FBUDs7T0FOSyxFQWhCTixFQUFQOzs7QUF3QkYsU0FBU21HLFVBQVQsQ0FBb0J2RyxHQUFwQixFQUF5QjtTQUFVQSxJQUFJMkIsV0FBSixFQUFQOzs7QUMxQmIsU0FBUzZFLGdCQUFULENBQTBCOUMsT0FBMUIsRUFBbUMrQyxJQUFuQyxFQUF5Q1gsTUFBekMsRUFBaUQ7UUFDeEQsRUFBQzNFLFNBQUQsS0FBYzJFLE1BQXBCO1FBQ00sRUFBQy9FLGFBQUQsS0FBa0IrRSxPQUFPbEYsWUFBL0I7O1FBRU04RixhQUFhNUMsU0FBU3RGLE1BQVQsQ0FBa0IsRUFBQzlDLFNBQVMsSUFBVixFQUFnQmMsT0FBTyxJQUF2QixFQUE2QkcsV0FBVyxRQUF4QyxFQUFsQixDQUFuQjtRQUNNZ0ssYUFBYTdDLFNBQVN0RixNQUFULENBQWtCLEVBQUM5QyxTQUFTLElBQVYsRUFBZ0JTLE9BQU8sSUFBdkIsRUFBNkJRLFdBQVcsVUFBeEMsRUFBbEIsQ0FBbkI7O1FBRU1pSyxZQUFZSCxPQUFLLEdBQXZCO1VBQ1FHLFNBQVIsSUFBcUJDLFNBQXJCO1FBQ01DLFlBQVlMLE9BQUssR0FBdkI7VUFDUUEsT0FBSyxHQUFiLElBQW9CTSxTQUFwQjs7U0FFTyxFQUFJcEMsTUFBS3FDLElBQVQsRUFBZUEsSUFBZixFQUFQOztXQUVTQSxJQUFULENBQWNqQyxJQUFkLEVBQW9CdEosR0FBcEIsRUFBeUI7UUFDcEIsQ0FBRUEsSUFBSWUsS0FBVCxFQUFpQjtVQUNYQSxLQUFKLEdBQVkyRSxXQUFaOztRQUNFcUMsSUFBSixHQUFXeUQsS0FBS0MsU0FBTCxDQUFpQjtVQUN0QixNQURzQixFQUNkQyxLQUFLLElBQUlDLElBQUosRUFEUyxFQUFqQixDQUFYO2VBRVcvSCxJQUFYLENBQWdCeUgsU0FBaEIsRUFBMkJyTCxHQUEzQjtVQUNNdUUsTUFBTWUsY0FBZ0J0RixHQUFoQixDQUFaO1dBQ09zSixLQUFPL0UsR0FBUCxDQUFQOzs7V0FFTytHLFNBQVQsQ0FBbUIvRyxHQUFuQixFQUF3QndCLElBQXhCLEVBQThCNkYsTUFBOUIsRUFBc0M7ZUFDekIvSCxNQUFYLENBQWtCVSxHQUFsQjtRQUNJd0QsSUFBSixHQUFXeEQsSUFBSXNILFNBQUosRUFBWDtlQUNhdEgsSUFBSXdELElBQWpCLEVBQXVCeEQsR0FBdkIsRUFBNEJ3QixJQUE1QixFQUFrQzZGLE1BQWxDO1dBQ083RixLQUFLK0YsUUFBTCxDQUFjdkgsSUFBSXdELElBQWxCLEVBQXdCeEQsSUFBSUksSUFBNUIsQ0FBUDs7O1dBRU9vSCxVQUFULENBQW9CLEVBQUNMLEdBQUQsRUFBcEIsRUFBMkJNLFFBQTNCLEVBQXFDakcsSUFBckMsRUFBMkM2RixNQUEzQyxFQUFtRDtVQUMzQyxFQUFDbEwsS0FBRCxFQUFRVCxTQUFRZ00sSUFBaEIsS0FBd0JELFNBQVNySCxJQUF2QztVQUNNLEVBQUN0RSxTQUFELEVBQVlDLFNBQVosS0FBeUIyTCxJQUEvQjtVQUNNak0sTUFBTSxFQUFJSyxTQUFKLEVBQWVDLFNBQWY7ZUFDRHlGLEtBQUs5RixPQURKLEVBQ2FTLEtBRGI7WUFFSjhLLEtBQUtDLFNBQUwsQ0FBaUI7WUFDakIsTUFEaUIsRUFDVEMsR0FEUyxFQUNKUSxLQUFLLElBQUlQLElBQUosRUFERCxFQUFqQixDQUZJLEVBQVo7O2VBS1cvSCxJQUFYLENBQWdCdUgsU0FBaEIsRUFBMkJuTCxHQUEzQjtVQUNNdUUsTUFBTWUsY0FBZ0J0RixHQUFoQixDQUFaO1dBQ080TCxPQUFPTyxRQUFQLENBQWtCLENBQUM1SCxHQUFELENBQWxCLENBQVA7OztXQUVPNkcsU0FBVCxDQUFtQjdHLEdBQW5CLEVBQXdCd0IsSUFBeEIsRUFBOEI7ZUFDakJsQyxNQUFYLENBQWtCVSxHQUFsQjtRQUNJd0QsSUFBSixHQUFXeEQsSUFBSXNILFNBQUosRUFBWDtXQUNPOUYsS0FBSytGLFFBQUwsQ0FBY3ZILElBQUl3RCxJQUFsQixFQUF3QnhELElBQUlJLElBQTVCLENBQVA7Ozs7QUN0Q1csU0FBU3lILGFBQVQsQ0FBdUJqSCxZQUF2QixFQUFxQ0gsT0FBckMsRUFBOEM7UUFDckRxRixTQUFTZ0MsYUFBZWxILFlBQWYsRUFBNkJILE9BQTdCLENBQWY7O1FBRU1pRCxVQUFVLEVBQWhCO1FBQ01xRSxPQUFPakMsT0FBT3RCLGNBQVAsQ0FBd0JkLE9BQXhCLEVBQ1gsSUFEVztJQUVYc0UsY0FBV2xDLE1BQVgsQ0FGVyxDQUFiOztRQUlNbUMsU0FBU25DLE9BQU90QixjQUFQLENBQXdCZCxPQUF4QixFQUNiLElBRGE7SUFFYndFLGdCQUFhcEMsTUFBYixDQUZhLENBQWY7O1FBSU1xQyxVQUFVQyxpQkFBZ0IxRSxPQUFoQixFQUNkLElBRGM7SUFFZG9DLE1BRmMsQ0FBaEI7O1FBSU11QyxTQUFXLEVBQUNOLElBQUQsRUFBT0UsTUFBUCxFQUFlRSxPQUFmLEVBQXdCRyxTQUFTUCxJQUFqQyxFQUFqQjs7UUFFTSxFQUFDNUcsU0FBRCxLQUFjMkUsTUFBcEI7U0FDUyxFQUFDcEMsT0FBRCxFQUFVMkUsTUFBVixFQUFrQmxILFNBQWxCLEVBQVQ7OztBQzNCYSxNQUFNb0gsSUFBTixDQUFXO1NBQ2pCQyxZQUFQLENBQW9CLEVBQUM5RSxPQUFELEVBQXBCLEVBQStCO1VBQ3ZCNkUsSUFBTixTQUFtQixJQUFuQixDQUF3QjtTQUNuQkUsU0FBTCxDQUFlQyxTQUFmLEdBQTJCaEYsT0FBM0I7V0FDTzZFLElBQVA7OztjQUVVakcsV0FBWixFQUF5QjtTQUNsQkEsV0FBTCxHQUFtQkEsV0FBbkI7OztXQUVPcUcsUUFBVCxFQUFtQkMsR0FBbkIsRUFBd0I3TSxTQUF4QixFQUFtQzhNLFFBQW5DLEVBQTZDO1VBQ3JDQyxhQUFhLE1BQU1GLElBQUl2QixNQUFKLENBQVcwQixnQkFBWCxDQUE0QmhOLFNBQTVCLENBQXpCOztRQUVJc0wsTUFBSixDQUFXMkIsY0FBWCxDQUE0QmpOLFNBQTVCLEVBQ0UsS0FBS2tOLGFBQUwsQ0FBcUJOLFFBQXJCLEVBQStCRyxVQUEvQixFQUEyQ0QsUUFBM0MsQ0FERjtXQUVPLElBQVA7OztnQkFFWUYsUUFBZCxFQUF3QkcsVUFBeEIsRUFBb0MsRUFBQ0ksTUFBRCxFQUFTdEcsUUFBVCxFQUFtQnVHLFdBQW5CLEVBQXBDLEVBQXFFO1FBQy9EQyxRQUFRLElBQVo7VUFDTUMsV0FBVyxLQUFLWCxTQUF0QjtVQUNNWSxVQUFVLE1BQU1GLEtBQXRCO1VBQ01HLFdBQVcsQ0FBQzVHLEdBQUQsRUFBTTZHLEtBQU4sS0FBZ0I7VUFDNUJKLEtBQUgsRUFBVztxQkFDS04sYUFBYU0sUUFBUSxLQUFyQjtvQkFDRnpHLEdBQVosRUFBaUI2RyxLQUFqQjs7S0FISjs7V0FLT0MsTUFBUCxDQUFnQixJQUFoQixFQUFzQmQsU0FBU2UsUUFBVCxDQUFrQixJQUFsQixDQUF0QixFQUErQyxFQUFJSixPQUFKLEVBQWFDLFFBQWIsRUFBL0M7V0FDT0UsTUFBUCxDQUFnQmQsUUFBaEIsRUFBMEIsRUFBSVcsT0FBSixFQUFhQyxRQUFiLEVBQTFCOztXQUVPLE9BQU92SixHQUFQLEVBQVlxSCxNQUFaLEtBQXVCO1VBQ3pCLFVBQVErQixLQUFSLElBQWlCLFFBQU1wSixHQUExQixFQUFnQztlQUFRb0osS0FBUDs7O1lBRTNCakYsV0FBV2tGLFNBQVNySixJQUFJTixJQUFiLENBQWpCO1VBQ0cxRCxjQUFjbUksUUFBakIsRUFBNEI7ZUFDbkIsS0FBS3ZCLFNBQVcsS0FBWCxFQUFrQixFQUFJNUMsR0FBSixFQUFTMkosTUFBTSxVQUFmLEVBQWxCLENBQVo7OztVQUVFO1lBQ0V0SCxNQUFNLE1BQU04QixTQUFXbkUsR0FBWCxFQUFnQixJQUFoQixFQUFzQnFILE1BQXRCLENBQWhCO1lBQ0csQ0FBRWhGLEdBQUwsRUFBVztpQkFBUUEsR0FBUDs7T0FGZCxDQUdBLE9BQU1NLEdBQU4sRUFBWTtlQUNILEtBQUtDLFNBQVdELEdBQVgsRUFBZ0IsRUFBSTNDLEdBQUosRUFBUzJKLE1BQU0sVUFBZixFQUFoQixDQUFaOzs7VUFFQyxVQUFVUCxLQUFiLEVBQXFCO2VBQ1osS0FBUCxDQURtQjtPQUVyQixJQUFJO2VBQ0ssTUFBTUYsT0FBUzdHLEdBQVQsRUFBY3JDLEdBQWQsQ0FBYjtPQURGLENBRUEsT0FBTTJDLEdBQU4sRUFBWTtZQUNOO2NBQ0VpSCxZQUFZaEgsU0FBV0QsR0FBWCxFQUFnQixFQUFJTixHQUFKLEVBQVNyQyxHQUFULEVBQWMySixNQUFNLFVBQXBCLEVBQWhCLENBQWhCO1NBREYsU0FFUTtjQUNILFVBQVVDLFNBQWIsRUFBeUI7cUJBQ2RqSCxHQUFULEVBQWMsRUFBQ04sR0FBRCxFQUFNckMsR0FBTixFQUFkO21CQUNPLEtBQVAsQ0FGdUI7Ozs7S0FyQi9CO0dBeUJGa0csU0FBU2xHLEdBQVQsRUFBYzZKLFFBQWQsRUFBd0I7VUFDaEIxTixRQUFRNkQsSUFBSUksSUFBSixDQUFTakUsS0FBdkI7UUFDSTJOLFFBQVEsS0FBS0MsUUFBTCxDQUFjQyxHQUFkLENBQWtCN04sS0FBbEIsQ0FBWjtRQUNHSCxjQUFjOE4sS0FBakIsRUFBeUI7VUFDcEIsQ0FBRTNOLEtBQUwsRUFBYTtjQUNMLElBQUlDLEtBQUosQ0FBYSxrQkFBaUJELEtBQU0sRUFBcEMsQ0FBTjs7VUFDQyxlQUFlLE9BQU8wTixRQUF6QixFQUFvQztnQkFDMUJBLFNBQVM3SixHQUFULEVBQWMsSUFBZCxFQUFvQjdELEtBQXBCLENBQVI7T0FERixNQUVLMk4sUUFBUUQsUUFBUjtXQUNBRSxRQUFMLENBQWNFLEdBQWQsQ0FBb0I5TixLQUFwQixFQUEyQjJOLEtBQTNCOztXQUNLQSxLQUFQOzs7aUJBRWEzTixLQUFmLEVBQXNCO1dBQ2IsS0FBSzROLFFBQUwsQ0FBY0csTUFBZCxDQUFxQi9OLEtBQXJCLENBQVA7Ozs7QUNsRVcsTUFBTWdPLFFBQU4sQ0FBZTtTQUNyQjNCLFlBQVAsQ0FBb0IsRUFBcEIsRUFBd0I7VUFDaEIyQixRQUFOLFNBQXVCLElBQXZCLENBQTRCO1dBQ3JCQSxRQUFQOzs7WUFFUTtXQUFVLEtBQUt6TyxPQUFaOztZQUNIO1dBQVcsYUFBWSxLQUFLQSxPQUFMLENBQWFLLFNBQVUsR0FBM0M7OztjQUVEcU8sT0FBWixFQUFxQjtjQUNUQSxRQUFRQyxZQUFSLENBQXFCLElBQXJCLENBQVY7V0FDT0MsZ0JBQVAsQ0FBMEIsSUFBMUIsRUFBa0M7ZUFDdkIsRUFBSTNKLE9BQU95SixRQUFRMU8sT0FBbkIsRUFBNEI2TyxZQUFZLElBQXhDLEVBRHVCO1VBRTVCLEVBQUk1SixPQUFPeUosUUFBUUksRUFBbkIsRUFGNEIsRUFBbEM7OztjQUlVO1dBQVUsSUFBSUMsR0FBSixFQUFQOzttQkFDRTtXQUFVLEtBQUtDLFNBQUwsRUFBUDs7bUJBQ0g7V0FBVSxLQUFLQSxTQUFMLEVBQVA7O3FCQUNEO1dBQVUsS0FBS0EsU0FBTCxFQUFQOzs7V0FFYmxKLElBQVQsRUFBZTtVQUNQbUosV0FBVyxLQUFLQyxjQUFMLEVBQWpCO1VBQ01DLGFBQWEsS0FBS0MsZ0JBQUwsRUFBbkI7V0FDT1IsZ0JBQVAsQ0FBMEIsSUFBMUIsRUFBa0M7Z0JBQ3RCLEVBQUkzSixPQUFPZ0ssUUFBWCxFQURzQjtrQkFFcEIsRUFBSWhLLE9BQU9rSyxVQUFYLEVBRm9CLEVBQWxDOztVQUlNRSxVQUFVLENBQUNyUCxPQUFELEVBQVVxUCxPQUFWLEtBQXNCO1lBQzlCQyxLQUFLNUQsS0FBSzZELEdBQUwsRUFBWDtVQUNHdlAsT0FBSCxFQUFhO2NBQ0x3UCxJQUFJTCxXQUFXYixHQUFYLENBQWV0TyxRQUFRSyxTQUF2QixDQUFWO1lBQ0dDLGNBQWNrUCxDQUFqQixFQUFxQjtZQUNqQkYsRUFBRixHQUFPRSxFQUFHLE1BQUtILE9BQVEsRUFBaEIsSUFBcUJDLEVBQTVCOzs7V0FDQ0csV0FBTCxDQUFpQnpQLE9BQWpCLEVBQTBCcVAsT0FBMUIsRUFBbUNDLEVBQW5DO0tBTkY7O1dBUU87ZUFDSSxLQUFLdFAsT0FEVDtnQkFFSyxLQUFLMFAsY0FBTCxFQUZMOztnQkFJSyxDQUFDL0ksR0FBRCxFQUFNakMsSUFBTixLQUFlO2dCQUNmQSxLQUFLMUUsT0FBYixFQUFzQixNQUF0QjtjQUNNMlAsT0FBTyxLQUFLOUQsUUFBTCxDQUFjbEYsR0FBZCxFQUFtQmpDLElBQW5CLENBQWI7O2NBRU1rTCxRQUFRWCxTQUFTWCxHQUFULENBQWE1SixLQUFLNUQsS0FBbEIsQ0FBZDtZQUNHUixjQUFjc1AsS0FBakIsRUFBeUI7a0JBQ2ZDLE9BQVIsQ0FBZ0IsRUFBQ0YsSUFBRCxFQUFPaEosR0FBUCxFQUFZakMsSUFBWixFQUFoQixFQUFtQ29MLElBQW5DLENBQXdDRixLQUF4QztTQURGLE1BRUssT0FBT0QsSUFBUDtPQVhGOztlQWFJLENBQUNoSixHQUFELEVBQU1qQyxJQUFOLEtBQWU7Z0JBQ2RBLEtBQUsxRSxPQUFiLEVBQXNCLEtBQXRCO2NBQ00yUCxPQUFPLEtBQUtwRixPQUFMLENBQWE1RCxHQUFiLEVBQWtCakMsSUFBbEIsQ0FBYjs7Y0FFTWtMLFFBQVFYLFNBQVNYLEdBQVQsQ0FBYTVKLEtBQUs1RCxLQUFsQixDQUFkO1lBQ0dSLGNBQWNzUCxLQUFqQixFQUF5QjtrQkFDZkMsT0FBUixDQUFnQkYsSUFBaEIsRUFBc0JHLElBQXRCLENBQTJCRixLQUEzQjtTQURGLE1BRUssT0FBT0QsSUFBUDtPQXBCRjs7c0JBc0JXLENBQUNySixPQUFELEVBQVU1QixJQUFWLEtBQW1CO2dCQUN6QkEsS0FBSzFFLE9BQWIsRUFBc0IsUUFBdEI7T0F2Qkc7a0JBd0JPLENBQUMyRyxHQUFELEVBQU1qQyxJQUFOLEtBQWU7Z0JBQ2pCQSxLQUFLMUUsT0FBYixFQUFzQixRQUF0QjtjQUNNc0csVUFBVSxLQUFLUSxVQUFMLENBQWdCSCxHQUFoQixFQUFxQmpDLElBQXJCLENBQWhCOztjQUVNa0wsUUFBUVgsU0FBU1gsR0FBVCxDQUFhNUosS0FBSzVELEtBQWxCLENBQWQ7WUFDR1IsY0FBY3NQLEtBQWpCLEVBQXlCO2tCQUNmQyxPQUFSLENBQWdCdkosT0FBaEIsRUFBeUJ3SixJQUF6QixDQUE4QkYsS0FBOUI7O2VBQ0t0SixPQUFQO09BL0JHLEVBQVA7OztjQWlDVXRHLE9BQVosRUFBcUJxUCxPQUFyQixFQUE4QkMsRUFBOUIsRUFBa0M7V0FDekIzSSxHQUFULEVBQWNqQyxJQUFkLEVBQW9CO1VBQ1ppQyxHQUFSLEVBQWFqQyxJQUFiLEVBQW1CO1dBQ1YsRUFBSWlDLEdBQUosRUFBU2pDLElBQVQsRUFBUDs7YUFDU2lDLEdBQVgsRUFBZ0JqQyxJQUFoQixFQUFzQjtZQUNacUwsSUFBUixDQUFnQix5QkFBd0JyTCxJQUFLLEVBQTdDO1dBQ08sSUFBUDs7Ozs7OztHQVFGc0wsVUFBVWxQLEtBQVYsRUFBaUI0TixPQUFqQixFQUEwQnVCLElBQTFCLEVBQWdDO1dBQ3ZCLEtBQUtDLGdCQUFMLENBQXdCcFAsS0FBeEIsRUFBK0I0TixRQUFReUIsVUFBdkMsQ0FBUDs7O2NBRVU5UCxTQUFaLEVBQXVCO1VBQ2Y2SixNQUFNN0osVUFBVUEsU0FBVixJQUF1QkEsU0FBbkM7UUFDSStQLFVBQVUsS0FBS2pCLFVBQUwsQ0FBZ0JiLEdBQWhCLENBQXNCcEUsR0FBdEIsQ0FBZDtRQUNHNUosY0FBYzhQLE9BQWpCLEVBQTJCO2dCQUNmLEVBQUkvUCxTQUFKLEVBQWVpUCxJQUFJNUQsS0FBSzZELEdBQUwsRUFBbkI7YUFDSDtpQkFBVTdELEtBQUs2RCxHQUFMLEtBQWEsS0FBS0QsRUFBekI7U0FEQSxFQUFWO1dBRUtILFVBQUwsQ0FBZ0JaLEdBQWhCLENBQXNCckUsR0FBdEIsRUFBMkJrRyxPQUEzQjs7V0FDS0EsT0FBUDs7O21CQUVldFAsS0FBakIsRUFBd0JxUCxVQUF4QixFQUFvQztVQUM1QkUsTUFBTSxJQUFJQyxPQUFKLENBQWMsQ0FBQ1QsT0FBRCxFQUFVVSxNQUFWLEtBQXFCO1dBQ3hDdEIsUUFBTCxDQUFjVixHQUFkLENBQW9Cek4sS0FBcEIsRUFBMkIrTyxPQUEzQjtVQUNHTSxVQUFILEVBQWdCO2NBQ1JLLE1BQU1DLFdBQVdDLE9BQVgsRUFBb0JQLFVBQXBCLENBQVo7WUFDR0ssSUFBSUcsS0FBUCxFQUFlO2NBQUtBLEtBQUo7O2lCQUNQRCxPQUFULEdBQW1CO2lCQUFZLElBQUksS0FBS0UsWUFBVCxFQUFUOzs7S0FMZCxDQUFaOztXQU9PcEgsUUFBUTtVQUNUQSxJQUFKLEdBQVdBLElBQVg7YUFDTzZHLEdBQVA7S0FGRjs7OztBQUlKLE1BQU1PLFlBQU4sU0FBMkJsUSxLQUEzQixDQUFpQzs7QUFFakNtUSxPQUFPOUMsTUFBUCxDQUFnQlUsU0FBUzFCLFNBQXpCLEVBQW9DO2NBQUEsRUFBcEM7O0FDM0dlLE1BQU0rRCxNQUFOLENBQWE7U0FDbkJoRSxZQUFQLENBQW9CLEVBQUNySCxTQUFELEVBQVlrSCxNQUFaLEVBQXBCLEVBQXlDO1VBQ2pDbUUsTUFBTixTQUFxQixJQUFyQixDQUEwQjtXQUNuQi9ELFNBQVAsQ0FBaUJ0SCxTQUFqQixHQUE2QkEsU0FBN0I7V0FDT3NMLFVBQVAsQ0FBb0JwRSxNQUFwQjtXQUNPbUUsTUFBUDs7O2NBRVU5USxPQUFaLEVBQXFCZ1IsWUFBckIsRUFBbUM7UUFDOUIsU0FBU2hSLE9BQVosRUFBc0I7WUFDZCxFQUFDSyxTQUFELEVBQVlELFNBQVosS0FBeUJKLE9BQS9CO2dCQUNVNlEsT0FBT0ksTUFBUCxDQUFnQixFQUFDNVEsU0FBRCxFQUFZRCxTQUFaLEVBQWhCLENBQVY7OztVQUVJOFEsTUFBTSxFQUFDbFIsT0FBRCxFQUFaO1dBQ080TyxnQkFBUCxDQUEwQixJQUExQixFQUFrQztjQUN0QixFQUFDM0osT0FBTyxJQUFSLEVBRHNCO2VBRXJCLEVBQUNBLE9BQU9qRixPQUFSLEVBRnFCO1dBR3pCLEVBQUNpRixPQUFPaU0sR0FBUixFQUh5QjtvQkFJaEIsRUFBQ2pNLE9BQU8rTCxZQUFSLEVBSmdCLEVBQWxDOzs7ZUFNVy9ELFFBQWIsRUFBdUI7V0FDZDRELE9BQU9qQyxnQkFBUCxDQUEwQixJQUExQixFQUFnQztnQkFDM0IsRUFBSTNKLE9BQU9nSSxRQUFYLEVBRDJCLEVBQWhDLENBQVA7OztTQUdLa0UsSUFBUCxDQUFZOVEsU0FBWixFQUF1QjZNLEdBQXZCLEVBQTRCO1VBQ3BCbE4sVUFBVSxTQUFTSyxTQUFULEdBQXFCLElBQXJCLEdBQ1osRUFBSUEsU0FBSixFQUFlRCxXQUFXOE0sSUFBSXZCLE1BQUosQ0FBV3lGLE9BQXJDLEVBREo7V0FFTyxJQUFJLElBQUosQ0FBV3BSLE9BQVgsRUFBb0JrTixJQUFJbUUsaUJBQUosRUFBcEIsQ0FBUDs7O01BRUV2QyxFQUFKLEdBQVM7V0FBVSxDQUFDLEdBQUd3QyxJQUFKLEtBQWEsS0FBS0MsS0FBTCxHQUFhQyxJQUFiLENBQW9CLEdBQUdGLElBQXZCLENBQXBCOzs7T0FFUHhRLFFBQU0sSUFBWCxFQUFpQjtXQUFVLEtBQUsyUSxLQUFMLENBQVcsU0FBWCxFQUFzQixFQUFDM1EsS0FBRCxFQUF0QixFQUErQjRRLE1BQS9CLENBQXdDLE1BQXhDLENBQVA7O09BQ2YsR0FBR0osSUFBUixFQUFjO1dBQVUsS0FBS0ksTUFBTCxDQUFjLE1BQWQsRUFBc0IsR0FBR0osSUFBekIsQ0FBUDs7U0FDVixHQUFHQSxJQUFWLEVBQWdCO1dBQVUsS0FBS0ksTUFBTCxDQUFjLFFBQWQsRUFBd0IsR0FBR0osSUFBM0IsQ0FBUDs7O1NBRVpwSCxHQUFQLEVBQVksR0FBR29ILElBQWYsRUFBcUI7VUFDYnZSLE1BQU04USxPQUFPOUMsTUFBUCxDQUFnQixFQUFoQixFQUFvQixLQUFLbUQsR0FBekIsQ0FBWjtTQUNLUyxhQUFMO1VBQ010SSxPQUFPLEtBQUsySCxZQUFMLENBQWtCalIsSUFBSUssU0FBdEIsQ0FBYjtRQUNHLFNBQVNMLElBQUllLEtBQWhCLEVBQXdCO2FBQ2YsS0FBSzhRLE1BQUwsQ0FBWTFILEdBQVosRUFBbUJiLElBQW5CLEVBQXlCdEosR0FBekIsRUFBOEIsR0FBR3VSLElBQWpDLENBQVA7S0FERixNQUdLO1lBQ0d4USxRQUFRZixJQUFJZSxLQUFKLEdBQVksS0FBSzJFLFNBQUwsRUFBMUI7WUFDTW1LLFFBQVEsS0FBSzNDLFFBQUwsQ0FBYytDLFNBQWQsQ0FBd0JsUCxLQUF4QixFQUErQixJQUEvQixFQUFxQ29KLEdBQXJDLENBQWQ7YUFDTzBGLE1BQVEsS0FBS2dDLE1BQUwsQ0FBWTFILEdBQVosRUFBbUJiLElBQW5CLEVBQXlCdEosR0FBekIsRUFBOEIsR0FBR3VSLElBQWpDLENBQVIsQ0FBUDs7OztPQUdDLEdBQUdBLElBQVIsRUFBYztVQUNOSixNQUFNLEtBQUtBLEdBQWpCO1NBQ0ksSUFBSVcsR0FBUixJQUFlUCxJQUFmLEVBQXNCO1VBQ2pCLGFBQWEsT0FBT08sR0FBdkIsRUFBNkI7WUFDdkJ4UixTQUFKLEdBQWdCd1IsR0FBaEI7WUFDSXpSLFNBQUosR0FBZ0I4USxJQUFJbFIsT0FBSixDQUFZSSxTQUE1Qjs7OztZQUdJLEVBQUNKLFNBQVM4UixRQUFWLEVBQW9CelIsU0FBcEIsRUFBK0JELFNBQS9CLEVBQTBDVSxLQUExQyxFQUFpREwsS0FBakQsS0FBMERvUixHQUFoRTs7VUFFR3ZSLGNBQWNELFNBQWpCLEVBQTZCO1lBQ3hCQyxjQUFjRixTQUFqQixFQUE2QjtjQUN4QixDQUFFOFEsSUFBSTlRLFNBQVQsRUFBcUI7O2dCQUVmQSxTQUFKLEdBQWdCOFEsSUFBSWxSLE9BQUosQ0FBWUksU0FBNUI7O1NBSEosTUFJSzhRLElBQUk5USxTQUFKLEdBQWdCQSxTQUFoQjtZQUNEQyxTQUFKLEdBQWdCQSxTQUFoQjtPQU5GLE1BT0ssSUFBR0MsY0FBY0YsU0FBakIsRUFBNkI7Y0FDMUIsSUFBSU0sS0FBSixDQUFhLDBDQUFiLENBQU47T0FERyxNQUVBLElBQUdKLGNBQWN3UixRQUFkLElBQTBCLENBQUVaLElBQUk3USxTQUFuQyxFQUErQztZQUM5Q0QsU0FBSixHQUFnQjBSLFNBQVMxUixTQUF6QjtZQUNJQyxTQUFKLEdBQWdCeVIsU0FBU3pSLFNBQXpCOzs7VUFFQ0MsY0FBY1EsS0FBakIsRUFBeUI7WUFBS0EsS0FBSixHQUFZQSxLQUFaOztVQUN2QlIsY0FBY0csS0FBakIsRUFBeUI7WUFBS0EsS0FBSixHQUFZQSxLQUFaOzs7O1dBRXJCLElBQVA7OztjQUVVO1dBQ0gsS0FBSzhRLEtBQUwsQ0FBYSxFQUFDelEsT0FBTyxJQUFSLEVBQWIsQ0FBUDs7O1FBRUksR0FBR3dRLElBQVQsRUFBZTtXQUNOVCxPQUFPa0IsTUFBUCxDQUFnQixLQUFLQyxNQUFyQixFQUE2QjtXQUMzQixFQUFDL00sT0FBTzRMLE9BQU85QyxNQUFQLENBQWdCLEVBQWhCLEVBQW9CLEtBQUttRCxHQUF6QixFQUE4QixHQUFHSSxJQUFqQyxDQUFSLEVBRDJCLEVBQTdCLENBQVA7O1FBRUksR0FBR0EsSUFBVCxFQUFlO1dBQ05ULE9BQU9rQixNQUFQLENBQWdCLElBQWhCLEVBQXNCO1dBQ3BCLEVBQUM5TSxPQUFPNEwsT0FBTzlDLE1BQVAsQ0FBZ0IsRUFBaEIsRUFBb0IsS0FBS21ELEdBQXpCLEVBQThCLEdBQUdJLElBQWpDLENBQVIsRUFEb0IsRUFBdEIsQ0FBUDs7O2tCQUljO1FBQ1gsQ0FBRSxLQUFLVyxZQUFMLEVBQUwsRUFBMkI7WUFDbkIsSUFBSXZSLEtBQUosQ0FBYSx3QkFBYixDQUFOOzs7aUJBQ1c7V0FBVSxJQUFQOztVQUNWcUUsVUFBUSxFQUFoQixFQUFvQjtRQUNmLFNBQVNBLE9BQVQsSUFBb0IsVUFBVUEsT0FBakMsRUFBMkM7Z0JBQy9CLEVBQUltTixRQUFRbk4sT0FBWixFQUFWOzs7VUFFSXFMLFVBQVUsS0FBS25ELFFBQUwsQ0FBY2tGLFdBQWQsQ0FBMEIsS0FBS2pCLEdBQUwsQ0FBUzdRLFNBQW5DLENBQWhCOztVQUVNK1IsY0FBY3JOLFFBQVFxTixXQUFSLElBQXVCLElBQTNDO1FBQ0lDLFlBQVl0TixRQUFRc04sU0FBeEI7UUFDRyxTQUFTQSxTQUFaLEVBQXdCO2tCQUNWRCxjQUFZLENBQXhCOzs7UUFFRUgsWUFBSjtVQUNNSyxVQUFVLElBQUloQyxPQUFKLENBQWMsQ0FBQ1QsT0FBRCxFQUFVVSxNQUFWLEtBQXFCO1lBQzNDdkwsT0FBT0QsUUFBUXdMLE1BQVIsR0FBaUJBLE1BQWpCLEdBQTBCVixPQUF2QztXQUNLb0MsWUFBTCxHQUFvQkEsZUFBZSxNQUNqQ0csY0FBY2hDLFFBQVFtQyxFQUFSLEVBQWQsR0FDSSxJQURKLElBQ1l2TixLQUFLb0wsT0FBTCxHQUFlLEtBRDNCLENBREY7S0FGYyxDQUFoQjs7UUFNSUksR0FBSjtVQUNNZ0MsY0FBY0gsYUFBYUQsY0FBWSxDQUE3QztRQUNHck4sUUFBUW1OLE1BQVIsSUFBa0JHLFNBQXJCLEVBQWlDO1lBQ3pCSSxPQUFPLEtBQUtoQixLQUFMLENBQVcsU0FBWCxDQUFiO1lBQ01pQixZQUFZLE1BQU07WUFDbkJGLGNBQWNwQyxRQUFRbUMsRUFBUixFQUFqQixFQUFnQztlQUN6QmIsTUFBTCxDQUFZLE1BQVo7O09BRko7WUFHTWlCLFlBQWNELFNBQWQsRUFBeUJGLFdBQXpCLENBQU47S0FMRixNQU1LO1lBQ0dHLFlBQWNWLFlBQWQsRUFBNEJPLFdBQTVCLENBQU47O1FBQ0NoQyxJQUFJRyxLQUFQLEVBQWU7VUFBS0EsS0FBSjs7VUFDVmlDLFFBQVEsTUFBTUMsY0FBY3JDLEdBQWQsQ0FBcEI7O1lBRVFWLElBQVIsQ0FBYThDLEtBQWIsRUFBb0JBLEtBQXBCO1dBQ09OLE9BQVA7OztRQUdJUSxTQUFOLEVBQWlCLEdBQUd4QixJQUFwQixFQUEwQjtRQUNyQixhQUFhLE9BQU93QixTQUF2QixFQUFtQztrQkFDckIsS0FBS0MsVUFBTCxDQUFnQkQsU0FBaEIsQ0FBWjs7O1FBRUMsZUFBZSxPQUFPQSxVQUFVN0osSUFBbkMsRUFBMEM7WUFDbEMsSUFBSWxGLFNBQUosQ0FBaUIsZ0NBQWpCLENBQU47OztXQUVLOE0sT0FBT2tCLE1BQVAsQ0FBZ0IsSUFBaEIsRUFBd0I7Y0FDbkIsRUFBQzlNLE9BQU82TixTQUFSLEVBRG1CO1dBRXRCLEVBQUM3TixPQUFPNEwsT0FBTzlDLE1BQVAsQ0FBZ0IsRUFBaEIsRUFBb0IsS0FBS21ELEdBQXpCLEVBQThCLEdBQUdJLElBQWpDLENBQVIsRUFGc0IsRUFBeEIsQ0FBUDs7O1NBSUtQLFVBQVAsQ0FBa0JpQyxTQUFsQixFQUE2QjtTQUN2QixNQUFNLENBQUNDLElBQUQsRUFBT0gsU0FBUCxDQUFWLElBQStCakMsT0FBT3FDLE9BQVAsQ0FBaUJGLFNBQWpCLENBQS9CLEVBQTREO1dBQ3JEakcsU0FBTCxDQUFla0csSUFBZixJQUF1QixZQUFXO2VBQ3pCLEtBQUt4QixLQUFMLENBQWFxQixTQUFiLENBQVA7T0FERjs7U0FFRy9GLFNBQUwsQ0FBZWdHLFVBQWYsR0FBNEJDLFNBQTVCO1NBQ0tqRyxTQUFMLENBQWU2RSxNQUFmLEdBQXdCb0IsVUFBVXBHLE9BQWxDO1dBQ08sSUFBUDs7OztBQUVKaUUsT0FBTzlDLE1BQVAsQ0FBZ0IrQyxPQUFPL0QsU0FBdkIsRUFBa0M7Y0FDcEIsSUFEb0IsRUFBbEM7O0FDM0lBLE1BQU1vRyx5QkFBMkI7V0FDdEJsTSxHQUFULEVBQWMsRUFBQ04sR0FBRCxFQUFNckMsR0FBTixFQUFkLEVBQTBCO1lBQ2hCOE8sS0FBUixDQUFnQixpQkFBaEIsRUFBbUNuTSxHQUFuQyxFQUF3QyxFQUFJTixHQUFKLEVBQVNyQyxHQUFULEVBQXhDOztHQUY2QixFQUkvQm1KLFlBQVl4RyxHQUFaLEVBQWlCLEVBQUNOLEdBQUQsRUFBTXJDLEdBQU4sRUFBakIsRUFBNkI7WUFDbkI4TyxLQUFSLENBQWdCLHVCQUF1Qm5NLEdBQXZDO0dBTDZCOztXQU90QixRQUFDNEYsT0FBRCxZQUFPNEIsV0FBUCxVQUFpQnFDLFNBQWpCLEVBQXlCdUMsU0FBekIsRUFBVCxFQUE4QyxFQVBmOzthQVNwQkMsRUFBWCxFQUFlO1dBQVUvSCxLQUFLZ0ksS0FBWjtHQVRhO2FBVXBCO1dBQVVoSSxLQUFLQyxTQUFaO0dBVmlCLEVBQWpDOztBQWFBLHNCQUFlLFVBQVNnSSxjQUFULEVBQXlCO21CQUNyQjNDLE9BQU85QyxNQUFQLENBQWdCLEVBQWhCLEVBQW9Cb0Ysc0JBQXBCLEVBQTRDSyxjQUE1QyxDQUFqQjtRQUNNO2FBQUEsRUFDT0MsVUFEUCxFQUNtQkMsUUFEbkI7Y0FFTUMsZ0JBRk47aUJBR1NDLG1CQUhULEtBSUpKLGNBSkY7O1NBTVMsRUFBQ0ssT0FBTyxDQUFSLEVBQVdDLFFBQVgsRUFBcUJDLElBQXJCLEVBQVQ7O1dBRVNELFFBQVQsQ0FBa0JFLFlBQWxCLEVBQWdDQyxLQUFoQyxFQUF1QztVQUMvQixFQUFDL08sWUFBRCxLQUFpQjhPLGFBQWFqSCxTQUFwQztRQUNHLFFBQU03SCxZQUFOLElBQXNCLENBQUVBLGFBQWFnUCxjQUFiLEVBQTNCLEVBQTJEO1lBQ25ELElBQUluUSxTQUFKLENBQWlCLGlDQUFqQixDQUFOOzs7aUJBRVdnSixTQUFiLENBQXVCRSxRQUF2QixHQUNFa0gsZ0JBQWtCalAsWUFBbEIsQ0FERjs7O1dBR082TyxJQUFULENBQWM3RyxHQUFkLEVBQW1CO1dBQ1ZBLElBQUlELFFBQUosR0FBZUMsSUFBSUQsUUFBSixDQUFhQyxHQUFiLENBQXRCOzs7V0FFT2lILGVBQVQsQ0FBeUJqUCxZQUF6QixFQUF1QztVQUMvQm1PLFlBQVlsSCxjQUFnQmpILFlBQWhCLEVBQThCLEVBQUlPLFNBQUosRUFBZUMsV0FBV2dPLFVBQTFCLEVBQTlCLENBQWxCO1VBQ003RyxVQUFPdUgsS0FBU3RILFlBQVQsQ0FBc0J1RyxTQUF0QixDQUFiO1VBQ012QyxZQUFTdUQsT0FBV3ZILFlBQVgsQ0FBd0J1RyxTQUF4QixDQUFmO1VBQ001RSxjQUFXNkYsU0FBYXhILFlBQWIsQ0FBMEJ1RyxTQUExQixDQUFqQjs7bUJBRWVTLFFBQWYsQ0FBMEI7bUJBQUEsWUFDbEJyRixXQURrQixVQUNScUMsU0FEUSxFQUNBdUMsU0FEQSxFQUExQjs7V0FHTyxVQUFTbkcsR0FBVCxFQUFjO2FBQ1oyRCxPQUFPOUMsTUFBUCxDQUFnQmQsUUFBaEIsRUFBNEIsRUFBQzhFLE1BQUQsRUFBU3dDLFFBQVF0SCxRQUFqQixFQUEyQnVILE1BQTNCLEVBQTVCLENBQVA7O2VBRVNBLE1BQVQsQ0FBZ0IsR0FBR2xELElBQW5CLEVBQXlCO2NBQ2pCNUMsVUFBVW9DLFVBQU9LLElBQVAsQ0FBYyxJQUFkLEVBQW9CakUsR0FBcEIsQ0FBaEI7ZUFDTyxNQUFNb0UsS0FBS3BQLE1BQVgsR0FDSHdNLFFBQVE4QyxJQUFSLENBQWEsR0FBR0YsSUFBaEIsQ0FERyxHQUNxQjVDLE9BRDVCOzs7ZUFHT3pCLFFBQVQsQ0FBa0I3RixPQUFsQixFQUEyQjtlQUNsQjJLLE9BQVN0TSxXQUFULEVBQXNCMkIsT0FBdEIsQ0FBUDs7O2VBRU8ySyxNQUFULENBQWdCMVIsU0FBaEIsRUFBMkIrRyxPQUEzQixFQUFvQztjQUM1QnNILFVBQVVvQyxVQUFPSyxJQUFQLENBQWM5USxTQUFkLEVBQXlCNk0sR0FBekIsQ0FBaEI7Y0FDTW9HLEtBQUssSUFBSTdFLFdBQUosQ0FBYUMsT0FBYixDQUFYOztjQUVNK0YsU0FBU3JOLFFBQVFrTSxFQUFSLEVBQVlwRyxHQUFaLENBQWY7Y0FDTU0sU0FBUyxDQUFDaUgsT0FBT2pILE1BQVAsSUFBaUJpSCxNQUFsQixFQUEwQnpOLElBQTFCLENBQStCeU4sTUFBL0IsQ0FBZjtjQUNNdk4sV0FBVyxDQUFDdU4sT0FBT3ZOLFFBQVAsSUFBbUJ5TSxnQkFBcEIsRUFBc0MzTSxJQUF0QyxDQUEyQ3lOLE1BQTNDLENBQWpCO2NBQ01oSCxjQUFjLENBQUNnSCxPQUFPaEgsV0FBUCxJQUFzQm1HLG1CQUF2QixFQUE0QzVNLElBQTVDLENBQWlEeU4sTUFBakQsQ0FBcEI7O2NBRU0zTyxPQUFPLElBQUkrRyxPQUFKLENBQVd5RyxHQUFHMU0sV0FBSCxJQUFrQjZNLFdBQVdILEVBQVgsQ0FBN0IsQ0FBYjthQUNLb0IsUUFBTCxDQUFnQnBCLEVBQWhCLEVBQW9CcEcsR0FBcEIsRUFBeUI3TSxTQUF6QixFQUNFLEVBQUltTixNQUFKLEVBQVl0RyxRQUFaLEVBQXNCdUcsV0FBdEIsRUFERjs7WUFHSWtILFFBQVFyRSxRQUFRVCxPQUFSLENBQWdCNEUsTUFBaEIsQ0FBWjtZQUNHQSxPQUFPRyxRQUFWLEVBQXFCO2tCQUNYRCxNQUFNN0UsSUFBTixDQUFhMkUsVUFBVUEsT0FBT0csUUFBUCxFQUF2QixDQUFSOzs7Y0FFSXhPLE1BQU15SyxPQUFPa0IsTUFBUCxDQUFnQjhDLG1CQUFoQixFQUF1QztxQkFDdEMsRUFBSWhHLFlBQVksSUFBaEIsRUFBc0I1SixPQUFPaUksSUFBSXZCLE1BQUosQ0FBV3lGLE9BQXhDLEVBRHNDO3FCQUV0QyxFQUFJdkMsWUFBWSxJQUFoQixFQUFzQjVKLE9BQU81RSxTQUE3QixFQUZzQztpQkFHMUMsRUFBSTRFLE9BQU8wUCxNQUFNN0UsSUFBTixDQUFhLE1BQU0xSixHQUFuQixDQUFYLEVBSDBDLEVBQXZDLENBQVo7ZUFJT0EsR0FBUDs7S0FoQ0o7Ozs7QUFrQ0osTUFBTXlPLHNCQUF3QjtZQUNsQjtXQUFVLElBQUksS0FBS3hVLFNBQWhCO0dBRGU7WUFFbEI7V0FBVyxvQkFBbUIsS0FBS0EsU0FBVSxHQUExQztHQUZlLEVBQTlCOztBQy9FQXlVLGdCQUFnQnJQLFNBQWhCLEdBQTRCQSxTQUE1QjtBQUNBLFNBQVNBLFNBQVQsR0FBcUI7U0FDWnNQLFlBQVksQ0FBWixFQUFlQyxXQUFmLEVBQVA7OztBQUVGLEFBQWUsU0FBU0YsZUFBVCxDQUF5QnRCLGlCQUFlLEVBQXhDLEVBQTRDO01BQ3RELFFBQVFBLGVBQWUvTixTQUExQixFQUFzQzttQkFDckJBLFNBQWYsR0FBMkJBLFNBQTNCOzs7U0FFS3dQLGdCQUFnQnpCLGNBQWhCLENBQVA7OztBQ1RGLE1BQU0wQixrQkFBa0IsZ0JBQWdCLE9BQU9DLE1BQXZCLEdBQ3BCQSxPQUFPQyxNQUFQLENBQWNGLGVBRE0sR0FDWSxJQURwQzs7QUFHQUcsaUJBQWlCNVAsU0FBakIsR0FBNkJBLFdBQTdCO0FBQ0EsU0FBU0EsV0FBVCxHQUFxQjtRQUNiNlAsTUFBTSxJQUFJQyxVQUFKLENBQWUsQ0FBZixDQUFaO2tCQUNnQkQsR0FBaEI7U0FDT0EsSUFBSSxDQUFKLENBQVA7OztBQUVGLEFBQWUsU0FBU0QsZ0JBQVQsQ0FBMEI3QixpQkFBZSxFQUF6QyxFQUE2QztNQUN2RCxRQUFRQSxlQUFlL04sU0FBMUIsRUFBc0M7bUJBQ3JCQSxTQUFmLEdBQTJCQSxXQUEzQjs7O1NBRUt3UCxnQkFBZ0J6QixjQUFoQixDQUFQOzs7Ozs7In0=
