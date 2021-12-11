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
  prop,
} from 'snarkyjs';

export default class Snapp extends SmartContract {
  @state(Field) indexOfNextUser: State<Field>;

  constructor(initialBalance: UInt64, address: PublicKey) {
    super(address);
    this.balance.addInPlace(initialBalance);
    this.indexOfNextUser = State.init(Field(0));
  }
  @method async get() {
    const stateIndex = await this.indexOfNextUser.get();
    const hardIndex = Field(5);
    console.log('stateIndex: ', stateIndex);
    console.log('hardIndex:', hardIndex.toString());
  }
}
