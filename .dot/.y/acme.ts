import {
  Handler,
  serve,
  serveTls,
} from "https://deno.land/std/http/server.ts";
import * as jose from "https://deno.land/x/jose/index.ts";
import { sha256 } from "https://denopkg.com/chiefbiiko/sha256/mod.ts";
import { exists } from "https://deno.land/std/fs/mod.ts";

const defaultAddRecord = (record: string, type: string, values: string[]) =>
  prompt(
    `Set DNS record to ${record}@${type} ${values.join(";")}, then press Enter`,
  );
const defaultRemoveRecord = (record: string, type: string) =>
  prompt(`Remove DNS ${record}@${type}, then press Enter`);

const makeSignedRequest = (
  privateKey: jose.KeyLike,
  nonce: string,
  url: string,
  body: {
    paylod: string;
    signedHeader?: jose.JWSHeaderParameters;
  },
  isDownload?: boolean,
) => {
  return new Promise((resolve, reject) => {
    new jose.FlattenedSign(
      new TextEncoder().encode(body.paylod),
    ).setProtectedHeader({
      alg: "RS256",
      nonce: nonce,
      url,
      ...body.signedHeader,
    }).sign(privateKey).then((signature) => {
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/jose+json",
        },
        body: JSON.stringify(signature),
      }).then((response) => {
        if (isDownload) {
          response.text().then((responseText) => {
            resolve(responseText);
          }).catch(reject);
        } else {
          response.json().then((data) => {
            resolve({
              ...data,
              headers: [...response.headers.entries()].reduce(
                (obj, key) => ({ ...obj, [key[0]]: key[1] }),
                {},
              ),
              kid: response.headers.get("Location"),
              nonce: response.headers.get("Replay-Nonce"),
            });
          }).catch(reject);
        }
      }).catch(reject);
    });
  });
};

const directories = {
  buypass: {
    staging: "https://api.test4.buypass.no/acme/directory",
    production: "https://api.buypass.com/acme/directory",
  },
  letsencrypt: {
    staging: "https://acme-staging-v02.api.letsencrypt.org/directory",
    production: "https://acme-v02.api.letsencrypt.org/directory",
  },
  zerossl: {
    production: "https://acme.zerossl.com/v2/DV90",
  },
};

const ACME = async function (directory: string, jwk: jose.KeyLike) {
  const mapping = await fetch(directory).then((r) => r.json());
  let lastRequest: Record<string, unknown> = {
    nonce: await fetch(mapping.newNonce, { method: "HEAD" }).then((r) =>
      r.headers.get("Replay-Nonce")
    ),
  };
  return {
    mapping,
    getAccount: async (email: string) => {
      const { kty, e, n } = await jose.exportJWK(jwk);
      const key = { kty, e, n };
      const r = await makeSignedRequest(
        jwk,
        lastRequest.nonce as string,
        mapping.newAccount,
        {
          paylod: JSON.stringify({
            termsOfServiceAgreed: true,
            contact: [
              email,
            ],
          }),
          signedHeader: {
            jwk: key,
          },
        },
      );
      lastRequest = {
        ...(r as Record<string, unknown>),
      };
      return r;
    },
    getOrder: async (account: string, cnames: string[]) => {
      const r = await makeSignedRequest(
        jwk,
        lastRequest.nonce as string,
        mapping.newOrder,
        {
          paylod: JSON.stringify({
            identifiers: cnames.map((cname) => {
              return {
                type: "dns",
                value: cname,
              };
            }),
          }),
          signedHeader: {
            kid: account as string,
          },
        },
      );
      lastRequest = {
        ...(r as Record<string, unknown>),
      };
      return r;
    },
    getAuthz: async (account: string, authz: string) => {
      const r = await makeSignedRequest(
        jwk,
        lastRequest.nonce as string,
        authz,
        {
          paylod: "",
          signedHeader: {
            kid: account as string,
          },
        },
      );
      lastRequest = {
        ...(r as Record<string, unknown>),
      };
      return r;
    },
    getChallengeValidation: async (account: string, challenge: string) => {
      const r = await makeSignedRequest(
        jwk,
        lastRequest.nonce as string,
        challenge,
        {
          paylod: "{}",
          signedHeader: {
            kid: account as string,
          },
        },
      );
      lastRequest = {
        ...(r as Record<string, unknown>),
      };
      return r;
    },
    sendCSR: async (account: string, finalizeUrl: string, csr: string) => {
      const r = await makeSignedRequest(
        jwk,
        await fetch(mapping.newNonce, { method: "HEAD" }).then((r) =>
          r.headers.get("Replay-Nonce")
        ) as string,
        finalizeUrl,
        {
          paylod: JSON.stringify({
            csr,
          }),
          signedHeader: {
            kid: account as string,
          },
        },
      );
      lastRequest = {
        ...(r as Record<string, unknown>),
      };
      return r;
    },
    downloadCertificate: async (account: string, authz: string) => {
      const r = await makeSignedRequest(
        jwk,
        lastRequest.nonce as string,
        authz,
        {
          paylod: "",
          signedHeader: {
            kid: account as string,
          },
        },
        true,
      );
      return r;
    },
  };
};

const serveWithACME = (handler: Handler, cname: string) => {

  const domain = cname;
  if (cname !== 'localhost') {
    const Decoder = new TextDecoder();
    const Encoder = new TextEncoder();

    const cwd = Deno.cwd();

    const certFile = `${cwd}/.serve-with-acme/.certFile`;
    const certKeyFile = `${cwd}/.serve-with-acme/.keyFile`;
    const privateKeyFile = `${cwd}/.serve-with-acme/.privateKeyFile.pem`;
    const publicKeyFile = `${cwd}/.serve-with-acme/.publicKeyFile.pem`;
    const accountFile = `${cwd}/.serve-with-acme/.accountFile`;

    Deno.mkdir(`${cwd}/.serve-with-acme`, {
      recursive: true,
    });
    exists(certFile).then((vCert) => {
      const _fn = vCert
        ? () => {
          serveTls(handler, {
            certFile,
            keyFile: certKeyFile,
            port: 443,
          });
        }
        : () => {
          exists(privateKeyFile).then(async (vPrivKey) => {
            const { publicKey, privateKey } = vPrivKey
              ? {
                privateKey: await jose.importPKCS8(
                  Decoder.decode(Deno.readFileSync(privateKeyFile)),
                  "RS256",
                  {
                    extractable: true,
                  },
                ),
                publicKey: await jose.importSPKI(
                  Decoder.decode(Deno.readFileSync(publicKeyFile)),
                  "RS256",
                  {
                    extractable: true,
                  },
                ),
              }
              : await jose.generateKeyPair("RS256", {
                extractable: true,
              });
            Deno.writeFile(
              privateKeyFile,
              Encoder.encode(await jose.exportPKCS8(privateKey)),
            );
            Deno.writeFile(
              publicKeyFile,
              Encoder.encode(await jose.exportSPKI(publicKey)),
            );

            const acme = await ACME(
              Deno.env.get("PROD")
                ? directories.letsencrypt.production
                : directories.letsencrypt.staging,
              privateKey,
            );
            const account = await exists(accountFile)
              ? JSON.parse(Decoder.decode(Deno.readFileSync(accountFile)))
              : await acme.getAccount(`mailto:admin@${domain}`);
            Deno.writeFileSync(
              accountFile,
              Encoder.encode(JSON.stringify(account)),
            );

            const order = await acme.getOrder(account.kid, [domain]);

            console.log(account)


            // @ts-ignore: because i am too lazy to fix this right now
            order.authorizations.forEach(async (authz) => {
              const r_authz = await acme.getAuthz(account.kid, authz);
              // @ts-ignore: i should really be using JS instead
              r_authz.challenges.filter((challenge) =>
                challenge.type === "dns-01"
              )
                // @ts-ignore: i should really be using JS instead
                .forEach(async (challenge) => {
                  const { kty, e, n } = await jose.exportJWK(privateKey);

                  const key = {
                    kty,
                    e,
                    n,
                  };

                  let thumbprint = await jose.calculateJwkThumbprint(
                    key,
                    "sha256",
                  );

                  thumbprint = thumbprint.replace(/\+/g, "-")
                    .replace(/\//g, "_")
                    .replace(/=/g, "");

                  let tokenAndThumbprint = sha256(
                    challenge.token + "." + thumbprint,
                    "utf8",
                    "base64",
                  ) as string;
                  tokenAndThumbprint = tokenAndThumbprint.replace(/\+/g, "-")
                    .replace(/\//g, "_")
                    .replace(/=/g, "");

                  await defaultAddRecord("_acme-challenge", "TXT", [
                    tokenAndThumbprint,
                  ]);

                  let _validation = await acme.getChallengeValidation(
                    account.kid,
                    challenge.url,
                  );

                  for (let i = 0; i < 10; i++) {
                    _validation = await acme.getChallengeValidation(
                      account.kid,
                      challenge.url,
                    );
                  }

                  await defaultRemoveRecord(`_acme-challenge.${domain}.`, "TXT");

                  const certKey = await jose.generateKeyPair("RS256", {
                    extractable: true,
                  });

                  Deno.writeFileSync(
                    certKeyFile,
                    Encoder.encode(await jose.exportPKCS8(certKey.privateKey)),
                  );

                  await Deno.run({
                    cmd:
                      `openssl req -inform PEM -outform DER -key ${certKeyFile} -new -batch -subj /C=RU/ST=Moscow/L=Moscow/O=Deno/OU=Deno/emailAddress=admin@${domain}/CN=${domain} -out cert.csr`
                        .split(" "),
                  }).status();

                  let csr: Uint8Array | string = await Deno.readFileSync(
                    "./cert.csr",
                  );
                  csr = await jose.base64url.encode(csr);

                  const certificateRequest = await acme.sendCSR(
                    account.kid,
                    // @ts-ignore: it's upset about order
                    order.finalize,
                    csr,
                  );

                  // @ts-ignore: TODO
                  const certificate = await acme.downloadCertificate(
                    account.kid,
                    // @ts-ignore: it's upset about certificateRequest
                    certificateRequest.certificate,
                  );

                  await Deno.writeFileSync(
                    certFile,
                    Encoder.encode(certificate as string),
                  );
                  Deno.remove("./cert.csr");
                  serveTls(handler, {
                    certFile,
                    keyFile: certKeyFile,
                    port: 443,
                  });
                });
            });
          });
        };
      _fn();
    });
    serve(
      (req: Request) => Response.redirect(`https://${req.headers.get("Host")}`),
      { port: 80 },
    );
  }
  else
    serve(
      handler,
      { port: 80 },
    );
};

export { serveWithACME };
