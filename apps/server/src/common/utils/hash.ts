import crypto from 'node:crypto';

export const hmacsha256 = (str: string, key: string) => {
  const hash = crypto
    .createHmac('sha256', key)
    .update(str, 'utf8')
    .digest('hex');
  return hash;
};
