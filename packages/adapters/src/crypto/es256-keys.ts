import { exportJWK, exportPKCS8, generateKeyPair, type JWK } from 'jose';
import { SIGNING_ALGORITHMS } from '@sentra/contracts';

export interface IssuedEs256KeyPair {
  readonly algorithm: typeof SIGNING_ALGORITHMS.ES256;
  readonly publicKeyJwk: JWK;
  readonly privateKeyJwk: JWK;
  readonly privateKeyPem: string;
}

export const generateEs256KeyPair = async (): Promise<IssuedEs256KeyPair> => {
  const { publicKey, privateKey } = await generateKeyPair(SIGNING_ALGORITHMS.ES256, {
    extractable: true,
  });
  const publicKeyJwk = await exportJWK(publicKey);
  const privateKeyJwk = await exportJWK(privateKey);
  const privateKeyPem = await exportPKCS8(privateKey);
  const { d: _private, ...publicOnly } = publicKeyJwk;
  return {
    algorithm: SIGNING_ALGORITHMS.ES256,
    publicKeyJwk: publicOnly,
    privateKeyJwk,
    privateKeyPem,
  };
};
