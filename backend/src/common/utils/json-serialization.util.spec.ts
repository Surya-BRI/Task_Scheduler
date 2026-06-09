import { installBigIntJsonSerialization, serializeBigInts } from './json-serialization.util';

describe('json-serialization.util', () => {
  it('serializeBigInts converts nested bigint fields', () => {
    const input = {
      files: [{ sizeBytes: BigInt(2048), fileName: 'a.pdf' }],
      durationSeconds: 120,
    };
    const output = serializeBigInts(input);
    expect(output.files[0].sizeBytes).toBe(2048);
    expect(JSON.stringify(output)).toBe(
      '{"files":[{"sizeBytes":2048,"fileName":"a.pdf"}],"durationSeconds":120}',
    );
  });

  it('installBigIntJsonSerialization allows JSON.stringify on bigint', () => {
    installBigIntJsonSerialization();
    expect(JSON.stringify({ sizeBytes: BigInt(1024) })).toBe('{"sizeBytes":1024}');
  });
});
