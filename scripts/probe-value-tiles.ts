import { PNG } from 'pngjs';

async function probe(name: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) { console.log(name + ': FAILED ' + res.status); return; }
  const buf = Buffer.from(await res.arrayBuffer());
  const png = PNG.sync.read(buf);

  // Collect all non-nodata pixel values
  const values: number[] = [];
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const a = png.data[i + 3];
      if (a < 10) continue;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      const raw = r + 256 * g + 65536 * b;
      values.push(raw);
    }
  }

  if (values.length === 0) { console.log(name + ': no data pixels'); return; }
  values.sort((a, b) => a - b);

  console.log(`${name}: ${values.length} data pixels`);
  console.log(`  raw: min=${values[0]} p25=${values[Math.floor(values.length * 0.25)]} median=${values[Math.floor(values.length * 0.5)]} p75=${values[Math.floor(values.length * 0.75)]} max=${values[values.length - 1]}`);

  // Try common decodings
  for (const [scale, offset, unit] of [[100, 0, ''], [10, 0, ''], [1, 0, ''], [100, -32768, '']]) {
    const decoded = values.map(v => ((v as number) + (offset as number)) / (scale as number));
    console.log(`  scale=${scale} offset=${offset}: min=${decoded[0].toFixed(2)} median=${decoded[Math.floor(decoded.length * 0.5)].toFixed(2)} max=${decoded[decoded.length - 1].toFixed(2)}`);
  }
}

const S3 = 'https://geo-test-api.s3.us-east-1.amazonaws.com';

(async () => {
  console.log('Probing value tile encodings at z=13 (Porto Alegre center)...\n');
  await probe('MERIT HAND (m above drainage)', S3 + '/merit_hydro/release/v1/porto_alegre/hnd/tiles_values/13/2932/4814.png');
  console.log('');
  await probe('MERIT UPA (upstream area km²)', S3 + '/merit_hydro/release/v1/porto_alegre/upa/tiles_values/13/2932/4814.png');
  console.log('');
  await probe('MERIT ELV (elevation m)', S3 + '/merit_hydro/release/v1/porto_alegre/elv/tiles_values/13/2932/4814.png');
  console.log('');
  await probe('Copernicus Flood Depth 2024 (center)', S3 + '/copernicus_emsn194/release/v1/2024/porto_alegre/tiles_values/13/2932/4814.png');
  console.log('');
  await probe('Copernicus Flood Depth 2024 (north flooded)', S3 + '/copernicus_emsn194/release/v1/2024/porto_alegre/tiles_values/13/2930/4811.png');
  console.log('');
  await probe('MERIT HAND z=11', S3 + '/merit_hydro/release/v1/porto_alegre/hnd/tiles_values/11/733/1203.png');
})();
