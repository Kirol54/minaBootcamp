import { create } from 'ipfs-http-client';
async function a() {
  let cid = 'QmeKejc9TNuRKcVqpXRNavF2ZHGxPjcDs5X5rs17tF17wY';
  const ipfs = create('http://127.0.0.1:5002');
  for await (const file of ipfs.get(cid)) {
    console.log(file.path);
  }
}

a();
