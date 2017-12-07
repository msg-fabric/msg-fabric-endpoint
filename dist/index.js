'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var crypto = require('crypto');

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

class EPTarget {
  static forProtocols({}) {
    class EPTarget extends this {}
    return EPTarget;
  }

  constructor(id, msg_ctx) {
    const props = {
      id_router: { enumerable: true, value: id.id_router },
      id_target: { enumerable: true, value: id.id_target } };

    if (msg_ctx) {
      let fn;
      props.send = { get: () => fn || (fn = msg_ctx.to(this).send_json) };
    }

    return Object.defineProperties(this, props);
  }

  valueOf() {
    return 0 | this.id_target;
  }
  inspect() {
    return `«EPTarget ${this.ep_encode(this, true)}»`;
  }
  toJSON() {
    return this.ep_encode(this);
  }
  isEPTarget() {
    return true;
  }

  static json_as_reply(msg_ctx) {
    return obj => this.from_json(obj.from_id, msg_ctx);
  }
  static from_json(id, msg_ctx) {
    if (id) {
      return new this(id, msg_ctx);
    }
  }

  static jsonUnpack(msg_ctx, xformByKey) {
    xformByKey = Object.create(xformByKey || null);
    xformByKey[this.token] = v => this.from_json(this.ep_decode(v), msg_ctx);
    return this.jsonUnpackByKey(xformByKey);
  }

  static jsonUnpackByKey(xformByKey) {
    const reg = new WeakMap();
    return sz => JSON.parse(sz, reviver);

    function reviver(key, value) {
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
    }
  }
}

const token = '\u03E0'; // 'Ϡ'
EPTarget.token = token;

EPTarget.ep_encode = EPTarget.prototype.ep_encode = ep_encode;
function ep_encode(from_id, simple) {
  let { id_router: r, id_target: t } = from_id;
  r = (r >>> 0).toString(36);
  t = (t >>> 0).toString(36);
  return simple ? `${token} ${r}~${t}` : { [token]: `${r}~${t}` };
}

EPTarget.ep_decode = EPTarget.prototype.ep_decode = ep_decode;
function ep_decode(v) {
  const from_id = 'string' === typeof v ? v.split(token)[1] : v[token];
  if (!from_id) {
    return;
  }

  let [r, t] = from_id.split('~');
  if (undefined === t) {
    return;
  }
  r = 0 | parseInt(r, 36);
  t = 0 | parseInt(t, 36);

  return { id_router: r, id_target: t };
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
    return `«Endpoint ${ep_encode(this.from_id, true)}»`;
  }

  constructor(msg_ctx, ep_tgt) {
    msg_ctx = msg_ctx.withEndpoint(this);
    const asReply = ep_tgt.constructor.json_as_reply(msg_ctx);
    Object.defineProperties(this, {
      from_id: { value: msg_ctx.from_id, enumerable: true },
      toJSON: { value() {
          return ep_tgt.toJSON();
        } },
      to: { value: msg_ctx.to },
      asReply: { value: asReply } });
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
    return { msg, info, reply: this.asReply(info) };
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
  }initReply(token, msg_ctx) {
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

  inspect() {
    const ctx = Object.assign({}, this.ctx);
    ctx.from = ep_encode(ctx.from_id, true);
    ctx.to = ep_encode(ctx, true);
    delete ctx.from_id;delete ctx.id_router;delete ctx.id_target;
    return `«MsgCtx ${JSON.stringify(ctx)}»`;
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
    return this._invoke_ex(this._msgCodecs.control.ping, [], token);
  }
  send(...args) {
    return this._invoke_ex(this._codec.send, args);
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
    if (undefined === token) {
      token = obj.token;
    }

    this.assertMonitor();
    const chan = this.resolveRoute(obj.id_router);
    if (true !== token) {
      obj.token = token;
      return invoke(chan, obj, ...args);
    } else {
      token = obj.token = this.random_id();
      const reply = this.endpoint.initReply(token, this);
      return reply(invoke(chan, obj, ...args));
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

    // bind send_json as frequently used fast-path
    const json_send = msgCodecs.json.send;
    Object.defineProperties(this.prototype, {
      send_json: { get() {
          return (...args) => this._invoke_ex(json_send, args);
        } } });

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

  subclass({ Endpoint: Endpoint$$1, EPTarget: EPTarget$$1, Sink: Sink$$1, MsgCtx: MsgCtx$$1, protocols }) {},

  json_pack: JSON.stringify };

var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    random_id, json_pack,
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
    const protocols = init_protocol(packetParser, { random_id, json_pack });
    const Sink$$1 = Sink.forProtocols(protocols);
    const MsgCtx$$1 = MsgCtx.forProtocols(protocols);
    const Endpoint$$1 = Endpoint.forProtocols(protocols);
    const EPTarget$$1 = EPTarget.forProtocols(protocols);

    plugin_options.subclass({
      Endpoint: Endpoint$$1, EPTarget: EPTarget$$1, Sink: Sink$$1, MsgCtx: MsgCtx$$1, protocols });

    return function (hub) {
      return Object.assign(endpoint, { create, server: endpoint, client });

      function client(...args) {
        const msg_ctx = MsgCtx$$1.from(null, hub);
        return 0 !== args.length ? msg_ctx.with(...args) : msg_ctx;
      }

      function endpoint(on_init) {
        const targets = hub.router.targets;
        do var id_target = random_id(); while (targets.has(id_target));
        return create(id_target, on_init);
      }

      function create(id_target, on_init) {
        const msg_ctx = MsgCtx$$1.from(id_target, hub);
        const ep_tgt = new EPTarget$$1(msg_ctx.from_id);
        const ep = new Endpoint$$1(msg_ctx, ep_tgt);

        const target = on_init(ep, hub);
        const on_msg = (target.on_msg || target).bind(target);
        const on_error = (target.on_error || default_on_error).bind(target);
        const on_shutdown = (target.on_shutdown || default_on_shutdown).bind(target);

        const json_unpack = target.json_unpack ? target.json_unpack.bind(target) : EPTarget$$1.jsonUnpack(msg_ctx);

        const sink = new Sink$$1(json_unpack);
        sink.register(ep, hub, id_target, { on_msg, on_error, on_shutdown });

        let ready = Promise.resolve(target);
        if (target.on_ready) {
          ready = ready.then(target => target.on_ready());
        }

        return Object.defineProperties(ep_tgt, {
          ready: { value: ready.then(() => ep_tgt) } });
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

exports.endpoint_nodejs = endpoint_nodejs;
exports.endpoint_browser = endpoint_browser;
exports['default'] = endpoint_plugin;
exports.endpoint = endpoint_plugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9zaW5rLmpzeSIsIi4uL2NvZGUvZXBfdGFyZ2V0LmpzeSIsIi4uL2NvZGUvZW5kcG9pbnQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5ub2RlanMuanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIEB7fSBzZW50OiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gQHt9IHNlbnQ6IGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBsZXQgcmVzXG4gICAgICAgIGZvciBjb25zdCBvYmogb2YgcGFja2V0RnJhZ21lbnRzIEAgYm9keSwgbmV4dCwgZmluIDo6XG4gICAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICAgIHJlcyA9IGF3YWl0IGNoYW4gQCBwa3RcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiByZXNcblxuICAgIGZ1bmN0aW9uIG1zZW5kX29iamVjdHMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGNvbnN0IG9iaiA9IG5leHQoe2Zpbn0pXG4gICAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gYmluZF9zdHJlYW0obW9kZSkgOjpcbiAgICAgIGNvbnN0IG1zZW5kX2ltcGwgPSB7b2JqZWN0OiBtc2VuZF9vYmplY3RzLCBieXRlczogbXNlbmRfYnl0ZXN9W21vZGVdXG4gICAgICBpZiBtc2VuZF9pbXBsIDo6IHJldHVybiBzdHJlYW1cblxuICAgICAgZnVuY3Rpb24gc3RyZWFtKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ3N0cmVhbWluZydcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9pbXBsIEAgY2hhbiwgb2JqLCBqc29uX3BhY2sobXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSB3cml0ZS5iaW5kKHRydWUpXG4gICAgICAgIHJldHVybiB3cml0ZVxuXG4gICAgICAgIGZ1bmN0aW9uIHdyaXRlKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgdHJ1ZT09PXRoaXMsIHBhY2tCb2R5KGNodW5rKVxuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuXG5mdW5jdGlvbiBjaGVja19mbnMob2JqLCAuLi5rZXlzKSA6OlxuICBmb3IgY29uc3Qga2V5IG9mIGtleXMgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb2JqW2tleV0gOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgXCIke2tleX1cIiB0byBiZSBhIGZ1bmN0aW9uYFxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwganNvbl9wYWNrfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5XG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKSB8fCB1bmRlZmluZWRcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBib2R5X2J1ZiA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGJvZHlfYnVmIDo6XG4gICAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHVucGFja191dGY4KGJvZHlfYnVmKSB8fCB1bmRlZmluZWRcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ29iamVjdCdcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIHJldHVybiBzdGF0ZS5mZWVkKHBrdCwgdW5wYWNrQm9keSlcblxuICBmdW5jdGlvbiBwYWNrQm9keShib2R5KSA6OlxuICAgIHJldHVybiBwYWNrX3V0ZjggQCBqc29uX3BhY2soYm9keSlcblxuICBmdW5jdGlvbiB1bnBhY2tCb2R5KHBrdCwgc2luaykgOjpcbiAgICByZXR1cm4gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYmluYXJ5X3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIGNvbnN0IHthc0J1ZmZlcn0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keTogYXNCdWZmZXJcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBwa3QuYm9keV9idWZmZXIoKVxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnYnl0ZXMnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdCwgcGt0X2J1ZmZlcilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbmZ1bmN0aW9uIHBrdF9idWZmZXIocGt0KSA6OiByZXR1cm4gcGt0LmJvZHlfYnVmZmVyKClcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNvbnRyb2xfcHJvdG9jb2woaW5ib3VuZCwgaGlnaCwgc2hhcmVkKSA6OlxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja1BhY2tldE9ian0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgY29uc3QgcGluZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCB0b2tlbjogdHJ1ZSwgdHJhbnNwb3J0OiAnZGlyZWN0J1xuICBjb25zdCBwb25nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIG1zZ2lkOiB0cnVlLCB0cmFuc3BvcnQ6ICdkYXRhZ3JhbSdcblxuICBjb25zdCBwb25nX3R5cGUgPSBoaWdofDB4ZVxuICBpbmJvdW5kW3BvbmdfdHlwZV0gPSByZWN2X3BvbmdcbiAgY29uc3QgcGluZ190eXBlID0gaGlnaHwweGZcbiAgaW5ib3VuZFtoaWdofDB4Zl0gPSByZWN2X3BpbmdcblxuICByZXR1cm4gQHt9IHNlbmQ6cGluZywgcGluZ1xuXG4gIGZ1bmN0aW9uIHBpbmcoY2hhbiwgb2JqKSA6OlxuICAgIGlmICEgb2JqLnRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgIG9iai5ib2R5ID0gSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgIG9wOiAncGluZycsIHRzMDogbmV3IERhdGUoKVxuICAgIHBpbmdfZnJhbWUucGFjayhwaW5nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICBmdW5jdGlvbiByZWN2X3BpbmcocGt0LCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgcGluZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgX3NlbmRfcG9uZyBAIHBrdC5ib2R5LCBwa3QsIHNpbmssIHJvdXRlclxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuICBmdW5jdGlvbiBfc2VuZF9wb25nKHt0czB9LCBwa3RfcGluZywgc2luaywgcm91dGVyKSA6OlxuICAgIGNvbnN0IHttc2dpZCwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXR9ID0gcl9pZFxuICAgIGNvbnN0IG9iaiA9IEB7fSBpZF9yb3V0ZXIsIGlkX3RhcmdldFxuICAgICAgZnJvbV9pZDogc2luay5mcm9tX2lkLCBtc2dpZFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICBjb25zdHJ1Y3Rvcihqc29uX3VucGFjaykgOjpcbiAgICB0aGlzLmpzb25fdW5wYWNrID0ganNvbl91bnBhY2tcblxuICByZWdpc3RlcihlbmRwb2ludCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzKSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCB1bnJlZ2lzdGVyLCBoYW5kbGVyc1xuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgdW5yZWdpc3Rlciwge29uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3dufSkgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVyciwgZXh0cmEpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIG9uX3NodXRkb3duKGVyciwgZXh0cmEpXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3QsIHpvbmU6ICdwa3QudHlwZSdcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGVyciwgQHt9IHBrdCwgem9uZTogJ3Byb3RvY29sJ1xuXG4gICAgICBpZiBmYWxzZSA9PT0gYWxpdmUgOjpcbiAgICAgICAgcmV0dXJuIGZhbHNlIC8vIGNoYW5nZSB3aGlsZSBhd2FpdGluZyBhYm92ZeKAplxuICAgICAgdHJ5IDo6XG4gICAgICAgIHJldHVybiBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHRyeSA6OlxuICAgICAgICAgIHZhciB0ZXJtaW5hdGUgPSBvbl9lcnJvciBAIGVyciwgQHt9IG1zZywgcGt0LCB6b25lOiAnZGlzcGF0Y2gnXG4gICAgICAgIGZpbmFsbHkgOjpcbiAgICAgICAgICBpZiBmYWxzZSAhPT0gdGVybWluYXRlIDo6XG4gICAgICAgICAgICBzaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG4gICAgICAgICAgICByZXR1cm4gZmFsc2UgLy8gc2lnbmFsIHVucmVnaXN0ZXIgdG8gbXNnLWZhYnJpYy1jb3JlL3JvdXRlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBFUFRhcmdldCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHt9KSA6OlxuICAgIGNsYXNzIEVQVGFyZ2V0IGV4dGVuZHMgdGhpcyA6OlxuICAgIHJldHVybiBFUFRhcmdldFxuXG4gIGNvbnN0cnVjdG9yKGlkLCBtc2dfY3R4KSA6OlxuICAgIGNvbnN0IHByb3BzID0gQHt9XG4gICAgICBpZF9yb3V0ZXI6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWQuaWRfcm91dGVyXG4gICAgICBpZF90YXJnZXQ6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWQuaWRfdGFyZ2V0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICBsZXQgZm5cbiAgICAgIHByb3BzLnNlbmQgPSBAe30gZ2V0OiAoKSA9PlxuICAgICAgICBmbiB8fCBAIGZuID0gbXNnX2N0eC50byh0aGlzKS5zZW5kX2pzb25cblxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIHByb3BzXG5cblxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIDAgfCB0aGlzLmlkX3RhcmdldFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VQVGFyZ2V0ICR7dGhpcy5lcF9lbmNvZGUodGhpcywgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVwX2VuY29kZSh0aGlzKVxuICBpc0VQVGFyZ2V0KCkgOjogcmV0dXJuIHRydWVcblxuICBzdGF0aWMganNvbl9hc19yZXBseShtc2dfY3R4KSA6OlxuICAgIHJldHVybiBvYmogPT4gdGhpcy5mcm9tX2pzb24ob2JqLmZyb21faWQsIG1zZ19jdHgpXG4gIHN0YXRpYyBmcm9tX2pzb24oaWQsIG1zZ19jdHgpIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIG5ldyB0aGlzKGlkLCBtc2dfY3R4KVxuXG4gIHN0YXRpYyBqc29uVW5wYWNrKG1zZ19jdHgsIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdGhpcy50b2tlbl0gPSB2ID0+XG4gICAgICB0aGlzLmZyb21fanNvbiBAIHRoaXMuZXBfZGVjb2RlKHYpLCBtc2dfY3R4XG4gICAgcmV0dXJuIHRoaXMuanNvblVucGFja0J5S2V5KHhmb3JtQnlLZXkpXG5cbiAgc3RhdGljIGpzb25VbnBhY2tCeUtleSh4Zm9ybUJ5S2V5KSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gc3ogPT4gSlNPTi5wYXJzZSBAIHN6LCByZXZpdmVyXG5cbiAgICBmdW5jdGlvbiByZXZpdmVyKGtleSwgdmFsdWUpIDo6XG4gICAgICBjb25zdCB4Zm4gPSB4Zm9ybUJ5S2V5W2tleV1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0geGZuIDo6XG4gICAgICAgIHJlZy5zZXQodGhpcywgeGZuKVxuICAgICAgICByZXR1cm4gdmFsdWVcblxuICAgICAgaWYgJ29iamVjdCcgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICBjb25zdCB2Zm4gPSByZWcuZ2V0KHZhbHVlKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHZmbiA6OlxuICAgICAgICAgIHJldHVybiB2Zm4gQCB2YWx1ZVxuICAgICAgcmV0dXJuIHZhbHVlXG5cblxuY29uc3QgdG9rZW4gPSAnXFx1MDNFMCcgLy8gJ8+gJ1xuRVBUYXJnZXQudG9rZW4gPSB0b2tlblxuXG5FUFRhcmdldC5lcF9lbmNvZGUgPSBFUFRhcmdldC5wcm90b3R5cGUuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGZyb21faWQsIHNpbXBsZSkgOjpcbiAgbGV0IHtpZF9yb3V0ZXI6ciwgaWRfdGFyZ2V0OnR9ID0gZnJvbV9pZFxuICByID0gKHI+Pj4wKS50b1N0cmluZygzNilcbiAgdCA9ICh0Pj4+MCkudG9TdHJpbmcoMzYpXG4gIHJldHVybiBzaW1wbGVcbiAgICA/IGAke3Rva2VufSAke3J9fiR7dH1gXG4gICAgOiBAe30gW3Rva2VuXTogYCR7cn1+JHt0fWBcblxuXG5FUFRhcmdldC5lcF9kZWNvZGUgPSBFUFRhcmdldC5wcm90b3R5cGUuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGZyb21faWQgPSAnc3RyaW5nJyA9PT0gdHlwZW9mIHZcbiAgICA/IHYuc3BsaXQodG9rZW4pWzFdXG4gICAgOiB2W3Rva2VuXVxuICBpZiAhIGZyb21faWQgOjogcmV0dXJuXG5cbiAgbGV0IFtyLHRdID0gZnJvbV9pZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cbiIsImltcG9ydCB7ZXBfZW5jb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe30pIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmZyb21faWRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmZyb21faWQsIHRydWUpfcK7YFxuXG4gIGNvbnN0cnVjdG9yKG1zZ19jdHgsIGVwX3RndCkgOjpcbiAgICBtc2dfY3R4ID0gbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcylcbiAgICBjb25zdCBhc1JlcGx5ID0gZXBfdGd0LmNvbnN0cnVjdG9yLmpzb25fYXNfcmVwbHkobXNnX2N0eClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBmcm9tX2lkOiBAe30gdmFsdWU6IG1zZ19jdHguZnJvbV9pZCwgZW51bWVyYWJsZTogdHJ1ZVxuICAgICAgdG9KU09OOiBAe30gdmFsdWUoKSA6OiByZXR1cm4gZXBfdGd0LnRvSlNPTigpXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG4gICAgICBhc1JlcGx5OiBAe30gdmFsdWU6IGFzUmVwbHlcblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgZnJvbV9pZDogdGhpcy5mcm9tX2lkXG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZSh7cm1zZywgbXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8pIDo6XG4gIHJlY3ZNc2cobXNnLCBpbmZvKSA6OlxuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCByZXBseTogdGhpcy5hc1JlcGx5KGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvKSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogcmV0dXJuIHRoaXMucGFydHMuam9pbignJylcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBtc2dfY3R4KSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgbXNnX2N0eC5tc190aW1lb3V0XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLmJ5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIG1zX3RpbWVvdXQpIDo6XG4gICAgY29uc3QgYW5zID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgaWYgbXNfdGltZW91dCA6OlxuICAgICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIG1zX3RpbWVvdXQpXG4gICAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgICAgICBmdW5jdGlvbiB0aW1lb3V0KCkgOjogcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG5cbiAgICByZXR1cm4gc2VudCA9PiA6OlxuICAgICAgYW5zLnNlbnQgPSBzZW50XG4gICAgICByZXR1cm4gYW5zXG5cblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dFxuXG4iLCJpbXBvcnQge2VwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIGluc3BlY3QoKSA6OlxuICAgIGNvbnN0IGN0eCA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuY3R4KVxuICAgIGN0eC5mcm9tID0gZXBfZW5jb2RlKGN0eC5mcm9tX2lkLCB0cnVlKVxuICAgIGN0eC50byA9IGVwX2VuY29kZShjdHgsIHRydWUpXG4gICAgZGVsZXRlIGN0eC5mcm9tX2lkOyBkZWxldGUgY3R4LmlkX3JvdXRlcjsgZGVsZXRlIGN0eC5pZF90YXJnZXRcbiAgICByZXR1cm4gYMKrTXNnQ3R4ICR7SlNPTi5zdHJpbmdpZnkoY3R4KX3Cu2BcblxuICBjb25zdHJ1Y3Rvcihmcm9tX2lkLCByZXNvbHZlUm91dGUpIDo6XG4gICAgaWYgbnVsbCAhPT0gZnJvbV9pZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGZyb21faWRcbiAgICAgIGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG5cbiAgICBjb25zdCBjdHggPSB7ZnJvbV9pZH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBfcm9vdF86IEA6IHZhbHVlOiB0aGlzXG4gICAgICBmcm9tX2lkOiBAOiB2YWx1ZTogZnJvbV9pZFxuICAgICAgY3R4OiBAOiB2YWx1ZTogY3R4XG4gICAgICByZXNvbHZlUm91dGU6IEA6IHZhbHVlOiByZXNvbHZlUm91dGVcblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG4gIHN0YXRpYyBmcm9tKGlkX3RhcmdldCwgaHViKSA6OlxuICAgIGNvbnN0IGZyb21faWQgPSBudWxsID09PSBpZF90YXJnZXQgPyBudWxsXG4gICAgICA6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgcmV0dXJuIG5ldyB0aGlzIEAgZnJvbV9pZCwgaHViLmJpbmRSb3V0ZURpc3BhdGNoKClcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuY2xvbmUoKS53aXRoIEAgLi4uYXJnc1xuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlblxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zZW5kLCBhcmdzXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiB1bmRlZmluZWQgPT09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZShvYmouaWRfcm91dGVyKVxuICAgIGlmIHRydWUgIT09IHRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSB0b2tlblxuICAgICAgcmV0dXJuIGludm9rZSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG4gICAgZWxzZSA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG4gICAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCB0aGlzKVxuICAgICAgcmV0dXJuIHJlcGx5IEAgaW52b2tlIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG5cblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY29udGludWVcblxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IGlkX3JvdXRlciA6OlxuICAgICAgICAgIGlmICEgY3R4LmlkX3JvdXRlciA6OlxuICAgICAgICAgICAgLy8gaW1wbGljaXRseSBvbiB0aGUgc2FtZSByb3V0ZXJcbiAgICAgICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgZWxzZSBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhc3NpbmcgJ2lkX3JvdXRlcicgcmVxdWlyZXMgJ2lkX3RhcmdldCdgXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICByZXNldCguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcy5fcm9vdF8sIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBzZW5kX2pzb24gYXMgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IGpzb25fc2VuZCA9IG1zZ0NvZGVjcy5qc29uLnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgc2VuZF9qc29uOiBAe30gZ2V0KCkgOjpcbiAgICAgICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXggQCBqc29uX3NlbmQsIGFyZ3NcblxuICAgIHJldHVybiB0aGlzXG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQgaW5pdF9wcm90b2NvbCBmcm9tICcuL3Byb3RvY29sL2luZGV4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5pbXBvcnQgRVBUYXJnZXRCYXNlIGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgb25fZXJyb3IoZXJyLCB7bXNnLCBwa3R9KSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgRVJST1I6JywgZXJyLCBAe30gbXNnLCBwa3RcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVyciwge21zZywgcGt0fSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIFNIVVRET1dOOicgKyBlcnJcblxuICBzdWJjbGFzcyh7RW5kcG9pbnQsIEVQVGFyZ2V0LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc30pIDo6XG5cbiAganNvbl9wYWNrOiBKU09OLnN0cmluZ2lmeVxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZS5lbmRwb2ludCA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViLmVuZHBvaW50ID0gaHViLmVuZHBvaW50KGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuICAgIGNvbnN0IFNpbmsgPSBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBFbmRwb2ludCA9IEVuZHBvaW50QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgIGNvbnN0IEVQVGFyZ2V0ID0gRVBUYXJnZXRCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG5cbiAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOlxuICAgICAgRW5kcG9pbnQsIEVQVGFyZ2V0LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEA6IGNyZWF0ZSwgc2VydmVyOiBlbmRwb2ludCwgY2xpZW50XG5cbiAgICAgIGZ1bmN0aW9uIGNsaWVudCguLi5hcmdzKSA6OlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gTXNnQ3R4LmZyb20gQCBudWxsLCBodWJcbiAgICAgICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoXG4gICAgICAgICAgPyBtc2dfY3R4LndpdGgoLi4uYXJncykgOiBtc2dfY3R4XG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBodWIucm91dGVyLnRhcmdldHNcbiAgICAgICAgZG8gdmFyIGlkX3RhcmdldCA9IHJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgaWRfdGFyZ2V0LCBodWJcbiAgICAgICAgY29uc3QgZXBfdGd0ID0gbmV3IEVQVGFyZ2V0KG1zZ19jdHguZnJvbV9pZClcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eCwgZXBfdGd0KVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IG9uX2luaXQoZXAsIGh1YilcbiAgICAgICAgY29uc3Qgb25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgdGFyZ2V0KS5iaW5kKHRhcmdldClcbiAgICAgICAgY29uc3Qgb25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0KVxuICAgICAgICBjb25zdCBvbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQpXG5cbiAgICAgICAgY29uc3QganNvbl91bnBhY2sgPSB0YXJnZXQuanNvbl91bnBhY2tcbiAgICAgICAgICA/IHRhcmdldC5qc29uX3VucGFjay5iaW5kKHRhcmdldClcbiAgICAgICAgICA6IEVQVGFyZ2V0Lmpzb25VbnBhY2sobXNnX2N0eClcblxuICAgICAgICBjb25zdCBzaW5rID0gbmV3IFNpbmsgQCBqc29uX3VucGFja1xuICAgICAgICBzaW5rLnJlZ2lzdGVyIEAgZXAsIGh1YiwgaWRfdGFyZ2V0LFxuICAgICAgICAgIEB7fSBvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93blxuXG4gICAgICAgIGxldCByZWFkeSA9IFByb21pc2UucmVzb2x2ZSh0YXJnZXQpXG4gICAgICAgIGlmIHRhcmdldC5vbl9yZWFkeSA6OlxuICAgICAgICAgIHJlYWR5ID0gcmVhZHkudGhlbiBAIHRhcmdldCA9PiB0YXJnZXQub25fcmVhZHkoKVxuXG4gICAgICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICAgICAgcmVhZHk6IEB7fSB2YWx1ZTogcmVhZHkudGhlbiBAICgpID0+IGVwX3RndFxuXG4iLCJpbXBvcnQge3JhbmRvbUJ5dGVzfSBmcm9tICdjcnlwdG8nXG5pbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuZW5kcG9pbnRfbm9kZWpzLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgcmV0dXJuIHJhbmRvbUJ5dGVzKDQpLnJlYWRJbnQzMkxFKClcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfbm9kZWpzKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiIsImltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5jb25zdCBnZXRSYW5kb21WYWx1ZXMgPSAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHdpbmRvd1xuICA/IHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzIDogbnVsbFxuXG5lbmRwb2ludF9icm93c2VyLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgY29uc3QgYXJyID0gbmV3IEludDMyQXJyYXkoMSlcbiAgZ2V0UmFuZG9tVmFsdWVzKGFycilcbiAgcmV0dXJuIGFyclswXVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9icm93c2VyKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwidW5kZWZpbmVkIiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJsZW5ndGgiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwib3AiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJkb25lIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZXMiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwiYmluZCIsImVyciIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5Iiwib25faW5pdCIsImRhdGEiLCJvbl9kYXRhIiwib25fZW5kIiwiZmVlZF9zZXEiLCJuZXh0X2hkciIsImkiLCJsYXN0SW5uZXIiLCJieXRlTGVuZ3RoIiwiaTAiLCJib2R5IiwiYmluZFRyYW5zcG9ydEltcGxzIiwiaW5ib3VuZCIsImhpZ2hiaXRzIiwidHJhbnNwb3J0cyIsIm91dGJvdW5kIiwiZnJhbWluZ3MiLCJmcmFtZSIsImltcGwiLCJ0X3JlY3YiLCJwYWNrX2hkciIsInJlY3ZfbXNnIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZGVmaW5lUHJvcGVydHkiLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic2VuZCIsInN0cmVhbSIsImJpbmRfc3RyZWFtIiwibW9kZSIsImNoYW4iLCJtc2VuZCIsIm1zZW5kX2J5dGVzIiwic2VudCIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJlbmRwb2ludCIsImh1YiIsImhhbmRsZXJzIiwidW5yZWdpc3RlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJvbl9tc2ciLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJleHRyYSIsImFzc2lnbiIsImJpbmRTaW5rIiwiem9uZSIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsImdldCIsInNldCIsImRlbGV0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJtc2dfY3R4IiwicHJvcHMiLCJlbnVtZXJhYmxlIiwiZm4iLCJ0byIsInNlbmRfanNvbiIsIk9iamVjdCIsImRlZmluZVByb3BlcnRpZXMiLCJlcF9lbmNvZGUiLCJqc29uX2FzX3JlcGx5IiwiZnJvbV9qc29uIiwianNvblVucGFjayIsInhmb3JtQnlLZXkiLCJjcmVhdGUiLCJ2IiwiZXBfZGVjb2RlIiwianNvblVucGFja0J5S2V5IiwicmVnIiwiV2Vha01hcCIsInN6IiwicGFyc2UiLCJyZXZpdmVyIiwieGZuIiwidmZuIiwic2ltcGxlIiwiciIsInQiLCJ0b1N0cmluZyIsInNwbGl0IiwicGFyc2VJbnQiLCJFbmRwb2ludCIsImVwX3RndCIsIndpdGhFbmRwb2ludCIsImFzUmVwbHkiLCJjb25zdHJ1Y3RvciIsInRvSlNPTiIsIk1hcCIsImNyZWF0ZU1hcCIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIm5vdyIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJybXNnIiwicmVwbHkiLCJyZXNvbHZlIiwidGhlbiIsIndhcm4iLCJpbml0UmVwbHkiLCJpbml0UmVwbHlQcm9taXNlIiwibXNfdGltZW91dCIsIm1vbml0b3IiLCJhbnMiLCJQcm9taXNlIiwicmVqZWN0IiwidGlkIiwic2V0VGltZW91dCIsInRpbWVvdXQiLCJ1bnJlZiIsIlJlcGx5VGltZW91dCIsIk1zZ0N0eCIsIndpdGhDb2RlY3MiLCJjdHgiLCJmcm9tIiwicmVzb2x2ZVJvdXRlIiwiZnJlZXplIiwiaWRfc2VsZiIsImJpbmRSb3V0ZURpc3BhdGNoIiwiYXJncyIsImNsb25lIiwid2l0aCIsIl9pbnZva2VfZXgiLCJfbXNnQ29kZWNzIiwiX2NvZGVjIiwiZm5PcktleSIsImludm9rZSIsImFzc2VydE1vbml0b3IiLCJ0Z3QiLCJyZXBseV9pZCIsIl9yb290XyIsImNoZWNrTW9uaXRvciIsImFjdGl2ZSIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwidGQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJqc29uX3NlbmQiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiZXJyb3IiLCJwcm90b2NvbHMiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwib3JkZXIiLCJzdWJjbGFzcyIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwiYmluZEVuZHBvaW50QXBpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiRVBUYXJnZXRCYXNlIiwic2VydmVyIiwiY2xpZW50IiwidGFyZ2V0cyIsImhhcyIsImVwIiwidGFyZ2V0IiwicmVnaXN0ZXIiLCJyZWFkeSIsIm9uX3JlYWR5IiwiZW5kcG9pbnRfbm9kZWpzIiwicmFuZG9tQnl0ZXMiLCJyZWFkSW50MzJMRSIsImVuZHBvaW50X3BsdWdpbiIsImdldFJhbmRvbVZhbHVlcyIsIndpbmRvdyIsImNyeXB0byIsImVuZHBvaW50X2Jyb3dzZXIiLCJhcnIiLCJJbnQzMkFycmF5Il0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxNQUFNQSxnQkFBZ0IsSUFBdEI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsYUFBYSxVQUFu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
