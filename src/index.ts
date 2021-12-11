import {
  Field,
  PublicKey,
  SmartContract,
  state,
  State,
  method,
  UInt64,
  Mina,
  shutdown,
  isReady,
  PrivateKey,
  Party,
  Poseidon,
  Signature,
  Circuit,
  Bool,
} from 'snarkyjs';

import { create, CID } from 'ipfs-http-client';

/**
 * StirThePickles
 */

export default class StirThePickles extends SmartContract {
  ownerAddr: PublicKey;
  @state(Field) ipfsWhiteList: State<Field>;
  @state(Field) indexOfNextUser: State<Field>;
  @state(Field) value: State<Field>;

  constructor(
    initialBalance: UInt64,
    address: PublicKey,
    ownerAddr: PublicKey
  ) {
    super(address);
    this.ownerAddr = ownerAddr;
    this.balance.addInPlace(initialBalance);
    this.ipfsWhiteList = State.init(Field.zero);
    this.indexOfNextUser = State.init(Field.zero);
    this.value = State.init(Field.zero);
  }

  @method async updateWhiteList(
    value: Field,
    owner: PublicKey,
    x: Field,
    signature: Signature,
    hashCID: Field
  ) {
    signature.verify(owner, [x]).assertEquals(true);
    owner.equals(this.ownerAddr).assertEquals(true);
    this.ipfsWhiteList.set(hashCID);
    this.value.set(value);
  }

  @method async deposit(
    pubkey: PublicKey,
    x: Field,
    signature: Signature,
    sendTo: PublicKey,
    cid: CID
  ) {
    //verify if the whitelist is set
    const whiteListCID = await this.ipfsWhiteList.get();
    whiteListCID.equals(Field.zero).assertEquals(false);
    //verify that owner of the pub key is sending the tx
    signature.verify(pubkey, [x]).assertEquals(true);
    // validate hash of the CID matches hash of CID provided by the owner
    const view = new DataView(cid.bytes.buffer);
    let uintOfCID = view.getUint32(0);
    Poseidon.hash([Field(uintOfCID)])
      .equals(whiteListCID)
      .assertEquals(true);
    // pull whitelist from ipfs
    let whiteList = [];
    const ipfs = create({ host: '127.0.0.1', port: 5002 });
    for await (const file of ipfs.cat(cid)) {
      console.log('return:');
      whiteList = JSON.parse(file.toString());
    }
    // get state of the counter, so the deposits can happen in order
    const stateIndex = await this.indexOfNextUser.get();
    let counter = 0;
    Circuit.asProver(() => {
      counter = parseInt(stateIndex.toString());
    });
    //bool workaround to validate if it's caller's time to deposit
    let isWhitelistedCheck = (
      JSON.stringify(whiteList[counter]) == JSON.stringify(pubkey.toJSON())
    ).valueOf();
    const isWhitelisted = Circuit.if(
      isWhitelistedCheck,
      new Bool(true),
      new Bool(false)
    );
    isWhitelisted.assertEquals(true);
    // substract agreed value

    let value = 0;
    const valueState = await this.value.get();
    Circuit.asProver(() => {
      value = parseInt(valueState.toString());
    });
    this.balance.addInPlace(UInt64.fromNumber(value));
  }
  @method async claim() {
    // const ipfs = create({ host: '127.0.0.1', port: 5002 });
    // for await (const file of ipfs.cat(cid)) {
    //   console.log('return:');
    //   console.log(JSON.parse(file.toString()));
    // }
  }
}

// export class Snapp extends SmartContract {
//   @state(Field) indexOfNextUser: State<Field>;

//   constructor(initialBalance: UInt64, address: PublicKey) {
//     super(address);
//     this.balance.addInPlace(initialBalance);
//     this.indexOfNextUser = State.init(Field(0));
//   }
//   @method async get() {
//     const hardIndex = Field(5);
//     console.log('hardIndex:', hardIndex.toString());
//     /// return '5'

//     const stateIndex = await this.indexOfNextUser.get();
//     console.log('stateIndex: ', stateIndex);
//     // ERROR :rejection
//   }
// }
// ===================================================================================================
// ===================================================================================================
// ===================================================================================================
export async function run() {
  await isReady;

  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  const account1 = Local.testAccounts[0].privateKey;
  const account2 = Local.testAccounts[1].privateKey;
  const account3 = Local.testAccounts[2].privateKey;
  const account4 = Local.testAccounts[3].privateKey;
  const account5 = Local.testAccounts[4].privateKey;

  const accountX = Local.testAccounts[5].privateKey;

  const snappPrivkey = PrivateKey.random();
  const snappPubkey = snappPrivkey.toPublicKey();

  let snappInstance: StirThePickles;
  let whiteListArray = [
    account2.toPublicKey(),
    account3.toPublicKey(),
    account4.toPublicKey(),
    account5.toPublicKey(),
  ];

  const ipfs = create({ host: '127.0.0.1', port: 5002 });

  let res = await ipfs.add(Buffer.from(JSON.stringify(whiteListArray)));

  let rawCID = res.cid;
  let stringCID = rawCID.toString();
  console.log('CID: ', stringCID);
  let whitelistCID1 = rawCID.bytes;
  const view = new DataView(whitelistCID1.buffer);
  let uintOfCID = view.getUint32(0);
  console.log('CID as decimal ', uintOfCID);
  // Deploys the snapp
  let depositAmount = 10;
  let value = Field(depositAmount);

  await Mina.transaction(account1, async () => {
    // account2 sends 1000000000 to the new snapp account
    const amount = UInt64.fromNumber(2000000000);
    const p = await Party.createSigned(account2);
    p.balance.subInPlace(amount);

    snappInstance = new StirThePickles(
      amount,
      snappPubkey,
      account1.toPublicKey()
    );
  })
    .send()
    .wait();
  // updates whitelist
  await Mina.transaction(account1, async () => {
    // 27 = 3^3
    const x = Field.zero;
    const signature = Signature.create(account1, [x]);
    await snappInstance.updateWhiteList(
      value,
      account1.toPublicKey(),
      x,
      signature,
      Poseidon.hash([Field(uintOfCID)])
    );
  })
    .send()
    .wait();

  await Mina.transaction(account2, async () => {
    // 27 = 3^3
    const x = Field.zero;
    const signature = Signature.create(account2, [x]);
    const p = await Party.createSigned(account2);
    p.balance.subInPlace(UInt64.fromNumber(depositAmount));

    await snappInstance.deposit(
      account2.toPublicKey(),
      x,
      signature,
      accountX.toPublicKey(),
      rawCID
    );
  })
    .send()
    .wait();

  const a = await Mina.getAccount(snappPubkey);

  // console.log('Exercise 1');
  console.log('final state value', a.snapp.appState[0].toString());
}

run();
shutdown();
