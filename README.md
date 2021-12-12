# Mina Snapp: Stir with JarOfPickles

A concept for coin tumbler on Mina.

Using whitelist to ensure 'locking' so no concurrent update to the merkle tree is possible.

Storing the whitelist on the IPFS.

More than happy to explain the idea and all pros and cons of this concept.

## How to run the snapp

comment out "// ======== mock code here ========" blocks in order to work

```sh
npm install
jsipfs daemon
npx tsc && node build/src/index.js
```

## Possibilities for future development

As this is just proof of concept, many things been simplified but especially with the future recursion of snapp,
there can be lot of improvements to be made.
Such as taking whitelist to a separate snapp, allowing mixed values being deposited, enhancing size of jars which increases
privacy

## How to run tests

```sh
npm run test
npm run testw # watch mode
```

## How to run coverage

```sh
npm run coverage
```

## License

[Apache-2.0](LICENSE)
