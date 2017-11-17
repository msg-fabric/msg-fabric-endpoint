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

  const { random_id, json_reviver, json_replacer } = options;
  return { packetParser, random_id, json_parse, json_stringify,
    createMultipart, createStream, packetFragments,
    bindTransports };

  function json_parse(text) {
    return JSON.parse(text, json_reviver);
  }
  function json_stringify(obj) {
    return JSON.stringify(obj, json_replacer);
  }

  function createMultipart(pkt, sink) {
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

      const res = concatBuffers(parts);
      parts = null;
      return res;
    }
  }

  function createStream(pkt, sink) {
    let next = 0,
        fin = false,
        rstream;
    const state = { feed: feed_init, info: pkt.info };
    return state;

    function on_error(err, pkt) {
      if (undefined === rstream.on_error) {
        return void console.warn(`Error during stream.feed:`, err);
      }
      return rstream.on_error(err, pkt);
    }

    function feed_init(pkt, as_content) {
      state.feed = feed_ignore;

      const msg = json_parse(pkt.body_utf8());
      rstream = sink.recvStream(msg, pkt.info);
      if (null == rstream) {
        return;
      }

      try {
        if (!feed_seq(pkt)) {
          return;
        }
        state.feed = feed_body;
      } catch (err) {
        return on_error(err, pkt);
      }

      if ('function' === typeof rstream.on_init) {
        return rstream.on_init(msg, pkt);
      } else return sink.recvMsg(msg, pkt.info);
    }

    function feed_body(pkt, as_content) {
      let data;
      try {
        if (!feed_seq(pkt)) {
          return;
        }
        data = as_content(pkt);
      } catch (err) {
        return on_error(err, pkt);
      }
      return rstream.on_data(data, pkt);
    }

    function feed_ignore() {}

    function feed_seq(pkt) {
      let seq = pkt.info.seq;
      if (seq < 0) {
        seq = -seq;
      }
      if (next === seq) {
        return ++next;
      }
      state.feed = feed_ignore;
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
    const stream = !transports.streaming ? null : 'object' === transports.streaming.mode ? bind_stream(msend_objects) : bind_stream(msend_bytes);

    return { send, stream };

    function send(chan, obj, body) {
      body = packBody(body);
      if (fragment_size < body.byteLength) {
        if (!obj.token) {
          obj.token = random_id();
        }
        const msend = msend_bytes('multipart', chan, obj);
        return { sent: msend(true, body) };
      }

      obj.transport = 'single';
      obj.body = body;
      const pack_hdr = outbound.choose(obj);
      const pkt = packPacketObj(pack_hdr(obj));
      return { sent: chan(pkt) };
    }

    function msend_bytes(transport, chan, obj, msg) {
      obj.transport = transport;
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

    function msend_objects(transport, chan, obj, msg) {
      obj.transport = transport;
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

    function bind_stream(send_impl) {
      return function stream(chan, obj, msg) {
        if (!obj.token) {
          obj.token = random_id();
        }
        if ('object' !== typeof msg) {
          throw new TypeError(`stream() requires a JSON seralizable msg for initial packet`);
        }
        msg = json_stringify(msg);
        const msend = send_impl('streaming', chan, obj, msg);
        write.write = write;write.end = end;
        return write;

        function write(chunk) {
          return chunk != null ? msend(false, packBody(chunk)) : msend(true);
        }

        function end(chunk) {
          return chunk != null ? msend(true, packBody(chunk)) : msend(true);
        }
      };
    }
  }
};

function json_protocol(shared) {
  const { createMultipart, createStream, json_parse, json_stringify } = shared;
  const { pack_utf8, unpack_utf8 } = shared.packetParser;

  return {
    packBody,
    packStream(chunk, fragment_size) {
      return [packBody(chunk)];
    },

    get datagram() {
      return this.direct;
    },
    direct: {
      t_recv(pkt, sink) {
        const msg = json_parse(pkt.body_utf8() || undefined);
        return sink.recvMsg(msg, pkt.info);
      } },

    multipart: {
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createMultipart);
        const body_buf = state.feed(pkt);
        if (undefined !== body_buf) {
          const msg = json_parse(unpack_utf8(body_buf) || undefined);
          return sink.recvMsg(msg, state.info);
        }
      } },

    streaming: {
      mode: 'object',
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createStream);
        return state.feed(pkt, pkt_as_ndjson);
      } } };

  function packBody(body) {
    return pack_utf8(json_stringify(body));
  }

  function pkt_as_ndjson(pkt) {
    return pkt.body_utf8().split(/\r|\n|\0/).filter(l => l).map(json_parse);
  }
}

function binary_protocol(shared) {
  const { createMultipart, createStream } = shared;
  const { asBuffer } = shared.packetParser;
  return {
    packBody: asBuffer,
    packStream(chunk, fragment_size) {
      return [asBuffer(chunk)];
    },

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

  static register(endpoint, kw_args) {
    return new this().register(endpoint, kw_args);
  }
  register(endpoint, { hub, id_target, on_msg, on_error }) {
    const unregister = () => hub.router.unregisterTarget(id_target);

    hub.router.registerTarget(id_target, this._bindDispatch(endpoint, on_msg, on_error, unregister));
    return this;
  }

  _bindDispatch(endpoint, on_msg, on_error, unregister) {
    let alive = true;
    const protocol = this._protocol;
    const isAlive = () => alive;
    const shutdown = err => {
      if (alive) {
        unregister();unregister = alive = false;
        if (err) {
          console.error('ENDPOINT SHUTDOWN: ' + err);
        }
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
        return on_error(false, { pkt });
      }

      try {
        var msg = await recv_msg(pkt, this, router);
        if (!msg) {
          return msg;
        }

        return await on_msg(msg, pkt);
      } catch (err) {
        if (false !== on_error(err, { msg, pkt })) {
          endpoint.shutdown(err, { msg, pkt });
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
        entry = ifAbsent(pkt, this);
      } else entry = ifAbsent;
      this.by_msgid.set(msgid, entry);
    }
    return entry;
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
      _by_token: { value: this.createReplyMap() },
      _by_traffic: { value: this.createTrafficMap() },
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
    const by_token = this._by_token;
    const by_traffic = this._by_traffic;
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

      recvStream: (msg, info) => {
        traffic(info.from_id, 'stream');
        const rstream = this.recvStream(msg, info);
        const rmsg = rstream.on_init ? rstream.on_init(msg, info) : this.recvMsg(msg, info);

        if (rstream != null && 'function' !== typeof rstream.on_data) {
          throw new TypeError(`Expected object with on_data(data, pkt) function`);
        }

        const reply = by_token.get(info.token);
        if (undefined !== reply) {
          Promise.resolve(rmsg).then(reply);
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
    //return @{}
    //  on_data(data, pkt) ::
    //  on_error(err, pkt) ::
  }initReply(token, msg_ctx, kind) {
    return this.initReplyPromise(token, msg_ctx.ms_timeout);
  }

  initMonitor(id_target) {
    const key = id_target.id_target || id_target;
    let monitor = this._by_traffic.get(key);
    if (undefined === monitor) {
      monitor = { id_target, ts: Date.now(),
        td() {
          return Date.now() - this.ts;
        } };
      this._by_traffic.set(key, monitor);
    }
    return monitor;
  }

  initReplyPromise(token, ms_timeout) {
    const ans = new Promise((resolve, reject) => {
      this._by_token.set(token, resolve);
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
  on_error: console.error,
  subclass({ Sink: Sink$$1, Endpoint: Endpoint$$1, SourceEndpoint, protocols }) {} };

var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    random_id, json_reviver, json_replacer,
    on_error: default_on_error } = plugin_options;

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
    const protocols = init_protocol(packetParser, { random_id, json_reviver, json_replacer });
    const Sink$$1 = Sink.forProtocols(protocols);
    const MsgCtx$$1 = MsgCtx.forProtocols(protocols);
    const Endpoint$$1 = Endpoint.forProtocols(protocols);

    plugin_options.subclass({
      Sink: Sink$$1, Endpoint: Endpoint$$1, MsgCtx: MsgCtx$$1, protocols });

    return function (hub) {
      return Object.assign(endpoint, { create: endpoint, server: endpoint, client });

      function client(...args) {
        const msg_ctx = MsgCtx$$1.from(null, hub);
        return 0 !== args.length ? msg_ctx.with(...args) : msg_ctx;
      }

      function endpoint(on_init) {
        const id_target = random_id();
        const msg_ctx = MsgCtx$$1.from(id_target, hub);
        const ep = new Endpoint$$1(msg_ctx);

        const target = on_init(ep);
        const on_msg = (target.on_msg || target).bind(target);
        const on_error = (target.on_error || default_on_error).bind(target);

        Sink$$1.register(ep, {
          hub, id_target, on_msg, on_error });

        if (target.on_ready) {
          Promise.resolve(target).then(target => target.on_ready());
        }

        return Object.create(endpoint_target_api, {
          id_router: { enumerable: true, value: hub.router.id_self },
          id_target: { enumerable: true, value: id_target } });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL3Byb3RvY29sL2ZyYW1pbmcuanN5IiwiLi4vY29kZS9wcm90b2NvbC9zaGFyZWQuanN5IiwiLi4vY29kZS9wcm90b2NvbC9qc29uLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvYmluYXJ5LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvY29udHJvbC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2luZGV4LmpzeSIsIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvbXNnY3R4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSIsIi4uL2NvZGUvaW5kZXgubm9kZWpzLmpzeSIsIi4uL2NvZGUvaW5kZXguYnJvd3Nlci5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgbGl0dGxlX2VuZGlhbiA9IHRydWVcbmNvbnN0IGNfc2luZ2xlID0gJ3NpbmdsZSdcbmNvbnN0IGNfZGF0YWdyYW0gPSAnZGF0YWdyYW0nXG5jb25zdCBjX2RpcmVjdCA9ICdkaXJlY3QnXG5jb25zdCBjX211bHRpcGFydCA9ICdtdWx0aXBhcnQnXG5jb25zdCBjX3N0cmVhbWluZyA9ICdzdHJlYW1pbmcnXG5cbmNvbnN0IF9lcnJfbXNnaWRfcmVxdWlyZWQgPSBgUmVzcG9uc2UgcmVxaXJlcyAnbXNnaWQnYFxuY29uc3QgX2Vycl90b2tlbl9yZXF1aXJlZCA9IGBUcmFuc3BvcnQgcmVxaXJlcyAndG9rZW4nYFxuXG5cbmZ1bmN0aW9uIGZybV9yb3V0aW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDEsIG1hc2sgPSAweDFcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5mcm9tX2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3Qge2Zyb21faWR9ID0gb2JqXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCAwfGZyb21faWQuaWRfcm91dGVyLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQzMiBAIDQrb2Zmc2V0LCAwfGZyb21faWQuaWRfdGFyZ2V0LCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCBmcm9tX2lkID0gdW5kZWZpbmVkID09PSBvYmouZnJvbV9pZFxuICAgICAgICA/IG9iai5mcm9tX2lkID0ge30gOiBvYmouZnJvbV9pZFxuICAgICAgZnJvbV9pZC5pZF9yb3V0ZXIgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBmcm9tX2lkLmlkX3RhcmdldCA9IGR2LmdldEludDMyIEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuZnVuY3Rpb24gZnJtX3Jlc3BvbnNlKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDIsIG1hc2sgPSAweDJcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5tc2dpZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLm1zZ2lkIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfbXNnaWRfcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai5tc2dpZCwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxX2FjaywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouYWNrX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudG9rZW4gPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2FjayA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5hY2tfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cblxuXG5mdW5jdGlvbiBmcm1fZGF0YWdyYW0oKSA6OlxuICBjb25zdCBzaXplID0gMCwgYml0cyA9IDB4MCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kYXRhZ3JhbVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RhdGFncmFtID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGF0YWdyYW1cblxuZnVuY3Rpb24gZnJtX2RpcmVjdCgpIDo6XG4gIGNvbnN0IHNpemUgPSA0LCBiaXRzID0gMHg0LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RpcmVjdFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RpcmVjdCA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RpcmVjdFxuXG5mdW5jdGlvbiBmcm1fbXVsdGlwYXJ0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDgsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfbXVsdGlwYXJ0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfbXVsdGlwYXJ0ID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6IC8vIHVzZSBzZXFfbmV4dFxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuXG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19tdWx0aXBhcnRcblxuZnVuY3Rpb24gZnJtX3N0cmVhbWluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHhjLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX3N0cmVhbWluZ1xuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX3N0cmVhbWluZyA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OlxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuIC8vIHVzZSBzZXFfbmV4dFxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfc3RyZWFtaW5nXG5cblxuZnVuY3Rpb24gYmluZF9zZXFfbmV4dChvZmZzZXQpIDo6XG4gIGNvbnN0IHNlcV9vZmZzZXQgPSB0aGlzLnNlcV9wb3MgKyBvZmZzZXRcbiAgbGV0IHNlcSA9IDFcbiAgcmV0dXJuIGZ1bmN0aW9uIHNlcV9uZXh0KHtmbGFncywgZmlufSwgZHYpIDo6XG4gICAgaWYgISBmaW4gOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgc2VxKyssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgZWxzZSA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCAtc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgICAgc2VxID0gTmFOXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlRnJhbWluZ3MoKVxuZnVuY3Rpb24gY29tcG9zZUZyYW1pbmdzKCkgOjpcbiAgY29uc3QgZnJtX2Zyb20gPSBmcm1fcm91dGluZygpLCBmcm1fcmVzcCA9IGZybV9yZXNwb25zZSgpXG4gIGNvbnN0IGZybV90cmFuc3BvcnRzID0gQFtdIGZybV9kYXRhZ3JhbSgpLCBmcm1fZGlyZWN0KCksIGZybV9tdWx0aXBhcnQoKSwgZnJtX3N0cmVhbWluZygpXG5cbiAgaWYgOCAhPT0gZnJtX2Zyb20uc2l6ZSB8fCA4ICE9PSBmcm1fcmVzcC5zaXplIHx8IDQgIT0gZnJtX3RyYW5zcG9ydHMubGVuZ3RoIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEZyYW1pbmcgU2l6ZSBjaGFuZ2VgXG5cbiAgY29uc3QgYnlCaXRzID0gW10sIG1hc2s9MHhmXG5cbiAgOjpcbiAgICBjb25zdCB0X2Zyb20gPSBmcm1fZnJvbS5mX3Rlc3QsIHRfcmVzcCA9IGZybV9yZXNwLmZfdGVzdFxuICAgIGNvbnN0IFt0MCx0MSx0Mix0M10gPSBmcm1fdHJhbnNwb3J0cy5tYXAgQCBmPT5mLmZfdGVzdFxuXG4gICAgY29uc3QgdGVzdEJpdHMgPSBieUJpdHMudGVzdEJpdHMgPSBvYmogPT5cbiAgICAgIDAgfCB0X2Zyb20ob2JqKSB8IHRfcmVzcChvYmopIHwgdDAob2JqKSB8IHQxKG9iaikgfCB0MihvYmopIHwgdDMob2JqKVxuXG4gICAgYnlCaXRzLmNob29zZSA9IGZ1bmN0aW9uIChvYmosIGxzdCkgOjpcbiAgICAgIGlmIG51bGwgPT0gbHN0IDo6IGxzdCA9IHRoaXMgfHwgYnlCaXRzXG4gICAgICByZXR1cm4gbHN0W3Rlc3RCaXRzKG9iaildXG5cblxuICBmb3IgY29uc3QgVCBvZiBmcm1fdHJhbnNwb3J0cyA6OlxuICAgIGNvbnN0IHtiaXRzOmIsIHNpemUsIHRyYW5zcG9ydH0gPSBUXG5cbiAgICBieUJpdHNbYnwwXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MCwgbWFzaywgc2l6ZTogc2l6ZSwgb3A6ICcnXG4gICAgYnlCaXRzW2J8MV0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDEsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ2YnXG4gICAgYnlCaXRzW2J8Ml0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDIsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ3InXG4gICAgYnlCaXRzW2J8M10gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDMsIG1hc2ssIHNpemU6IDE2ICsgc2l6ZSwgb3A6ICdmcidcblxuICAgIGZvciBjb25zdCBmbl9rZXkgb2YgWydmX3BhY2snLCAnZl91bnBhY2snXSA6OlxuICAgICAgY29uc3QgZm5fdHJhbiA9IFRbZm5fa2V5XSwgZm5fZnJvbSA9IGZybV9mcm9tW2ZuX2tleV0sIGZuX3Jlc3AgPSBmcm1fcmVzcFtmbl9rZXldXG5cbiAgICAgIGJ5Qml0c1tifDBdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl90cmFuKG9iaiwgZHYsIDApXG4gICAgICBieUJpdHNbYnwxXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8Ml1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3Jlc3Aob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDNdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl9yZXNwKG9iaiwgZHYsIDgpOyBmbl90cmFuKG9iaiwgZHYsIDE2KVxuXG4gIGZvciBjb25zdCBmcm0gb2YgYnlCaXRzIDo6XG4gICAgYmluZEFzc2VtYmxlZCBAIGZybVxuXG4gIHJldHVybiBieUJpdHNcblxuXG5mdW5jdGlvbiBiaW5kQXNzZW1ibGVkKGZybSkgOjpcbiAgY29uc3Qge1QsIHNpemUsIGZfcGFjaywgZl91bnBhY2t9ID0gZnJtXG4gIGlmIFQuYmluZF9zZXFfbmV4dCA6OlxuICAgIGZybS5zZXFfbmV4dCA9IFQuYmluZF9zZXFfbmV4dCBAIGZybS5zaXplIC0gVC5zaXplXG5cbiAgZGVsZXRlIGZybS5UXG4gIGZybS5wYWNrID0gcGFjayA7IGZybS51bnBhY2sgPSB1bnBhY2tcbiAgY29uc3Qgc2VxX25leHQgPSBmcm0uc2VxX25leHRcblxuICBmdW5jdGlvbiBwYWNrKHBrdF90eXBlLCBwa3Rfb2JqKSA6OlxuICAgIGlmICEgQCAwIDw9IHBrdF90eXBlICYmIHBrdF90eXBlIDw9IDI1NSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwa3RfdHlwZSB0byBiZSBbMC4uMjU1XWBcblxuICAgIHBrdF9vYmoudHlwZSA9IHBrdF90eXBlXG4gICAgaWYgc2VxX25leHQgJiYgbnVsbCA9PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgcGt0X29iai5zZXEgPSB0cnVlXG5cbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBBcnJheUJ1ZmZlcihzaXplKVxuICAgIGZfcGFjayhwa3Rfb2JqLCBkdiwgMClcbiAgICBwa3Rfb2JqLmhlYWRlciA9IGR2LmJ1ZmZlclxuXG4gICAgaWYgdHJ1ZSA9PT0gcGt0X29iai5zZXEgOjpcbiAgICAgIF9iaW5kX2l0ZXJhYmxlIEAgcGt0X29iaiwgZHYuYnVmZmVyLnNsaWNlKDAsc2l6ZSlcblxuICBmdW5jdGlvbiB1bnBhY2socGt0KSA6OlxuICAgIGNvbnN0IGJ1ZiA9IHBrdC5oZWFkZXJfYnVmZmVyKClcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBVaW50OEFycmF5KGJ1ZikuYnVmZmVyXG5cbiAgICBjb25zdCBpbmZvID0ge31cbiAgICBmX3VucGFjayhpbmZvLCBkdiwgMClcbiAgICByZXR1cm4gcGt0LmluZm8gPSBpbmZvXG5cbiAgZnVuY3Rpb24gX2JpbmRfaXRlcmFibGUocGt0X29iaiwgYnVmX2Nsb25lKSA6OlxuICAgIGNvbnN0IHt0eXBlfSA9IHBrdF9vYmpcbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXQsIHR0bCwgdG9rZW59ID0gcGt0X29ialxuICAgIHBrdF9vYmoubmV4dCA9IG5leHRcblxuICAgIGZ1bmN0aW9uIG5leHQob3B0aW9ucykgOjpcbiAgICAgIGlmIG51bGwgPT0gb3B0aW9ucyA6OiBvcHRpb25zID0ge31cbiAgICAgIGNvbnN0IGhlYWRlciA9IGJ1Zl9jbG9uZS5zbGljZSgpXG4gICAgICBzZXFfbmV4dCBAIG9wdGlvbnMsIG5ldyBEYXRhVmlldyBAIGhlYWRlclxuICAgICAgcmV0dXJuIEB7fSBkb25lOiAhISBvcHRpb25zLmZpbiwgdmFsdWU6IEB7fSAvLyBwa3Rfb2JqXG4gICAgICAgIGlkX3JvdXRlciwgaWRfdGFyZ2V0LCB0eXBlLCB0dGwsIHRva2VuLCBoZWFkZXJcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBhY2tldFBhcnNlciwgb3B0aW9ucywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIGNvbnN0IHtyYW5kb21faWQsIGpzb25fcmV2aXZlciwganNvbl9yZXBsYWNlcn0gPSBvcHRpb25zXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwganNvbl9wYXJzZSwganNvbl9zdHJpbmdpZnlcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGpzb25fcGFyc2UodGV4dCkgOjpcbiAgICByZXR1cm4gSlNPTi5wYXJzZSBAIHRleHQsIGpzb25fcmV2aXZlclxuICBmdW5jdGlvbiBqc29uX3N0cmluZ2lmeShvYmopIDo6XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5IEAgb2JqLCBqc29uX3JlcGxhY2VyXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaykgOjpcbiAgICBsZXQgbmV4dD0wLCBmaW4gPSBmYWxzZSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIG9uX2Vycm9yKGVyciwgcGt0KSA6OlxuICAgICAgaWYgdW5kZWZpbmVkID09PSByc3RyZWFtLm9uX2Vycm9yIDo6XG4gICAgICAgIHJldHVybiB2b2lkIGNvbnNvbGUud2FybiBAXG4gICAgICAgICAgYEVycm9yIGR1cmluZyBzdHJlYW0uZmVlZDpgLCBlcnJcbiAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgbXNnID0ganNvbl9wYXJzZSBAIHBrdC5ib2R5X3V0ZjgoKVxuICAgICAgcnN0cmVhbSA9IHNpbmsucmVjdlN0cmVhbShtc2csIHBrdC5pbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgaWYgISBmZWVkX3NlcShwa3QpIDo6IHJldHVyblxuICAgICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIG9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHJzdHJlYW0ub25faW5pdCA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9pbml0KG1zZywgcGt0KVxuICAgICAgZWxzZSByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuICAgIFxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGlmICEgZmVlZF9zZXEocGt0KSA6OiByZXR1cm5cbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiBvbl9lcnJvciBAIGVyciwgcGt0XG4gICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZSgpIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPCAwIDo6IGZpbiA9IHRydWU7IHNlcSA9IC1zZXFcbiAgICAgIGlmIG5leHQgPT09IHNlcSA6OiByZXR1cm4gKytuZXh0XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IHBhY2tTdHJlYW0gPSB0cmFuc3BvcnRzLnBhY2tTdHJlYW1cbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICBjb25zdCBzdHJlYW0gPSAhIHRyYW5zcG9ydHMuc3RyZWFtaW5nID8gbnVsbCA6XG4gICAgICAnb2JqZWN0JyA9PT0gdHJhbnNwb3J0cy5zdHJlYW1pbmcubW9kZVxuICAgICAgICA/IGJpbmRfc3RyZWFtIEAgbXNlbmRfb2JqZWN0c1xuICAgICAgICA6IGJpbmRfc3RyZWFtIEAgbXNlbmRfYnl0ZXNcblxuICAgIHJldHVybiBAe30gc2VuZCwgc3RyZWFtXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKCdtdWx0aXBhcnQnLCBjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBAe30gc2VudDogbXNlbmQgQCB0cnVlLCBib2R5XG5cbiAgICAgIG9iai50cmFuc3BvcnQgPSAnc2luZ2xlJ1xuICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgcGFja19oZHIob2JqKVxuICAgICAgcmV0dXJuIEB7fSBzZW50OiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyh0cmFuc3BvcnQsIGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IHRyYW5zcG9ydFxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBsZXQgcmVzXG4gICAgICAgIGZvciBjb25zdCBvYmogb2YgcGFja2V0RnJhZ21lbnRzIEAgYm9keSwgbmV4dCwgZmluIDo6XG4gICAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICAgIHJlcyA9IGF3YWl0IGNoYW4gQCBwa3RcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiByZXNcblxuICAgIGZ1bmN0aW9uIG1zZW5kX29iamVjdHModHJhbnNwb3J0LCBjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIG9iai50cmFuc3BvcnQgPSB0cmFuc3BvcnRcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgY29uc3Qgb2JqID0gbmV4dCh7ZmlufSlcbiAgICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBiaW5kX3N0cmVhbShzZW5kX2ltcGwpIDo6XG4gICAgICByZXR1cm4gZnVuY3Rpb24gc3RyZWFtIChjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgaWYgJ29iamVjdCcgIT09IHR5cGVvZiBtc2cgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYHN0cmVhbSgpIHJlcXVpcmVzIGEgSlNPTiBzZXJhbGl6YWJsZSBtc2cgZm9yIGluaXRpYWwgcGFja2V0YFxuICAgICAgICBtc2cgPSBqc29uX3N0cmluZ2lmeShtc2cpXG4gICAgICAgIGNvbnN0IG1zZW5kID0gc2VuZF9pbXBsKCdzdHJlYW1pbmcnLCBjaGFuLCBvYmosIG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gZW5kXG4gICAgICAgIHJldHVybiB3cml0ZVxuXG4gICAgICAgIGZ1bmN0aW9uIHdyaXRlKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgZmFsc2UsIHBhY2tCb2R5IEAgY2h1bmtcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cbiAgICAgICAgZnVuY3Rpb24gZW5kKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgdHJ1ZSwgcGFja0JvZHkgQCBjaHVua1xuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFyc2UsIGpzb25fc3RyaW5naWZ5fSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5XG4gICAgcGFja1N0cmVhbShjaHVuaywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgICAgIHJldHVybiBAW10gcGFja0JvZHkoY2h1bmspXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0ganNvbl9wYXJzZSBAIHBrdC5ib2R5X3V0ZjgoKSB8fCB1bmRlZmluZWRcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBib2R5X2J1ZiA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGJvZHlfYnVmIDo6XG4gICAgICAgICAgY29uc3QgbXNnID0ganNvbl9wYXJzZSBAIHVucGFja191dGY4KGJvZHlfYnVmKSB8fCB1bmRlZmluZWRcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ29iamVjdCdcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIHJldHVybiBzdGF0ZS5mZWVkKHBrdCwgcGt0X2FzX25kanNvbilcblxuICBmdW5jdGlvbiBwYWNrQm9keShib2R5KSA6OlxuICAgIHJldHVybiBwYWNrX3V0ZjggQCBqc29uX3N0cmluZ2lmeShib2R5KVxuXG4gIGZ1bmN0aW9uIHBrdF9hc19uZGpzb24ocGt0KSA6OlxuICAgIHJldHVybiBwa3QuYm9keV91dGY4KCkuc3BsaXQoL1xccnxcXG58XFwwLylcbiAgICAgIC5maWx0ZXIgQCBsPT5sXG4gICAgICAubWFwIEAganNvbl9wYXJzZVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYmluYXJ5X3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIGNvbnN0IHthc0J1ZmZlcn0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keTogYXNCdWZmZXJcbiAgICBwYWNrU3RyZWFtKGNodW5rLCBmcmFnbWVudF9zaXplKSA6OlxuICAgICAgcmV0dXJuIEBbXSBhc0J1ZmZlcihjaHVuaylcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBwa3QuYm9keV9idWZmZXIoKVxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnYnl0ZXMnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdCwgcGt0X2J1ZmZlcilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbmZ1bmN0aW9uIHBrdF9idWZmZXIocGt0KSA6OiByZXR1cm4gcGt0LmJvZHlfYnVmZmVyKClcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNvbnRyb2xfcHJvdG9jb2woaW5ib3VuZCwgaGlnaCwgc2hhcmVkKSA6OlxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja1BhY2tldE9ian0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgY29uc3QgcGluZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCB0b2tlbjogdHJ1ZSwgdHJhbnNwb3J0OiAnZGlyZWN0J1xuICBjb25zdCBwb25nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIG1zZ2lkOiB0cnVlLCB0cmFuc3BvcnQ6ICdkYXRhZ3JhbSdcblxuICBjb25zdCBwb25nX3R5cGUgPSBoaWdofDB4ZVxuICBpbmJvdW5kW3BvbmdfdHlwZV0gPSByZWN2X3BvbmdcbiAgY29uc3QgcGluZ190eXBlID0gaGlnaHwweGZcbiAgaW5ib3VuZFtoaWdofDB4Zl0gPSByZWN2X3BpbmdcblxuICByZXR1cm4gQHt9IHNlbmQ6cGluZywgcGluZ1xuXG4gIGZ1bmN0aW9uIHBpbmcoY2hhbiwgb2JqKSA6OlxuICAgIGlmICEgb2JqLnRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgIG9iai5ib2R5ID0gSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgIG9wOiAncGluZycsIHRzMDogbmV3IERhdGUoKVxuICAgIHBpbmdfZnJhbWUucGFjayhwaW5nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICBmdW5jdGlvbiByZWN2X3BpbmcocGt0LCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgcGluZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgX3NlbmRfcG9uZyBAIHBrdC5ib2R5LCBwa3QsIHNpbmssIHJvdXRlclxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuICBmdW5jdGlvbiBfc2VuZF9wb25nKHt0czB9LCBwa3RfcGluZywgc2luaywgcm91dGVyKSA6OlxuICAgIGNvbnN0IHttc2dpZCwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXR9ID0gcl9pZFxuICAgIGNvbnN0IG9iaiA9IEB7fSBpZF9yb3V0ZXIsIGlkX3RhcmdldFxuICAgICAgZnJvbV9pZDogc2luay5mcm9tX2lkLCBtc2dpZFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICBzdGF0aWMgcmVnaXN0ZXIoZW5kcG9pbnQsIGt3X2FyZ3MpIDo6XG4gICAgcmV0dXJuIG5ldyB0aGlzKCkucmVnaXN0ZXIoZW5kcG9pbnQsIGt3X2FyZ3MpXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCB7aHViLCBpZF90YXJnZXQsIG9uX21zZywgb25fZXJyb3J9KSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCBvbl9tc2csIG9uX2Vycm9yLCB1bnJlZ2lzdGVyXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCBvbl9tc2csIG9uX2Vycm9yLCB1bnJlZ2lzdGVyKSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBpZiBlcnIgOjogY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBTSFVURE9XTjogJyArIGVyclxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gb25fZXJyb3IgQCBmYWxzZSwgQDogcGt0XG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgaWYgZmFsc2UgIT09IG9uX2Vycm9yKGVyciwge21zZywgcGt0fSkgOjpcbiAgICAgICAgICBlbmRwb2ludC5zaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG5cbiAgc3RhdGVGb3IocGt0LCBpZkFic2VudCkgOjpcbiAgICBjb25zdCBtc2dpZCA9IHBrdC5pbmZvLm1zZ2lkXG4gICAgbGV0IGVudHJ5ID0gdGhpcy5ieV9tc2dpZC5nZXQobXNnaWQpXG4gICAgaWYgdW5kZWZpbmVkID09PSBlbnRyeSA6OlxuICAgICAgaWYgISBtc2dpZCA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBtc2dpZDogJHttc2dpZH1gXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWZBYnNlbnQgOjpcbiAgICAgICAgZW50cnkgPSBpZkFic2VudChwa3QsIHRoaXMpXG4gICAgICBlbHNlIGVudHJ5ID0gaWZBYnNlbnRcbiAgICAgIHRoaXMuYnlfbXNnaWQuc2V0IEAgbXNnaWQsIGVudHJ5XG4gICAgcmV0dXJuIGVudHJ5XG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe30pIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmZyb21faWRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke3RoaXMuZnJvbV9pZC5pZF90YXJnZXR9wrtgXG5cbiAgY29uc3RydWN0b3IobXNnX2N0eCkgOjpcbiAgICBtc2dfY3R4ID0gbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcylcblxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9ieV90b2tlbjogQHt9IHZhbHVlOiB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICAgIF9ieV90cmFmZmljOiBAe30gdmFsdWU6IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgICBmcm9tX2lkOiBAe30gdmFsdWU6IG1zZ19jdHguZnJvbV9pZCwgZW51bWVyYWJsZTogdHJ1ZVxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLl9ieV90b2tlblxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLl9ieV90cmFmZmljXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgZnJvbV9pZDogdGhpcy5mcm9tX2lkXG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZSh7cm1zZywgbXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgICBjb25zdCBybXNnID0gcnN0cmVhbS5vbl9pbml0XG4gICAgICAgICAgPyByc3RyZWFtLm9uX2luaXQobXNnLCBpbmZvKVxuICAgICAgICAgIDogdGhpcy5yZWN2TXNnKG1zZywgaW5mbylcblxuICAgICAgICBpZiByc3RyZWFtICE9IG51bGwgJiYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJzdHJlYW0ub25fZGF0YSA6OlxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgb2JqZWN0IHdpdGggb25fZGF0YShkYXRhLCBwa3QpIGZ1bmN0aW9uYFxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvKSA6OlxuICByZWN2TXNnKG1zZywgaW5mbykgOjpcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mb1xuICByZWN2U3RyZWFtKG1zZywgaW5mbykgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgLy9yZXR1cm4gQHt9XG4gICAgLy8gIG9uX2RhdGEoZGF0YSwgcGt0KSA6OlxuICAgIC8vICBvbl9lcnJvcihlcnIsIHBrdCkgOjpcblxuICBpbml0UmVwbHkodG9rZW4sIG1zZ19jdHgsIGtpbmQpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBtc2dfY3R4Lm1zX3RpbWVvdXRcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuX2J5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuX2J5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBtc190aW1lb3V0KSA6OlxuICAgIGNvbnN0IGFucyA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuX2J5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBpZiBtc190aW1lb3V0IDo6XG4gICAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgbXNfdGltZW91dClcbiAgICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgICAgIGZ1bmN0aW9uIHRpbWVvdXQoKSA6OiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcblxuICAgIHJldHVybiBzZW50ID0+IDo6XG4gICAgICBhbnMuc2VudCA9IHNlbnRcbiAgICAgIHJldHVybiBhbnNcblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dFxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBjb25zdHJ1Y3Rvcihmcm9tX2lkLCByZXNvbHZlUm91dGUpIDo6XG4gICAgaWYgbnVsbCAhPT0gZnJvbV9pZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGZyb21faWRcbiAgICAgIGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG5cbiAgICBjb25zdCBjdHggPSB7ZnJvbV9pZH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBfcm9vdF86IEA6IHZhbHVlOiB0aGlzXG4gICAgICBmcm9tX2lkOiBAOiB2YWx1ZTogZnJvbV9pZFxuICAgICAgY3R4OiBAOiB2YWx1ZTogY3R4XG4gICAgICByZXNvbHZlUm91dGU6IEA6IHZhbHVlOiByZXNvbHZlUm91dGVcblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG4gIHN0YXRpYyBmcm9tKGlkX3RhcmdldCwgaHViKSA6OlxuICAgIGNvbnN0IGZyb21faWQgPSBudWxsID09PSBpZF90YXJnZXQgPyBudWxsXG4gICAgICA6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgcmV0dXJuIG5ldyB0aGlzIEAgZnJvbV9pZCwgaHViLmJpbmRSb3V0ZURpc3BhdGNoKClcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuY2xvbmUoKS53aXRoIEAgLi4uYXJnc1xuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuY29kZWMoJ2NvbnRyb2wnLCB7dG9rZW59KS5pbnZva2UgQCAncGluZydcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5pbnZva2UgQCAnc2VuZCcsIC4uLmFyZ3NcbiAgc3RyZWFtKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLmludm9rZSBAICdzdHJlYW0nLCAuLi5hcmdzXG5cbiAgaW52b2tlKGtleSwgLi4uYXJncykgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgdGhpcy5hc3NlcnRNb25pdG9yKClcbiAgICBjb25zdCBjaGFuID0gdGhpcy5yZXNvbHZlUm91dGUob2JqLmlkX3JvdXRlcilcbiAgICBpZiB0cnVlICE9PSBvYmoudG9rZW4gOjpcbiAgICAgIHJldHVybiB0aGlzLl9jb2RlY1trZXldIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG5cbiAgICBlbHNlIDo6XG4gICAgICBjb25zdCB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcbiAgICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHRoaXMsIGtleSlcbiAgICAgIHJldHVybiByZXBseSBAIHRoaXMuX2NvZGVjW2tleV0gQCBjaGFuLCBvYmosIC4uLmFyZ3NcblxuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSB0Z3RcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgICAgICBjb250aW51ZVxuXG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gaWRfcm91dGVyIDo6XG4gICAgICAgICAgaWYgISBjdHguaWRfcm91dGVyIDo6XG4gICAgICAgICAgICAvLyBpbXBsaWNpdGx5IG9uIHRoZSBzYW1lIHJvdXRlclxuICAgICAgICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgICAgICBlbHNlIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IGlkX3RhcmdldFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IGlkX3JvdXRlciA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFzc2luZyAnaWRfcm91dGVyJyByZXF1aXJlcyAnaWRfdGFyZ2V0J2BcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IHJlcGx5X2lkLmlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIHJlc2V0KC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLl9yb290XywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG4gICAgcmV0dXJuIHRoaXNcblxuT2JqZWN0LmFzc2lnbiBAIE1zZ0N0eC5wcm90b3R5cGUsIEB7fVxuICBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCBpbml0X3Byb3RvY29sIGZyb20gJy4vcHJvdG9jb2wvaW5kZXguanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgb25fZXJyb3I6IGNvbnNvbGUuZXJyb3JcbiAgc3ViY2xhc3Moe1NpbmssIEVuZHBvaW50LCBTb3VyY2VFbmRwb2ludCwgcHJvdG9jb2xzfSkgOjpcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHJhbmRvbV9pZCwganNvbl9yZXZpdmVyLCBqc29uX3JlcGxhY2VyXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIHJldHVybiBAOiBvcmRlcjogMSwgc3ViY2xhc3MsIHBvc3RcbiAgXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3Qge3BhY2tldFBhcnNlcn0gPSBGYWJyaWNIdWJfUEkucHJvdG90eXBlXG4gICAgaWYgbnVsbD09cGFja2V0UGFyc2VyIHx8ICEgcGFja2V0UGFyc2VyLmlzUGFja2V0UGFyc2VyKCkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgSW52YWxpZCBwYWNrZXRQYXJzZXIgZm9yIHBsdWdpbmBcbiAgICBcbiAgICBGYWJyaWNIdWJfUEkucHJvdG90eXBlLmVuZHBvaW50ID1cbiAgICAgIGJpbmRFbmRwb2ludEFwaSBAIHBhY2tldFBhcnNlclxuXG4gIGZ1bmN0aW9uIHBvc3QoaHViKSA6OlxuICAgIHJldHVybiBodWIuZW5kcG9pbnQgPSBodWIuZW5kcG9pbnQoaHViKVxuXG4gIGZ1bmN0aW9uIGJpbmRFbmRwb2ludEFwaShwYWNrZXRQYXJzZXIpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gaW5pdF9wcm90b2NvbCBAIHBhY2tldFBhcnNlciwgQHt9IHJhbmRvbV9pZCwganNvbl9yZXZpdmVyLCBqc29uX3JlcGxhY2VyXG4gICAgY29uc3QgU2luayA9IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgY29uc3QgTXNnQ3R4ID0gTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgIGNvbnN0IEVuZHBvaW50ID0gRW5kcG9pbnRCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG5cbiAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOlxuICAgICAgU2luaywgRW5kcG9pbnQsIE1zZ0N0eCwgcHJvdG9jb2xzXG5cbiAgICByZXR1cm4gZnVuY3Rpb24oaHViKSA6OlxuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQDogY3JlYXRlOiBlbmRwb2ludCwgc2VydmVyOiBlbmRwb2ludCwgY2xpZW50XG5cbiAgICAgIGZ1bmN0aW9uIGNsaWVudCguLi5hcmdzKSA6OlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gTXNnQ3R4LmZyb20gQCBudWxsLCBodWJcbiAgICAgICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoXG4gICAgICAgICAgPyBtc2dfY3R4LndpdGgoLi4uYXJncykgOiBtc2dfY3R4XG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGlkX3RhcmdldCA9IHJhbmRvbV9pZCgpXG4gICAgICAgIGNvbnN0IG1zZ19jdHggPSBNc2dDdHguZnJvbSBAIGlkX3RhcmdldCwgaHViXG4gICAgICAgIGNvbnN0IGVwID0gbmV3IEVuZHBvaW50KG1zZ19jdHgpXG5cbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gb25faW5pdChlcClcbiAgICAgICAgY29uc3Qgb25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgdGFyZ2V0KS5iaW5kKHRhcmdldClcbiAgICAgICAgY29uc3Qgb25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0KVxuXG4gICAgICAgIFNpbmsucmVnaXN0ZXIgQCBlcCwgQHt9XG4gICAgICAgICAgaHViLCBpZF90YXJnZXQsIG9uX21zZywgb25fZXJyb3JcblxuICAgICAgICBpZiB0YXJnZXQub25fcmVhZHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUodGFyZ2V0KS50aGVuIEBcbiAgICAgICAgICAgIHRhcmdldCA9PiB0YXJnZXQub25fcmVhZHkoKVxuXG4gICAgICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgZW5kcG9pbnRfdGFyZ2V0X2FwaSwgQDpcbiAgICAgICAgICBpZF9yb3V0ZXI6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgICAgICAgaWRfdGFyZ2V0OiBAe30gZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IGlkX3RhcmdldFxuXG5jb25zdCBlbmRwb2ludF90YXJnZXRfYXBpID0gQDpcbiAgdmFsdWVPZigpIDo6IHJldHVybiAwIHwgdGhpcy5pZF90YXJnZXRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCBUYXJnZXQgJHt0aGlzLmlkX3RhcmdldH3Cu2BcblxuIiwiaW1wb3J0IHtyYW5kb21CeXRlc30gZnJvbSAnY3J5cHRvJ1xuaW1wb3J0IGVuZHBvaW50X3BsdWdpbiBmcm9tICcuL3BsdWdpbi5qc3knXG5cbmVuZHBvaW50X25vZGVqcy5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIHJldHVybiByYW5kb21CeXRlcyg0KS5yZWFkSW50MzJMRSgpXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGVuZHBvaW50X25vZGVqcyhwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iLCJpbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuY29uc3QgZ2V0UmFuZG9tVmFsdWVzID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiB3aW5kb3dcbiAgPyB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA6IG51bGxcblxuZW5kcG9pbnRfYnJvd3Nlci5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIGNvbnN0IGFyciA9IG5ldyBJbnQzMkFycmF5KDEpXG4gIGdldFJhbmRvbVZhbHVlcyhhcnIpXG4gIHJldHVybiBhcnJbMF1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfYnJvd3NlcihwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iXSwibmFtZXMiOlsibGl0dGxlX2VuZGlhbiIsImNfc2luZ2xlIiwiY19kYXRhZ3JhbSIsImNfZGlyZWN0IiwiY19tdWx0aXBhcnQiLCJjX3N0cmVhbWluZyIsIl9lcnJfbXNnaWRfcmVxdWlyZWQiLCJfZXJyX3Rva2VuX3JlcXVpcmVkIiwiZnJtX3JvdXRpbmciLCJzaXplIiwiYml0cyIsIm1hc2siLCJvYmoiLCJmcm9tX2lkIiwiZHYiLCJvZmZzZXQiLCJzZXRJbnQzMiIsImlkX3JvdXRlciIsImlkX3RhcmdldCIsInVuZGVmaW5lZCIsImdldEludDMyIiwiZnJtX3Jlc3BvbnNlIiwibXNnaWQiLCJFcnJvciIsInNldEludDE2Iiwic2VxX2FjayIsImFja19mbGFncyIsInRva2VuIiwiZ2V0SW50MTYiLCJmcm1fZGF0YWdyYW0iLCJ0cmFuc3BvcnQiLCJmcm1fZGlyZWN0IiwiZnJtX211bHRpcGFydCIsInNlcV9wb3MiLCJzZXEiLCJzZXFfZmxhZ3MiLCJmcm1fc3RyZWFtaW5nIiwiYmluZF9zZXFfbmV4dCIsInNlcV9vZmZzZXQiLCJzZXFfbmV4dCIsImZsYWdzIiwiZmluIiwiTmFOIiwiY29tcG9zZUZyYW1pbmdzIiwiZnJtX2Zyb20iLCJmcm1fcmVzcCIsImZybV90cmFuc3BvcnRzIiwibGVuZ3RoIiwiYnlCaXRzIiwidF9mcm9tIiwiZl90ZXN0IiwidF9yZXNwIiwidDAiLCJ0MSIsInQyIiwidDMiLCJtYXAiLCJmIiwidGVzdEJpdHMiLCJjaG9vc2UiLCJsc3QiLCJUIiwiYiIsIm9wIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwiZG9uZSIsInZhbHVlIiwicGFja2V0UGFyc2VyIiwiZnJhZ21lbnRfc2l6ZSIsImNvbmNhdEJ1ZmZlcnMiLCJwYWNrUGFja2V0T2JqIiwicGFja191dGY4IiwidW5wYWNrX3V0ZjgiLCJOdW1iZXIiLCJyYW5kb21faWQiLCJqc29uX3Jldml2ZXIiLCJqc29uX3JlcGxhY2VyIiwianNvbl9wYXJzZSIsImpzb25fc3RyaW5naWZ5IiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwidGV4dCIsIkpTT04iLCJwYXJzZSIsInN0cmluZ2lmeSIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwicmVzIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0Iiwib25fZXJyb3IiLCJlcnIiLCJjb25zb2xlIiwid2FybiIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImJvZHlfdXRmOCIsInJlY3ZTdHJlYW0iLCJmZWVkX3NlcSIsImZlZWRfYm9keSIsIm9uX2luaXQiLCJyZWN2TXNnIiwiZGF0YSIsIm9uX2RhdGEiLCJuZXh0X2hkciIsImkiLCJsYXN0SW5uZXIiLCJieXRlTGVuZ3RoIiwiaTAiLCJib2R5IiwiYmluZFRyYW5zcG9ydEltcGxzIiwiaW5ib3VuZCIsImhpZ2hiaXRzIiwidHJhbnNwb3J0cyIsIm91dGJvdW5kIiwiZnJhbWluZ3MiLCJmcmFtZSIsImltcGwiLCJ0X3JlY3YiLCJwYWNrX2hkciIsInJlY3ZfbXNnIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZGVmaW5lUHJvcGVydHkiLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtIiwic3RyZWFtaW5nIiwibW9kZSIsImJpbmRfc3RyZWFtIiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2J5dGVzIiwic2VuZCIsImNoYW4iLCJtc2VuZCIsInNlbnQiLCJzZW5kX2ltcGwiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0Iiwic3RhdGVGb3IiLCJib2R5X2J1ZiIsInBrdF9hc19uZGpzb24iLCJzcGxpdCIsImZpbHRlciIsImwiLCJiaW5hcnlfcHJvdG9jb2wiLCJhc0J1ZmZlciIsInBrdF9idWZmZXIiLCJjb250cm9sX3Byb3RvY29sIiwiaGlnaCIsInBpbmdfZnJhbWUiLCJwb25nX2ZyYW1lIiwicG9uZ190eXBlIiwicmVjdl9wb25nIiwicGluZ190eXBlIiwicmVjdl9waW5nIiwicGluZyIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJyZWdpc3RlciIsImVuZHBvaW50Iiwia3dfYXJncyIsImh1YiIsIm9uX21zZyIsInVucmVnaXN0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImVycm9yIiwiYXNzaWduIiwiYmluZFNpbmsiLCJpZkFic2VudCIsImVudHJ5IiwiYnlfbXNnaWQiLCJnZXQiLCJzZXQiLCJFbmRwb2ludCIsIm1zZ19jdHgiLCJ3aXRoRW5kcG9pbnQiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiY3JlYXRlUmVwbHlNYXAiLCJjcmVhdGVUcmFmZmljTWFwIiwiZW51bWVyYWJsZSIsInRvIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJfYnlfdG9rZW4iLCJieV90cmFmZmljIiwiX2J5X3RyYWZmaWMiLCJ0cmFmZmljIiwidHMiLCJub3ciLCJ0IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJyZXBseSIsInJlc29sdmUiLCJ0aGVuIiwiaW5pdFJlcGx5Iiwia2luZCIsImluaXRSZXBseVByb21pc2UiLCJtc190aW1lb3V0Iiwia2V5IiwibW9uaXRvciIsImFucyIsIlByb21pc2UiLCJyZWplY3QiLCJ0aWQiLCJzZXRUaW1lb3V0IiwidGltZW91dCIsInVucmVmIiwiUmVwbHlUaW1lb3V0IiwiT2JqZWN0IiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsInJlc29sdmVSb3V0ZSIsImZyZWV6ZSIsImN0eCIsImZyb20iLCJpZF9zZWxmIiwiYmluZFJvdXRlRGlzcGF0Y2giLCJhcmdzIiwiY2xvbmUiLCJ3aXRoIiwiY29kZWMiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwiX2NvZGVjIiwidGd0IiwicmVwbHlfaWQiLCJjcmVhdGUiLCJfcm9vdF8iLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJfbXNnQ29kZWNzIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiU291cmNlRW5kcG9pbnQiLCJwcm90b2NvbHMiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fZXJyb3IiLCJvcmRlciIsInN1YmNsYXNzIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJiaW5kRW5kcG9pbnRBcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJzZXJ2ZXIiLCJjbGllbnQiLCJlcCIsInRhcmdldCIsImJpbmQiLCJvbl9yZWFkeSIsImVuZHBvaW50X3RhcmdldF9hcGkiLCJlbmRwb2ludF9ub2RlanMiLCJyYW5kb21CeXRlcyIsInJlYWRJbnQzMkxFIiwiZW5kcG9pbnRfcGx1Z2luIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGFBQWEsVUFB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
