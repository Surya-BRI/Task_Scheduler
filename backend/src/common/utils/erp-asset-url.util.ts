import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client: S3Client | null | undefined;

function getClient(): S3Client | null {
  if (client !== undefined) return client;
  const region = process.env.AWS_REGION;
  if (!region) {
    client = null;
    return client;
  }
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  // Explicit keys if present; otherwise fall back to the default AWS credential chain
  // (env/shared-config/instance role), same as the ERP's own s3_service.py does.
  client = new S3Client({
    region,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
  return client;
}

/** Resolve {bucket, key} from a stored assets URL (virtual-hosted or path-style). */
function parseBucketAndKey(rawUrl: string): { bucket: string; key: string } | null {
  let withoutQuery = rawUrl.split('?')[0];
  const hostMatch = withoutQuery.match(/^https?:\/\/([^/]+)\/(.+)$/i);
  if (!hostMatch) return null;
  const [, host, path] = hostMatch;
  // Virtual-hosted-style: {bucket}.s3.{region}.amazonaws.com/{key}
  const virtualHostMatch = host.match(/^([^.]+)\.s3[.-][^.]*\.amazonaws\.com$/i) ?? host.match(/^([^.]+)\.s3\.amazonaws\.com$/i);
  if (virtualHostMatch) {
    return { bucket: virtualHostMatch[1], key: decodeURIComponent(path) };
  }
  // Path-style: s3.{region}.amazonaws.com/{bucket}/{key}
  if (/^s3[.-]/i.test(host)) {
    const [bucket, ...rest] = path.split('/');
    if (bucket && rest.length) return { bucket, key: decodeURIComponent(rest.join('/')) };
  }
  return null;
}

/** ERP asset URLs (e.g. profile images) point at private S3 objects — presign before handing them to the browser. */
export async function signErpAssetUrl(rawUrl: string | null, expiresIn = 60 * 60): Promise<string | null> {
  if (!rawUrl) return null;
  const parsed = parseBucketAndKey(rawUrl);
  if (!parsed) return rawUrl;
  const s3Client = getClient();
  if (!s3Client) return null;
  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }),
      { expiresIn },
    );
  } catch {
    return null;
  }
}
