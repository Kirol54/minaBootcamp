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
  DataStore,
  MerkleProofFactory,
} from 'snarkyjs';

import { create, CID } from 'ipfs-http-client';

/**
 * JarOfPickles
 */

export default class JarOfPickles extends SmartContract {
  ownerAddr: PublicKey;
  @state(Field) ipfsWhiteList: State<Field>;
  @state(Field) indexOfNextUser: State<Field>;
  @state(Field) value: State<Field>;
  @state(Bool) isClaimable: State<Bool>;

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
    this.isClaimable = State.init(Bool(false));
  }

  @method async updateWhiteList(
    value: Field,
    owner: PublicKey,
    x: Field,
    signature: Signature,
    hashCID: Field
  ) {
    //verify that owner of the pub key is sending the tx
    signature.verify(owner, [x]).assertEquals(true);
    //verify that caller is owner
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
    // verify if the whitelist is set
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

    // If I'd know how to use this:
    // DataStore.IPFS(Field.zero, ipfsHash);
    // pull whitelist from ipfs
    let whiteList = [];
    const ipfs = create({ host: '127.0.0.1', port: 5002 });
    for await (const file of ipfs.cat(cid)) {
      whiteList = JSON.parse(file.toString());
    }
    // get state of the counter, so the deposits can happen in order
    const stateIndex = await this.indexOfNextUser.get();
    let counter = 0;
    Circuit.asProver(() => {
      counter = parseInt(stateIndex.toString());
    });
    stateIndex.assertLte(whiteList.length);

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

    //increase the counter
    this.indexOfNextUser.set(stateIndex.add(1));

    // save sendTo into merkle tree

    // add nodes to ipfs
    // await ipfs.add(Buffer.from(JSON.stringify(MerkleNodes)));

    //unlock if the last user deposited
    const shouldUnlock = Circuit.if(
      (counter == whiteList.length - 1).valueOf(),
      new Bool(true),
      new Bool(false)
    );

    this.isClaimable.set(shouldUnlock);
    this.balance.addInPlace(await this.GetValue());
  }
  @method async claim(pubkey: PublicKey, x: Field, signature: Signature) {
    // make sure if it's claimable
    const isClaimable = await this.isClaimable.get();
    isClaimable.assertEquals(true);
    //verify that owner of the pub key is sending the tx
    signature.verify(pubkey, [x]).assertEquals(true);

    //verify that the account is in the merkle leaf
    // get nodes from ipfs
    // const ipfs = create({ host: '127.0.0.1', port: 5002 });
    // for await (const file of ipfs.cat(cid)) {
    //   whiteList = JSON.parse(file.toString());
    // }
    this.balance.subInPlace(await this.GetValue());
  }

  async GetValue(): Promise<UInt64> {
    let value = 0;
    const valueState = await this.value.get();
    Circuit.asProver(() => {
      value = parseInt(valueState.toString());
    });
    return UInt64.fromNumber(value);
  }
}

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

  let snappInstance: JarOfPickles;
  //deploy the snapp
  await Mina.transaction(account1, async () => {
    // account2 sends 1000000000 to the new snapp account
    const amount = UInt64.fromNumber(2001000000);
    const p = await Party.createSigned(account2);
    p.balance.subInPlace(amount);

    snappInstance = new JarOfPickles(
      amount,
      snappPubkey,
      account1.toPublicKey()
    );
  })
    .send()
    .wait();
  //create whitelist
  let whiteListArray = [
    account2.toPublicKey(),
    account3.toPublicKey(),
    account4.toPublicKey(),
    account5.toPublicKey(),
  ];
  //upload to IPFS
  const ipfs = create({ host: '127.0.0.1', port: 5002 });
  let res = await ipfs.add(Buffer.from(JSON.stringify(whiteListArray)));
  // workaround to store it in a field element
  let rawCID = res.cid;
  let stringCID = rawCID.toString();
  console.log('CID: ', stringCID);
  let whitelistCID1 = rawCID.bytes;
  const view = new DataView(whitelistCID1.buffer);
  let uintOfCID = view.getUint32(0);
  console.log('CID as decimal ', uintOfCID);

  let depositAmount = 1000000;
  let value = Field(depositAmount);

  // updates whitelist
  await Mina.transaction(account1, async () => {
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
  //deposit as acc2
  await Mina.transaction(account1, async () => {
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

  //deposit as acc3
  await Mina.transaction(account1, async () => {
    const x = Field.zero;
    const signature = Signature.create(account3, [x]);
    const p = await Party.createSigned(account3);
    p.balance.subInPlace(UInt64.fromNumber(depositAmount));

    await snappInstance.deposit(
      account3.toPublicKey(),
      x,
      signature,
      accountX.toPublicKey(),
      rawCID
    );
  })
    .send()
    .wait();

  // deposit as acc4
  await Mina.transaction(account1, async () => {
    const x = Field.zero;
    const signature = Signature.create(account4, [x]);
    const p = await Party.createSigned(account4);
    p.balance.subInPlace(UInt64.fromNumber(depositAmount));

    await snappInstance.deposit(
      account4.toPublicKey(),
      x,
      signature,
      accountX.toPublicKey(),
      rawCID
    );
  })
    .send()
    .wait();

  // deposit as acc5
  await Mina.transaction(account1, async () => {
    const x = Field.zero;
    const signature = Signature.create(account5, [x]);
    const p = await Party.createSigned(account5);
    p.balance.subInPlace(UInt64.fromNumber(depositAmount));

    await snappInstance.deposit(
      account5.toPublicKey(),
      x,
      signature,
      accountX.toPublicKey(),
      rawCID
    );
  })
    .send()
    .wait();

  await Mina.transaction(account1, async () => {
    const x = Field.zero;
    const signature = Signature.create(accountX, [x]);

    await snappInstance.claim(accountX.toPublicKey(), x, signature);

    const p = Party.createUnsigned(accountX.toPublicKey());

    p.balance.addInPlace(UInt64.fromNumber(depositAmount));
  })
    .send()
    .wait();

  // await Mina.transaction(account1, async () => {
  //   const p = await Party.createSigned(account3);

  //   p.balance.subInPlace(UInt64.fromNumber(depositAmount));
  //   await snappInstance.claim();
  // })
  //   .send()
  //   .wait();

  const a = await Mina.getAccount(snappPubkey);
  console.log('snapp balance', (await Mina.getBalance(snappPubkey)).toString());
  // console.log(
  //   'acc1 balance : ',
  //   (await Mina.getBalance(account1.toPublicKey())).toString()
  // );
  console.log(
    'acc2 balance : ',
    (await Mina.getBalance(account2.toPublicKey())).toString()
  );
  console.log(
    'acc3 balance : ',
    (await Mina.getBalance(account3.toPublicKey())).toString()
  );
  console.log(
    'acc4 balance : ',
    (await Mina.getBalance(account4.toPublicKey())).toString()
  );
  console.log(
    'accX balance : ',
    (await Mina.getBalance(accountX.toPublicKey())).toString()
  );

  // console.log('Exercise 1');
  console.log('final state value', a.snapp.appState[0].toString());
}

run();
shutdown();
