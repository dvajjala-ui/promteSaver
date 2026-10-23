/** Release metadata checked against npm and native packaging by release:check. */
export const APP_VERSION = '0.9.0';
export const SUPPORTED_NODE = '>=24.16.0 <25';
export function supportedNode(version = process.versions.node): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return !!match && Number(match[1]) === 24 && Number(match[2]) >= 16;
}
