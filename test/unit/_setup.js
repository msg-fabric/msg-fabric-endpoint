export const sym_sampi = '\u03E0' // 'Ϡ'

var Hub
export { Hub }
export function _init(FabricHub) :: Hub = FabricHub

const chai = require('chai')

import chaiAsPromised from 'chai-as-promised'
chai.use @ chaiAsPromised

export const assert = chai.assert
export const expect = chai.expect

export const sleep = ms =>
  new Promise @ resolve =>
    setTimeout @ resolve, ms

export function newLog() ::
  const log = (...args) =>
    log.calls.push @ 1 === args.length
      ? args[0] : args

  log.calls = []
  log.expectOneLogOf = expectOneLogOf
  log.expectLastLogOf = expectLastLogOf
  return log

async function expectOneLogOf(...args) ::
  await sleep(1)
  expect(this.calls).to.have.lengthOf(1)
  expect(this.calls[0]).to.deep.equal(args)

async function expectLastLogOf(...args) ::
  await sleep(1)
  const last = this.calls[ this.calls.length - 1 ]
  expect @ last.slice(0, -1) // trim off body
  .to.deep.equal(args)

